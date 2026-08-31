import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field


class PlanStepCreate(BaseModel):
    label: str = Field(min_length=1, max_length=150)
    offset_days: int = Field(ge=0)


class PlanStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    offset_days: int
    position: int


class VaccinationPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    compound: str = Field(min_length=1, max_length=200)
    species: str | None = Field(default=None, max_length=50)
    brand: str | None = Field(default=None, max_length=100)
    prevents: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    active: bool = True
    steps: list[PlanStepCreate] = Field(default_factory=list)


class VaccinationPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    compound: str | None = Field(default=None, min_length=1, max_length=200)
    species: str | None = Field(default=None, max_length=50)
    brand: str | None = Field(default=None, max_length=100)
    prevents: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    active: bool | None = None
    steps: list[PlanStepCreate] | None = None


class VaccinationPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    name: str
    compound: str
    species: str | None
    brand: str | None
    prevents: str | None
    notes: str | None
    active: bool
    is_standard: bool
    created_at: datetime
    steps: list[PlanStepRead] = Field(default_factory=list)


class VaccinationAssignRequest(BaseModel):
    pet_id: uuid.UUID
    plan_id: uuid.UUID
    branch_id: uuid.UUID
    vet_user_id: uuid.UUID | None = None
    start_date: date
    start_time: time = Field(default=time(10, 0))
    duration_minutes: int = Field(default=30, ge=5, le=240)


class DoseUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(scheduled|completed|skipped)$")
    due_date: date | None = None
    date_applied: date | None = None
    lot: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=100)


class DoseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    due_date: date
    status: str
    appointment_id: uuid.UUID | None
    appointment_start: datetime | None = None
    date_applied: date | None = None
    lot: str | None = None
    brand: str | None = None


class PetVaccinationPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pet_id: uuid.UUID
    plan_id: uuid.UUID
    plan_name: str | None = None
    compound: str | None = None
    prevents: str | None = None
    branch_id: uuid.UUID
    branch_name: str | None = None
    vet_user_id: uuid.UUID | None
    vet_name: str | None = None
    start_date: date
    start_time: time
    duration_minutes: int
    steps: list[PlanStepRead] = Field(default_factory=list)
    doses: list[DoseRead] = Field(default_factory=list)
