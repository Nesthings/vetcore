"""CRUD de consultas — por-tenant, vet/admin para mutar.

Incluye la generación del PDF de resumen (informativo, no receta) y la
subida de adjuntos (foto/nota).
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.core.events import record_audit
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import (
    Clinic,
    ClinicBranch,
    Consultation,
    ConsultationAttachment,
    ConsultationItem,
    ConsultationSummaryPdf,
    Pet,
    User,
)
from app.schemas.consultation import (
    ConsultationCreate,
    ConsultationRead,
    ConsultationUpdate,
)
from app.schemas.crm import SurveyRead
from app.services.pdf import build_consultation_summary_pdf

router = APIRouter(prefix="/consultations", tags=["consultations"])

CONSULTATION_MUTATORS = ("admin", "veterinario")

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("", response_model=list[ConsultationRead])
def list_consultations(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    pet_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Consultation]:
    stmt = (
        select(Consultation)
        .options(selectinload(Consultation.items))
        .where(Consultation.clinic_id == ctx.clinic["id"])
        .order_by(Consultation.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if pet_id:
        stmt = stmt.where(Consultation.pet_id == pet_id)
    return list(db.scalars(stmt))


def _get_consultation_or_404(db: Session, clinic_id: str, consultation_id: str) -> Consultation:
    consultation = db.scalar(
        select(Consultation)
        .options(selectinload(Consultation.items))
        .where(
            Consultation.id == consultation_id,
            Consultation.clinic_id == clinic_id,
        )
    )
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consulta no encontrada")
    return consultation


def _validate_pet_belongs(db: Session, clinic_id: str, pet_id: str) -> None:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente no encontrado en esta clínica",
        )


@router.get("/{consultation_id}", response_model=ConsultationRead)
def get_consultation(
    consultation_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> Consultation:
    return _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)


@router.post("", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
def create_consultation(
    body: ConsultationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> Consultation:
    _validate_pet_belongs(db, ctx.clinic["id"], str(body.pet_id))
    consultation = Consultation(
        clinic_id=ctx.clinic["id"],
        branch_id=body.branch_id,
        pet_id=body.pet_id,
        vet_user_id=body.vet_user_id,
        template_id=body.template_id,
        reason=body.reason,
        diagnosis=body.diagnosis,
        treatment=body.treatment,
        care_instructions=body.care_instructions,
        next_appointment_suggestion=body.next_appointment_suggestion,
    )
    for item in body.items:
        consultation.items.append(ConsultationItem(**item.model_dump()))
    db.add(consultation)
    db.commit()
    return _get_consultation_or_404(db, ctx.clinic["id"], str(consultation.id))


@router.patch("/{consultation_id}", response_model=ConsultationRead)
def update_consultation(
    consultation_id: str,
    body: ConsultationUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> Consultation:
    consultation = _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(consultation, field, value)
    db.commit()
    return _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)


@router.delete("/{consultation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_consultation(
    consultation_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    consultation = _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="consultation_deleted",
        entity_type="consultation",
        entity_id=consultation.id,
        metadata={"pet_id": str(consultation.pet_id)},
    )
    db.delete(consultation)
    db.commit()


@router.post(
    "/{consultation_id}/summary-pdf",
    summary="Genera el PDF de resumen de la consulta (informativo)",
)
def generate_summary_pdf(
    consultation_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    """Genera (o regenera) el PDF de resumen. Es un documento INFORMATIVO:
    qué se hizo, qué se aplicó e indicaciones. No es una receta médica."""
    consultation = _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)

    clinic = db.get(Clinic, ctx.clinic["id"])
    pet = db.get(Pet, consultation.pet_id)
    vet = db.get(User, consultation.vet_user_id)
    branch = db.get(ClinicBranch, consultation.branch_id) if consultation.branch_id else None

    data = {
        "clinic_name": f"{clinic.name}" + (f" — {branch.name}" if branch else ""),
        "pet_name": pet.name,
        "species": pet.species,
        "breed": pet.breed,
        "vet_name": vet.full_name,
        "date_str": consultation.created_at.astimezone().strftime("%d/%m/%Y %H:%M"),
        "reason": consultation.reason,
        "diagnosis": consultation.diagnosis,
        "treatment": consultation.treatment,
        "care_instructions": consultation.care_instructions,
        "items": [
            {"description": i.description, "quantity": i.quantity} for i in consultation.items
        ],
        "next_appointment_suggestion": (
            consultation.next_appointment_suggestion.isoformat()
            if consultation.next_appointment_suggestion
            else None
        ),
    }

    pdf_bytes = build_consultation_summary_pdf(data)
    rel = save_media("summaries", f"consulta_{consultation_id}.pdf", pdf_bytes)
    pdf_url = public_url(rel)

    existing = db.scalar(
        select(ConsultationSummaryPdf).where(
            ConsultationSummaryPdf.consultation_id == consultation_id
        )
    )
    if existing:
        existing.pdf_url = pdf_url
    else:
        db.add(ConsultationSummaryPdf(consultation_id=consultation_id, pdf_url=pdf_url))
    db.commit()

    return {"consultation_id": consultation_id, "pdf_url": pdf_url}


@router.post(
    "/{consultation_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Adjunta una foto/nota a la consulta",
)
def upload_attachment(
    consultation_id: str,
    file: UploadFile = File(...),
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)

    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )

    rel = save_media(f"consultations/{consultation_id}", file.filename or "attach.jpg", content)
    attachment = ConsultationAttachment(
        consultation_id=consultation_id,
        type="photo",
        url=public_url(rel),
    )
    db.add(attachment)
    db.commit()
    return {"id": str(attachment.id), "url": attachment.url, "type": "photo"}


@router.get(
    "/{consultation_id}/survey",
    response_model=SurveyRead | None,
    summary="Encuesta de la consulta (lectura para staff)",
)
def consultation_survey(
    consultation_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict | None:
    _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)
    row = (
        db.execute(
            text(
                "SELECT id, consultation_id, rating, comments, created_at "
                "FROM consultation_surveys WHERE consultation_id = :c"
            ),
            {"c": consultation_id},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None
