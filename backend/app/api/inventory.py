"""CRUD de productos, lotes y stock de inventario — por-tenant.

El stock se deriva de la suma de `inventory_movements`; los lotes aportan
la fecha de caducidad para las alertas (1.5) y el consumo FIFO (2.2).
Incluye la predicción de agotamiento (days_remaining).
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.db.session import get_db
from app.models import InventoryLot, InventoryMovement, InventoryProduct
from app.schemas.inventory import (
    InventoryLotCreate,
    InventoryLotRead,
    InventoryProductCreate,
    InventoryProductRead,
    InventoryProductUpdate,
    StockEntryCreate,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

INVENTORY_MUTATORS = ("admin", "veterinario")

EXPIRATION_ALERT_DAYS = 30
FORECAST_WINDOW_DAYS = 30


def allocate_fifo(db: Session, product_id: str, quantity: float) -> list[tuple[str, float]]:
    """Asigna el consumo de stock a lotes por FIFO (vence primero, primero en salir).

    Devuelve [(lot_id, cantidad)] que cubren hasta `quantity`. Si los lotes no
    alcanzan, la diferencia se consume sin lote (stock genérico).
    """
    lots = list(
        db.scalars(
            select(InventoryLot)
            .where(InventoryLot.product_id == product_id, InventoryLot.quantity > 0)
            .order_by(InventoryLot.expiration_date.asc().nulls_last(), InventoryLot.created_at)
        )
    )
    remaining = Decimal(str(quantity))
    allocation: list[tuple[str, float]] = []
    for lot in lots:
        if remaining <= 0:
            break
        take = min(Decimal(str(lot.quantity)), remaining)
        lot.quantity = float(Decimal(str(lot.quantity)) - take)
        allocation.append((str(lot.id), float(take)))
        remaining -= take
    return allocation


def _enrich(db: Session, products: list[InventoryProduct]) -> list[dict]:
    """Agrega stock (Σ movimientos) y lotes con alertas de caducidad."""
    if not products:
        return []
    product_ids = [p.id for p in products]

    stock_rows = dict(
        db.execute(
            select(InventoryMovement.product_id, func.sum(InventoryMovement.quantity_delta))
            .where(InventoryMovement.product_id.in_(product_ids))
            .group_by(InventoryMovement.product_id)
        ).all()
    )

    # Predicción de agotamiento: consumo por ventas de los últimos N días
    since = datetime.now() - timedelta(days=FORECAST_WINDOW_DAYS)
    sales_rows = dict(
        db.execute(
            select(InventoryMovement.product_id, func.sum(InventoryMovement.quantity_delta))
            .where(
                InventoryMovement.product_id.in_(product_ids),
                InventoryMovement.reason == "sale",
                InventoryMovement.created_at >= since,
            )
            .group_by(InventoryMovement.product_id)
        ).all()
    )

    lots_rows = list(
        db.scalars(
            select(InventoryLot)
            .where(InventoryLot.product_id.in_(product_ids))
            .order_by(InventoryLot.expiration_date)
        )
    )
    lots_by_product: dict = {}
    for lot in lots_rows:
        lots_by_product.setdefault(lot.product_id, []).append(lot)

    today = date.today()
    soon = today + timedelta(days=EXPIRATION_ALERT_DAYS)

    out = []
    for p in products:
        data = InventoryProductRead.model_validate(p).model_dump()
        lots = lots_by_product.get(p.id, [])
        stock = float(stock_rows.get(p.id, 0))
        data["stock"] = stock
        data["lots"] = [InventoryLotRead.model_validate(lot).model_dump() for lot in lots]
        data["expiring_soon"] = any(
            lot.expiration_date and today <= lot.expiration_date <= soon for lot in lots
        )
        data["expired"] = any(lot.expiration_date and lot.expiration_date < today for lot in lots)
        sold = float(sales_rows.get(p.id, 0) or 0)
        daily_rate = max(0, -sold) / FORECAST_WINDOW_DAYS
        data["days_remaining"] = round(stock / daily_rate, 1) if daily_rate > 0 else None
        out.append(data)
    return out


@router.get("", response_model=list[InventoryProductRead])
def list_products(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    stmt = select(InventoryProduct).where(InventoryProduct.clinic_id == ctx.clinic["id"])
    if branch_id:
        stmt = stmt.where(InventoryProduct.branch_id == branch_id)
    if search:
        stmt = stmt.where(InventoryProduct.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(InventoryProduct.name).limit(limit).offset(offset)
    return _enrich(db, list(db.scalars(stmt)))


def _get_product_or_404(db: Session, clinic_id: str, product_id: str) -> InventoryProduct:
    product = db.scalar(
        select(InventoryProduct).where(
            InventoryProduct.id == product_id,
            InventoryProduct.clinic_id == clinic_id,
        )
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return product


@router.get("/{product_id}", response_model=InventoryProductRead)
def get_product(
    product_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    return _enrich(db, [product])[0]


@router.post("", response_model=InventoryProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    body: InventoryProductCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    product = InventoryProduct(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return _enrich(db, [product])[0]


@router.post(
    "/{product_id}/lots",
    response_model=InventoryProductRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea un lote y registra su entrada de stock",
)
def create_lot(
    product_id: str,
    body: InventoryLotCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    lot = InventoryLot(
        product_id=product.id,
        lot_number=body.lot_number,
        expiration_date=body.expiration_date,
        quantity=body.quantity,
    )
    db.add(lot)
    # La entrada de stock es un movimiento de compra (consistente con el stock por Σ deltas)
    db.add(
        InventoryMovement(
            product_id=product.id,
            lot_id=lot.id,
            quantity_delta=body.quantity,
            reason="purchase",
        )
    )
    db.commit()
    return _enrich(db, [product])[0]


@router.post(
    "/{product_id}/stock-entry",
    response_model=InventoryProductRead,
    summary="Registra una entrada/salida de stock manual",
)
def stock_entry(
    product_id: str,
    body: StockEntryCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    db.add(
        InventoryMovement(
            product_id=product.id,
            quantity_delta=body.quantity,
            reason=body.reason,
        )
    )
    db.commit()
    return _enrich(db, [product])[0]


@router.patch("/{product_id}", response_model=InventoryProductRead)
def update_product(
    product_id: str,
    body: InventoryProductUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return _enrich(db, [product])[0]


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    try:
        db.delete(product)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: el producto está referenciado en facturas o consultas",
        ) from exc
