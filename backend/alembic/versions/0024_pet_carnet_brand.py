"""Marca del biológico en el carnet de vacunación.

Agrega la columna `brand` a `pet_carnet_records` para registrar la marca del
biológico aplicado (ej. Canigen MHA, Rabigen Mono).

Revision ID: 0024_pet_carnet_brand
Revises: 0023_pet_carnet
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0024_pet_carnet_brand"
down_revision: Union[str, None] = "0023_pet_carnet"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pet_carnet_records", sa.Column("brand", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("pet_carnet_records", "brand")
