"""Consultas walk-in (mascota no registrada).

Consistente con las citas walk-in (migración 0022): se deja
`consultations.pet_id` como opcional y se añade `walk_in_name` para finalizar
una consulta de emergencia sin mascota registrada.

Revision ID: 0027_consultation_walk_in
Revises: 0026_pet_photos
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0027_consultation_walk_in"
down_revision: Union[str, None] = "0026_pet_photos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("consultations", "pet_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("consultations", sa.Column("walk_in_name", sa.String(150), nullable=True))


def downgrade() -> None:
    op.drop_column("consultations", "walk_in_name")
    op.alter_column("consultations", "pet_id", existing_type=sa.Uuid(), nullable=False)
