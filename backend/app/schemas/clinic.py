import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClinicBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)


class ClinicCreate(ClinicBase):
    subscription_status: str = Field(
        default="trial", pattern="^(trial|active|suspended|cancelled)$"
    )


class ClinicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)
    subscription_status: str | None = Field(
        default=None, pattern="^(trial|active|suspended|cancelled)$"
    )


class ClinicRead(ClinicBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subscription_status: str
    created_at: datetime
    updated_at: datetime


class ClinicBranchBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    address: str | None = None
    phone: str | None = Field(default=None, max_length=30)


class ClinicBranchCreate(ClinicBranchBase):
    pass


class ClinicBranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    address: str | None = None
    phone: str | None = Field(default=None, max_length=30)


class ClinicBranchRead(ClinicBranchBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    created_at: datetime
