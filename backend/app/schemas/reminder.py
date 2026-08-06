import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ReminderStage(BaseModel):
    stage: Literal["48h", "24h", "2h"]
    window_time: datetime
    status: Literal["pending", "pending_due", "sent", "not_consented"]
    owner_consented: bool | None = None


class ReminderSchedule(BaseModel):
    appointment_id: uuid.UUID
    pet_name: str | None = None
    vet_name: str | None = None
    start_time: datetime
    consent: bool
    stages: list[ReminderStage]


class PendingReminder(BaseModel):
    appointment_id: uuid.UUID
    pet_name: str | None = None
    procedure_type: str
    start_time: datetime
    next_stage: str | None
    consent: bool


class ReminderRunResult(BaseModel):
    processed: int
    skipped_no_consent: int
    now: datetime
