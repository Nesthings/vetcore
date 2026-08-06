import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PetBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    species: str = Field(min_length=1, max_length=50)
    breed: str | None = Field(default=None, max_length=100)
    sex: str | None = Field(default=None, max_length=10)
    birth_date: date | None = None
    allergies: str | None = None
    clinical_alert_text: str | None = None
    clinical_photo_url: str | None = None


class PetCreate(PetBase):
    pass


class PetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    species: str | None = Field(default=None, min_length=1, max_length=50)
    breed: str | None = Field(default=None, max_length=100)
    sex: str | None = Field(default=None, max_length=10)
    birth_date: date | None = None
    allergies: str | None = None
    clinical_alert_text: str | None = None
    clinical_photo_url: str | None = None
    is_active: bool | None = None


class PetRead(PetBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    is_active: bool
    created_at: datetime
    latest_weight_kg: float | None = None


class PetWeightCreate(BaseModel):
    weight_kg: float = Field(gt=0, le=500)
    consultation_id: uuid.UUID | None = None


class PetWeightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pet_id: uuid.UUID
    clinic_id: uuid.UUID
    weight_kg: float
    recorded_at: datetime
    consultation_id: uuid.UUID | None


class OwnerLinkRead(BaseModel):
    owner_id: uuid.UUID
    phone: str | None
    email: str | None
    linked_at: datetime
    is_active: bool


class OwnerTransferRequest(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)


class OwnerTransferResponse(BaseModel):
    owner_id: uuid.UUID
    reused: bool
    links_revoked: int
    invitation: dict
