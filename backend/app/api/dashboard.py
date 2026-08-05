"""Dashboard del día — indicadores operativos (sin cifras de dinero).

Regla de la sección 3, punto 9: las pantallas con montos son exclusivas del
admin (Dashboard financiero, Subfase 2.6). Este dashboard es operativo y lo
puede ver todo el staff.
"""

from collections import Counter
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.appointments import _with_names
from app.api.deps import CurrentClinic, get_current_clinic
from app.db.session import get_db
from app.models import Appointment, InventoryMovement, InventoryProduct, Pet, ScheduleBlock

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

STOCK_ALERT_DEFAULT_THRESHOLD = 5


@router.get("/day", summary="Indicadores del día (citas, alertas de stock)")
def dashboard_day(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    day: date | None = Query(default=None, description="Fecha (YYYY-MM-DD). Default: hoy local"),
    stock_threshold: float = Query(
        default=STOCK_ALERT_DEFAULT_THRESHOLD, ge=0, description="Umbral para alerta de stock"
    ),
) -> dict:
    clinic_id = ctx.clinic["id"]
    selected_branch = branch_id or ctx.user.branch_id
    today = day or date.today()

    start = datetime.combine(today, time.min)
    end = datetime.combine(today, time.max)

    base = [
        Appointment.clinic_id == clinic_id,
        Appointment.start_time >= start,
        Appointment.start_time <= end,
    ]
    if selected_branch:
        base.append(Appointment.branch_id == selected_branch)

    total = db.scalar(select(func.count()).select_from(Appointment).where(*base)) or 0

    statuses = {
        row.status: row.count
        for row in db.execute(
            select(Appointment.status, func.count().label("count"))
            .where(*base)
            .group_by(Appointment.status)
        ).all()
    }
    citas_por_estado = {
        s: statuses.get(s, 0)
        for s in ("scheduled", "confirmed", "completed", "cancelled", "no_show")
    }

    appts = list(db.scalars(select(Appointment).where(*base).order_by(Appointment.start_time)))
    horas = Counter(a.start_time.astimezone().hour for a in appts)
    citas_por_hora = [{"hora": h, "count": horas.get(h, 0)} for h in range(7, 21)]
    citas_hoy = _with_names(db, appts)

    block_base = [
        ScheduleBlock.clinic_id == clinic_id,
        ScheduleBlock.start_time >= start,
        ScheduleBlock.start_time <= end,
    ]
    if selected_branch:
        block_base.append(ScheduleBlock.branch_id == selected_branch)
    bloques_hoy = len(db.scalars(select(ScheduleBlock).where(*block_base)).all())

    inv_base = [InventoryProduct.clinic_id == clinic_id]
    if selected_branch:
        inv_base.append(InventoryProduct.branch_id == selected_branch)

    stock_rows = db.execute(
        select(
            InventoryProduct.id,
            InventoryProduct.name,
            func.coalesce(func.sum(InventoryMovement.quantity_delta), 0).label("stock"),
        )
        .outerjoin(
            InventoryMovement,
            InventoryMovement.product_id == InventoryProduct.id,
        )
        .where(*inv_base)
        .group_by(InventoryProduct.id, InventoryProduct.name)
        .having(func.coalesce(func.sum(InventoryMovement.quantity_delta), 0) <= stock_threshold)
    ).all()

    stock_alerts = [
        {"product_id": str(r.id), "name": r.name, "stock": float(r.stock)} for r in stock_rows
    ]

    pacientes_activos = (
        db.scalar(
            select(func.count())
            .select_from(Pet)
            .where(Pet.clinic_id == clinic_id, Pet.is_active.is_(True))
        )
        or 0
    )

    return {
        "date": today.isoformat(),
        "branch_id": str(selected_branch) if selected_branch else None,
        "citas_total": total,
        "citas_por_estado": citas_por_estado,
        "citas_por_hora": citas_por_hora,
        "citas_hoy": citas_hoy,
        "bloques_hoy": bloques_hoy,
        "stock_alerts": stock_alerts,
        "pacientes_activos": pacientes_activos,
    }
