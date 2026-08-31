"""Hospitalización (Milestone 9): configuración de costos de estancia.

Crea `hospitalization_config`: pares clave/valor JSON por clínica (precios por
día por tipo de espacio y recargo por nivel de monitorización). Los costos de
la estancia se calculan con esto y se suman a lo facturado del paciente en el
mismo período (vía el módulo de facturación existente, sin duplicar cálculos).

Revision ID: 0054_hospitalization_config
Revises: 0053_hospitalization_shifts
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0054_hospitalization_config"
down_revision: Union[str, None] = "0053_hospitalization_shifts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_config",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("key", sa.String(50), nullable=False),
        sa.Column("value", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_config_clinic", "hospitalization_config", ["clinic_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_hosp_config_key "
        "ON hospitalization_config (clinic_id, key)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_hosp_config_key")
    op.drop_table("hospitalization_config")
