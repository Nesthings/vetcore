import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ConsultationItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=200)
    quantity: float = Field(default=1, gt=0)


class ConsultationItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None
    description: str
    quantity: float


class ConsultationCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    pet_id: uuid.UUID
    vet_user_id: uuid.UUID
    template_id: uuid.UUID | None = None
    reason: str | None = None
    diagnosis: str | None = None
    treatment: str | None = None
    care_instructions: str | None = None
    next_appointment_suggestion: date | None = None
    items: list[ConsultationItemCreate] = Field(default_factory=list)


class ConsultationUpdate(BaseModel):
    branch_id: uuid.UUID | None = None
    reason: str | None = None
    diagnosis: str | None = None
    treatment: str | None = None
    care_instructions: str | None = None
    next_appointment_suggestion: date | None = None


class ConsultationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID | None
    pet_id: uuid.UUID
    vet_user_id: uuid.UUID
    template_id: uuid.UUID | None
    reason: str | None
    diagnosis: str | None
    treatment: str | None
    care_instructions: str | None
    next_appointment_suggestion: date | None
    performed_at: datetime | None
    created_at: datetime
    items: list[ConsultationItemRead] = Field(default_factory=list)


class CheckoutServiceItem(BaseModel):
    service_id: uuid.UUID
    quantity: float = Field(default=1, gt=0)


class CheckoutProductItem(BaseModel):
    product_id: uuid.UUID
    quantity: float = Field(default=1, gt=0)


class ConsultationCheckoutRequest(BaseModel):
    branch_id: uuid.UUID
    pet_id: uuid.UUID
    vet_user_id: uuid.UUID
    reason: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    performed_at: datetime | None = None
    services: list[CheckoutServiceItem] = Field(default_factory=list)
    products: list[CheckoutProductItem] = Field(default_factory=list)
    send_receipt_whatsapp: bool = False


class CheckoutResult(BaseModel):
    consultation_id: uuid.UUID
    invoice_id: uuid.UUID
    summary_pdf_url: str
    receipt_pdf_url: str
    total: float
