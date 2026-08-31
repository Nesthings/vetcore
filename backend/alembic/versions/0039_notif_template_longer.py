"""Amplía el template de outbound_notifications para felicitaciones.

El motor de recordatorios usa plantillas `rem:<appointment_id>:<stage>` (~46
caracteres), pero las felicitaciones usan `bday:<pet_id>:<fecha>` que supera
los 50. Se amplía la columna a 200 para que quepa sin truncar.

Revision ID: 0039_notif_template_longer
Revises: 0038_birthday_settings
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0039_notif_template_longer"
down_revision: Union[str, None] = "0038_birthday_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "outbound_notifications",
        "template",
        type_=sa.String(200),
        existing_type=sa.String(50),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "outbound_notifications",
        "template",
        type_=sa.String(50),
        existing_type=sa.String(200),
        existing_nullable=True,
    )
