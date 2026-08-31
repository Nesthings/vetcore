"""Razas personalizadas por clínica.

El catálogo de razas (app/data/breeds.py) es estático. Esta tabla guarda
razas adicionales que el staff agrega al escribir una raza no existente; se
fusionan con el catálogo base al desplegar el diccionario (breeds-catalog).

Revision ID: 0011_custom_breeds
Revises: 0010_owner_contact
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0011_custom_breeds"
down_revision: Union[str, None] = "0010_owner_contact"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_breeds",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False, index=True
        ),
        sa.Column("species", sa.String(50), nullable=False),
        sa.Column("breed", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("clinic_id", "species", "breed", name="uq_custom_breed"),
    )


def downgrade() -> None:
    op.drop_table("custom_breeds")
