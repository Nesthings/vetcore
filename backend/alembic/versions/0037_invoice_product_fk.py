"""Quita el FK de invoice_items.product_id a inventory_products.

El catálogo de venta (`sale_products`) es independiente del inventario de
insumos (`inventory_products`) desde la migración 0016. Los checkouts de
consulta y venta registran productos del catálogo de venta en
`invoice_items.product_id`, mientras la facturación registra insumos. Un solo
FK no puede referenciar ambas tablas, así que el FK a `inventory_products`
hacía fallar (500) la venta/consulta de cualquier producto retail.

Revision ID: 0037_invoice_product_fk
Revises: 0036_clinic_invites
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0037_invoice_product_fk"
down_revision: Union[str, None] = "0036_clinic_invites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "invoice_items_product_id_fkey", "invoice_items", type_="foreignkey"
    )


def downgrade() -> None:
    op.create_foreign_key(
        "invoice_items_product_id_fkey",
        "invoice_items",
        "inventory_products",
        ["product_id"],
        ["id"],
    )
