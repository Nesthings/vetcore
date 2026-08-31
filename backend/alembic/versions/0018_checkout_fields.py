"""Campos del checkout de "Nueva consulta".

- `consultations.performed_at`: fecha/hora de la consulta (la captura la
  recepcionista en el checkout; por defecto ahora).
- `invoices.send_receipt_whatsapp`: casilla del checkout para enviar el recibo
  por WhatsApp (la lógica de envío se implementa después; solo se guarda el
  flag).

Revision ID: 0018_checkout_fields
Revises: 0017_product_stock
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0018_checkout_fields"
down_revision: Union[str, None] = "0017_product_stock"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "consultations",
        sa.Column("performed_at", sa.TIMESTAMP(timezone=True)),
    )
    op.add_column(
        "invoices",
        sa.Column(
            "send_receipt_whatsapp",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("invoices", "send_receipt_whatsapp")
    op.drop_column("consultations", "performed_at")
