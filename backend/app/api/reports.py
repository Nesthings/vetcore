"""Reportes — separación por contenido (sección 3.9).

- `/reports/operational`: SIN cifras de dinero, lo ve todo el staff.
- `/reports/financial`: con montos, EXCLUSIVO del admin.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.db.session import get_db
from app.models import (
    Appointment,
    Consultation,
    ConsultationItem,
    InventoryProduct,
    Invoice,
    InvoiceItem,
    User,
)

router = APIRouter(prefix="/reports", tags=["reports"])

DEFAULT_RANGE_DAYS = 30


def _resolve_range(from_: datetime | None, to: datetime | None) -> tuple[datetime, datetime]:
    if to is None:
        to = datetime.now(UTC)
    if from_ is None:
        from_ = to - timedelta(days=DEFAULT_RANGE_DAYS)
    return from_, to


def _branch_scope(ctx: CurrentClinic, branch_id: str | None) -> list:
    clauses = [ctx.clinic["id"]]
    if branch_id:
        clauses.append(branch_id)
    return clauses


@router.get("/operational", summary="Reporte operativo (sin cifras de dinero)")
def operational_report(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    branch_id: str | None = Query(default=None),
) -> dict:
    from_, to = _resolve_range(from_, to)
    clinic_id = ctx.clinic["id"]

    appt_base = [
        Appointment.clinic_id == clinic_id,
        Appointment.start_time >= from_,
        Appointment.start_time <= to,
    ]
    if branch_id:
        appt_base.append(Appointment.branch_id == branch_id)

    citas_total = db.scalar(select(func.count()).select_from(Appointment).where(*appt_base)) or 0
    citas_por_estado = {
        row.status: row.count
        for row in db.execute(
            select(Appointment.status, func.count().label("count"))
            .where(*appt_base)
            .group_by(Appointment.status)
        ).all()
    }

    cons_base = [
        Consultation.clinic_id == clinic_id,
        Consultation.created_at >= from_,
        Consultation.created_at <= to,
    ]
    consultas_total = (
        db.scalar(select(func.count()).select_from(Consultation).where(*cons_base)) or 0
    )

    vet_rows = db.execute(
        select(User.full_name, func.count().label("count"))
        .join(Consultation, Consultation.vet_user_id == User.id)
        .where(*cons_base)
        .group_by(User.full_name)
        .order_by(func.count().desc())
    ).all()
    consultas_por_veterinario = [{"vet": r.full_name, "count": r.count} for r in vet_rows]

    pacientes_atendidos = (
        db.scalar(
            select(func.count(func.distinct(Consultation.pet_id)))
            .select_from(Consultation)
            .where(*cons_base)
        )
        or 0
    )

    top_rows = db.execute(
        select(InventoryProduct.name, func.count().label("count"))
        .join(ConsultationItem, ConsultationItem.product_id == InventoryProduct.id)
        .join(Consultation, Consultation.id == ConsultationItem.consultation_id)
        .where(*cons_base)
        .group_by(InventoryProduct.name)
        .order_by(func.count().desc())
        .limit(5)
    ).all()
    top_productos = [{"name": r.name, "count": r.count} for r in top_rows]

    return {
        "from": from_.isoformat(),
        "to": to.isoformat(),
        "citas_total": citas_total,
        "citas_por_estado": citas_por_estado,
        "consultas_total": consultas_total,
        "consultas_por_veterinario": consultas_por_veterinario,
        "pacientes_atendidos": pacientes_atendidos,
        "top_productos": top_productos,
    }


@router.get("/financial", summary="Dashboard financiero (EXCLUSIVO del admin)")
def financial_report(
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    branch_id: str | None = Query(default=None),
) -> dict:
    from_, to = _resolve_range(from_, to)
    clinic_id = ctx.clinic["id"]

    inv_base = [
        Invoice.clinic_id == clinic_id,
        Invoice.created_at >= from_,
        Invoice.created_at <= to,
    ]
    if branch_id:
        inv_base.append(Invoice.branch_id == branch_id)

    paid_base = [*inv_base, Invoice.status == "paid"]

    ingresos_total = (
        db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(*paid_base)) or 0
    )

    dias = db.execute(
        select(
            func.date(Invoice.created_at).label("day"),
            func.coalesce(func.sum(Invoice.total), 0).label("total"),
        )
        .where(*paid_base)
        .group_by(func.date(Invoice.created_at))
        .order_by(func.date(Invoice.created_at))
    ).all()
    ingresos_por_dia = [{"date": str(r.day), "total": float(r.total)} for r in dias]

    facturas_por_estado = {
        row.status: row.count
        for row in db.execute(
            select(Invoice.status, func.count().label("count"))
            .where(*inv_base)
            .group_by(Invoice.status)
        ).all()
    }

    pendientes_por_cobrar = (
        db.scalar(
            select(func.coalesce(func.sum(Invoice.total), 0)).where(
                *inv_base, Invoice.status == "pending"
            )
        )
        or 0
    )

    ticket_promedio = db.scalar(select(func.avg(Invoice.total)).where(*paid_base)) or 0

    top_rows = db.execute(
        select(
            InvoiceItem.description,
            func.sum(
                InvoiceItem.quantity
                * InvoiceItem.unit_price
                * (1 - InvoiceItem.discount_percent / 100)
            ).label("total"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .where(*paid_base)
        .group_by(InvoiceItem.description)
        .order_by(
            func.sum(
                InvoiceItem.quantity
                * InvoiceItem.unit_price
                * (1 - InvoiceItem.discount_percent / 100)
            ).desc()
        )
        .limit(5)
    ).all()
    top_servicios = [{"name": r.description, "total": float(r.total)} for r in top_rows]

    return {
        "from": from_.isoformat(),
        "to": to.isoformat(),
        "ingresos_total": float(ingresos_total),
        "ingresos_por_dia": ingresos_por_dia,
        "facturas_por_estado": facturas_por_estado,
        "pendientes_por_cobrar": float(pendientes_por_cobrar),
        "ticket_promedio": float(ticket_promedio),
        "top_servicios": top_servicios,
    }
