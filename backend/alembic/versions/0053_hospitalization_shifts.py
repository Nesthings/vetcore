"""Hospitalización (Milestone 8): cambio de turno.

Crea `hospitalization_shifts`: un turno abierto por un responsable con nota de
entrega. El resumen de turno se calcula en lectura sobre las estancias activas.

Revision ID: 0053_hospitalization_shifts
Revises: 0052_hospitalization_evolution
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0053_hospitalization_shifts"
down_revision: Union[str, None] = "0052_hospitalization_evolution"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_shifts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handover_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_shifts_clinic", "hospitalization_shifts", ["clinic_id"])
    op.create_index("ix_hosp_shifts_user", "hospitalization_shifts", ["user_id"])


def downgrade() -> None:
    op.drop_table("hospitalization_shifts")
