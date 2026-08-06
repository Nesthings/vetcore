"""Precio de los kits de inventario.

Los kits (FASE 2) son paquetes de productos con un precio propio (decisión
de la Subfase 2.2: 'kit con precio propio' — el bundle ya incluye el
descuento por ser conjunto).

Revision ID: 0006_kit_price
Revises: 0005_cartilla_photo
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006_kit_price"
down_revision: Union[str, None] = "0005_cartilla_photo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inventory_kits",
        sa.Column("price", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("inventory_kits", "price")
