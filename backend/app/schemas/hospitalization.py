"""Schemas de Hospitalización (estancias, espacios y tareas)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

# --- Espacios / jaulas ---


class AccommodationCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=150)
    branch_id: uuid.UUID
    type: str = Field(default="general", max_length=30)
    capacity: int = Field(default=1, ge=1, le=50)
    status: str = Field(default="available", max_length=20)
    max_isolation: str = Field(default="normal", max_length=20)
    active: bool = True


class AccommodationUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    type: str | None = Field(default=None, max_length=30)
    capacity: int | None = Field(default=None, ge=1, le=50)
    status: str | None = Field(default=None, max_length=20)
    max_isolation: str | None = Field(default=None, max_length=20)
    active: bool | None = None


class AccommodationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    code: str
    name: str
    type: str
    capacity: int
    status: str
    max_isolation: str
    active: bool
    created_at: datetime


# --- Hospitalizaciones ---


class HospitalizationCreate(BaseModel):
    pet_id: uuid.UUID
    branch_id: uuid.UUID
    status: str = Field(default="admitted", max_length=20)
    accommodation_id: uuid.UUID | None = None
    vet_user_id: uuid.UUID | None = None
    reason: str | None = None
    diagnosis: str | None = None
    monitoring_level: str | None = Field(default=None, max_length=20)
    operational_status: str = Field(default="stable", max_length=20)
    isolation_status: str = Field(default="normal", max_length=20)
    expected_discharge_at: datetime | None = None
    notes: str | None = None


class HospitalizationUpdate(BaseModel):
    reason: str | None = None
    diagnosis: str | None = None
    monitoring_level: str | None = Field(default=None, max_length=20)
    operational_status: str | None = Field(default=None, max_length=20)
    isolation_status: str | None = Field(default=None, max_length=20)
    expected_discharge_at: datetime | None = None
    notes: str | None = None
    accommodation_id: uuid.UUID | None = None
    vet_user_id: uuid.UUID | None = None


class HospitalizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    pet_id: uuid.UUID
    status: str
    accommodation_id: uuid.UUID | None
    vet_user_id: uuid.UUID | None
    reason: str | None
    diagnosis: str | None
    monitoring_level: str | None
    operational_status: str
    isolation_status: str
    admitted_at: datetime
    expected_discharge_at: datetime | None
    actual_discharge_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


# --- Tareas ---


class HospitalizationTaskCreate(BaseModel):
    type: str = Field(default="other", max_length=30)
    description: str = Field(min_length=1, max_length=255)
    scheduled_at: datetime
    priority: str = Field(default="normal", max_length=20)
    assigned_user_id: uuid.UUID | None = None


class HospitalizationTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    type: str
    description: str
    scheduled_at: datetime
    priority: str
    status: str
    assigned_user_id: uuid.UUID | None
    completed_by: uuid.UUID | None
    completed_at: datetime | None
    observation: str | None
    created_at: datetime


# --- Signos vitales ---


class VitalMeasurement(BaseModel):
    parameter: str = Field(min_length=1, max_length=30)
    value: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    observation: str | None = None


class VitalBatchCreate(BaseModel):
    observed_at: datetime | None = None
    measurements: list[VitalMeasurement] = Field(min_length=1, max_length=30)


class HospitalizationVitalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    parameter: str
    value: float | None
    unit: str | None
    observed_at: datetime
    user_id: uuid.UUID | None
    observation: str | None
    created_at: datetime


# --- Medicamentos ---


class MedicationOrderCreate(BaseModel):
    inventory_product_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    dose: str | None = Field(default=None, max_length=50)
    unit: str | None = Field(default=None, max_length=20)
    route: str | None = Field(default=None, max_length=30)
    interval_hours: int | None = Field(default=None, ge=1, le=168)
    start_at: datetime
    end_at: datetime | None = None
    observations: str | None = None
    vet_user_id: uuid.UUID | None = None


class MedicationOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    hospitalization_id: uuid.UUID
    inventory_product_id: uuid.UUID | None
    name: str
    dose: str | None
    unit: str | None
    route: str | None
    interval_hours: int | None
    start_at: datetime
    end_at: datetime | None
    observations: str | None
    vet_user_id: uuid.UUID | None
    active: bool
    created_at: datetime


class MedicationAdministrationCreate(BaseModel):
    scheduled_at: datetime
    dose: str | None = Field(default=None, max_length=50)
    route: str | None = Field(default=None, max_length=30)


class MedicationAdministrationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    order_id: uuid.UUID
    scheduled_at: datetime
    status: str
    administered_at: datetime | None
    administered_by: uuid.UUID | None
    dose_actual: str | None
    route_actual: str | None
    observation: str | None
    created_at: datetime


# --- Cuidados: alimentación / fluidos / eliminación / dolor ---


class FeedCreate(BaseModel):
    diet: str | None = None
    type: str | None = Field(default=None, max_length=30)
    amount_offered: float | None = Field(default=None, ge=0)
    amount_consumed: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    offered_at: datetime | None = None
    rejected: bool = False
    vomited: bool = False
    observations: str | None = None


class FeedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    diet: str | None
    type: str | None
    amount_offered: float | None
    amount_consumed: float | None
    unit: str | None
    offered_at: datetime
    user_id: uuid.UUID | None
    rejected: bool
    vomited: bool
    observations: str | None


class FluidCreate(BaseModel):
    solution: str | None = None
    route: str | None = Field(default=None, max_length=30)
    rate: float | None = Field(default=None, ge=0)
    rate_unit: str | None = Field(default=None, max_length=20)
    volume: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    started_at: datetime
    observations: str | None = None


class FluidRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    solution: str | None
    route: str | None
    rate: float | None
    rate_unit: str | None
    volume: float | None
    unit: str | None
    started_at: datetime
    ended_at: datetime | None
    user_id: uuid.UUID | None
    observations: str | None


class EliminationCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=20)
    present: bool = True
    quantity: str | None = Field(default=None, max_length=30)
    consistency: str | None = Field(default=None, max_length=30)
    observations: str | None = None
    observed_at: datetime | None = None


class EliminationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    kind: str
    present: bool
    quantity: str | None
    consistency: str | None
    observations: str | None
    observed_at: datetime
    user_id: uuid.UUID | None


class PainCreate(BaseModel):
    score: int = Field(ge=0, le=10)
    scale: str | None = Field(default=None, max_length=50)
    observations: str | None = None
    observed_at: datetime | None = None


class PainRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    score: int
    scale: str | None
    observed_at: datetime
    user_id: uuid.UUID | None
    observations: str | None


# --- Evolución, incidencias y fotos ---


class NoteCreate(BaseModel):
    category: str = Field(default="evolution", max_length=30)
    text: str = Field(min_length=1)


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    category: str
    text: str
    user_id: uuid.UUID | None
    created_at: datetime


class IncidentCreate(BaseModel):
    severity: str = Field(default="medium", max_length=20)
    description: str = Field(min_length=1)
    actions_taken: str | None = None
    observed_at: datetime | None = None


class IncidentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    severity: str
    description: str
    actions_taken: str | None
    observed_at: datetime
    user_id: uuid.UUID | None


class HospitalizationPhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    url: str
    label: str | None
    category: str | None
    description: str | None
    taken_at: datetime
    user_id: uuid.UUID | None


# --- Alta ---


class DischargeChecklistItem(BaseModel):
    item: str
    done: bool = False


class DischargeCreate(BaseModel):
    reason: str | None = None
    summary: str | None = None
    checklist: list[DischargeChecklistItem] = Field(default_factory=list)
    follow_up_date: date | None = None
    follow_up_reason: str | None = None
    follow_up_vet_user_id: uuid.UUID | None = None


class DischargeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    hospitalization_id: uuid.UUID
    user_id: uuid.UUID | None
    reason: str | None
    summary: str | None
    checklist: list[dict]
    follow_up_date: date | None
    follow_up_reason: str | None
    follow_up_vet_user_id: uuid.UUID | None
    discharged_at: datetime
