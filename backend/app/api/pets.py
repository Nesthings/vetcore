"""CRUD de pacientes (mascotas) y registros de peso — por-tenant.

El peso es histórico (una fila por consulta, principio 4 del documento):
la lectura de mascotas expone el último peso como default visual.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.db.session import get_db
from app.models import Pet, PetWeightRecord
from app.schemas.pet import PetCreate, PetRead, PetUpdate, PetWeightCreate, PetWeightRead

router = APIRouter(prefix="/pets", tags=["pets"])

PET_MUTATORS = ("admin", "veterinario")


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
