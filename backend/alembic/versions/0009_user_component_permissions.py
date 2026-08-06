"""Permisos por componente del staff (idea 2 de IDEAS.txt).

El admin de la clínica puede activar/desactivar el acceso a componentes
(módulos del panel) por usuario. La tabla guarda SOLO los overrides: el
acceso por defecto proviene del rol (`ROLE_DEFAULT_COMPONENTS` en
`app/core/permissions.py`). Una fila `allowed=false` revoca, `allowed=true`
concede, y la ausencia de fila = default del rol.

Revision ID: 0009_user_component_permissions
Revises: 0008_super_admin_last_login
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0009_user_component_permissions"
down_revision: Union[str, None] = "0008_super_admin_last_login"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_component_permissions",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("component", sa.String(50), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("user_id", "component", name="uq_user_component"),
    )


def downgrade() -> None:
    op.drop_table("user_component_permissions")
