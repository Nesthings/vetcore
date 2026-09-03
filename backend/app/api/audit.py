"""Bitácora de auditoría de la clínica — staff."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_component
from app.db.session import get_db
from app.models import AuditLog, User
from app.schemas.events import AuditLogRead

router = APIRouter(
    prefix="/audit-log",
    tags=["audit-log"],
    dependencies=[Depends(require_component("audit"))],
)


@router.get("", response_model=list[AuditLogRead])
def list_audit(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    entity_type: str | None = Query(default=None, max_length=50),
    action: str | None = Query(default=None, max_length=50),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AuditLog]:
    stmt = select(AuditLog).where(AuditLog.clinic_id == ctx.clinic["id"])
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if from_:
        stmt = stmt.where(AuditLog.created_at >= from_)
    if to:
        stmt = stmt.where(AuditLog.created_at <= to)
    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit)
    rows = list(db.scalars(stmt))

    # Resuelve el nombre real del actor (staff de la clínica o dueño) para
    # mostrar trazabilidad legible, no UUIDs ni "user"/"owner".
    user_ids = [r.actor_id for r in rows if r.actor_type == "user"]
    owner_ids = [r.actor_id for r in rows if r.actor_type == "owner"]
    user_names = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids))).all())
        if user_ids
        else {}
    )
    owner_names = (
        dict(db.execute(text("SELECT id, full_name FROM owners WHERE id = ANY(:ids)"), {"ids": owner_ids}).all())
        if owner_ids
        else {}
    )

    out = []
    for r in rows:
        data = AuditLogRead.model_validate(r).model_dump()
        data["actor_name"] = user_names.get(r.actor_id) or owner_names.get(r.actor_id)
        out.append(AuditLogRead(**data))
    return out
