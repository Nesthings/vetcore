import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PurchaseOrderItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: float = Field(gt=0)


class PurchaseOrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: float
    product_name: str | None = None


class PurchaseOrderCreate(BaseModel):
    branch_id: uuid.UUID
    supplier_name: str | None = Field(default=None, max_length=200)
    items: list[PurchaseOrderItemCreate] = Field(min_length=1)


class PurchaseOrderUpdate(BaseModel):
    supplier_name: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, pattern="^(draft|sent|received|cancelled)$")
    items: list[PurchaseOrderItemCreate] | None = None


class PurchaseOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    supplier_name: str | None
    status: str
    created_at: datetime
    items: list[PurchaseOrderItemRead] = Field(default_factory=list)
    branch_name: str | None = None
