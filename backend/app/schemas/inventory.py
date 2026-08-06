import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class InventoryProductCreate(BaseModel):
    branch_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=50)
    unit: str | None = Field(default=None, max_length=20)


class InventoryProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=50)
    unit: str | None = Field(default=None, max_length=20)


class InventoryLotCreate(BaseModel):
    lot_number: str | None = Field(default=None, max_length=100)
    expiration_date: date | None = None
    quantity: float = Field(gt=0)


class InventoryLotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    lot_number: str | None
    expiration_date: date | None
    quantity: float


class StockEntryCreate(BaseModel):
    quantity: float = Field(gt=0)
    reason: str = Field(min_length=1, max_length=50)


class InventoryProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    name: str
    category: str | None
    unit: str | None
    created_at: datetime

    # Enriquecido
    stock: float = 0
    lots: list[InventoryLotRead] = Field(default_factory=list)
    expiring_soon: bool = False
    expired: bool = False
