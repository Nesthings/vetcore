"""Campos de resultado en outbound_notifications.

Guarda el destinatario, el id externo del proveedor (message id de Meta) y el
error cuando un envío falla, para no registrar los envíos solo como stub.

Revision ID: 0041_outbound_result
Revises: 0040_whatsapp_credentials
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0041_outbound_result"
down_revision: Union[str, None] = "0040_whatsapp_credentials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("outbound_notifications", sa.Column("recipient", sa.String(30), nullable=True))
    op.add_column("outbound_notifications", sa.Column("external_id", sa.String(100), nullable=True))
    op.add_column("outbound_notifications", sa.Column("error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("outbound_notifications", "error")
    op.drop_column("outbound_notifications", "external_id")
    op.drop_column("outbound_notifications", "recipient")
