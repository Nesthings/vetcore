"""Bloqueos manuales de horario — por-tenant, todo el staff."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.db.session import get_db
from app.models import ScheduleBlock, User
from app.schemas.appointment import ScheduleBlockCreate, ScheduleBlockRead

router = APIRouter(
    prefix="/schedule-blocks",
    tags=["schedule-blocks"],
    dependencies=[Depends(require_component("agenda"))],
)


@router.get("", response_model=list[ScheduleBlockRead])
def list_schedule_blocks(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> list[dict]:
    stmt = select(ScheduleBlock).where(ScheduleBlock.clinic_id == ctx.clinic["id"])
    if branch_id:
        stmt = stmt.where(ScheduleBlock.branch_id == branch_id)
    if from_:
        stmt = stmt.where(ScheduleBlock.start_time >= from_)
    if to:
        stmt = stmt.where(ScheduleBlock.start_time <= to)
    stmt = stmt.order_by(ScheduleBlock.start_time)
    blocks = list(db.scalars(stmt))

    vet_ids = {b.vet_user_id for b in blocks if b.vet_user_id}
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )

    out = []
    for b in blocks:
        data = ScheduleBlockRead.model_validate(b).model_dump()
        data["vet_name"] = vets.get(b.vet_user_id)
        out.append(data)
    return out


def _get_block_or_404(db: Session, clinic_id: str, block_id: str) -> ScheduleBlock:
    block = db.scalar(
        select(ScheduleBlock).where(
            ScheduleBlock.id == block_id, ScheduleBlock.clinic_id == clinic_id
        )
    )
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bloqueo no encontrado")
    return block


@router.post("", response_model=ScheduleBlockRead, status_code=status.HTTP_201_CREATED)
def create_schedule_block(
    body: ScheduleBlockCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> ScheduleBlock:
    if body.end_time <= body.start_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time debe ser posterior a start_time",
        )
    block = ScheduleBlock(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@router.patch("/{block_id}", response_model=ScheduleBlockRead)
def update_schedule_block(
    block_id: str,
    body: ScheduleBlockCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> ScheduleBlock:
    block = _get_block_or_404(db, ctx.clinic["id"], block_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(block, field, value)
    if block.end_time <= block.start_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time debe ser posterior a start_time",
        )
    db.commit()
    db.refresh(block)
    return block


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_block(
    block_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> None:
    block = _get_block_or_404(db, ctx.clinic["id"], block_id)
    db.delete(block)
    db.commit()
