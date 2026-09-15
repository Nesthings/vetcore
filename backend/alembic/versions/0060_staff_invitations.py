"""Invitaciones de staff (definir contraseña) y verificación de email.

Revision ID: 0060_staff_invitations
Revises: 0059_subscription_expires_at
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0060_staff_invitations"
down_revision: Union[str, None] = "0059_subscription_expires_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_table(
        "staff_invitations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "clinic_id",
            sa.Uuid(),
            sa.ForeignKey("clinics.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(200), nullable=False, unique=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_staff_invitations_user_id", "staff_invitations", ["user_id"])
    op.create_index("ix_staff_invitations_token", "staff_invitations", ["token"])


def downgrade() -> None:
    op.drop_index("ix_staff_invitations_token", table_name="staff_invitations")
    op.drop_index("ix_staff_invitations_user_id", table_name="staff_invitations")
    op.drop_table("staff_invitations")
    op.drop_column("users", "email_verified_at")