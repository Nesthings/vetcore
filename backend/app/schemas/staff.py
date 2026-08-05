import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

STAFF_ROLE_VALUES = ("admin", "veterinario", "recepcion")


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(admin|veterinario|recepcion)$")
    phone: str | None = Field(default=None, max_length=30)
    branch_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=3, max_length=200)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: str | None = Field(default=None, pattern="^(admin|veterinario|recepcion)$")
    phone: str | None = Field(default=None, max_length=30)
    branch_id: uuid.UUID | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID | None
    role: str
    full_name: str
    email: str
    phone: str | None
    is_active: bool
    created_at: datetime
