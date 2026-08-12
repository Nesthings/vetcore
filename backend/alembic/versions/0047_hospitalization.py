"""Hospitalización (Milestone 1): estancias + espacios/jaulas.

Reemplaza las tablas stub de la migración 0001 (`hospitalization_records` y
`hospitalization_vitals`, que nunca se conectaron a API ni tienen datos) por el
modelo operativo completo:

- `hospitalization_accommodations`: espacios/jaulas por clínica y sucursal.
- `hospitalizations`: estancia de un paciente (estados, responsable, espacio,
  nivel de monitorización, estado operativo y de aislamiento, costos futuros).

Revision ID: 0047_hospitalization
Revises: 0046_smart_alerts
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0047_hospitalization"
down_revision: Union[str, None] = "0046_smart_alerts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reemplaza los stubs de 0001 (sin datos ni FKs activas).
    op.drop_table("hospitalization_vitals")
    op.drop_table("hospitalization_records")

    op.create_table(
        "hospitalization_accommodations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("clinic_branches.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column(
            "type",
            sa.String(30),
            nullable=False,
            server_default="general",
        ),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="available",
        ),
        sa.Column(
            "max_isolation",
            sa.String(20),
            nullable=False,
            server_default="normal",
        ),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_acc_clinic", "hospitalization_accommodations", ["clinic_id"])
    op.create_index("ix_hosp_acc_branch", "hospitalization_accommodations", ["branch_id"])
    op.create_index(
        "ix_hosp_acc_code", "hospitalization_accommodations", ["clinic_id", "branch_id", "code"], unique=True
    )

    op.create_table(
        "hospitalizations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("clinic_branches.id"), nullable=False),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="admitted",
        ),
        sa.Column(
            "accommodation_id",
            sa.Uuid(),
            sa.ForeignKey("hospitalization_accommodations.id"),
            nullable=True,
        ),
        sa.Column("vet_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("diagnosis", sa.Text(), nullable=True),
        sa.Column("monitoring_level", sa.String(20), nullable=True),
        sa.Column(
            "operational_status",
            sa.String(20),
            nullable=False,
            server_default="stable",
        ),
        sa.Column(
            "isolation_status",
            sa.String(20),
            nullable=False,
            server_default="normal",
        ),
        sa.Column("admitted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expected_discharge_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_discharge_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_clinic", "hospitalizations", ["clinic_id"])
    op.create_index("ix_hosp_branch", "hospitalizations", ["branch_id"])
    op.create_index("ix_hosp_pet", "hospitalizations", ["pet_id"])
    op.create_index("ix_hosp_status", "hospitalizations", ["status"])
    op.create_index("ix_hosp_admitted", "hospitalizations", ["admitted_at"])


def downgrade() -> None:
    op.drop_table("hospitalizations")
    op.drop_table("hospitalization_accommodations")
    # Restaura los stubs de 0001.
    op.create_table(
        "hospitalization_records",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=False),
        sa.Column("admitted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("discharged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "hospitalization_vitals",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "hospitalization_id",
            sa.Uuid(),
            sa.ForeignKey("hospitalization_records.id"),
            nullable=False,
        ),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("temperature", sa.Numeric(4, 1), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
