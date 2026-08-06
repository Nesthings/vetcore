"""Motor de recordatorios escalonados (48h / 24h / 2h).

El envío WhatsApp real queda como stub (no hay proveedor configurado): el
motor calcula la etapa, verifica el CONSENTIMIENTO opt-in (principio 10) y
registra la notificación en `outbound_notifications` con status 'sent'.
Sin `accepts_reminders`, el recordatorio NO se envía (nunca por defecto).
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_component
from app.db.session import get_db
from app.models import Appointment, OutboundNotification, Pet, User
from app.schemas.reminder import PendingReminder, ReminderRunResult, ReminderSchedule, ReminderStage

router = APIRouter(
    prefix="/automation",
    tags=["automation"],
    dependencies=[Depends(require_component("automation"))],
)

REMINDER_STAGES: list[tuple[str, int]] = [("48h", 48), ("24h", 24), ("2h", 2)]


def _reminder_template(appointment_id: str, stage: str) -> str:
    # Codifica cita + etapa para deduplicar sin columnas extra en el esquema.
    return f"rem:{appointment_id}:{stage}"


def _get_consent(db: Session, clinic_id: str, pet_id: str) -> tuple[str | None, bool]:
    owner_id = db.execute(
        text(
            "SELECT owner_id FROM owner_pet_links "
            "WHERE pet_id = :p AND clinic_id = :c AND is_active = true LIMIT 1"
        ),
        {"p": pet_id, "c": clinic_id},
    ).scalar()
    if owner_id is None:
        return None, False
    accepts = db.execute(
        text("SELECT accepts_reminders FROM owner_preferences WHERE owner_id = :o"),
        {"o": owner_id},
    ).scalar()
    return str(owner_id), bool(accepts)


def _stage_status(
    db: Session, appointment_id: str, stage: str, window_time: datetime, consent: bool
) -> str:
    exists = db.scalar(
        select(OutboundNotification.id).where(
            OutboundNotification.template == _reminder_template(str(appointment_id), stage)
        )
    )
    if exists:
        return "sent"
    if not consent:
        return "not_consented"
    return "pending_due" if window_time <= datetime.now(UTC) else "pending"


@router.get(
    "/appointments/{appointment_id}/reminder-schedule",
    response_model=ReminderSchedule,
    summary="Cronograma de recordatorios de la cita",
)
def reminder_schedule(
    appointment_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ReminderSchedule:
    appointment = db.scalar(
        select(Appointment).where(
            Appointment.id == appointment_id, Appointment.clinic_id == ctx.clinic["id"]
        )
    )
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cita no encontrada")

    pet = db.get(Pet, appointment.pet_id)
    vet = db.get(User, appointment.vet_user_id) if appointment.vet_user_id else None
    _, consent = _get_consent(db, ctx.clinic["id"], str(appointment.pet_id))

    stages = []
    for stage, hours in REMINDER_STAGES:
        window_time = appointment.start_time - timedelta(hours=hours)
        stages.append(
            ReminderStage(
                stage=stage,
                window_time=window_time,
                status=_stage_status(db, appointment_id, stage, window_time, consent),
                owner_consented=consent,
            )
        )
    return ReminderSchedule(
        appointment_id=appointment.id,
        pet_name=pet.name if pet else None,
        vet_name=vet.full_name if vet else None,
        start_time=appointment.start_time,
        consent=consent,
        stages=stages,
    )


@router.post("/reminders/run", response_model=ReminderRunResult)
def run_reminders(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ReminderRunResult:
    """Procesa los recordatorios vencidos de las citas próximas (≤48h)."""
    now = datetime.now(UTC)
    horizon = now + timedelta(hours=48)

    appointments = list(
        db.scalars(
            select(Appointment).where(
                Appointment.clinic_id == ctx.clinic["id"],
                Appointment.status.in_(["scheduled", "confirmed"]),
                Appointment.start_time > now,
                Appointment.start_time <= horizon,
            )
        )
    )

    processed = 0
    skipped_no_consent = 0
    for appt in appointments:
        owner_id, consent = _get_consent(db, ctx.clinic["id"], str(appt.pet_id))
        for stage, hours in REMINDER_STAGES:
            if now < appt.start_time - timedelta(hours=hours):
                continue  # la etapa aún no toca
            template = _reminder_template(str(appt.id), stage)
            exists = db.scalar(
                select(OutboundNotification.id).where(OutboundNotification.template == template)
            )
            if exists:
                continue
            if not consent:
                skipped_no_consent += 1
                continue
            db.add(
                OutboundNotification(
                    clinic_id=ctx.clinic["id"],
                    owner_id=owner_id,
                    channel="whatsapp",
                    template=template,
                    status="sent",
                )
            )
            processed += 1

    db.commit()
    return ReminderRunResult(processed=processed, skipped_no_consent=skipped_no_consent, now=now)


@router.get("/reminders/pending", response_model=list[PendingReminder])
def pending_reminders(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[PendingReminder]:
    now = datetime.now(UTC)
    horizon = now + timedelta(hours=48)
    appointments = list(
        db.scalars(
            select(Appointment)
            .where(
                Appointment.clinic_id == ctx.clinic["id"],
                Appointment.status.in_(["scheduled", "confirmed"]),
                Appointment.start_time > now,
                Appointment.start_time <= horizon,
            )
            .order_by(Appointment.start_time)
        )
    )

    pets = {p.id: p for p in db.scalars(select(Pet).where(Pet.clinic_id == ctx.clinic["id"])).all()}
    out = []
    for appt in appointments:
        _, consent = _get_consent(db, ctx.clinic["id"], str(appt.pet_id))
        next_stage = None
        for stage, hours in REMINDER_STAGES:
            if now < appt.start_time - timedelta(hours=hours):
                continue
            template = _reminder_template(str(appt.id), stage)
            exists = db.scalar(
                select(OutboundNotification.id).where(OutboundNotification.template == template)
            )
            if not exists:
                next_stage = stage if consent else None
                break
        pet = pets.get(appt.pet_id)
        out.append(
            PendingReminder(
                appointment_id=appt.id,
                pet_name=pet.name if pet else None,
                procedure_type=appt.procedure_type,
                start_time=appt.start_time,
                next_stage=next_stage,
                consent=consent,
            )
        )
    return out
