"""Sesión de fotos del veterinario por mascota.

Tabla `pet_photos`: fotos que toma el veterinario durante la consulta desde
la app móvil, etiquetadas con texto libre. `pet_id` es nullable para soportar
el flujo walk-in (emergencia sin mascota registrada), donde se usa
`walk_in_name`.

Revision ID: 0026_pet_photos
Revises: 0025_vaccination_plan_fields
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0026_pet_photos"
down_revision: Union[str, None] = "0025_vaccination_plan_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pet_photos",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=True),
        sa.Column("walk_in_name", sa.String(150), nullable=True),
        sa.Column("vet_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column(
            "taken_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("annotation_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_pet_photos_pet", "pet_photos", ["pet_id"])


def downgrade() -> None:
    op.drop_table("pet_photos")
