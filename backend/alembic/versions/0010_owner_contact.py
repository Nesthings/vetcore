"""Datos de contacto ampliados del dueño.

Al registrar una mascota se solicita la información del dueño: nombre,
teléfono, correo y un contacto alternativo (nombre y número). Estas columnas
se agregan a `owners` (identidad global del dueño).

Revision ID: 0010_owner_contact
Revises: 0009_user_component_permissions
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0010_owner_contact"
down_revision: Union[str, None] = "0009_user_component_permissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("owners", sa.Column("full_name", sa.String(200), nullable=True))
    op.add_column("owners", sa.Column("alt_contact_name", sa.String(200), nullable=True))
    op.add_column("owners", sa.Column("alt_phone", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("owners", "alt_phone")
    op.drop_column("owners", "alt_contact_name")
    op.drop_column("owners", "full_name")
