"""Modelos de pacientes (mascotas) y sus registros de peso."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import UUIDPkMixin


class Pet(UUIDPkMixin, Base):
    __tablename__ = "pets"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    species: Mapped[str] = mapped_column(String(50), nullable=False)
    breed: Mapped[str | None] = mapped_column(String(100))
    sex: Mapped[str | None] = mapped_column(String(10))
    birth_date: Mapped[date | None] = mapped_column(Date)
    allergies: Mapped[str | None] = mapped_column(Text)
    clinical_alert_text: Mapped[str | None] = mapped_column(Text)
    clinical_photo_url: Mapped[str | None] = mapped_column(Text)
    cartilla_photo_url: Mapped[str | None] = mapped_column(Text)
    cartilla_photo_prev_url: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    weight_records: Mapped[list["PetWeightRecord"]] = relationship(
        back_populates="pet", cascade="all, delete-orphan"
    )


class PetWeightRecord(UUIDPkMixin, Base):
    __tablename__ = "pet_weight_records"

    pet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pets.id"), nullable=False, index=True
    )
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False
    )
    weight_kg: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    consultation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("consultations.id")
    )

    pet: Mapped[Pet] = relationship(back_populates="weight_records")
