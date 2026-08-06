"""Venta de mostrador (módulo Productos).

Cuando el cliente solo compra productos (sin consulta), esta venta genera una
factura pagada, descuenta el stock real de `sale_products` y produce el recibo
PDF. Disponible para admin/vet/recepción (caja).
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, require_clinic_roles, require_component
from app.core.events import record_audit
from app.core.storage import public_url, save_media
from app.db.session import get_db
from app.models import Clinic, ClinicBranch, Invoice, InvoiceItem, Pet, SaleProduct
from app.schemas.sale import SaleCreate, SaleResult
from app.services.pdf import build_invoice_receipt_pdf

router = APIRouter(
    prefix="/sales",
    tags=["sales"],
    dependencies=[Depends(require_component("pets"))],
)

SALE_MUTATORS = ("admin", "veterinario", "recepcion")


@router.post("", response_model=SaleResult, status_code=status.HTTP_201_CREATED)
def create_sale(
    body: SaleCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*SALE_MUTATORS)),
    db: Session = Depends(get_db),
) -> SaleResult:
    clinic_id = ctx.clinic["id"]

    branch = db.get(ClinicBranch, body.branch_id)
    if branch is None or branch.clinic_id != clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sucursal no encontrada")

    pet = None
    if body.pet_id:
        pet = db.scalar(select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == clinic_id))
        if pet is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado"
            )

    total = Decimal("0")
    invoice_items: list[InvoiceItem] = []
    for p in body.products:
        product = db.get(SaleProduct, p.product_id)
        if product is None or product.clinic_id != clinic_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado"
            )
        if not product.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El producto «{product.name}» está inactivo",
            )
        if product.price is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El producto «{product.name}» no tiene precio",
            )
        qty = Decimal(str(p.quantity))
        if qty > product.stock_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock insuficiente para «{product.name}» "
                f"(disponible: {int(product.stock_quantity)})",
            )
        product.stock_quantity -= int(qty)
        total += qty * Decimal(str(product.price))
        invoice_items.append(
            InvoiceItem(
                description=product.name,
                quantity=float(qty),
                unit_price=float(product.price),
                discount_percent=0,
            )
        )

    owner_id = None
    if pet:
        owner_id = db.execute(
            text(
                "SELECT owner_id FROM owner_pet_links "
                "WHERE pet_id = :pid AND clinic_id = :cid AND is_active = true "
                "ORDER BY linked_at DESC LIMIT 1"
            ),
            {"pid": body.pet_id, "cid": clinic_id},
        ).scalar()

    performed_at = body.performed_at or datetime.now(UTC)
    invoice = Invoice(
        clinic_id=clinic_id,
        branch_id=body.branch_id,
        owner_id=owner_id,
        pet_id=body.pet_id,
        status="paid",
        total=total.quantize(Decimal("0.01")),
        send_receipt_whatsapp=body.send_receipt_whatsapp,
        send_receipt_email=body.send_receipt_email,
    )
    for item in invoice_items:
        invoice.items.append(item)
    db.add(invoice)
    db.flush()
    record_audit(
        db,
        clinic_id=clinic_id,
        actor_type="user",
        actor_id=ctx.user.sub,
        action="invoice_created",
        entity_type="invoice",
        entity_id=invoice.id,
        metadata={"sale": True, "total": float(invoice.total)},
    )
    db.commit()

    clinic = db.get(Clinic, clinic_id)
    date_str = performed_at.astimezone().strftime("%d/%m/%Y %H:%M")
    receipt_items = []
    for item in invoice.items:
        line_total = (
            Decimal(str(item.quantity))
            * Decimal(str(item.unit_price))
            * (Decimal("1") - Decimal(str(item.discount_percent)) / Decimal("100"))
        )
        receipt_items.append(
            {
                "description": item.description,
                "quantity": float(item.quantity),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "line_total": float(line_total),
            }
        )
    receipt_data = {
        "clinic_name": clinic.name,
        "invoice_id": str(invoice.id)[:8].upper(),
        "pet_name": pet.name if pet else "Venta mostrador",
        "status": invoice.status,
        "date_str": date_str,
        "items": receipt_items,
        "total": float(invoice.total),
    }
    receipt_bytes = build_invoice_receipt_pdf(receipt_data)
    receipt_rel = save_media("receipts", f"recibo_{invoice.id}.pdf", receipt_bytes)

    return SaleResult(
        invoice_id=invoice.id,
        receipt_pdf_url=public_url(receipt_rel),
        total=float(invoice.total),
    )
