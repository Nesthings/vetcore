"""Reportes — separación por contenido (sección 3.9).

- `/reports/operational`: SIN cifras de dinero, lo ve todo el staff.
- `/reports/financial`: con montos, EXCLUSIVO del admin.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import (
    CurrentClinic,
    require_clinic_roles,
    require_component,
)
from app.core.events import record_audit
from app.db.session import get_db
from app.models import (
    Appointment,
    ClinicBranch,
    Consultation,
    ConsultationItem,
    FinancialExpense,
    InventoryProduct,
    Invoice,
    InvoiceItem,
    Pet,
    User,
)
from app.schemas.billing import ExpenseCreate, ExpenseRead

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
    ctx: CurrentClinic = Depends(require_component("reports")),
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
    _component: CurrentClinic = Depends(require_component("financial")),
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

    movements = _build_movements(db, clinic_id, from_, to, branch_id)

    return {
        "from": from_.isoformat(),
        "to": to.isoformat(),
        "ingresos_total": float(ingresos_total),
        "ingresos_por_dia": ingresos_por_dia,
        "facturas_por_estado": facturas_por_estado,
        "pendientes_por_cobrar": float(pendientes_por_cobrar),
        "ticket_promedio": float(ticket_promedio),
        "top_servicios": top_servicios,
        "movements": movements,
    }


def _build_movements(
    db: Session, clinic_id: str, from_: datetime, to: datetime, branch_id: str | None
) -> list[dict]:
    """Lista de movimientos financieros: ingresos (facturas paid) y egresos
    (gastos registrados), ordenados por fecha descendente."""
    inv_stmt = (
        select(Invoice)
        .options(selectinload(Invoice.items))
        .where(
            Invoice.clinic_id == clinic_id,
            Invoice.status == "paid",
            Invoice.created_at >= from_,
            Invoice.created_at <= to,
        )
    )
    if branch_id:
        inv_stmt = inv_stmt.where(Invoice.branch_id == branch_id)
    invoices_rows = list(db.scalars(inv_stmt.order_by(Invoice.created_at.desc())))

    pet_ids = {i.pet_id for i in invoices_rows if i.pet_id}
    branch_ids = {i.branch_id for i in invoices_rows}
    pets = (
        dict(db.execute(select(Pet.id, Pet.name).where(Pet.id.in_(pet_ids))).all())
        if pet_ids
        else {}
    )
    branches = (
        dict(
            db.execute(
                select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
            ).all()
        )
        if branch_ids
        else {}
    )

    expenses = list(
        db.scalars(
            select(FinancialExpense)
            .where(
                FinancialExpense.clinic_id == clinic_id,
                FinancialExpense.recorded_at >= from_,
                FinancialExpense.recorded_at <= to,
            )
            .order_by(FinancialExpense.recorded_at.desc())
        )
    )

    movements: list[dict] = []
    for inv in invoices_rows:
        movements.append(
            {
                "id": str(inv.id),
                "tipo": "ingreso",
                "monto": float(inv.total),
                "fecha": inv.created_at.isoformat(),
                "origen": "Checkout de consulta" if inv.consultation_id else "Factura",
                "concepto": pets.get(inv.pet_id) or "—",
                "detalle": ", ".join(i.description for i in inv.items[:3]) or "—",
                "sucursal": branches.get(inv.branch_id) or "—",
                "status": inv.status,
            }
        )
    for exp in expenses:
        movements.append(
            {
                "id": str(exp.id),
                "tipo": "egreso",
                "monto": float(exp.amount),
                "fecha": exp.recorded_at.isoformat(),
                "origen": "Gasto registrado",
                "concepto": exp.concept,
                "detalle": exp.notes or "—",
                "sucursal": "—",
                "status": None,
            }
        )
    movements.sort(key=lambda m: m["fecha"], reverse=True)
    return movements


@router.get("/financial/expenses", response_model=list[ExpenseRead])
def list_expenses(
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    _component: CurrentClinic = Depends(require_component("financial")),
    db: Session = Depends(get_db),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[FinancialExpense]:
    from_, to = _resolve_range(from_, to)
    stmt = (
        select(FinancialExpense)
        .where(
            FinancialExpense.clinic_id == ctx.clinic["id"],
            FinancialExpense.recorded_at >= from_,
            FinancialExpense.recorded_at <= to,
        )
        .order_by(FinancialExpense.recorded_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))


@router.post(
    "/financial/expenses",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    body: ExpenseCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    _component: CurrentClinic = Depends(require_component("financial")),
    db: Session = Depends(get_db),
) -> FinancialExpense:
    expense = FinancialExpense(
        clinic_id=ctx.clinic["id"],
        concept=body.concept,
        amount=body.amount,
        notes=body.notes,
        recorded_at=body.recorded_at,
        created_by=ctx.user.sub,
    )
    db.add(expense)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="expense_created",
        entity_type="expense",
        entity_id=expense.id,
        metadata={"concept": body.concept, "amount": float(body.amount)},
    )
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/financial/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    _component: CurrentClinic = Depends(require_component("financial")),
    db: Session = Depends(get_db),
) -> None:
    expense = db.scalar(
        select(FinancialExpense).where(
            FinancialExpense.id == expense_id,
            FinancialExpense.clinic_id == ctx.clinic["id"],
        )
    )
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado"
        )
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="expense_deleted",
        entity_type="expense",
        entity_id=expense.id,
    )
    db.delete(expense)
    db.commit()
