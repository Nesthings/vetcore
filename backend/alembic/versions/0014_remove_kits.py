"""Eliminación del módulo de kits de inventario.

Los kits (FASE 2) se eliminaron por decisión del usuario (2026-08-06) por ser
redundantes: se dropean las tablas `inventory_kits` e `inventory_kit_items`
(creadas en 0001 y ampliadas con `price` en 0006).

Revision ID: 0014_remove_kits
Revises: 0013_consents
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0014_remove_kits"
down_revision: Union[str, None] = "0013_consents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("inventory_kit_items")
    op.drop_table("inventory_kits")


def downgrade() -> None:
    pass
