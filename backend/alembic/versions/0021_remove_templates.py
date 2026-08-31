"""Eliminación del módulo de plantillas de consulta.

El módulo de Plantillas se eliminó por decisión del usuario (2026-08-06):
se dropea la tabla `consultation_templates` y la columna
`consultations.template_id` que la referenciaba.

Revision ID: 0021_remove_templates
Revises: 0020_financial_expenses
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0021_remove_templates"
down_revision: Union[str, None] = "0020_financial_expenses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("consultations_template_id_fkey", "consultations", type_="foreignkey")
    op.drop_column("consultations", "template_id")
    op.drop_table("consultation_templates")


def downgrade() -> None:
    pass
