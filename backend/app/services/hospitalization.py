"""Servicio de Hospitalización — motor de tareas de monitorización.

Genera tareas de "signos vitales" según el nivel de monitorización de cada
hospitalización, sin duplicar slots y sin diagnósticos automáticos (el estado
clínico lo fija el personal).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Hospitalization, HospitalizationTask

MONITORING_INTERVAL_MINUTES = {
    "basic": 240,
    "intermediate": 120,
    "intensive": 60,
}

MONITORING_LOOKAHEAD_HOURS = 24


def monitoring_interval_minutes(level: str | None, intervals: dict | None = None) -> int:
    base = intervals or MONITORING_INTERVAL_MINUTES
    return base.get(level or "", 240)


def _slot_floor(dt: datetime, minutes: int) -> datetime:
    epoch = int(dt.timestamp())
    slot = epoch - (epoch % (minutes * 60))
    return datetime.fromtimestamp(slot, tz=UTC)


def sync_monitoring_tasks(db: Session, hospitalization: Hospitalization) -> int:
    """Genera (si faltan) las tareas de signos vitales del próximo lookahead.

    Solo actúa si la hospitalización tiene nivel de monitorización. No duplica:
    un slot ya cubierto por una tarea pendiente se ignora.
    """
    if not hospitalization.monitoring_level:
        return 0
    intervals = get_config(
        db, hospitalization.clinic_id, "monitoring_intervals", MONITORING_INTERVAL_MINUTES
    )
    interval = monitoring_interval_minutes(hospitalization.monitoring_level, intervals)
    now = datetime.now(UTC)

    existing = db.scalars(
        select(HospitalizationTask).where(
            HospitalizationTask.hospitalization_id == hospitalization.id,
            HospitalizationTask.type == "vitals",
            HospitalizationTask.status == "pending",
            HospitalizationTask.scheduled_at >= now,
        )
    ).all()
    covered = {_slot_floor(t.scheduled_at, interval) for t in existing}

    lookahead = now + timedelta(hours=MONITORING_LOOKAHEAD_HOURS)
    slot = _slot_floor(now, interval) + timedelta(minutes=interval)
    created = 0
    while slot <= lookahead:
        if slot not in covered:
            db.add(
                HospitalizationTask(
                    clinic_id=hospitalization.clinic_id,
                    hospitalization_id=hospitalization.id,
                    type="vitals",
                    description="Signos vitales (monitorización)",
                    scheduled_at=slot,
                    priority="normal",
                    status="pending",
                )
            )
            created += 1
        slot += timedelta(minutes=interval)
    if created:
        db.commit()
    return created


def task_overdue(task: HospitalizationTask, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    return task.status == "pending" and task.scheduled_at < now


def complete_next_vitals_task(
    db: Session, hospitalization_id, user_id, completed_at: datetime | None = None
) -> HospitalizationTask | None:
    """Completa la próxima tarea de signos vitales pendiente de la estancia."""
    task = db.scalar(
        select(HospitalizationTask)
        .where(
            HospitalizationTask.hospitalization_id == hospitalization_id,
            HospitalizationTask.type == "vitals",
            HospitalizationTask.status == "pending",
        )
        .order_by(HospitalizationTask.scheduled_at.asc())
        .limit(1)
    )
    if task is None:
        return None
    task.status = "completed"
    task.completed_by = user_id
    task.completed_at = completed_at or datetime.now(UTC)
    db.commit()
    db.refresh(task)
    return task


import math  # noqa: E402

from app.models import HospitalizationConfig  # noqa: E402

STAY_PRICE_DEFAULTS = {
    "general": 800,
    "uci": 1200,
    "isolation": 1000,
    "recovery": 900,
    "postop": 900,
    "other": 800,
}

MONITORING_SURCHARGE_DEFAULTS = {
    "basic": 0,
    "intermediate": 100,
    "intensive": 300,
}


def get_config(db: Session, clinic_id, key: str, defaults: dict) -> dict:
    row = db.scalar(
        select(HospitalizationConfig).where(
            HospitalizationConfig.clinic_id == clinic_id,
            HospitalizationConfig.key == key,
        )
    )
    return {**defaults, **(row.value if row and row.value else {})}


def compute_stay_cost(
    db: Session,
    clinic_id,
    admitted_at: datetime,
    actual_discharge_at: datetime | None,
    accommodation_type: str | None,
    monitoring_level: str | None,
) -> dict:
    stay_prices = get_config(db, clinic_id, "stay_prices", STAY_PRICE_DEFAULTS)
    surcharges = get_config(db, clinic_id, "monitoring_surcharge", MONITORING_SURCHARGE_DEFAULTS)
    end = actual_discharge_at or datetime.now(UTC)
    days = max(1, math.ceil((end - admitted_at).total_seconds() / 86400))
    price_per_day = stay_prices.get(accommodation_type or "general", 800) + surcharges.get(
        monitoring_level or "basic", 0
    )
    return {
        "days": days,
        "price_per_day": price_per_day,
        "total": days * price_per_day,
        "accommodation_type": accommodation_type,
        "monitoring_level": monitoring_level,
    }
