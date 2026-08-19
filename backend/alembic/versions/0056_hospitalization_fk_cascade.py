"""Hospitalización: FKs con ON DELETE CASCADE / SET NULL.

Las FKs de hospitalización no tenían `ondelete`, lo que hace frágil el borrado
de una estancia (hay que limpiar a mano cada tabla hija) y bloquea eliminar una
jaula con hospitalizaciones históricas. Se refuerzan:

- Todos los hijos de `hospitalizations` → `ON DELETE CASCADE`.
- `hospitalizations.accommodation_id` → `ON DELETE SET NULL` (una jaula puede
  eliminarse aunque haya tenido estancias, liberando el vínculo).

Revision ID: 0056_hospitalization_fk_cascade
Revises: 0055_hospitalization_discharges
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0056_hospitalization_fk_cascade"
down_revision: Union[str, None] = "0055_hospitalization_discharges"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (tabla, columna, constraint actual, tabla referenciada)
FKS_CASCADE = [
    ("hospitalization_tasks", "hospitalization_id", "hospitalization_tasks_hospitalization_id_fkey", "hospitalizations"),
    ("hospitalization_vitals", "hospitalization_id", "hospitalization_vitals_hospitalization_id_fkey", "hospitalizations"),
    (
        "hospitalization_medication_orders",
        "hospitalization_id",
        "hospitalization_medication_orders_hospitalization_id_fkey",
        "hospitalizations",
    ),
    (
        "hospitalization_medication_administrations",
        "order_id",
        "hospitalization_medication_administrations_order_id_fkey",
        "hospitalization_medication_orders",
    ),
    ("hospitalization_feeds", "hospitalization_id", "hospitalization_feeds_hospitalization_id_fkey", "hospitalizations"),
    ("hospitalization_fluids", "hospitalization_id", "hospitalization_fluids_hospitalization_id_fkey", "hospitalizations"),
    (
        "hospitalization_eliminations",
        "hospitalization_id",
        "hospitalization_eliminations_hospitalization_id_fkey",
        "hospitalizations",
    ),
    (
        "hospitalization_pain_scores",
        "hospitalization_id",
        "hospitalization_pain_scores_hospitalization_id_fkey",
        "hospitalizations",
    ),
    ("hospitalization_notes", "hospitalization_id", "hospitalization_notes_hospitalization_id_fkey", "hospitalizations"),
    (
        "hospitalization_incidents",
        "hospitalization_id",
        "hospitalization_incidents_hospitalization_id_fkey",
        "hospitalizations",
    ),
    ("hospitalization_photos", "hospitalization_id", "hospitalization_photos_hospitalization_id_fkey", "hospitalizations"),
    (
        "hospitalization_discharges",
        "hospitalization_id",
        "hospitalization_discharges_hospitalization_id_fkey",
        "hospitalizations",
    ),
]


def upgrade() -> None:
    for table, column, constraint, ref_table in FKS_CASCADE:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(
            f"fk_{table}_{column}_cascade", table, ref_table, [column], ["id"],
            ondelete="CASCADE",
        )
    # accommodation_id → SET NULL (liberar al borrar la jaula)
    op.drop_constraint(
        "hospitalizations_accommodation_id_fkey", "hospitalizations", type_="foreignkey"
    )
    op.create_foreign_key(
        "hospitalizations_accommodation_id_fkey_setnull",
        "hospitalizations",
        "hospitalization_accommodations",
        ["accommodation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    for table, column, constraint, ref_table in FKS_CASCADE:
        op.drop_constraint(f"fk_{table}_{column}_cascade", table, type_="foreignkey")
        op.create_foreign_key(constraint, table, ref_table, [column], ["id"])
    op.drop_constraint(
        "hospitalizations_accommodation_id_fkey_setnull",
        "hospitalizations",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "hospitalizations_accommodation_id_fkey",
        "hospitalizations",
        "hospitalization_accommodations",
        ["accommodation_id"],
        ["id"],
    )
