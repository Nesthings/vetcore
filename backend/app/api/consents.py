"""Consentimientos digitales.

Flujo (3.2):
1. El staff envía el consentimiento desde el perfil de la mascota
   (título + texto) → status `pending`, sin pedir firma.
2. El dueño lo firma y envía desde su cartilla compartida →
   status `owner_signed`.
3. El personal de la clínica lo confirma → se incluyen las firmas del
   personal y se genera el PDF → status `signed`, con `confirmed_at`.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.core.events import record_audit
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_PDF_EXTENSIONS,
    public_url,
    read_media_bytes,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import Clinic, DigitalConsent, Pet, User
from app.schemas.consent import ConsentRead
from app.services.pdf import build_consent_pdf

router = APIRouter(prefix="/consents", tags=["consents"])

CONSENT_MUTATORS = ("admin", "veterinario", "recepcion")

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def _owner_display(db: Session, pet_id: str) -> str:
    row = db.execute(
        text(
            "SELECT o.full_name FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
            "WHERE l.pet_id = :pid AND l.is_active = true "
            "ORDER BY l.linked_at DESC LIMIT 1"
        ),
        {"pid": pet_id},
    ).scalar()
    return row or "Dueño"


def _owner_row(db: Session, owner_id: str) -> dict | None:
    row = db.execute(
        text("SELECT id, full_name, signature_url FROM owners WHERE id = :oid"),
        {"oid": owner_id},
    ).mappings().first()
    return dict(row) if row else None


@router.post(
    "/pending",
    response_model=ConsentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Envía un consentimiento al dueño (firma remota)",
)
def create_pending_consent(
    pet_id: str = Form(...),
    title: str = Form(...),
    body: str = Form(...),
    vet_user_id: uuid.UUID | None = Form(
        default=None, description="Médico que firma (staff con firma guardada)"
    ),
    owner_id: uuid.UUID | None = Form(
        default=None, description="Dueño que también es médico y firmará"
    ),
    attachment: UploadFile | None = File(default=None),
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSENT_MUTATORS)),
    db: Session = Depends(get_db),
) -> DigitalConsent:
    pet = db.scalar(
        select(Pet).where(Pet.id == pet_id, Pet.clinic_id == ctx.clinic["id"])
    )
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    if vet_user_id is not None and owner_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecciona un solo médico que firma",
        )

    attachment_url = None
    attachment_name = None
    if attachment is not None and attachment.filename:
        validate_extension(
            attachment.filename, ALLOWED_IMAGE_EXTENSIONS | ALLOWED_PDF_EXTENSIONS
        )
        content = attachment.file.read()
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="El documento supera el límite de 10 MB",
            )
        rel = save_media(f"consents/{pet.id}", attachment.filename, content)
        attachment_url = public_url(rel)
        attachment_name = attachment.filename

    # Médico que firma: staff elegido → dueño médico → quien envía por defecto
    if vet_user_id is not None:
        signing_vet = vet_user_id
        signing_owner = None
    elif owner_id is not None:
        signing_vet = None
        signing_owner = owner_id
    else:
        signing_vet = ctx.user.sub
        signing_owner = None

    consent = DigitalConsent(
        clinic_id=ctx.clinic["id"],
        pet_id=pet.id,
        vet_user_id=signing_vet,
        owner_id=signing_owner,
        title=title,
        body=body,
        status="pending",
        attachment_url=attachment_url,
        attachment_name=attachment_name,
    )
    db.add(consent)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="consent_pending_created",
        entity_type="consent",
        entity_id=consent.id,
        metadata={"pet_id": str(pet.id), "title": title},
    )
    db.commit()
    db.refresh(consent)
    return consent


@router.post("/{consent_id}/confirm", response_model=ConsentRead)
def confirm_consent(
    consent_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSENT_MUTATORS)),
    db: Session = Depends(get_db),
) -> DigitalConsent:
    """Confirma el consentimiento firmado por el dueño: incluye las firmas del
    personal (firma guardada de quien confirma) y genera el PDF imprimible."""
    consent = db.scalar(
        select(DigitalConsent).where(
            DigitalConsent.id == consent_id,
            DigitalConsent.clinic_id == ctx.clinic["id"],
        )
    )
    if consent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consentimiento no encontrado"
        )
    if consent.status != "owner_signed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede confirmar un consentimiento firmado por el dueño",
        )

    owner_signature_bytes = read_media_bytes(consent.signature_url)

    # Firma del personal: médico seleccionado (staff) → dueño-médico → quien confirma
    staff_signature_bytes = None
    staff_name = None
    if consent.vet_user_id is not None:
        doctor = db.get(User, consent.vet_user_id)
        if doctor is not None:
            staff_signature_bytes = read_media_bytes(doctor.signature_url)
            staff_name = doctor.full_name
    elif consent.owner_id is not None:
        owner_row = _owner_row(db, str(consent.owner_id))
        if owner_row is not None:
            staff_signature_bytes = read_media_bytes(owner_row.get("signature_url"))
            staff_name = owner_row.get("full_name")
    if not staff_signature_bytes:
        confirming_user = db.get(User, ctx.user.sub)
        if confirming_user is not None:
            staff_signature_bytes = read_media_bytes(confirming_user.signature_url)
            staff_name = confirming_user.full_name

    clinic = db.get(Clinic, consent.clinic_id)
    pet = db.get(Pet, consent.pet_id)
    owner_display = _owner_display(db, str(consent.pet_id))

    pdf_bytes = build_consent_pdf(
        {
            "clinic_name": clinic.name,
            "pet_name": pet.name,
            "owner_display": owner_display,
            "title": consent.title,
            "body": consent.body,
            "date_str": datetime.now(UTC).astimezone().strftime("%d/%m/%Y %H:%M"),
            "signature_bytes": owner_signature_bytes,
            "vet_signature_bytes": staff_signature_bytes,
            "vet_name": staff_name,
        }
    )
    pdf_rel = save_media(
        f"consents/{consent.pet_id}",
        f"consentimiento_{uuid.uuid4().hex[:8]}.pdf",
        pdf_bytes,
    )
    consent.pdf_url = public_url(pdf_rel)
    consent.status = "signed"
    consent.confirmed_at = datetime.now(UTC)
    db.flush()

    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="consent_confirmed",
        entity_type="consent",
        entity_id=consent.id,
        metadata={"pet_id": str(consent.pet_id), "title": consent.title},
    )
    db.commit()
    db.refresh(consent)
    return consent


@router.get(
    "/pets/{pet_id}",
    response_model=list[ConsentRead],
    summary="Consentimientos de la mascota",
)
def list_pet_consents(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[DigitalConsent]:
    _pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.clinic_id == ctx.clinic["id"]))
    if _pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    stmt = (
        select(DigitalConsent)
        .where(
            DigitalConsent.pet_id == pet_id,
            DigitalConsent.clinic_id == ctx.clinic["id"],
        )
        .order_by(DigitalConsent.signed_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))
