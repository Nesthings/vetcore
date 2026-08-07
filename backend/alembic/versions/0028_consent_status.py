"""Consentimientos pendientes de firma remota del dueño.

Agrega `status` a `digital_consents` ('signed' para los existentes) y deja
`signature_url`/`pdf_url` opcionales para soportar consentimientos pendientes:
el vet genera el documento, el dueño lo firma a distancia desde la cartilla
compartida y entonces se genera la firma + el PDF.

Revision ID: 0028_consent_status
Revises: 0027_consultation_walk_in
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0028_consent_status"
down_revision: Union[str, None] = "0027_consultation_walk_in"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "digital_consents",
        sa.Column("status", sa.String(20), nullable=False, server_default="signed"),
    )
    op.alter_column("digital_consents", "signature_url", existing_type=sa.Text(), nullable=True)
    op.alter_column("digital_consents", "pdf_url", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("digital_consents", "pdf_url", existing_type=sa.Text(), nullable=False)
    op.alter_column("digital_consents", "signature_url", existing_type=sa.Text(), nullable=False)
    op.drop_column("digital_consents", "status")
