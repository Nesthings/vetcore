"""Firma del médico veterinario.

Agrega `users.signature_url` (la firma dibujada del doctor, guardada una vez
y reutilizada en los PDFs) y `digital_consents.vet_user_id` para saber qué
médico emitió cada consentimiento y poder incrustar su firma.

Revision ID: 0029_vet_signature
Revises: 0028_consent_status
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0029_vet_signature"
down_revision: Union[str, None] = "0028_consent_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("signature_url", sa.Text(), nullable=True))
    op.add_column(
        "digital_consents",
        sa.Column("vet_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("digital_consents", "vet_user_id")
    op.drop_column("users", "signature_url")
