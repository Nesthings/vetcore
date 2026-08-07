import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PetOwnerCreate(BaseModel):
    """Dueño al registrar la mascota (contacto + alternativo)."""

    full_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=200)
    alt_contact_name: str | None = Field(default=None, max_length=200)
    alt_phone: str | None = Field(default=None, max_length=30)
    accepts_reminders: bool = False


class PetBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    species: str = Field(min_length=1, max_length=50)
    breed: str | None = Field(default=None, max_length=100)
    color_primary: str | None = Field(default=None, max_length=50)
    color_secondary: str | None = Field(default=None, max_length=50)
    markings: str | None = Field(default=None, max_length=100)
    sex: str | None = Field(default=None, max_length=10)
    birth_date: date | None = None
    allergies: str | None = None
    clinical_alert_text: str | None = None
    clinical_photo_url: str | None = None


class PetCreate(PetBase):
    owner: PetOwnerCreate | None = None


class PetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    species: str | None = Field(default=None, min_length=1, max_length=50)
    breed: str | None = Field(default=None, max_length=100)
    color_primary: str | None = Field(default=None, max_length=50)
    color_secondary: str | None = Field(default=None, max_length=50)
    markings: str | None = Field(default=None, max_length=100)
    sex: str | None = Field(default=None, max_length=10)
    birth_date: date | None = None
    allergies: str | None = None
    clinical_alert_text: str | None = None
    clinical_photo_url: str | None = None
    is_active: bool | None = None


class OwnerLinkRead(BaseModel):
    owner_id: uuid.UUID
    full_name: str | None = None
    phone: str | None
    email: str | None
    profile_photo_url: str | None = None
    alt_contact_name: str | None = None
    alt_phone: str | None = None
    linked_at: datetime
    is_active: bool


class OwnerContactUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150)
    alt_contact_name: str | None = Field(default=None, max_length=150)
    alt_phone: str | None = Field(default=None, max_length=30)


class PetRead(PetBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    is_active: bool
    created_at: datetime
    latest_weight_kg: float | None = None
    alert_count: int | None = None
    owners: list[OwnerLinkRead] | None = None


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


class OwnerTransferRequest(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)


class OwnerTransferResponse(BaseModel):
    owner_id: uuid.UUID
    reused: bool
    links_revoked: int
    invitation: dict


class ClinicalAlertCreate(BaseModel):
    type: str = Field(min_length=1, max_length=30)
    description: str = Field(min_length=1)


class ClinicalAlertUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=30)
    description: str | None = Field(default=None, min_length=1)


class ClinicalAlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pet_id: uuid.UUID
    type: str
    description: str
    created_at: datetime
