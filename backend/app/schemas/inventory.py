import uuid
from datetime import datetime

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


class InventoryProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    name: str
    category: str | None
    unit: str | None
    created_at: datetime
