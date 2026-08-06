"""CRUD de clínicas — exclusivo del super-admin (sin aislamiento por tenant).

El Panel Super-Admin (Subfase 1.8) opera sobre esta colección. El alta de una
clínica nueva crea el tenant; el cambio de suscripción registra eventos en la
bitácora `clinic_subscription_events`.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, require_roles
from app.db.session import get_db
from app.models import (
    Appointment,
    Clinic,
    ClinicBranch,
    ClinicSubscriptionEvent,
    Invoice,
    Pet,
    User,
)
from app.schemas.clinic import (
    ClinicCreate,
    ClinicRead,
    ClinicSubscriptionChange,
    ClinicSubscriptionEventRead,
    ClinicSummaryRead,
    ClinicUpdate,
)

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


@router.post(
    "/{clinic_id}/subscription",
    response_model=ClinicRead,
    summary="Cambia el estado de suscripción y registra el evento",
)
def change_subscription(
    clinic_id: str,
    body: ClinicSubscriptionChange,
    admin: CurrentUser = Depends(require_roles("super-admin")),
    db: Session = Depends(get_db),
) -> Clinic:
    clinic = _get_clinic_or_404(db, clinic_id)
    event_type = {
        "active": "activated",
        "suspended": "suspended",
        "cancelled": "cancelled",
    }.get(body.status, "activated")

    clinic.subscription_status = body.status
    db.add(
        ClinicSubscriptionEvent(
            clinic_id=clinic.id,
            event_type=event_type,
            notes=body.notes,
            created_by=admin.sub,
        )
    )
    db.commit()
    db.refresh(clinic)
    return clinic


@router.get(
    "/{clinic_id}/events",
    response_model=list[ClinicSubscriptionEventRead],
    summary="Historial de eventos de suscripción de la clínica",
)
def clinic_events(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> list[ClinicSubscriptionEvent]:
    _get_clinic_or_404(db, clinic_id)
    return list(
        db.scalars(
            select(ClinicSubscriptionEvent)
            .where(ClinicSubscriptionEvent.clinic_id == clinic_id)
            .order_by(ClinicSubscriptionEvent.created_at.desc())
        )
    )


@router.get(
    "/{clinic_id}/summary",
    response_model=ClinicSummaryRead,
    summary="Resumen de la clínica (conteos)",
)
def clinic_summary(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> ClinicSummaryRead:
    clinic = _get_clinic_or_404(db, clinic_id)
    counts = {
        "branches": db.scalar(
            select(func.count())
            .select_from(ClinicBranch)
            .where(ClinicBranch.clinic_id == clinic_id)
        )
        or 0,
        "staff": db.scalar(
            select(func.count()).select_from(User).where(User.clinic_id == clinic_id)
        )
        or 0,
        "pets": db.scalar(select(func.count()).select_from(Pet).where(Pet.clinic_id == clinic_id))
        or 0,
        "appointments": db.scalar(
            select(func.count()).select_from(Appointment).where(Appointment.clinic_id == clinic_id)
        )
        or 0,
        "invoices": db.scalar(
            select(func.count()).select_from(Invoice).where(Invoice.clinic_id == clinic_id)
        )
        or 0,
    }
    return ClinicSummaryRead(
        id=clinic.id,
        name=clinic.name,
        subscription_status=clinic.subscription_status,
        **counts,
    )
