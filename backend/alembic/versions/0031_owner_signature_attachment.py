"""Firma del dueño y adjuntos en consentimientos.

- `owners.signature_url`: firma dibujada del dueño (cuando el dueño también es
  médico), guardada desde su cartilla compartida y reutilizada como firma del
  "médico veterinario" si se le selecciona como médico que firma.
- `digital_consents.attachment_url` / `attachment_name`: documento adjunto
  opcional que explica el consentimiento.

Revision ID: 0031_owner_signature_attachment
Revises: 0030_consent_confirmation
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0031_owner_signature_attachment"
down_revision: Union[str, None] = "0030_consent_confirmation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("owners", sa.Column("signature_url", sa.Text(), nullable=True))
    op.add_column("digital_consents", sa.Column("attachment_url", sa.Text(), nullable=True))
    op.add_column(
        "digital_consents", sa.Column("attachment_name", sa.String(255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("digital_consents", "attachment_name")
    op.drop_column("digital_consents", "attachment_url")
    op.drop_column("owners", "signature_url")
