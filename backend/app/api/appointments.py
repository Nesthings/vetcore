"""CRUD de citas de la agenda — por-tenant, todo el staff."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.core.events import notify_user, record_audit
from app.db.session import get_db
from app.models import Appointment, ClinicBranch, Pet, User
from app.schemas.appointment import AppointmentCreate, AppointmentRead, AppointmentUpdate

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _with_names(db: Session, appointments: list[Appointment]) -> list[dict]:
    """Enriquece las citas con nombres legibles para la UI de la agenda."""
    if not appointments:
        return []
    pet_ids = {a.pet_id for a in appointments}
    vet_ids = {a.vet_user_id for a in appointments if a.vet_user_id}
    branch_ids = {a.branch_id for a in appointments}

    pets = dict(db.execute(select(Pet.id, Pet.name).where(Pet.id.in_(pet_ids))).all())
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )
    branches = dict(
        db.execute(
            select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
        ).all()
    )

    out = []
    for a in appointments:
        data = AppointmentRead.model_validate(a).model_dump()
        data.update(
            pet_name=pets.get(a.pet_id),
            vet_name=vets.get(a.vet_user_id),
            branch_name=branches.get(a.branch_id),
        )
        out.append(data)
    return out


@router.get("", response_model=list[AppointmentRead])
def list_appointments(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    pet_id: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    stmt = select(Appointment).where(Appointment.clinic_id == ctx.clinic["id"])
    if branch_id:
        stmt = stmt.where(Appointment.branch_id == branch_id)
    if pet_id:
        stmt = stmt.where(Appointment.pet_id == pet_id)
    if from_:
        stmt = stmt.where(Appointment.start_time >= from_)
    if to:
        stmt = stmt.where(Appointment.start_time <= to)
    stmt = stmt.order_by(Appointment.start_time).limit(limit).offset(offset)
    return _with_names(db, list(db.scalars(stmt)))


def _get_appointment_or_404(db: Session, clinic_id: str, appointment_id: str) -> Appointment:
    appointment = db.scalar(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.clinic_id == clinic_id,
        )
    )
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cita no encontrada")
    return appointment


def _validate_dependencies(db: Session, clinic_id: str, body: AppointmentCreate) -> None:
    if body.end_time <= body.start_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time debe ser posterior a start_time",
        )
    pet = db.scalar(select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente no encontrado en esta clínica",
        )


@router.get("/{appointment_id}", response_model=AppointmentRead)
def get_appointment(
    appointment_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    appointment = _get_appointment_or_404(db, ctx.clinic["id"], appointment_id)
    return _with_names(db, [appointment])[0]


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    body: AppointmentCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> Appointment:
    _validate_dependencies(db, ctx.clinic["id"], body)
    appointment = Appointment(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}", response_model=AppointmentRead)
def update_appointment(
    appointment_id: str,
    body: AppointmentUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> Appointment:
    appointment = _get_appointment_or_404(db, ctx.clinic["id"], appointment_id)
    data = body.model_dump(exclude_unset=True)
    if "start_time" in data or "end_time" in data:
        new_start = data.get("start_time", appointment.start_time)
        new_end = data.get("end_time", appointment.end_time)
        if new_end <= new_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="end_time debe ser posterior a start_time",
            )
    old_status = appointment.status
    for field, value in data.items():
        setattr(appointment, field, value)

    # Auditoría + notificación al cambiar estado (cancelación/no-show)
    if "status" in data and data["status"] != old_status:
        record_audit(
            db,
            clinic_id=ctx.clinic["id"],
            actor_type="user",
            actor_id=ctx.user.sub,
            action=f"appointment_{data['status']}",
            entity_type="appointment",
            entity_id=appointment.id,
            metadata={"from": old_status, "to": data["status"]},
        )
        if data["status"] in ("cancelled", "no_show") and appointment.vet_user_id:
            notify_user(
                db,
                clinic_id=ctx.clinic["id"],
                user_id=appointment.vet_user_id,
                type_="appointment_cancelled",
                message=(
                    f"Cita {data['status']} ({appointment.procedure_type}) para el "
                    f"{appointment.start_time.astimezone().strftime('%d/%m %H:%M')}"
                ),
            )

    db.commit()
    db.refresh(appointment)
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> None:
    appointment = _get_appointment_or_404(db, ctx.clinic["id"], appointment_id)
    db.delete(appointment)
    db.commit()
