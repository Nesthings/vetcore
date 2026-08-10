"""Dashboard del día — indicadores operativos (sin cifras de dinero).

Regla de la sección 3, punto 9: las pantallas con montos son exclusivas del
admin (Dashboard financiero, Subfase 2.6). Este dashboard es operativo y lo
puede ver todo el staff.
"""

from collections import Counter
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.appointments import _with_names
from app.api.deps import CurrentClinic, get_current_clinic, require_component
from app.core.clinic_settings import clinic_stock_threshold
from app.db.session import get_db
from app.models import (
    Appointment,
    AppointmentWaitlist,
    InventoryMovement,
    InventoryProduct,
    Pet,
    PetVaccinationDose,
    PetVaccinationPlan,
    PurchaseOrder,
    ScheduleBlock,
)

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_component("dashboard"))],
)

WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

PERIOD_WINDOWS = {
    "day": {"days": 0, "label": "hoy"},
    "week": {"days": 6, "label": "últimos 7 días"},
    "month": {"days": 29, "label": "últimos 30 días"},
}


@router.get("/day", summary="Indicadores del dashboard (diario/semanal/mensual)")
def dashboard_day(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    day: date | None = Query(default=None, description="Fecha (YYYY-MM-DD). Default: hoy local"),
    period: str = Query(default="day", pattern="^(day|week|month)$"),
    stock_threshold: float | None = Query(
        default=None, ge=0, description="Umbral para alerta de stock (default: el de la clínica)"
    ),
) -> dict:
    clinic_id = ctx.clinic["id"]
    selected_branch = branch_id or ctx.user.branch_id
    today = day or date.today()
    if stock_threshold is None:
        stock_threshold = clinic_stock_threshold(db, clinic_id)

    window = PERIOD_WINDOWS[period]
    start_date = today - timedelta(days=window["days"])
    start = datetime.combine(start_date, time.min)
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

    if period == "day":
        horas = Counter(a.start_time.astimezone().hour for a in appts)
        citas_series = [
            {"label": f"{h:02d}:00", "count": horas.get(h, 0)} for h in range(7, 21)
        ]
    else:
        days = [start_date + timedelta(days=i) for i in range(window["days"] + 1)]
        counts = Counter(a.start_time.astimezone().date() for a in appts)
        if period == "week":
            citas_series = [
                {"label": WEEKDAYS[d.weekday()], "count": counts.get(d, 0)} for d in days
            ]
        else:
            citas_series = [
                {"label": d.strftime("%d/%m"), "count": counts.get(d, 0)} for d in days
            ]

    citas = _with_names(db, appts[:50])

    block_base = [
        ScheduleBlock.clinic_id == clinic_id,
        ScheduleBlock.start_time >= start,
        ScheduleBlock.start_time <= end,
    ]
    if selected_branch:
        block_base.append(ScheduleBlock.branch_id == selected_branch)
    bloques = len(db.scalars(select(ScheduleBlock).where(*block_base)).all())

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

    # Mascotas distintas con al menos una cita completada en la ventana.
    mascotas_atendidas = (
        db.scalar(
            select(func.count(func.distinct(Appointment.pet_id)))
            .where(*base, Appointment.status == "completed", Appointment.pet_id.is_not(None))
        )
        or 0
    )

    # Lista de espera: cola ACTUAL de pacientes esperando hueco (no ligada al período).
    wait_base = [
        AppointmentWaitlist.clinic_id == clinic_id,
        AppointmentWaitlist.status == "waiting",
    ]
    if selected_branch:
        wait_base.append(AppointmentWaitlist.branch_id == selected_branch)
    waitlist_count = (
        db.scalar(select(func.count()).select_from(AppointmentWaitlist).where(*wait_base)) or 0
    )

    # Órdenes de compra sin recibir.
    po_base = [PurchaseOrder.clinic_id == clinic_id, PurchaseOrder.status != "received"]
    if selected_branch:
        po_base.append(PurchaseOrder.branch_id == selected_branch)
    pending_purchase_orders = (
        db.scalar(select(func.count()).select_from(PurchaseOrder).where(*po_base)) or 0
    )

    # Mascotas nuevas registradas en los ÚLTIMOS 7 DÍAS (fijo, sin importar el
    # período; Pet no tiene sucursal: es por clínica).
    week_start = today - timedelta(days=6)
    week_start_dt = datetime.combine(week_start, time.min)
    nuevas_mascotas = (
        db.scalar(
            select(func.count())
            .select_from(Pet)
            .where(
                Pet.clinic_id == clinic_id,
                Pet.created_at >= week_start_dt,
                Pet.created_at <= end,
            )
        )
        or 0
    )

    # Dosis de vacuna programadas (status=scheduled) cuya fecha está dentro de la ventana.
    vacuna_base = [
        PetVaccinationPlan.clinic_id == clinic_id,
        PetVaccinationDose.status == "scheduled",
        PetVaccinationDose.due_date >= start_date,
        PetVaccinationDose.due_date <= today,
    ]
    if selected_branch:
        vacuna_base.append(PetVaccinationPlan.branch_id == selected_branch)
    vacunas_hoy = (
        db.scalar(
            select(func.count())
            .select_from(PetVaccinationDose)
            .join(
                PetVaccinationPlan,
                PetVaccinationDose.pet_vaccination_plan_id == PetVaccinationPlan.id,
            )
            .where(*vacuna_base)
        )
        or 0
    )

    return {
        "date": today.isoformat(),
        "period": period,
        "period_label": window["label"],
        "branch_id": str(selected_branch) if selected_branch else None,
        "citas_total": total,
        "citas_por_estado": citas_por_estado,
        "citas_series": citas_series,
        "citas": citas,
        "bloques": bloques,
        "stock_alerts": stock_alerts,
        "pacientes_activos": pacientes_activos,
        "mascotas_atendidas": mascotas_atendidas,
        "waitlist_count": waitlist_count,
        "pending_purchase_orders": pending_purchase_orders,
        "nuevas_mascotas": nuevas_mascotas,
        "vacunas_hoy": vacunas_hoy,
    }
