"""Hospitalización (Milestone 4): signos vitales.

Crea `hospitalization_vitals`: mediciones de parámetros clínicos capturados
manualmente por el personal (sin integración con dispositivos, sin
diagnósticos automáticos).

Revision ID: 0049_hospitalization_vitals
Revises: 0048_hospitalization_tasks
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0049_hospitalization_vitals"
down_revision: Union[str, None] = "0048_hospitalization_tasks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_vitals",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("parameter", sa.String(30), nullable=False),
        sa.Column("value", sa.Numeric(12, 3), nullable=True),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_vitals_clinic", "hospitalization_vitals", ["clinic_id"])
    op.create_index("ix_hosp_vitals_hosp", "hospitalization_vitals", ["hospitalization_id"])
    op.create_index(
        "ix_hosp_vitals_param_time",
        "hospitalization_vitals",
        ["hospitalization_id", "parameter", "observed_at"],
    )


def downgrade() -> None:
    op.drop_table("hospitalization_vitals")
