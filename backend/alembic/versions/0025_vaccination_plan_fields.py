"""Campos de especie y marca en los planes de vacunación.

Los Planes de vacunación se convierten en la fuente del carnet: se añade la
especie a la que aplican, la marca sugerida del biológico, las enfermedades
que previene y el flag `is_standard` para distinguir los esquemas estándar
sembrados automáticamente de los creados por el veterinario.

Revision ID: 0025_vaccination_plan_fields
Revises: 0024_pet_carnet_brand
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0025_vaccination_plan_fields"
down_revision: Union[str, None] = "0024_pet_carnet_brand"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vaccination_plans", sa.Column("species", sa.String(50), nullable=True))
    op.add_column("vaccination_plans", sa.Column("brand", sa.String(100), nullable=True))
    op.add_column("vaccination_plans", sa.Column("prevents", sa.String(255), nullable=True))
    op.add_column(
        "vaccination_plans",
        sa.Column("is_standard", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("vaccination_plans", "is_standard")
    op.drop_column("vaccination_plans", "prevents")
    op.drop_column("vaccination_plans", "brand")
    op.drop_column("vaccination_plans", "species")
