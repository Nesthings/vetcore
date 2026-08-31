"""Cantidad en existencia del catálogo de productos.

Los productos de venta llevan una existencia simple (unidades disponibles),
independiente del inventario de insumos por lotes.

Revision ID: 0017_product_stock
Revises: 0016_sale_products
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0017_product_stock"
down_revision: Union[str, None] = "0016_sale_products"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sale_products",
        sa.Column("stock_quantity", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("sale_products", "stock_quantity")
