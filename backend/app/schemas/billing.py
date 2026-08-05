import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=200)
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(gt=0)


class InvoiceItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None
    description: str
    quantity: float
    unit_price: float


class InvoiceCreate(BaseModel):
    branch_id: uuid.UUID
    owner_id: uuid.UUID | None = None
    pet_id: uuid.UUID | None = None
    consultation_id: uuid.UUID | None = None
    status: str = Field(default="paid", pattern="^(pending|paid|cancelled)$")
    items: list[InvoiceItemCreate] = Field(min_length=1)


class InvoiceUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(pending|paid|cancelled)$")


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    owner_id: uuid.UUID | None
    pet_id: uuid.UUID | None
    consultation_id: uuid.UUID | None
    total: Decimal
    status: str
    created_at: datetime
    items: list[InvoiceItemRead] = Field(default_factory=list)
