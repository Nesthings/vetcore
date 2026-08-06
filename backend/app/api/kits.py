"""Kits de inventario — por-tenant, admin/veterinario.

Kit = paquete de productos con precio propio (decisión de la Subfase 2.2).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.db.session import get_db
from app.models import InventoryKit, InventoryKitItem, InventoryProduct
from app.schemas.kit import KitCreate, KitRead, KitUpdate

router = APIRouter(
    prefix="/kits",
    tags=["kits"],
    dependencies=[Depends(require_component("kits"))],
)

KIT_MUTATORS = ("admin", "veterinario")


def _with_names(db: Session, kits: list[InventoryKit]) -> list[dict]:
    if not kits:
        return []
    product_ids = {i.product_id for k in kits for i in k.items}
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
    out = []
    for k in kits:
        data = KitRead.model_validate(k).model_dump()
        for item in data["items"]:
            item["product_name"] = products.get(item["product_id"])
        out.append(data)
    return out


@router.get("", response_model=list[KitRead])
def list_kits(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict]:
    stmt = (
        select(InventoryKit)
        .options(selectinload(InventoryKit.items))
        .where(InventoryKit.clinic_id == ctx.clinic["id"])
        .order_by(InventoryKit.name)
        .limit(limit)
    )
    return _with_names(db, list(db.scalars(stmt)))


def _get_kit_or_404(db: Session, clinic_id: str, kit_id: str) -> InventoryKit:
    kit = db.scalar(
        select(InventoryKit)
        .options(selectinload(InventoryKit.items))
        .where(InventoryKit.id == kit_id, InventoryKit.clinic_id == clinic_id)
    )
    if kit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kit no encontrado")
    return kit


@router.get("/{kit_id}", response_model=KitRead)
def get_kit(
    kit_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    return _with_names(db, [_get_kit_or_404(db, ctx.clinic["id"], kit_id)])[0]


@router.post("", response_model=KitRead, status_code=status.HTTP_201_CREATED)
def create_kit(
    body: KitCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*KIT_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    kit = InventoryKit(clinic_id=ctx.clinic["id"], name=body.name, price=body.price)
    for item in body.items:
        kit.items.append(InventoryKitItem(product_id=item.product_id, quantity=item.quantity))
    db.add(kit)
    db.commit()
    return _with_names(db, [_get_kit_or_404(db, ctx.clinic["id"], str(kit.id))])[0]


@router.patch("/{kit_id}", response_model=KitRead)
def update_kit(
    kit_id: str,
    body: KitUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*KIT_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    kit = _get_kit_or_404(db, ctx.clinic["id"], kit_id)
    if body.name is not None:
        kit.name = body.name
    if body.price is not None:
        kit.price = body.price
    if body.items is not None:
        kit.items.clear()
        for item in body.items:
            kit.items.append(InventoryKitItem(product_id=item.product_id, quantity=item.quantity))
    db.commit()
    return _with_names(db, [_get_kit_or_404(db, ctx.clinic["id"], kit_id)])[0]


@router.delete("/{kit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kit(
    kit_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*KIT_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    kit = _get_kit_or_404(db, ctx.clinic["id"], kit_id)
    db.delete(kit)
    db.commit()
