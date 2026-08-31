import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AppointmentCreate(BaseModel):
    branch_id: uuid.UUID
    pet_id: uuid.UUID | None = None
    walk_in_name: str | None = Field(default=None, max_length=100)
    vet_user_id: uuid.UUID | None = None
    procedure_type: str = Field(min_length=1, max_length=50)
    start_time: datetime
    end_time: datetime
    status: str = Field(
        default="scheduled", pattern="^(scheduled|confirmed|completed|cancelled|no_show)$"
    )

    @model_validator(mode="after")
    def _pet_or_walk_in(self) -> "AppointmentCreate":
        if self.pet_id is None and not (self.walk_in_name or "").strip():
            raise ValueError("Indica un paciente o un nombre sin registro")
        return self


class AppointmentUpdate(BaseModel):
    branch_id: uuid.UUID | None = None
    pet_id: uuid.UUID | None = None
    walk_in_name: str | None = Field(default=None, max_length=100)
    vet_user_id: uuid.UUID | None = None
    procedure_type: str | None = Field(default=None, min_length=1, max_length=50)
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: str | None = Field(
        default=None, pattern="^(scheduled|confirmed|completed|cancelled|no_show)$"
    )


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    pet_id: uuid.UUID | None
    walk_in_name: str | None = None
    vet_user_id: uuid.UUID | None
    procedure_type: str
    start_time: datetime
    end_time: datetime
    status: str
    created_at: datetime

    # Nombres enriquecidos (para la UI de la agenda)
    pet_name: str | None = None
    vet_name: str | None = None
    branch_name: str | None = None


class ScheduleBlockCreate(BaseModel):
    branch_id: uuid.UUID
    vet_user_id: uuid.UUID | None = None
    start_time: datetime
    end_time: datetime
    reason: str | None = Field(default=None, max_length=200)


class ScheduleBlockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    vet_user_id: uuid.UUID | None
    start_time: datetime
    end_time: datetime
    reason: str | None
    vet_name: str | None = None
