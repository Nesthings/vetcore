"""Hospitalización (Milestone 7): notas de evolución, incidencias y fotografías.

- `hospitalization_notes`: notas de evolución/incidencia por categoría.
- `hospitalization_incidents`: incidencias con severidad y acciones.
- `hospitalization_photos`: fotografías (evolución, herida, lesión, etc.).

El timeline de la estancia se arma en lectura fusionando estas entidades con
las del resto del módulo (vitales, alimentación, medicamentos, etc.).

Revision ID: 0052_hospitalization_evolution
Revises: 0051_hospitalization_care
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0052_hospitalization_evolution"
down_revision: Union[str, None] = "0051_hospitalization_care"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_notes",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False, server_default="evolution"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_notes_clinic", "hospitalization_notes", ["clinic_id"])
    op.create_index("ix_hosp_notes_hosp", "hospitalization_notes", ["hospitalization_id"])

    op.create_table(
        "hospitalization_incidents",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("actions_taken", sa.Text(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_incidents_clinic", "hospitalization_incidents", ["clinic_id"])
    op.create_index("ix_hosp_incidents_hosp", "hospitalization_incidents", ["hospitalization_id"])

    op.create_table(
        "hospitalization_photos",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("category", sa.String(30), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_photos_clinic", "hospitalization_photos", ["clinic_id"])
    op.create_index("ix_hosp_photos_hosp", "hospitalization_photos", ["hospitalization_id"])


def downgrade() -> None:
    op.drop_table("hospitalization_photos")
    op.drop_table("hospitalization_incidents")
    op.drop_table("hospitalization_notes")
