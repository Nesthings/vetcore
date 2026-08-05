"""CRUD de facturas — EXCLUSIVO del admin de la clínica.

Regla de la sección 3, punto 9: cualquier pantalla con montos de dinero es
exclusiva del Admin. El total se calcula en servidor (nunca se confía en el
cliente). El DELETE es soft (status='cancelled') por integridad financiera.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, require_clinic_roles
from app.db.session import get_db
from app.models import Invoice, InvoiceItem
from app.schemas.billing import InvoiceCreate, InvoiceItemCreate, InvoiceRead, InvoiceUpdate

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
    pet_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .options(selectinload(Invoice.items))
        .where(Invoice.clinic_id == ctx.clinic["id"])
        .order_by(Invoice.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if pet_id:
        stmt = stmt.where(Invoice.pet_id == pet_id)
    return list(db.scalars(stmt))


def _get_invoice_or_404(db: Session, clinic_id: str, invoice_id: str) -> Invoice:
    invoice = db.scalar(
        select(Invoice)
        .options(selectinload(Invoice.items))
        .where(Invoice.id == invoice_id, Invoice.clinic_id == clinic_id)
    )
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(
    invoice_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> Invoice:
    return _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)


def _compute_total(items: list[InvoiceItemCreate]) -> Decimal:
    total = sum((Decimal(item.quantity) * Decimal(str(item.unit_price))) for item in items)
    return total.quantize(Decimal("0.01"))


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(
    body: InvoiceCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> Invoice:
    invoice = Invoice(
        clinic_id=ctx.clinic["id"],
        branch_id=body.branch_id,
        owner_id=body.owner_id,
        pet_id=body.pet_id,
        consultation_id=body.consultation_id,
        status=body.status,
        total=_compute_total(body.items),
    )
    for item in body.items:
        invoice.items.append(InvoiceItem(**item.model_dump()))
    db.add(invoice)
    db.commit()
    return _get_invoice_or_404(db, ctx.clinic["id"], str(invoice.id))


@router.patch("/{invoice_id}", response_model=InvoiceRead)
def update_invoice_status(
    invoice_id: str,
    body: InvoiceUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> Invoice:
    invoice = _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(invoice, field, value)
    db.commit()
    return _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invoice(
    invoice_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    invoice = _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)
    invoice.status = "cancelled"
    db.commit()
