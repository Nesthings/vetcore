"""Alertas inteligentes — lectura y acciones del staff.

El motor de reglas corre en backend (`app/services/smart_alerts.py`); aquí
solo se expone la lectura de avisos (evaluación perezosa) y las acciones
(resolver/descartar), siempre acotadas por clínica (multi-tenant).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic
from app.db.session import get_db
from app.models import SmartAlert
from app.services import smart_alerts as alerts_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", summary="Resumen y lista de avisos activos")
def list_alerts(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    return alerts_service.get_alerts_summary(db, ctx.clinic["id"], branch_id, limit=limit)


@router.post("/{alert_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
def resolve_alert(
    alert_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> None:
    alert = db.scalar(
        select(SmartAlert).where(
            SmartAlert.id == alert_id,
            SmartAlert.clinic_id == ctx.clinic["id"],
        )
    )
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aviso no encontrado")
    if alert.status == "active":
        from datetime import UTC, datetime

        alert.status = "resolved"
        alert.resolved_at = datetime.now(UTC)
        db.commit()


@router.post("/{alert_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_alert(
    alert_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> None:
    alert = db.scalar(
        select(SmartAlert).where(
            SmartAlert.id == alert_id,
            SmartAlert.clinic_id == ctx.clinic["id"],
        )
    )
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aviso no encontrado")
    if alert.status == "active":
        alert.status = "dismissed"
        db.commit()
