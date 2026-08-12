"""Modelos de Hospitalización veterinaria.

Estancia de un paciente (`hospitalizations`), espacios/jaulas
(`hospitalization_accommodations`) y tareas operativas
(`hospitalization_tasks`). El estado de la estancia es independiente del
estado operativo del paciente (stable/monitoring/delicate/critical) y del
aislamiento (normal/precaución/aislamiento).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
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

TASK_TYPES = (
    "vitals",
    "medication",
    "feeding",
    "hydration",
    "review",
    "procedure",
    "cleaning",
    "photo",
    "lab",
    "visit",
    "other",
)

TASK_STATUSES = ("pending", "completed", "overdue", "skipped", "cancelled")

TASK_PRIORITIES = ("low", "normal", "high", "critical")

VITAL_PARAMETERS = (
    "temperature",
    "heart_rate",
    "respiratory_rate",
    "weight",
    "spo2",
    "blood_pressure",
    "glucose",
    "pain",
    "hydration",
    "mucous_membranes",
    "crt",
    "consciousness",
)


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


class HospitalizationTask(UUIDPkMixin, Base):
    """Tarea operativa programada de una hospitalización.

    El estado `overdue` se deriva en lectura (pending con scheduled_at < ahora)
    y se expone en el payload; `completed`/`skipped`/`cancelled` son terminales
    y siempre registran quién y cuándo.
    """

    __tablename__ = "hospitalization_tasks"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="other", server_default="other"
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="normal", server_default="normal"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    completed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observation: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationVital(UUIDPkMixin, Base):
    """Medición de un signo vital/parámetro de la hospitalización.

    Captura manual por el personal; el valor es numérico con unidad y
    `observation` opcional. No se generan diagnósticos automáticos.
    """

    __tablename__ = "hospitalization_vitals"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    parameter: Mapped[str] = mapped_column(String(30), nullable=False)
    value: Mapped[float | None] = mapped_column(Numeric(12, 3))
    unit: Mapped[str | None] = mapped_column(String(20))
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    observation: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationMedicationOrder(UUIDPkMixin, Base):
    """Orden de medicación; el medicamento referencia el catálogo de insumos."""

    __tablename__ = "hospitalization_medication_orders"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinic_branches.id"), nullable=False
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    inventory_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    dose: Mapped[str | None] = mapped_column(String(50))
    unit: Mapped[str | None] = mapped_column(String(20))
    route: Mapped[str | None] = mapped_column(String(30))
    interval_hours: Mapped[int | None] = mapped_column(Integer)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observations: Mapped[str | None] = mapped_column(Text)
    vet_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationMedicationAdministration(UUIDPkMixin, Base):
    """Dosis programada de una orden; registra trazabilidad de la administración."""

    __tablename__ = "hospitalization_medication_administrations"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hospitalization_medication_orders.id"),
        nullable=False,
        index=True,
    )
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    administered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    administered_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    dose_actual: Mapped[str | None] = mapped_column(String(50))
    route_actual: Mapped[str | None] = mapped_column(String(30))
    observation: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationFeed(UUIDPkMixin, Base):
    """Registro de alimentación de la hospitalización."""

    __tablename__ = "hospitalization_feeds"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    diet: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str | None] = mapped_column(String(30))
    amount_offered: Mapped[float | None] = mapped_column(Numeric(10, 2))
    amount_consumed: Mapped[float | None] = mapped_column(Numeric(10, 2))
    unit: Mapped[str | None] = mapped_column(String(20))
    offered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    rejected: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    vomited: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    observations: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationFluid(UUIDPkMixin, Base):
    """Plan de fluidoterapia (registro y cálculo, sin recomendación médica)."""

    __tablename__ = "hospitalization_fluids"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    solution: Mapped[str | None] = mapped_column(Text)
    route: Mapped[str | None] = mapped_column(String(30))
    rate: Mapped[float | None] = mapped_column(Numeric(10, 2))
    rate_unit: Mapped[str | None] = mapped_column(String(20))
    volume: Mapped[float | None] = mapped_column(Numeric(10, 2))
    unit: Mapped[str | None] = mapped_column(String(20))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    observations: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationElimination(UUIDPkMixin, Base):
    """Evento de eliminación (orina, heces o vómito)."""

    __tablename__ = "hospitalization_eliminations"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    present: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    quantity: Mapped[str | None] = mapped_column(String(30))
    consistency: Mapped[str | None] = mapped_column(String(30))
    observations: Mapped[str | None] = mapped_column(Text)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationPainScore(UUIDPkMixin, Base):
    """Puntuación de dolor (escala configurable, sin diagnóstico automático)."""

    __tablename__ = "hospitalization_pain_scores"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    scale: Mapped[str | None] = mapped_column(String(50))
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    observations: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationNote(UUIDPkMixin, Base):
    """Nota de evolución / incidencia / revisión de la hospitalización."""

    __tablename__ = "hospitalization_notes"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(
        String(30), nullable=False, default="evolution", server_default="evolution"
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationIncident(UUIDPkMixin, Base):
    """Incidencia registrada (caída, vómito, reacción, etc.)."""

    __tablename__ = "hospitalization_incidents"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium", server_default="medium"
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    actions_taken: Mapped[str | None] = mapped_column(Text)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationPhoto(UUIDPkMixin, Base):
    """Fotografía asociada a la hospitalización."""

    __tablename__ = "hospitalization_photos"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str | None] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(30))
    description: Mapped[str | None] = mapped_column(Text)
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationShift(UUIDPkMixin, Base):
    """Turno de hospitalización con nota de entrega."""

    __tablename__ = "hospitalization_shifts"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handover_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HospitalizationConfig(UUIDPkMixin, Base):
    """Configuración de hospitalización por clínica (clave/valor JSON)."""

    __tablename__ = "hospitalization_config"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class HospitalizationDischarge(UUIDPkMixin, Base):
    """Alta formal de una hospitalización con resumen y seguimiento."""

    __tablename__ = "hospitalization_discharges"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    hospitalization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hospitalizations.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    checklist: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    follow_up_reason: Mapped[str | None] = mapped_column(Text)
    follow_up_vet_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    discharged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
