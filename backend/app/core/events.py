"""Helpers transversales: notificaciones internas y bitácora de auditoría."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, InternalNotification, User


def notify_user(
    db: Session, clinic_id: uuid.UUID, user_id: uuid.UUID, type_: str, message: str
) -> None:
    db.add(InternalNotification(clinic_id=clinic_id, user_id=user_id, type=type_, message=message))


def notify_roles(
    db: Session, clinic_id: uuid.UUID, roles: list[str], type_: str, message: str
) -> None:
    """Notifica a todos los usuarios activos de la clínica con los roles dados."""
    user_ids = db.scalars(
        select(User.id).where(
            User.clinic_id == clinic_id,
            User.role.in_(roles),
            User.is_active.is_(True),
        )
    ).all()
    for uid in user_ids:
        notify_user(db, clinic_id, uid, type_, message)


def record_audit(
    db: Session,
    *,
    clinic_id: uuid.UUID | None,
    actor_type: str,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    metadata: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            clinic_id=clinic_id,
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata,
        )
    )
