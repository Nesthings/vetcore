"""Modelos de Hospitalización veterinaria.

Estancia de un paciente (`hospitalizations`) y espacios/jaulas
(`hospitalization_accommodations`). El estado de la estancia es independiente
del estado operativo del paciente (stable/monitoring/delicate/critical) y del
aislamiento (normal/precaución/aislamiento).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import UUIDPkMixin

HOSPITALIZATION_STATUSES = (
    "planned",
    "admitted",
    "active",
    "discharge_pending",
    "discharged",
    "cancelled",
)

OPERATIONAL_STATUSES = ("stable", "monitoring", "delicate", "critical")

ISOLATION_STATUSES = ("normal", "precaution", "isolation")

MONITORING_LEVELS = ("basic", "intermediate", "intensive")

ACCOMMODATION_TYPES = ("general", "uci", "isolation", "recovery", "postop", "other")

ACCOMMODATION_STATUSES = ("available", "occupied", "maintenance", "unavailable")


class HospitalizationAccommodation(UUIDPkMixin, Base):
    """Espacio/jaula de hospitalización, por clínica y sucursal."""

    __tablename__ = "hospitalization_accommodations"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinic_branches.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="general", server_default="general"
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="available", server_default="available"
    )
    max_isolation: Mapped[str] = mapped_column(
        String(20), nullable=False, default="normal", server_default="normal"
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Hospitalization(UUIDPkMixin, Base):
    """Estancia de un paciente en hospitalización."""

    __tablename__ = "hospitalizations"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinic_branches.id"), nullable=False, index=True
    )
    pet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pets.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="admitted", server_default="admitted"
    )
    accommodation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hospitalization_accommodations.id"),
        nullable=True,
    )
    vet_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text)
    diagnosis: Mapped[str | None] = mapped_column(Text)
    monitoring_level: Mapped[str | None] = mapped_column(String(20))
    operational_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="stable", server_default="stable"
    )
    isolation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="normal", server_default="normal"
    )
    admitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expected_discharge_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_discharge_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
