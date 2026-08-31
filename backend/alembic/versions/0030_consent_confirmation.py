"""Confirmación de consentimientos por el staff.

Flujo: el staff envía el consentimiento al dueño (status `pending`), el dueño
lo firma en la cartilla compartida (status `owner_signed`) y el personal de la
clínica lo CONFIRMA, incluyendo las firmas del personal y generando el PDF
(status `signed`, con `confirmed_at`).

Revision ID: 0030_consent_confirmation
Revises: 0029_vet_signature
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0030_consent_confirmation"
down_revision: Union[str, None] = "0029_vet_signature"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "digital_consents",
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("digital_consents", "confirmed_at")
