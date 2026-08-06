"""Órdenes de compra a proveedores — por-tenant, solo admin.

Al marcar una orden como 'received', se registran los movimientos de entrada
de stock de todos sus productos.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, require_clinic_roles
from app.db.session import get_db
from app.models import (
    ClinicBranch,
    InventoryMovement,
    InventoryProduct,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.schemas.purchase import (
    PurchaseOrderCreate,
    PurchaseOrderRead,
    PurchaseOrderUpdate,
)

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


def _with_names(db: Session, orders: list[PurchaseOrder]) -> list[dict]:
    if not orders:
        return []
    product_ids = {i.product_id for o in orders for i in o.items}
    branch_ids = {o.branch_id for o in orders}
    products = (
        dict(
            db.execute(
                select(InventoryProduct.id, InventoryProduct.name).where(
                    InventoryProduct.id.in_(product_ids)
                )
            ).all()
        )
        if product_ids
        else {}
    )
    branches = dict(
        db.execute(
            select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
        ).all()
    )
    out = []
    for o in orders:
        data = PurchaseOrderRead.model_validate(o).model_dump()
        for item in data["items"]:
            item["product_name"] = products.get(item["product_id"])
        data["branch_name"] = branches.get(o.branch_id)
        out.append(data)
    return out


@router.get("", response_model=list[PurchaseOrderRead])
def list_orders(
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict]:
    stmt = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.clinic_id == ctx.clinic["id"])
        .order_by(PurchaseOrder.created_at.desc())
        .limit(limit)
    )
    return _with_names(db, list(db.scalars(stmt)))


def _get_order_or_404(db: Session, clinic_id: str, order_id: str) -> PurchaseOrder:
    order = db.scalar(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == order_id, PurchaseOrder.clinic_id == clinic_id)
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return order


@router.get("/{order_id}", response_model=PurchaseOrderRead)
def get_order(
    order_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    return _with_names(db, [_get_order_or_404(db, ctx.clinic["id"], order_id)])[0]


@router.post("", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    body: PurchaseOrderCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    order = PurchaseOrder(
        clinic_id=ctx.clinic["id"],
        branch_id=body.branch_id,
        supplier_name=body.supplier_name,
        status="draft",
    )
    for item in body.items:
        order.items.append(PurchaseOrderItem(product_id=item.product_id, quantity=item.quantity))
    db.add(order)
    db.commit()
    return _with_names(db, [_get_order_or_404(db, ctx.clinic["id"], str(order.id))])[0]


@router.patch("/{order_id}", response_model=PurchaseOrderRead)
def update_order(
    order_id: str,
    body: PurchaseOrderUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    order = _get_order_or_404(db, ctx.clinic["id"], order_id)

    new_status = body.status or order.status

    if order.status == "received":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Una orden recibida no se puede modificar",
        )

    if body.supplier_name is not None:
        order.supplier_name = body.supplier_name
    if body.items is not None:
        order.items.clear()
        for item in body.items:
            order.items.append(
                PurchaseOrderItem(product_id=item.product_id, quantity=item.quantity)
            )

    # Al recibir, se registran las entradas de stock
    if new_status == "received" and order.status != "received":
        for item in order.items:
            db.add(
                InventoryMovement(
                    product_id=item.product_id,
                    quantity_delta=item.quantity,
                    reason="purchase",
                    reference_id=order.id,
                )
            )

    order.status = new_status
    db.commit()
    return _with_names(db, [_get_order_or_404(db, ctx.clinic["id"], order_id)])[0]


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(
    order_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    order = _get_order_or_404(db, ctx.clinic["id"], order_id)
    if order.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden eliminar órdenes en borrador",
        )
    db.delete(order)
    db.commit()
