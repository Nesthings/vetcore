import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ConsentCreate(BaseModel):
    pet_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    owner_name: str | None = Field(default=None, max_length=200)
    owner_phone: str | None = Field(default=None, max_length=30)
    owner_email: str | None = Field(default=None, max_length=200)
    signature_base64: str = Field(min_length=1, description="PNG en base64 (data URI o cruda)")


class PendingConsentCreate(BaseModel):
    pet_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class ConsentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pet_id: uuid.UUID
    consultation_id: uuid.UUID | None
    owner_id: uuid.UUID | None
    title: str
    body: str
    status: str
    signature_url: str | None
    pdf_url: str | None
    signed_at: datetime
