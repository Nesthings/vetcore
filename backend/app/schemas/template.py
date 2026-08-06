import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TemplateField(BaseModel):
    key: str = Field(min_length=1, max_length=50, pattern="^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=100)
    type: Literal["text", "textarea", "number", "select"] = "text"
    options: list[str] | None = None
    required: bool = False


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    species: str | None = Field(default=None, max_length=50)
    fields: list[TemplateField] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    species: str | None = Field(default=None, max_length=50)
    fields: list[TemplateField] | None = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    name: str
    species: str | None
    fields: list[TemplateField] = Field(validation_alias="fields_json")
    created_at: datetime
