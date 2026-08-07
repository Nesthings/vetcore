"""Consentimientos digitales firmados en tablet (subfase 3.2).

El staff genera el consentimiento (título + texto), el dueño lo firma en la
tablet (firma dibujada → PNG base64), y el sistema guarda la firma y genera
un PDF firmado con reportlab. Queda archivado en el expediente de la mascota.
"""

import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.core.events import record_audit
from app.core.storage import public_url, read_media_bytes, save_media
from app.db.session import get_db
from app.models import Clinic, DigitalConsent, Pet, User
from app.schemas.consent import ConsentCreate, ConsentRead, PendingConsentCreate
from app.services.pdf import build_consent_pdf

router = APIRouter(prefix="/consents", tags=["consents"])

CONSENT_MUTATORS = ("admin", "veterinario", "recepcion")


@router.post(
    "/pending",
    response_model=ConsentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea un consentimiento pendiente de firma del dueño (remoto)",
)
def create_pending_consent(
    body: PendingConsentCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSENT_MUTATORS)),
    db: Session = Depends(get_db),
) -> DigitalConsent:
    pet = db.scalar(
        select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == ctx.clinic["id"])
    )
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")

    consent = DigitalConsent(
        clinic_id=ctx.clinic["id"],
        pet_id=pet.id,
        vet_user_id=ctx.user.sub,
        title=body.title,
        body=body.body,
        status="pending",
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
        metadata={"pet_id": str(pet.id), "title": body.title},
    )
    db.commit()
    db.refresh(consent)
    return consent


@router.post("", response_model=ConsentRead, status_code=status.HTTP_201_CREATED)
def create_consent(
    body: ConsentCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSENT_MUTATORS)),
    db: Session = Depends(get_db),
) -> DigitalConsent:
    """Crea el consentimiento firmado: guarda la firma (PNG) y genera el PDF."""
    pet = db.scalar(
        select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == ctx.clinic["id"])
    )
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")

    # Firma: acepta data URI (data:image/png;base64,...) o base64 crudo
    raw = body.signature_base64
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        signature_bytes = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La firma no es un base64 válido",
        ) from exc

    # Guardar firma como PNG
    sig_rel = save_media(f"consents/{pet.id}", "firma.png", signature_bytes)
    signature_url = public_url(sig_rel)

    clinic = db.get(Clinic, ctx.clinic["id"])
    owner_display = " ".join(
        [x for x in [body.owner_name, body.owner_phone, body.owner_email] if x]
    ) or "Dueño"

    vet = db.get(User, ctx.user.sub)
    vet_signature_bytes = (
        read_media_bytes(vet.signature_url) if vet is not None and vet.signature_url else None
    )

    pdf_bytes = build_consent_pdf(
        {
            "clinic_name": clinic.name,
            "pet_name": pet.name,
            "owner_display": owner_display,
            "title": body.title,
            "body": body.body,
            "date_str": datetime.now().astimezone().strftime("%d/%m/%Y %H:%M"),
            "signature_bytes": signature_bytes,
            "vet_signature_bytes": vet_signature_bytes,
            "vet_name": vet.full_name if vet is not None else None,
        }
    )
    pdf_rel = save_media(
        f"consents/{pet.id}",
        f"consentimiento_{uuid.uuid4().hex[:8]}.pdf",
        pdf_bytes,
    )
    pdf_url = public_url(pdf_rel)

    consent = DigitalConsent(
        clinic_id=ctx.clinic["id"],
        pet_id=pet.id,
        vet_user_id=ctx.user.sub,
        title=body.title,
        body=body.body,
        signature_url=signature_url,
        pdf_url=pdf_url,
    )
    db.add(consent)
    db.flush()

    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="consent_created",
        entity_type="consent",
        entity_id=consent.id,
        metadata={"pet_id": str(pet.id), "title": body.title},
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
