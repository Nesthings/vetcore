"""Color y características especiales de la mascota.

Campos muy útiles para identificar al paciente: color primario, color
secundario (una mascota puede tener dos colores) y características
especiales de pelaje/patrón (manchado, atigrado, merle, etc.).

Revision ID: 0012_pet_color_markings
Revises: 0011_custom_breeds
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0012_pet_color_markings"
down_revision: Union[str, None] = "0011_custom_breeds"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pets", sa.Column("color_primary", sa.String(50), nullable=True))
    op.add_column("pets", sa.Column("color_secondary", sa.String(50), nullable=True))
    op.add_column("pets", sa.Column("markings", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("pets", "markings")
    op.drop_column("pets", "color_secondary")
    op.drop_column("pets", "color_primary")
