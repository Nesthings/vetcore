"""last_login_at del super-admin (dueño de la plataforma).

Complemento de 0007: el login del super-admin también registra su último
acceso (auth.py lo actualiza en cada login). Separada para no re-aplicar
0007, que ya corrió antes de que este campo existiera.

Revision ID: 0008_super_admin_last_login
Revises: 0007_base_profiles
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0008_super_admin_last_login"
down_revision: Union[str, None] = "0007_base_profiles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "super_admins",
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("super_admins", "last_login_at")
