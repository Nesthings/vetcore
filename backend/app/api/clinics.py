"""CRUD de clínicas — exclusivo del super-admin (sin aislamiento por tenant).

El Panel Super-Admin (Subfase 1.8) opera sobre esta colección. El alta de una
clínica nueva crea el tenant; las demás operaciones de clínica son por-tenant.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models import Clinic
from app.schemas.clinic import ClinicCreate, ClinicRead, ClinicUpdate

router = APIRouter(prefix="/clinics", tags=["clinics"])


@router.get("", response_model=list[ClinicRead])
def list_clinics(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> list[Clinic]:
    return list(
        db.scalars(select(Clinic).order_by(Clinic.created_at.desc()).limit(limit).offset(offset))
    )


def _get_clinic_or_404(db: Session, clinic_id: str) -> Clinic:
    clinic = db.get(Clinic, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clínica no encontrada")
    return clinic


@router.get("/{clinic_id}", response_model=ClinicRead)
def get_clinic(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> Clinic:
    return _get_clinic_or_404(db, clinic_id)


@router.post("", response_model=ClinicRead, status_code=status.HTTP_201_CREATED)
def create_clinic(
    body: ClinicCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> Clinic:
    clinic = Clinic(**body.model_dump())
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    return clinic


@router.patch("/{clinic_id}", response_model=ClinicRead)
def update_clinic(
    clinic_id: str,
    body: ClinicUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> Clinic:
    clinic = _get_clinic_or_404(db, clinic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(clinic, field, value)
    db.commit()
    db.refresh(clinic)
    return clinic


@router.delete("/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_clinic(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> None:
    """Desactiva la clínica (soft-delete) pasando su suscripción a 'cancelled'."""
    clinic = _get_clinic_or_404(db, clinic_id)
    clinic.subscription_status = "cancelled"
    db.commit()
