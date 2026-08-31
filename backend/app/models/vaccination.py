"""Modelos del módulo de planes de vacunación.

`VaccinationPlan` define un esquema de vacunación (nombre, compuesto activo y
una lista de dosis en `steps`). `PetVaccinationPlan` es la asignación de un
plan a una mascota; al asignarse se generan `PetVaccinationDose` (una por
step) y una cita automática por dosis.
"""

import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Time, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import UUIDPkMixin

DOSE_STATUSES = ("scheduled", "completed", "skipped")


class VaccinationPlan(UUIDPkMixin, Base):
    __tablename__ = "vaccination_plans"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    compound: Mapped[str] = mapped_column(String(200), nullable=False)
    species: Mapped[str | None] = mapped_column(String(50))
    brand: Mapped[str | None] = mapped_column(String(100))
    prevents: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    is_standard: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    steps: Mapped[list["VaccinationPlanStep"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="VaccinationPlanStep.position"
    )


class VaccinationPlanStep(UUIDPkMixin, Base):
    __tablename__ = "vaccination_plan_steps"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vaccination_plans.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    offset_days: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    plan: Mapped[VaccinationPlan] = relationship(back_populates="steps")


class PetVaccinationPlan(UUIDPkMixin, Base):
    __tablename__ = "pet_vaccination_plans"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    pet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vaccination_plans.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinic_branches.id"), nullable=False, index=True
    )
    vet_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    doses: Mapped[list["PetVaccinationDose"]] = relationship(
        back_populates="vaccination_plan", cascade="all, delete-orphan",
        order_by="PetVaccinationDose.due_date",
    )


class PetVaccinationDose(UUIDPkMixin, Base):
    __tablename__ = "pet_vaccination_doses"

    pet_vaccination_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pet_vaccination_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="scheduled", server_default="scheduled"
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL")
    )
    date_applied: Mapped[date | None] = mapped_column(Date)
    lot: Mapped[str | None] = mapped_column(String(100))
    brand: Mapped[str | None] = mapped_column(String(100))
    applied_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    vaccination_plan: Mapped[PetVaccinationPlan] = relationship(back_populates="doses")


class PetCarnetRecord(UUIDPkMixin, Base):
    """Aplicación de vacuna registrada en el carnet del paciente.

    Si la aplicación proviene de una dosis del plan (se completó la cita de
    vacunación), `dose_id` la vincula para no duplicarla en las vistas.
    """

    __tablename__ = "pet_carnet_records"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    pet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dose_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pet_vaccination_doses.id", ondelete="SET NULL"), unique=True
    )
    vaccine: Mapped[str] = mapped_column(String(150), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100))
    date_applied: Mapped[date] = mapped_column(Date, nullable=False)
    lot: Mapped[str | None] = mapped_column(String(100))
    vet_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    notes: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
