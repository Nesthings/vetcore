"""CRUD de pacientes (mascotas) y registros de peso — por-tenant.

El peso es histórico (una fila por consulta, principio 4 del documento):
la lectura de mascotas expone el último peso como default visual.
Incluye la foto clínica del expediente (distinta de la foto de la Cartilla,
principio 5) y la línea de tiempo que fusiona consultas y citas.
"""

import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import Appointment, Consultation, Pet, PetWeightRecord, User
from app.schemas.pet import PetCreate, PetRead, PetUpdate, PetWeightCreate, PetWeightRead

router = APIRouter(prefix="/pets", tags=["pets"])

PET_MUTATORS = ("admin", "veterinario")

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


class InvitationCreate(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InvitationResponse(BaseModel):
    token: str
    activation_url: str
    expires_at: datetime


@router.get("", response_model=list[PetRead])
def list_pets(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    active_only: bool = Query(default=True),
    search: str | None = Query(default=None, max_length=150),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Pet]:
    stmt = select(Pet).where(Pet.clinic_id == ctx.clinic["id"])
    if active_only:
        stmt = stmt.where(Pet.is_active.is_(True))
    if search:
        stmt = stmt.where(Pet.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(Pet.name).limit(limit).offset(offset)
    pets = list(db.scalars(stmt))
    return [_pet_with_latest_weight(db, pet) for pet in pets]


def _pet_with_latest_weight(db: Session, pet: Pet) -> Pet:
    latest = db.scalar(
        select(PetWeightRecord.weight_kg)
        .where(PetWeightRecord.pet_id == pet.id)
        .order_by(PetWeightRecord.recorded_at.desc(), PetWeightRecord.id.desc())
        .limit(1)
    )
    pet.latest_weight_kg = Decimal(latest) if latest is not None else None
    return pet


def _get_pet_or_404(db: Session, clinic_id: str, pet_id: str) -> Pet:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return pet


@router.get("/{pet_id}", response_model=PetRead)
def get_pet(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> Pet:
    return _pet_with_latest_weight(db, _get_pet_or_404(db, ctx.clinic["id"], pet_id))


@router.post("", response_model=PetRead, status_code=status.HTTP_201_CREATED)
def create_pet(
    body: PetCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> Pet:
    pet = Pet(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(pet)
    db.commit()
    db.refresh(pet)
    return pet


@router.patch("/{pet_id}", response_model=PetRead)
def update_pet(
    pet_id: str,
    body: PetUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> Pet:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pet, field, value)
    db.commit()
    db.refresh(pet)
    return _pet_with_latest_weight(db, pet)


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_pet(
    pet_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    """Desactiva el paciente (soft-delete via is_active)."""
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    pet.is_active = False
    db.commit()


@router.get("/{pet_id}/weights", response_model=list[PetWeightRead])
def list_weights(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[PetWeightRecord]:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    stmt = (
        select(PetWeightRecord)
        .where(
            PetWeightRecord.pet_id == pet_id,
            PetWeightRecord.clinic_id == ctx.clinic["id"],
        )
        .order_by(PetWeightRecord.recorded_at.desc())
    )
    return list(db.scalars(stmt))


@router.post(
    "/{pet_id}/weights",
    response_model=PetWeightRead,
    status_code=status.HTTP_201_CREATED,
)
def create_weight(
    pet_id: str,
    body: PetWeightCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> PetWeightRecord:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    record = PetWeightRecord(
        pet_id=pet_id,
        clinic_id=ctx.clinic["id"],
        weight_kg=body.weight_kg,
        consultation_id=body.consultation_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post(
    "/{pet_id}/photo",
    response_model=PetRead,
    summary="Sube la foto clínica del expediente del paciente",
)
def upload_pet_photo(
    pet_id: str,
    file: UploadFile = File(...),
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> Pet:
    """Foto CLÍNICA del expediente. Es un campo distinto de la foto de la
    Cartilla digital (principio 5): nunca se sobrescriben entre sí."""
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )

    rel = save_media(f"pets/{pet_id}", file.filename or "photo.jpg", content)
    pet.clinical_photo_url = public_url(rel)
    db.commit()
    db.refresh(pet)
    return _pet_with_latest_weight(db, pet)


@router.get(
    "/{pet_id}/timeline",
    summary="Línea de tiempo del paciente (consultas + citas)",
)
def pet_timeline(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    consultations = db.scalars(
        select(Consultation)
        .where(Consultation.pet_id == pet.id, Consultation.clinic_id == ctx.clinic["id"])
        .order_by(Consultation.created_at.desc())
    ).all()

    appointments = db.scalars(
        select(Appointment)
        .where(Appointment.pet_id == pet.id, Appointment.clinic_id == ctx.clinic["id"])
        .order_by(Appointment.start_time.desc())
    ).all()

    vet_ids = {c.vet_user_id for c in consultations}
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )

    events: list[dict] = []
    for c in consultations:
        events.append(
            {
                "type": "consulta",
                "id": str(c.id),
                "title": c.reason or "Consulta",
                "subtitle": f"Diagnóstico: {c.diagnosis}" if c.diagnosis else "",
                "author": vets.get(c.vet_user_id),
                "date": c.created_at.isoformat(),
                "status": None,
            }
        )
    for a in appointments:
        events.append(
            {
                "type": "cita",
                "id": str(a.id),
                "title": a.procedure_type,
                "subtitle": "",
                "author": None,
                "date": a.start_time.isoformat(),
                "status": a.status,
            }
        )

    events.sort(key=lambda e: e["date"], reverse=True)
    return events


@router.post(
    "/{pet_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Genera la invitación del dueño (token de activación)",
)
def create_invitation(
    pet_id: str,
    body: InvitationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> InvitationResponse:
    """Cierra el flujo de invitación (Subfase 1.7): la clínica capturó el
    teléfono/correo del dueño en persona y genera el token. El link se
    comparte por WhatsApp/email (en dev se devuelve en la respuesta)."""
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    if not body.contact_phone and not body.contact_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Se necesita al menos un teléfono o correo de contacto",
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)
    db.execute(
        text(
            "INSERT INTO owner_invitations "
            "(clinic_id, pet_id, contact_phone, contact_email, token, status, "
            "expires_at, created_by) "
            "VALUES (:c, :p, :phone, :email, :token, 'pending', :expires, :by)"
        ),
        {
            "c": ctx.clinic["id"],
            "p": pet_id,
            "phone": body.contact_phone,
            "email": body.contact_email,
            "token": token,
            "expires": expires_at,
            "by": ctx.user.sub,
        },
    )
    db.commit()
    return InvitationResponse(
        token=token,
        activation_url=f"/activate?token={token}",
        expires_at=expires_at,
    )
