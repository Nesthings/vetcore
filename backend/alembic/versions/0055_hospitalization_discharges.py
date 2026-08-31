"""Hospitalización (Milestone 10): alta formal, resumen y seguimiento.

Crea `hospitalization_discharges`: registro de alta con motivo, resumen,
checklist configurable y datos de seguimiento (cita post-alta en Agenda).

Revision ID: 0055_hospitalization_discharges
Revises: 0054_hospitalization_config
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0055_hospitalization_discharges"
down_revision: Union[str, None] = "0054_hospitalization_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_discharges",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("checklist", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("follow_up_date", sa.Date(), nullable=True),
        sa.Column("follow_up_reason", sa.Text(), nullable=True),
        sa.Column("follow_up_vet_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("discharged_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_discharges_clinic", "hospitalization_discharges", ["clinic_id"])
    op.create_index("ix_hosp_discharges_hosp", "hospitalization_discharges", ["hospitalization_id"])


def downgrade() -> None:
    op.drop_table("hospitalization_discharges")
