import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SurveyCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comments: str | None = None


class SurveyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    consultation_id: uuid.UUID
    rating: int
    comments: str | None
    created_at: datetime


class PhotoEvolutionItem(BaseModel):
    url: str
    consultation_id: uuid.UUID
    consultation_date: datetime
    reason: str | None = None


class OwnerPreferencesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    preferred_channel: str
    accepts_reminders: bool
    accepts_reminders_at: datetime | None = None


class OwnerPreferencesUpdate(BaseModel):
    preferred_channel: str | None = Field(default=None, pattern="^(whatsapp|email|sms)$")
    accepts_reminders: bool | None = None
