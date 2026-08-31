"""Plantilla de recibo con cabecera de documento (PDF) por clínica.

Para entregar el recibo PDF fuera de la ventana 24h se usa una plantilla con
cabecera de tipo `document`. Se guarda el nombre de esa plantilla en la clínica.

Revision ID: 0044_receipt_document_template
Revises: 0043_outbound_status
Create Date: 2026-08-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0044_receipt_document_template"
down_revision: Union[str, None] = "0043_outbound_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinics", sa.Column("whatsapp_receipt_document_template", sa.String(100), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("clinics", "whatsapp_receipt_document_template")
