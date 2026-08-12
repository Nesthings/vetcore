"""Schemas de Hospitalización (estancias y espacios)."""

import uuid
from datetime import datetime

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
