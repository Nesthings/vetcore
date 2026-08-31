"""Carnet de vacunación por paciente.

Tabla de aplicaciones registradas en el carnet de cada mascota. El esquema
estándar de vacunas por especie es estático (app/data/vaccine_carnet.py); esta
tabla guarda las aplicaciones reales (fecha, lote, veterinario).

Revision ID: 0023_pet_carnet
Revises: 0022_appointment_walk_in
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0023_pet_carnet"
down_revision: Union[str, None] = "0022_appointment_walk_in"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pet_carnet_records",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=False),
        sa.Column("vaccine", sa.String(150), nullable=False),
        sa.Column("date_applied", sa.Date(), nullable=False),
        sa.Column("lot", sa.String(100), nullable=True),
        sa.Column("vet_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pet_carnet_pet", "pet_carnet_records", ["pet_id"])


def downgrade() -> None:
    op.drop_table("pet_carnet_records")
