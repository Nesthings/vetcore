"""Suscripción de clínicas: fecha de vencimiento.

Revision ID: 0059_subscription_expires_at
Revises: 0058_support_tickets
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0059_subscription_expires_at"
down_revision: Union[str, None] = "0058_support_tickets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinics",
        sa.Column("subscription_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    # Backfill: clínicas activas/en prueba sin vencimiento → 30 días desde su alta.
    op.execute(
        "UPDATE clinics SET subscription_expires_at = created_at + interval '30 days' "
        "WHERE subscription_status IN ('active','trial') "
        "AND subscription_expires_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("clinics", "subscription_expires_at")