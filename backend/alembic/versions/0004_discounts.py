"""Descuentos en catálogo de servicios y en líneas de factura.

Soporta la regla de la Subfase 1.5: 'descuento automático al facturar'.
El descuento vive en el servicio del catálogo y se aplica por línea al
facturar; el admin puede ajustarlo por línea.

Revision ID: 0004_discounts
Revises: 0003_password_reset_tokens
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_discounts"
down_revision: Union[str, None] = "0003_password_reset_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "service_catalog",
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "invoice_items",
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("invoice_items", "discount_percent")
    op.drop_column("service_catalog", "discount_percent")
