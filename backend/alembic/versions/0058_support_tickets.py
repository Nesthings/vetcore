"""Tickets de soporte: reportes de problemas del staff y adjuntos.

Revision ID: 0058_support_tickets
Revises: f458adc115c5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0058_support_tickets"
down_revision: Union[str, None] = "f458adc115c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "reporter_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reporter_name", sa.String(200), nullable=False),
        sa.Column("reporter_email", sa.String(200), nullable=False),
        sa.Column(
            "clinic_id",
            sa.Uuid(),
            sa.ForeignKey("clinics.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column(
            "resolved_by",
            sa.Uuid(),
            sa.ForeignKey("super_admins.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_support_tickets_reporter_user_id", "support_tickets", ["reporter_user_id"])
    op.create_index("ix_support_tickets_clinic_id", "support_tickets", ["clinic_id"])
    op.create_index("ix_support_tickets_status_created", "support_tickets", ["status", "created_at"])

    op.create_table(
        "support_ticket_attachments",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "ticket_id",
            sa.Uuid(),
            sa.ForeignKey("support_tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("file_type", sa.String(20), nullable=False, server_default="file"),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_support_ticket_attachments_ticket_id", "support_ticket_attachments", ["ticket_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_support_ticket_attachments_ticket_id", table_name="support_ticket_attachments")
    op.drop_table("support_ticket_attachments")
    op.drop_index("ix_support_tickets_status_created", table_name="support_tickets")
    op.drop_index("ix_support_tickets_clinic_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_reporter_user_id", table_name="support_tickets")
    op.drop_table("support_tickets")