"""Foto de la Cartilla digital: columnas en pets.

Principio 5 del documento: la foto de la Cartilla (perfil de la mascota) es
un campo DISTINTO de la foto clínica del expediente. Se conserva la foto
anterior para poder revertirla (sección 8).

Revision ID: 0005_cartilla_photo
Revises: 0004_discounts
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005_cartilla_photo"
down_revision: Union[str, None] = "0004_discounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pets", sa.Column("cartilla_photo_url", sa.Text()))
    op.add_column("pets", sa.Column("cartilla_photo_prev_url", sa.Text()))


def downgrade() -> None:
    op.drop_column("pets", "cartilla_photo_prev_url")
    op.drop_column("pets", "cartilla_photo_url")
