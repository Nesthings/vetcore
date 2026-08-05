"""CRUD de consultas — por-tenant, vet/admin para mutar."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.db.session import get_db
from app.models import Consultation, ConsultationItem, Pet
from app.schemas.consultation import (
    ConsultationCreate,
    ConsultationRead,
    ConsultationUpdate,
)

router = APIRouter(prefix="/consultations", tags=["consultations"])

CONSULTATION_MUTATORS = ("admin", "veterinario")


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
    db.delete(consultation)
    db.commit()
