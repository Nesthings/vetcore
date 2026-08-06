"""CRUD de facturas — EXCLUSIVO del admin de la clínica.

Regla de la sección 3, punto 9: cualquier pantalla con montos de dinero es
exclusiva del Admin. El total se calcula en servidor (nunca se confía en el
cliente). El 'descuento automático' (Subfase 1.5): si una línea referencia
un servicio del catálogo con descuento configurado, se aplica automáticamente.
Al facturar un producto, se descuenta stock (movimiento de venta).
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, require_clinic_roles
from app.api.inventory import allocate_fifo
from app.core.events import record_audit
from app.db.session import get_db
from app.models import (
    Clinic,
    ClinicBranch,
    InventoryMovement,
    Invoice,
    InvoiceItem,
    Pet,
    ServiceCatalog,
)
from app.schemas.billing import InvoiceCreate, InvoiceItemCreate, InvoiceRead, InvoiceUpdate
from app.services.pdf import build_invoice_receipt_pdf

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _with_names(db: Session, invoices: list[Invoice]) -> list[dict]:
    if not invoices:
        return []
    pet_ids = {i.pet_id for i in invoices if i.pet_id}
    branch_ids = {i.branch_id for i in invoices}

    pets = (
        dict(db.execute(select(Pet.id, Pet.name).where(Pet.id.in_(pet_ids))).all())
        if pet_ids
        else {}
    )
    branches = dict(
        db.execute(
            select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
        ).all()
    )

    out = []
    for inv in invoices:
        data = InvoiceRead.model_validate(inv).model_dump()
        data["pet_name"] = pets.get(inv.pet_id)
        data["branch_name"] = branches.get(inv.branch_id)
        for item in data["items"]:
            item["line_total"] = float(
                Decimal(str(item["quantity"]))
                * Decimal(str(item["unit_price"]))
                * (Decimal("1") - Decimal(str(item["discount_percent"])) / Decimal("100"))
            )
        out.append(data)
    return out


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
    pet_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
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
    return _with_names(db, list(db.scalars(stmt)))


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
) -> dict:
    invoice = _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)
    return _with_names(db, [invoice])[0]


def _line_total(item: InvoiceItemCreate) -> Decimal:
    return (
        Decimal(str(item.quantity))
        * Decimal(str(item.unit_price))
        * (Decimal("1") - Decimal(str(item.discount_percent or 0)) / Decimal("100"))
    )


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(
    body: InvoiceCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    invoice = Invoice(
        clinic_id=ctx.clinic["id"],
        branch_id=body.branch_id,
        owner_id=body.owner_id,
        pet_id=body.pet_id,
        consultation_id=body.consultation_id,
        status=body.status,
        total=Decimal("0"),
    )
    total = Decimal("0")
    for item in body.items:
        # Descuento automático: si la línea usa un servicio del catálogo y no
        # se especificó descuento, se toma el del catálogo.
        discount = item.discount_percent
        if discount is None and item.service_id:
            service = db.get(ServiceCatalog, item.service_id)
            if service is not None and service.clinic_id == ctx.clinic["id"]:
                discount = float(service.discount_percent or 0)
        discount = discount or 0

        line_total = (
            Decimal(str(item.quantity))
            * Decimal(str(item.unit_price))
            * (Decimal("1") - Decimal(str(discount)) / Decimal("100"))
        )
        total += line_total

        invoice.items.append(
            InvoiceItem(
                service_id=item.service_id,
                product_id=item.product_id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount_percent=discount,
            )
        )
        # Al facturar un producto, se descuenta stock por FIFO (Subfase 2.2):
        # consume primero los lotes que vencen antes.
        if item.product_id is not None:
            consumed = Decimal(str(item.quantity))
            for lot_id, qty in allocate_fifo(db, str(item.product_id), float(item.quantity)):
                db.add(
                    InventoryMovement(
                        product_id=item.product_id,
                        lot_id=lot_id,
                        quantity_delta=-Decimal(str(qty)),
                        reason="sale",
                        reference_id=invoice.id,
                    )
                )
                consumed -= Decimal(str(qty))
            if consumed > 0:
                db.add(
                    InventoryMovement(
                        product_id=item.product_id,
                        quantity_delta=-consumed,
                        reason="sale",
                        reference_id=invoice.id,
                    )
                )

    invoice.total = total.quantize(Decimal("0.01"))
    db.add(invoice)
    db.commit()
    return _with_names(db, [_get_invoice_or_404(db, ctx.clinic["id"], str(invoice.id))])[0]


@router.get("/{invoice_id}/receipt", summary="Recibo de la factura en PDF")
def invoice_receipt(
    invoice_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> Response:
    invoice = _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)
    return receipt_response(db, invoice)


def receipt_response(db: Session, invoice: Invoice) -> Response:
    """Genera la respuesta PDF de un recibo (reutilizada por el dueño, 2.5)."""
    clinic = db.get(Clinic, invoice.clinic_id)
    pet = db.get(Pet, invoice.pet_id) if invoice.pet_id else None

    items = []
    for item in invoice.items:
        line_total = (
            Decimal(str(item.quantity))
            * Decimal(str(item.unit_price))
            * (Decimal("1") - Decimal(str(item.discount_percent)) / Decimal("100"))
        )
        items.append(
            {
                "description": item.description,
                "quantity": float(item.quantity),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "line_total": float(line_total),
            }
        )

    data = {
        "clinic_name": clinic.name if clinic else "—",
        "invoice_id": str(invoice.id)[:8].upper(),
        "pet_name": pet.name if pet else "—",
        "status": invoice.status,
        "date_str": invoice.created_at.astimezone().strftime("%d/%m/%Y %H:%M"),
        "items": items,
        "total": float(invoice.total),
    }
    pdf = build_invoice_receipt_pdf(data)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="recibo_{str(invoice.id)[:8]}.pdf"'},
    )


@router.patch("/{invoice_id}", response_model=InvoiceRead)
def update_invoice_status(
    invoice_id: str,
    body: InvoiceUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    invoice = _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(invoice, field, value)
    db.commit()
    return _with_names(db, [_get_invoice_or_404(db, ctx.clinic["id"], invoice_id)])[0]


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invoice(
    invoice_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    invoice = _get_invoice_or_404(db, ctx.clinic["id"], invoice_id)
    invoice.status = "cancelled"
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="invoice_cancelled",
        entity_type="invoice",
        entity_id=invoice.id,
        metadata={"total": float(invoice.total)},
    )
    db.commit()
