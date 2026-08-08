"""Unificación dosis ↔ carnet de vacunación.

Conecta los dos mundos de la vacunación:
- `pet_carnet_records.dose_id`: vincula cada aplicación del carnet con la
  dosis del plan que la generó (unique, ondelete SET NULL).
- `pet_vaccination_doses`: campos de aplicación real (fecha aplicada, lote,
  marca y quién la aplicó) capturados al completar la cita de vacunación.
- `pet_vaccination_doses.appointment_id`: ahora ondelete SET NULL para poder
  borrar/reprogramar citas sin romper la dosis.

Revision ID: 0034_vaccination_sync
Revises: 0033_pet_qr
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0034_vaccination_sync"
down_revision: Union[str, None] = "0033_pet_qr"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Campos de aplicación en la dosis
    op.add_column("pet_vaccination_doses", sa.Column("date_applied", sa.Date(), nullable=True))
    op.add_column("pet_vaccination_doses", sa.Column("lot", sa.String(100), nullable=True))
    op.add_column("pet_vaccination_doses", sa.Column("brand", sa.String(100), nullable=True))
    op.add_column(
        "pet_vaccination_doses",
        sa.Column(
            "applied_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Borrar una cita ya no rompe la dosis (SET NULL)
    op.drop_constraint(
        "pet_vaccination_doses_appointment_id_fkey", "pet_vaccination_doses", type_="foreignkey"
    )
    op.create_foreign_key(
        "pet_vaccination_doses_appointment_id_fkey",
        "pet_vaccination_doses",
        "appointments",
        ["appointment_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Vinculación carnet ↔ dosis
    op.add_column("pet_carnet_records", sa.Column("dose_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint(
        "uq_pet_carnet_records_dose_id", "pet_carnet_records", ["dose_id"]
    )
    op.create_foreign_key(
        "pet_carnet_records_dose_id_fkey",
        "pet_carnet_records",
        "pet_vaccination_doses",
        ["dose_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "pet_carnet_records_dose_id_fkey", "pet_carnet_records", type_="foreignkey"
    )
    op.drop_constraint("uq_pet_carnet_records_dose_id", "pet_carnet_records", type_="unique")
    op.drop_column("pet_carnet_records", "dose_id")

    op.drop_constraint(
        "pet_vaccination_doses_appointment_id_fkey", "pet_vaccination_doses", type_="foreignkey"
    )
    op.create_foreign_key(
        "pet_vaccination_doses_appointment_id_fkey",
        "pet_vaccination_doses",
        "appointments",
        ["appointment_id"],
        ["id"],
    )

    op.drop_column("pet_vaccination_doses", "applied_by")
    op.drop_column("pet_vaccination_doses", "brand")
    op.drop_column("pet_vaccination_doses", "lot")
    op.drop_column("pet_vaccination_doses", "date_applied")
