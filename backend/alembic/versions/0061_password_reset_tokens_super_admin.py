"""Password reset tokens: user_id nullable (soporta super-admin).

El token de recuperación del super-admin no encaja en la FK de `users`. Se
hace nullable y se elimina la FK estricta: el sistema resuelve la tabla
(`users` vs `super_admins`) al aplicar el reset.

Revision ID: 0061_password_reset_tokens_super_admin
Revises: 0060_staff_invitations
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0061_password_reset_super_admin"
down_revision: Union[str, None] = "0060_staff_invitations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("password_reset_tokens", "user_id", nullable=True)
    op.drop_constraint("password_reset_tokens_user_id_fkey", "password_reset_tokens", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "password_reset_tokens_user_id_fkey",
        "password_reset_tokens",
        "users",
        ["user_id"],
        ["id"],
    )
    op.alter_column("password_reset_tokens", "user_id", nullable=False)