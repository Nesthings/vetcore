"""Añade columnas TOTP (2FA) a super_admins.

Revision ID: 0056_super_admin_totp
Revises: 0055_hospitalization_discharges
"""

from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "0056_super_admin_totp"
down_revision: Union[str, None] = "0055_hospitalization_discharges"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("super_admins", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column(
        "super_admins",
        sa.Column(
            "totp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("super_admins", "totp_enabled")
    op.drop_column("super_admins", "totp_secret")