"""Hospitalización (Milestone 5): órdenes de medicamento y administraciones.

- `hospitalization_medication_orders`: órdenes de medicación; el medicamento
  referencia el catálogo de insumos (`inventory_products`), sin duplicarlo.
- `hospitalization_medication_administrations`: cada dosis programada de la
  orden. Al administrar, el backend consume stock vía los movimientos de
  inventario existentes (trazabilidad hospitalización → administración → lote).

Revision ID: 0050_hospitalization_medications
Revises: 0049_hospitalization_vitals
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0050_hospitalization_medications"
down_revision: Union[str, None] = "0049_hospitalization_vitals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_medication_orders",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("clinic_branches.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("inventory_product_id", sa.Uuid(), sa.ForeignKey("inventory_products.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("dose", sa.String(50), nullable=True),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("route", sa.String(30), nullable=True),
        sa.Column("interval_hours", sa.Integer(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("vet_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_med_orders_clinic", "hospitalization_medication_orders", ["clinic_id"])
    op.create_index("ix_hosp_med_orders_hosp", "hospitalization_medication_orders", ["hospitalization_id"])

    op.create_table(
        "hospitalization_medication_administrations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column(
            "order_id",
            sa.Uuid(),
            sa.ForeignKey("hospitalization_medication_orders.id"),
            nullable=False,
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("administered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("administered_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("dose_actual", sa.String(50), nullable=True),
        sa.Column("route_actual", sa.String(30), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_med_admin_clinic", "hospitalization_medication_administrations", ["clinic_id"])
    op.create_index("ix_hosp_med_admin_order", "hospitalization_medication_administrations", ["order_id"])
    op.create_index("ix_hosp_med_admin_status", "hospitalization_medication_administrations", ["status"])
    op.create_index("ix_hosp_med_admin_sched", "hospitalization_medication_administrations", ["scheduled_at"])


def downgrade() -> None:
    op.drop_table("hospitalization_medication_administrations")
    op.drop_table("hospitalization_medication_orders")
