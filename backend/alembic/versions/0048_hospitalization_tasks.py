"""Hospitalización (Milestone 3): tareas y motor de monitorización.

Crea `hospitalization_tasks`: tareas operativas de una hospitalización
(signos vitales, medicamento, alimentación, hidratación, revisión, etc.).
La monitorización genera tareas de signos vitales por nivel (configurable).

Revision ID: 0048_hospitalization_tasks
Revises: 0047_hospitalization
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0048_hospitalization_tasks"
down_revision: Union[str, None] = "0047_hospitalization"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column(
            "type",
            sa.String(30),
            nullable=False,
            server_default="other",
        ),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "priority",
            sa.String(20),
            nullable=False,
            server_default="normal",
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("assigned_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("completed_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_tasks_clinic", "hospitalization_tasks", ["clinic_id"])
    op.create_index("ix_hosp_tasks_hosp", "hospitalization_tasks", ["hospitalization_id"])
    op.create_index("ix_hosp_tasks_status", "hospitalization_tasks", ["status"])
    op.create_index("ix_hosp_tasks_scheduled", "hospitalization_tasks", ["scheduled_at"])


def downgrade() -> None:
    op.drop_table("hospitalization_tasks")
