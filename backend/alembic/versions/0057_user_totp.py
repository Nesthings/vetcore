"""Añade columnas TOTP (2FA) a users (staff de clínica).

Revision ID: 0057_user_totp
Revises: 0056_super_admin_totp
"""

from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "0057_user_totp"
down_revision: Union[str, None] = "0056_super_admin_totp"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "totp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")