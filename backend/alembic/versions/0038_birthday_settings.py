"""Ajustes de felicitaciones de cumpleaños de la clínica.

Agrega a `clinics` el mensaje personalizable de cumpleaños y los canales
(correo / whatsapp) por los que se envían las felicitaciones desde el
dashboard.

Revision ID: 0038_birthday_settings
Revises: 0037_invoice_product_fk
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0038_birthday_settings"
down_revision: Union[str, None] = "0037_invoice_product_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinics",
        sa.Column("birthday_message", sa.Text(), nullable=True),
    )
    op.add_column(
        "clinics",
        sa.Column(
            "birthday_send_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "clinics",
        sa.Column(
            "birthday_send_whatsapp",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("clinics", "birthday_send_whatsapp")
    op.drop_column("clinics", "birthday_send_email")
    op.drop_column("clinics", "birthday_message")
