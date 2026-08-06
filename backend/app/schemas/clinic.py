import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClinicBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=2000)
    rfc: str | None = Field(default=None, max_length=50)
    fiscal_name: str | None = Field(default=None, max_length=200)
    timezone: str = "UTC"
    currency: str = "MXN"


class ClinicCreate(ClinicBase):
    subscription_status: str = Field(
        default="trial", pattern="^(trial|active|suspended|cancelled)$"
    )
    first_admin: "FirstAdminCreate | None" = None


class FirstAdminCreate(BaseModel):
    """Primer super-usuario (admin) de una clínica nueva.

    Se crea junto con la clínica para que su primer login arranque el wizard
    de configuración (setup_completed=false).
    """

    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    professional_title: str | None = Field(default=None, max_length=150)
    cedula: str | None = Field(default=None, max_length=50)


ClinicCreate.model_rebuild()


class ClinicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)
    subscription_status: str | None = Field(
        default=None, pattern="^(trial|active|suspended|cancelled)$"
    )
    address: str | None = Field(default=None, max_length=2000)
    rfc: str | None = Field(default=None, max_length=50)
    fiscal_name: str | None = Field(default=None, max_length=200)
    timezone: str | None = Field(default=None, max_length=50)
    currency: str | None = Field(default=None, max_length=10)
    setup_completed: bool | None = None


class ClinicRead(ClinicBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subscription_status: str
    logo_url: str | None = None
    setup_completed: bool
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


class ClinicSubscriptionChange(BaseModel):
    status: str = Field(pattern="^(trial|active|suspended|cancelled)$")
    notes: str | None = None


class ClinicSubscriptionEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    event_type: str
    amount: float | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime


class ClinicSummaryRead(BaseModel):
    id: uuid.UUID
    name: str
    subscription_status: str
    branches: int
    staff: int
    pets: int
    appointments: int
    invoices: int
