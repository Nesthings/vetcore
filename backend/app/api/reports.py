"""Dashboard financiero — EXCLUSIVO del admin (sección 3.9).

El módulo de "Reportes operativos" se eliminó por decisión del usuario
(2026-08-06). Aquí quedan: el dashboard financiero con la lista de movimientos
(ingresos de facturas + egresos) y el CRUD de gastos.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

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
    ClinicBranch,
    FinancialExpense,
    Invoice,
    InvoiceItem,
    Pet,
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

    line_total = (
        InvoiceItem.quantity
        * InvoiceItem.unit_price
        * (1 - InvoiceItem.discount_percent / 100)
    )
    service_cond = InvoiceItem.service_id.isnot(None)
    product_cond = InvoiceItem.service_id.is_(None)

    ingresos_servicios_total = (
        db.scalar(
            select(func.coalesce(func.sum(line_total), 0))
            .select_from(InvoiceItem)
            .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
            .where(*paid_base, service_cond)
        )
        or 0
    )
    ingresos_productos_total = (
        db.scalar(
            select(func.coalesce(func.sum(line_total), 0))
            .select_from(InvoiceItem)
            .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
            .where(*paid_base, product_cond)
        )
        or 0
    )

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

    ingresos_productos, ingresos_servicios, egresos = _build_movements(
        db, clinic_id, from_, to, branch_id
    )

    return {
        "from": from_.isoformat(),
        "to": to.isoformat(),
        "ingresos_total": float(ingresos_total),
        "ingresos_servicios_total": float(ingresos_servicios_total),
        "ingresos_productos_total": float(ingresos_productos_total),
        "ingresos_por_dia": ingresos_por_dia,
        "facturas_por_estado": facturas_por_estado,
        "pendientes_por_cobrar": float(pendientes_por_cobrar),
        "ticket_promedio": float(ticket_promedio),
        "top_servicios": top_servicios,
        "ingresos_productos": ingresos_productos,
        "ingresos_servicios": ingresos_servicios,
        "egresos": egresos,
    }


def _build_movements(
    db: Session, clinic_id: str, from_: datetime, to: datetime, branch_id: str | None
) -> tuple[list[dict], list[dict], list[dict]]:
    """Movimientos financieros separados por categoría:
    - `ingresos_servicios`: facturas pagadas con líneas de servicio.
    - `ingresos_productos`: facturas pagadas con líneas de producto.
    - `egresos`: gastos registrados.
    Una factura puede aparecer en ambas tablas de ingresos si mezcla servicios
    y productos; cada fila lleva el subtotal de su categoría."""
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

    def _split(inv: Invoice) -> tuple[dict | None, dict | None]:
        servicios: list[str] = []
        productos: list[str] = []
        s_total = Decimal("0")
        p_total = Decimal("0")
        for item in inv.items:
            amount = Decimal(str(item.quantity)) * Decimal(str(item.unit_price)) * (
                Decimal("1") - Decimal(str(item.discount_percent)) / Decimal("100")
            )
            if item.service_id is not None:
                servicios.append(item.description)
                s_total += amount
            else:
                productos.append(item.description)
                p_total += amount
        base = {
            "fecha": inv.created_at.isoformat(),
            "origen": "Checkout de consulta" if inv.consultation_id else "Factura",
            "concepto": pets.get(inv.pet_id) or "—",
            "sucursal": branches.get(inv.branch_id) or "—",
            "status": inv.status,
        }
        s_row = None
        if servicios and s_total > 0:
            s_row = {
                "id": f"{inv.id}-s",
                "tipo": "ingreso",
                "categoria": "servicios",
                "monto": float(s_total),
                "detalle": ", ".join(servicios[:3]) or "—",
                **base,
            }
        p_row = None
        if productos and p_total > 0:
            p_row = {
                "id": f"{inv.id}-p",
                "tipo": "ingreso",
                "categoria": "productos",
                "monto": float(p_total),
                "detalle": ", ".join(productos[:3]) or "—",
                **base,
            }
        return s_row, p_row

    ingresos_servicios: list[dict] = []
    ingresos_productos: list[dict] = []
    for inv in invoices_rows:
        s_row, p_row = _split(inv)
        if s_row:
            ingresos_servicios.append(s_row)
        if p_row:
            ingresos_productos.append(p_row)

    ingresos_servicios.sort(key=lambda m: m["fecha"], reverse=True)
    ingresos_productos.sort(key=lambda m: m["fecha"], reverse=True)

    egresos: list[dict] = []
    for exp in expenses:
        egresos.append(
            {
                "id": str(exp.id),
                "tipo": "egreso",
                "categoria": "egresos",
                "monto": float(exp.amount),
                "fecha": exp.recorded_at.isoformat(),
                "origen": "Gasto registrado",
                "concepto": exp.concept,
                "detalle": exp.notes or "—",
                "sucursal": "—",
                "status": None,
            }
        )
    egresos.sort(key=lambda m: m["fecha"], reverse=True)

    return ingresos_productos, ingresos_servicios, egresos


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
