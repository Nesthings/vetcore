"""Catálogo de productos de venta (módulo "Productos").

La veterinaria vende productos retail (croquetas, premios, ropas, camas,
platos, etc.). El admin registra el producto con nombre, categoría, precio
opcional y una foto opcional, y el catálogo queda consultable en cualquier
momento. Es independiente del inventario de insumos (`inventory_products`).

Revision ID: 0016_sale_products
Revises: 0015_vaccination_plans
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0016_sale_products"
down_revision: Union[str, None] = "0015_vaccination_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sale_products",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False, index=True
        ),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, index=True),
        sa.Column("price", sa.Numeric(10, 2)),
        sa.Column("photo_url", sa.Text()),
        sa.Column(
            "active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("sale_products")
