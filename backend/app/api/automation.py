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
from app.services.queue import dispatch
from app.services.whatsapp import normalize_mx

router = APIRouter(
    prefix="/automation",
    tags=["automation"],
    dependencies=[Depends(require_component("automation"))],
)

REMINDER_STAGES: list[tuple[str, int]] = [("48h", 48), ("24h", 24), ("2h", 2)]


def _reminder_template(appointment_id: str, stage: str) -> str:
    # Codifica cita + etapa para deduplicar sin columnas extra en el esquema.
    return f"rem:{appointment_id}:{stage}"


def _consents_batch(
    db: Session, clinic_id: str, pet_ids: list[str]
) -> dict[str, tuple[str | None, bool]]:
    """Consentimiento (owner_id, accepts) en batch por pet_id."""
    if not pet_ids:
        return {}
    rows = (
        db.execute(
            text(
                "SELECT l.pet_id AS pet_id, l.owner_id AS owner_id, "
                "       COALESCE(op.accepts_reminders, false) AS accepts "
                "FROM owner_pet_links l "
                "LEFT JOIN owner_preferences op ON op.owner_id = l.owner_id "
                "WHERE l.pet_id = ANY(:pids) AND l.clinic_id = :c AND l.is_active = true"
            ),
            {"pids": pet_ids, "c": clinic_id},
        )
        .mappings()
        .all()
    )
    out: dict[str, tuple[str | None, bool]] = {}
    for r in rows:
        out.setdefault(str(r["pet_id"]), (str(r["owner_id"]), bool(r["accepts"])))
    return out


def _sent_templates_batch(
    db: Session, templates: list[str], clinic_id: str | None = None
) -> set[str]:
    if not templates:
        return set()
    stmt = select(OutboundNotification.template).where(
        OutboundNotification.template.in_(templates),
        # Incluye "queued": un recordatorio ya encolado (pendiente de enviar por
        # el worker) no debe volver a enviarse si run_reminders corre de nuevo.
        OutboundNotification.status.in_(("sent", "queued")),
    )
    if clinic_id:
        stmt = stmt.where(OutboundNotification.clinic_id == clinic_id)
    return set(db.scalars(stmt).all())


def _owner_phones_batch(db: Session, owner_ids: list[str]) -> dict[str, str | None]:
    if not owner_ids:
        return {}
    rows = db.execute(
        text("SELECT id, phone FROM owners WHERE id = ANY(:ids)"), {"ids": owner_ids}
    ).all()
    return {str(r[0]): r[1] for r in rows}


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

    pet = db.get(Pet, appointment.pet_id) if appointment.pet_id else None
    vet = db.get(User, appointment.vet_user_id) if appointment.vet_user_id else None
    _, consent = (
        _consents_batch(db, ctx.clinic["id"], [str(appointment.pet_id)]).get(
            str(appointment.pet_id), (None, False)
        )
        if appointment.pet_id
        else (None, False)
    )

    templates = [_reminder_template(appointment_id, stage) for stage, _ in REMINDER_STAGES]
    sent = _sent_templates_batch(db, templates, clinic_id=ctx.clinic["id"])

    stages = []
    for stage, hours in REMINDER_STAGES:
        window_time = appointment.start_time - timedelta(hours=hours)
        status_value: str
        if _reminder_template(appointment_id, stage) in sent:
            status_value = "sent"
        elif not consent:
            status_value = "not_consented"
        else:
            status_value = "pending_due" if window_time <= datetime.now(UTC) else "pending"
        stages.append(
            ReminderStage(
                stage=stage,
                window_time=window_time,
                status=status_value,
                owner_consented=consent,
            )
        )
    return ReminderSchedule(
        appointment_id=appointment.id,
        pet_name=pet.name if pet else appointment.walk_in_name,
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
                Appointment.pet_id.is_not(None),
                Appointment.status.in_(["scheduled", "confirmed"]),
                Appointment.start_time > now,
                Appointment.start_time <= horizon,
            )
        )
    )

    # Datos en batch: consentimientos, teléfonos, mascotas y estados ya enviados.
    pet_ids = [str(a.pet_id) for a in appointments if a.pet_id]
    consents = _consents_batch(db, ctx.clinic["id"], pet_ids)
    owner_ids = [c[0] for c in consents.values() if c[0]]
    phones = _owner_phones_batch(db, owner_ids)
    pets = {
        str(p.id): p for p in db.scalars(select(Pet).where(Pet.clinic_id == ctx.clinic["id"])).all()
    }
    all_templates = [
        _reminder_template(str(a.id), stage) for a in appointments for stage, _ in REMINDER_STAGES
    ]
    sent_templates = _sent_templates_batch(db, all_templates)

    processed = 0
    skipped_no_consent = 0
    not_configured = 0
    failed = 0
    clinic_name = ctx.clinic["name"]
    for appt in appointments:
        owner_id, consent = consents.get(str(appt.pet_id), (None, False))
        if owner_id is None:
            continue
        owner_phone = phones.get(owner_id)
        pet = pets.get(str(appt.pet_id)) if appt.pet_id else None
        pet_name = pet.name if pet else (appt.walk_in_name or "tu mascota")
        for stage, hours in REMINDER_STAGES:
            if now < appt.start_time - timedelta(hours=hours):
                continue  # la etapa aún no toca
            template = _reminder_template(str(appt.id), stage)
            if template in sent_templates:
                continue
            if not consent:
                skipped_no_consent += 1
                continue
            start = appt.start_time.astimezone()
            msg = (
                f"Recordatorio · {pet_name}: tu cita ({appt.procedure_type}) "
                f"es el {start.strftime('%d/%m')} a las {start.strftime('%H:%M')}."
                f" — {clinic_name}"
            )
            to = normalize_mx(owner_phone)
            if not to:
                failed += 1
                continue
            res = dispatch(
                db,
                ctx.clinic["id"],
                "reminder",
                to,
                msg,
                [pet_name, start.strftime("%d/%m"), start.strftime("%H:%M")],
                template,
                owner_id,
            )
            if res["ok"]:
                processed += 1
            elif res["error"] == "not_configured":
                not_configured += 1
            else:
                failed += 1

    db.commit()
    return ReminderRunResult(
        processed=processed,
        skipped_no_consent=skipped_no_consent,
        not_configured=not_configured,
        failed=failed,
        now=now,
    )


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

    pet_ids = [str(a.pet_id) for a in appointments if a.pet_id]
    consents = _consents_batch(db, ctx.clinic["id"], pet_ids)
    pets = {
        str(p.id): p for p in db.scalars(select(Pet).where(Pet.clinic_id == ctx.clinic["id"])).all()
    }
    all_templates = [
        _reminder_template(str(a.id), stage) for a in appointments for stage, _ in REMINDER_STAGES
    ]
    sent_templates = _sent_templates_batch(db, all_templates, clinic_id=ctx.clinic["id"])

    out = []
    for appt in appointments:
        _, consent = consents.get(str(appt.pet_id), (None, False))
        next_stage = None
        for stage, hours in REMINDER_STAGES:
            if now < appt.start_time - timedelta(hours=hours):
                continue
            template = _reminder_template(str(appt.id), stage)
            if template not in sent_templates:
                next_stage = stage if consent else None
                break
        pet = pets.get(str(appt.pet_id))
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
