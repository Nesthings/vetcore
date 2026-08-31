"""Ajustes de la clínica compartidos por varios módulos."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Clinic

DEFAULT_STOCK_THRESHOLD = 5


def clinic_stock_threshold(db: Session, clinic_id) -> float:
    """Umbral de alerta de stock configurado por el admin (default 5)."""
    value = db.scalar(select(Clinic.stock_alert_threshold).where(Clinic.id == clinic_id))
    if value is None:
        return DEFAULT_STOCK_THRESHOLD
    return float(value)
