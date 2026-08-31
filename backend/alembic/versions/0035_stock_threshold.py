"""Umbral de alerta de stock configurable por clínica.

Agrega `clinics.stock_alert_threshold` (default 5): el admin lo ajusta y se
usa de forma consistente en insumos, productos, el dashboard y las
notificaciones de stock bajo.

Revision ID: 0035_stock_threshold
Revises: 0034_vaccination_sync
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0035_stock_threshold"
down_revision: Union[str, None] = "0034_vaccination_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinics",
        sa.Column(
            "stock_alert_threshold",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="5",
        ),
    )


def downgrade() -> None:
    op.drop_column("clinics", "stock_alert_threshold")
