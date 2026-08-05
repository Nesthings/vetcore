"""Crear tabla password_reset_tokens para recuperación de contraseña (staff).

No existe en el esquema de la sección 5; se agrega para soportar la
recuperación segura de contraseña con token con expiración (Subfase 1.2).

Revision ID: 0003_password_reset_tokens
Revises: 0002_super_admins
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_password_reset_tokens"
down_revision: Union[str, None] = "0002_super_admins"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(100), nullable=False, unique=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_reset_tokens_user", "password_reset_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_reset_tokens_user", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
