"""CRUD de productos de inventario — por-tenant."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles
from app.db.session import get_db
from app.models import InventoryProduct
from app.schemas.inventory import (
    InventoryProductCreate,
    InventoryProductRead,
    InventoryProductUpdate,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

INVENTORY_MUTATORS = ("admin", "veterinario")


@router.get("", response_model=list[InventoryProductRead])
def list_products(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[InventoryProduct]:
    stmt = select(InventoryProduct).where(InventoryProduct.clinic_id == ctx.clinic["id"])
    if branch_id:
        stmt = stmt.where(InventoryProduct.branch_id == branch_id)
    if search:
        stmt = stmt.where(InventoryProduct.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(InventoryProduct.name).limit(limit).offset(offset)
    return list(db.scalars(stmt))


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
) -> InventoryProduct:
    return _get_product_or_404(db, ctx.clinic["id"], product_id)


@router.post("", response_model=InventoryProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    body: InventoryProductCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> InventoryProduct:
    product = InventoryProduct(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}", response_model=InventoryProductRead)
def update_product(
    product_id: str,
    body: InventoryProductUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*INVENTORY_MUTATORS)),
    db: Session = Depends(get_db),
) -> InventoryProduct:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


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
