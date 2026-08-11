"""Plantillas de WhatsApp por automatización.

Meta entrega mensajes de texto libre solo dentro de la ventana de 24h (tras
un mensaje del cliente); fuera de ella se requieren PLANTILLAS aprobadas.
Se guarda el nombre de la plantilla de cada automatización (y el idioma).

Revision ID: 0042_whatsapp_templates
Revises: 0041_outbound_result
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0042_whatsapp_templates"
down_revision: Union[str, None] = "0041_outbound_result"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clinics", sa.Column("whatsapp_reminder_template", sa.String(100), nullable=True))
    op.add_column("clinics", sa.Column("whatsapp_birthday_template", sa.String(100), nullable=True))
    op.add_column("clinics", sa.Column("whatsapp_receipt_template", sa.String(100), nullable=True))
    op.add_column(
        "clinics",
        sa.Column(
            "whatsapp_template_language",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'es_MX'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("clinics", "whatsapp_template_language")
    op.drop_column("clinics", "whatsapp_receipt_template")
    op.drop_column("clinics", "whatsapp_birthday_template")
    op.drop_column("clinics", "whatsapp_reminder_template")
