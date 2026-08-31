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


class CreateClinicInvited(ClinicCreate):
    """Alta de clínica a través del link único del super-admin."""
    token: str = Field(min_length=1)


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
    stock_alert_threshold: float | None = Field(default=None, ge=0, le=10000)
    birthday_message: str | None = Field(default=None, max_length=2000)
    birthday_send_email: bool | None = None
    birthday_send_whatsapp: bool | None = None


class ClinicRead(ClinicBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subscription_status: str
    logo_url: str | None = None
    setup_completed: bool
    stock_alert_threshold: float
    birthday_message: str | None = None
    birthday_send_email: bool = False
    birthday_send_whatsapp: bool = False
    whatsapp_phone_number: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_business_account_id: str | None = None
    whatsapp_enabled: bool = False
    created_at: datetime
    updated_at: datetime


class WhatsAppConfig(BaseModel):
    """Credenciales de WhatsApp Business (Cloud API) de la clínica.

    El `access_token` es sensible: se cifra en la BD y nunca se devuelve.
    """

    phone_number: str | None = Field(default=None, max_length=30)
    phone_number_id: str | None = Field(default=None, max_length=100)
    business_account_id: str | None = Field(default=None, max_length=100)
    access_token: str | None = Field(default=None, max_length=1024)
    reminder_template: str | None = Field(default=None, max_length=100)
    birthday_template: str | None = Field(default=None, max_length=100)
    receipt_template: str | None = Field(default=None, max_length=100)
    receipt_document_template: str | None = Field(default=None, max_length=100)
    cartilla_template: str | None = Field(default=None, max_length=100)
    template_language: str | None = Field(default=None, max_length=20)


class WhatsAppTestRequest(BaseModel):
    to: str = Field(default="", max_length=30, description="Teléfono E.164 de destino")


class WhatsAppStatus(BaseModel):
    enabled: bool
    phone_number: str | None
    phone_number_id: str | None
    business_account_id: str | None
    token_configured: bool
    reminder_template: str | None = None
    birthday_template: str | None = None
    receipt_template: str | None = None
    receipt_document_template: str | None = None
    cartilla_template: str | None = None
    template_language: str = "es_MX"


class ClinicInviteCreate(BaseModel):
    clinic_name: str | None = Field(default=None, max_length=200)
    contact_email: str | None = Field(default=None, max_length=200)
    expires_in_days: int = Field(default=30, ge=1, le=365)


class ClinicInviteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    token: str
    clinic_name: str | None
    contact_email: str | None
    status: str
    expires_at: datetime
    used_at: datetime | None
    created_at: datetime


class StaffResetPassword(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


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
