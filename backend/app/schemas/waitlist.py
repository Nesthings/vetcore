import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WaitlistCreate(BaseModel):
    branch_id: uuid.UUID
    pet_id: uuid.UUID
    desired_from: datetime
    desired_to: datetime


class WaitlistUpdate(BaseModel):
    status: str = Field(pattern="^(waiting|offered|fulfilled|expired)$")


class WaitlistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clinic_id: uuid.UUID
    branch_id: uuid.UUID
    pet_id: uuid.UUID
    desired_from: datetime
    desired_to: datetime
    status: str
    created_at: datetime
    pet_name: str | None = None
    branch_name: str | None = None
