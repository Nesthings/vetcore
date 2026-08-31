"""Citas para pacientes no registrados (walk-in).

Permite agendar una cita sin ligarla a una mascota registrada: se deja
`appointments.pet_id` como opcional y se añade `walk_in_name` con el nombre
libre que escribe el staff en el modal de Nueva cita.

Revision ID: 0022_appointment_walk_in
Revises: 0021_remove_templates
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0022_appointment_walk_in"
down_revision: Union[str, None] = "0021_remove_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("appointments", "pet_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column(
        "appointments", sa.Column("walk_in_name", sa.String(100), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("appointments", "walk_in_name")
    op.alter_column("appointments", "pet_id", existing_type=sa.Uuid(), nullable=False)
