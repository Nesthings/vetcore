"""Invitaciones para crear clínicas (link único del super-admin).

Agrega `clinic_invites`: el dueño del producto (super-admin) genera un link
único con el que un admin puede crear su clínica. El token es de un solo uso
y expira.

Revision ID: 0036_clinic_invites
Revises: 0035_stock_threshold
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0036_clinic_invites"
down_revision: Union[str, None] = "0035_stock_threshold"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clinic_invites",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("token", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("clinic_name", sa.String(200), nullable=True),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column(
            "created_by",
            sa.Uuid(),
            sa.ForeignKey("super_admins.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("clinic_invites")
