"""Plantilla de cartilla por WhatsApp + elimina owner_invitations.

1. Agrega `whatsapp_cartilla_template` a `clinics` para el envío de la cartilla.
2. Elimina la tabla `owner_invitations` (flujo de invitación/activación de
   cuenta del dueño): los dueños solo ven la cartilla por enlace, sin login.

Revision ID: 0045_cartilla_send
Revises: 0044_receipt_document_template
Create Date: 2026-08-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0045_cartilla_send"
down_revision: Union[str, None] = "0044_receipt_document_template"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinics", sa.Column("whatsapp_cartilla_template", sa.String(100), nullable=True)
    )
    op.drop_index("idx_invitations_token", table_name="owner_invitations")
    op.drop_table("owner_invitations")


def downgrade() -> None:
    op.drop_column("clinics", "whatsapp_cartilla_template")
    op.create_table(
        "owner_invitations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=False),
        sa.Column("contact_phone", sa.String(30)),
        sa.Column("contact_email", sa.String(200)),
        sa.Column("token", sa.String(100), nullable=False, unique=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id")),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_invitations_token", "owner_invitations", ["token"])
