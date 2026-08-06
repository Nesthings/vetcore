import uuid

from pydantic import BaseModel, ConfigDict, Field


class KitItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: float = Field(gt=0)


class KitItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: float
    product_name: str | None = None


class KitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    price: float = Field(ge=0)
    items: list[KitItemCreate] = Field(default_factory=list)


class KitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    price: float | None = Field(default=None, ge=0)
    items: list[KitItemCreate] | None = None


class KitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    name: str
    price: float
    items: list[KitItemRead] = Field(default_factory=list)
