"""Lista de espera de citas — por-tenant, todo el staff."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.db.session import get_db
from app.models import AppointmentWaitlist, ClinicBranch, Pet
from app.schemas.waitlist import WaitlistCreate, WaitlistRead, WaitlistUpdate

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


def _with_names(db: Session, rows: list[AppointmentWaitlist]) -> list[dict]:
    if not rows:
        return []
    pet_ids = {r.pet_id for r in rows}
    branch_ids = {r.branch_id for r in rows}
    pets = dict(db.execute(select(Pet.id, Pet.name).where(Pet.id.in_(pet_ids))).all())
    branches = dict(
        db.execute(
            select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
        ).all()
    )
    out = []
    for r in rows:
        data = WaitlistRead.model_validate(r).model_dump()
        data["pet_name"] = pets.get(r.pet_id)
        data["branch_name"] = branches.get(r.branch_id)
        out.append(data)
    return out


@router.get("", response_model=list[WaitlistRead])
def list_waitlist(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[dict]:
    stmt = select(AppointmentWaitlist).where(AppointmentWaitlist.clinic_id == ctx.clinic["id"])
    if branch_id:
        stmt = stmt.where(AppointmentWaitlist.branch_id == branch_id)
    if status_filter:
        stmt = stmt.where(AppointmentWaitlist.status == status_filter)
    stmt = stmt.order_by(AppointmentWaitlist.created_at.desc())
    return _with_names(db, list(db.scalars(stmt)))


def _get_waitlist_or_404(db: Session, clinic_id: str, waitlist_id: str) -> AppointmentWaitlist:
    row = db.scalar(
        select(AppointmentWaitlist).where(
            AppointmentWaitlist.id == waitlist_id,
            AppointmentWaitlist.clinic_id == clinic_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    return row


@router.post("", response_model=WaitlistRead, status_code=status.HTTP_201_CREATED)
def create_waitlist(
    body: WaitlistCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> dict:
    if body.desired_to <= body.desired_from:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="desired_to debe ser posterior a desired_from",
        )
    pet = db.scalar(select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == ctx.clinic["id"]))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    row = AppointmentWaitlist(
        clinic_id=ctx.clinic["id"],
        branch_id=body.branch_id,
        pet_id=body.pet_id,
        desired_from=body.desired_from,
        desired_to=body.desired_to,
        status="waiting",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _with_names(db, [row])[0]


@router.patch("/{waitlist_id}", response_model=WaitlistRead)
def update_waitlist(
    waitlist_id: str,
    body: WaitlistUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> dict:
    row = _get_waitlist_or_404(db, ctx.clinic["id"], waitlist_id)
    row.status = body.status
    db.commit()
    db.refresh(row)
    return _with_names(db, [row])[0]


@router.delete("/{waitlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_waitlist(
    waitlist_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> None:
    row = _get_waitlist_or_404(db, ctx.clinic["id"], waitlist_id)
    db.delete(row)
    db.commit()
