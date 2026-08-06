"""Consentimientos digitales firmados en tablet (subfase 3.2).

La tabla `digital_consents` existe desde la migración 0001 (FASE 3 del
esquema). Se amplía con aislamiento multi-tenant (clinic_id), el paciente
(pet_id), el título y cuerpo del consentimiento y la URL de la firma (PNG).
El PDF firmado se genera con reportlab y se guarda en `pdf_url`.

Revision ID: 0013_consents
Revises: 0012_pet_color_markings
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0013_consents"
down_revision: Union[str, None] = "0012_pet_color_markings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "digital_consents",
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
    )
    op.add_column(
        "digital_consents",
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=False, index=True),
    )
    op.add_column("digital_consents", sa.Column("title", sa.String(200), nullable=False))
    op.add_column("digital_consents", sa.Column("body", sa.Text(), nullable=False))


def downgrade() -> None:
    op.drop_column("digital_consents", "body")
    op.drop_column("digital_consents", "title")
    op.drop_column("digital_consents", "pet_id")
    op.drop_column("digital_consents", "clinic_id")
