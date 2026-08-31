"""Planes de vacunación (módulo de automatización del esquema de vacunación).

El admin define planes (nombre, compuesto activo, notas) con una lista de
dosis (steps): cada paso indica cuántos días después de la dosis anterior
corresponde. Al asignar un plan a una mascota se generan TODAS las dosis de
golpe y una cita automática por dosis en la agenda.

Revision ID: 0015_vaccination_plans
Revises: 0014_remove_kits
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0015_vaccination_plans"
down_revision: Union[str, None] = "0014_remove_kits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vaccination_plans",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False, index=True
        ),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("compound", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column(
            "active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_table(
        "vaccination_plan_steps",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "plan_id",
            sa.Uuid(),
            sa.ForeignKey("vaccination_plans.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("label", sa.String(150), nullable=False),
        sa.Column("offset_days", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_table(
        "pet_vaccination_plans",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False, index=True
        ),
        sa.Column(
            "pet_id", sa.Uuid(), sa.ForeignKey("pets.id", ondelete="CASCADE"), nullable=False,
            index=True,
        ),
        sa.Column(
            "plan_id",
            sa.Uuid(),
            sa.ForeignKey("vaccination_plans.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "branch_id",
            sa.Uuid(),
            sa.ForeignKey("clinic_branches.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("vet_user_id", sa.Uuid(), sa.ForeignKey("users.id")),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id")),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_table(
        "pet_vaccination_doses",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "pet_vaccination_plan_id",
            sa.Uuid(),
            sa.ForeignKey("pet_vaccination_plans.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("label", sa.String(150), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column("appointment_id", sa.Uuid(), sa.ForeignKey("appointments.id")),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("pet_vaccination_doses")
    op.drop_table("pet_vaccination_plans")
    op.drop_table("vaccination_plan_steps")
    op.drop_table("vaccination_plans")
