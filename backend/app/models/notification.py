"""Modelos de notificaciones (salientes e internas)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import UUIDPkMixin


class OutboundNotification(UUIDPkMixin, Base):
    """Registro de una notificación saliente (whatsapp/email/sms).

    Sin proveedor configurado todavía, el motor de recordatorios (2.3) registra
    aquí sus envíos con status 'sent' (stub). El template codifica la cita y la
    etapa: `rem:<appointment_id>:<stage>` para deduplicar sin columnas extra.
    """

    __tablename__ = "outbound_notifications"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("owners.id"))
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    template: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="sent", server_default="sent"
    )
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class InternalNotification(UUIDPkMixin, Base):
    """Notificación interna dirigida a un usuario del staff."""

    __tablename__ = "internal_notifications"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
