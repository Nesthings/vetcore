"""Casilla de envío de recibo por correo en el checkout de "Nueva consulta".

Espejo del flag de WhatsApp: guarda la intención de enviar el recibo por
correo (la lógica de envío se implementa después; el correo destino se deriva
del dueño vinculado a la factura).

Revision ID: 0019_send_receipt_email
Revises: 0018_checkout_fields
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0019_send_receipt_email"
down_revision: Union[str, None] = "0018_checkout_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column(
            "send_receipt_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("invoices", "send_receipt_email")
