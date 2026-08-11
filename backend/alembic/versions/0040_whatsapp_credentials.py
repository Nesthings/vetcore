"""Credenciales de WhatsApp Business (Meta Cloud API) por clínica.

El admin vincula su cuenta de WhatsApp Business: número, phone number id,
WABA id y access token (cifrado con Fernet — nunca se devuelve en respuestas).

Revision ID: 0040_whatsapp_credentials
Revises: 0039_notif_template_longer
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0040_whatsapp_credentials"
down_revision: Union[str, None] = "0039_notif_template_longer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clinics", sa.Column("whatsapp_phone_number", sa.String(30), nullable=True))
    op.add_column("clinics", sa.Column("whatsapp_phone_number_id", sa.String(100), nullable=True))
    op.add_column(
        "clinics", sa.Column("whatsapp_business_account_id", sa.String(100), nullable=True)
    )
    op.add_column("clinics", sa.Column("whatsapp_access_token", sa.Text(), nullable=True))
    op.add_column(
        "clinics",
        sa.Column(
            "whatsapp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )


def downgrade() -> None:
    op.drop_column("clinics", "whatsapp_enabled")
    op.drop_column("clinics", "whatsapp_access_token")
    op.drop_column("clinics", "whatsapp_business_account_id")
    op.drop_column("clinics", "whatsapp_phone_number_id")
    op.drop_column("clinics", "whatsapp_phone_number")
