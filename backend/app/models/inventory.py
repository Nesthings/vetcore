"""Modelos de productos y movimientos de inventario."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import UUIDPkMixin


class InventoryProduct(UUIDPkMixin, Base):
    __tablename__ = "inventory_products"

    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinic_branches.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(50))
    unit: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class InventoryMovement(UUIDPkMixin, Base):
    """Libro de movimientos: el stock se deriva de la suma de quantity_delta."""

    __tablename__ = "inventory_movements"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id"), nullable=False, index=True
    )
    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_lots.id")
    )
    quantity_delta: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
