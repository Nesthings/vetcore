"""Catálogo de productos de venta (módulo "Productos").

La veterinaria vende productos retail (croquetas, premios, ropas, camas,
platos, etc.). El admin registra el producto con nombre, categoría, precio
opcional y foto opcional. Es independiente del inventario de insumos.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.core.events import record_audit
from app.core.images import process_product_photo
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import SaleProduct
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate

router = APIRouter(
    prefix="/products",
    tags=["products"],
    dependencies=[Depends(require_component("products"))],
)

PRODUCT_MUTATORS = ("admin",)
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _get_product_or_404(db: Session, clinic_id: str, product_id: str) -> SaleProduct:
    product = db.scalar(
        select(SaleProduct).where(
            SaleProduct.id == product_id,
            SaleProduct.clinic_id == clinic_id,
        )
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return product


@router.get("", response_model=list[ProductRead])
def list_products(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    category: str | None = Query(default=None),
    active_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[SaleProduct]:
    stmt = select(SaleProduct).where(SaleProduct.clinic_id == ctx.clinic["id"])
    if category:
        stmt = stmt.where(SaleProduct.category == category)
    if active_only:
        stmt = stmt.where(SaleProduct.active.is_(True))
    stmt = stmt.order_by(SaleProduct.name).limit(limit)
    return list(db.scalars(stmt))


@router.get("/categories", response_model=list[str])
def list_categories(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[str]:
    rows = db.execute(
        select(SaleProduct.category)
        .where(SaleProduct.clinic_id == ctx.clinic["id"])
        .distinct()
        .order_by(SaleProduct.category)
    ).scalars()
    return list(rows)


@router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> SaleProduct:
    return _get_product_or_404(db, ctx.clinic["id"], product_id)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    body: ProductCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PRODUCT_MUTATORS)),
    db: Session = Depends(get_db),
) -> SaleProduct:
    product = SaleProduct(
        clinic_id=ctx.clinic["id"],
        name=body.name,
        category=body.category,
        price=body.price,
        active=body.active,
    )
    db.add(product)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="product_created",
        entity_type="product",
        entity_id=product.id,
    )
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: str,
    body: ProductUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PRODUCT_MUTATORS)),
    db: Session = Depends(get_db),
) -> SaleProduct:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(product, field, value)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="product_updated",
        entity_type="product",
        entity_id=product.id,
        metadata={"fields": list(data.keys())},
    )
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PRODUCT_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="product_deleted",
        entity_type="product",
        entity_id=product.id,
    )
    db.delete(product)
    db.commit()


@router.post(
    "/{product_id}/photo",
    response_model=ProductRead,
    summary="Sube la foto del producto (opcional)",
)
def upload_product_photo(
    product_id: str,
    file: UploadFile = File(...),
    ctx: CurrentClinic = Depends(require_clinic_roles(*PRODUCT_MUTATORS)),
    db: Session = Depends(get_db),
) -> SaleProduct:
    product = _get_product_or_404(db, ctx.clinic["id"], product_id)

    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )
    try:
        processed = process_product_photo(content)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    rel = save_media(f"products/{product_id}", file.filename or "photo.jpg", processed)
    product.photo_url = public_url(rel)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="product_photo_updated",
        entity_type="product",
        entity_id=product.id,
    )
    db.commit()
    db.refresh(product)
    return product
