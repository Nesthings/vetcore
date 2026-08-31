"""Hospitalización (Milestone 6): alimentación, fluidoterapia, eliminación y dolor.

- `hospitalization_feeds`: registros de alimentación (ofrecido/consumido).
- `hospitalization_fluids`: planes de fluidoterapia.
- `hospitalization_eliminations`: eventos de orina/heces/vómito.
- `hospitalization_pain_scores`: puntuación de dolor (escala libre).

Revision ID: 0051_hospitalization_care
Revises: 0050_hospitalization_medications
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0051_hospitalization_care"
down_revision: Union[str, None] = "0050_hospitalization_medications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hospitalization_feeds",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("diet", sa.Text(), nullable=True),
        sa.Column("type", sa.String(30), nullable=True),
        sa.Column("amount_offered", sa.Numeric(10, 2), nullable=True),
        sa.Column("amount_consumed", sa.Numeric(10, 2), nullable=True),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("offered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("rejected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("vomited", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_feeds_clinic", "hospitalization_feeds", ["clinic_id"])
    op.create_index("ix_hosp_feeds_hosp", "hospitalization_feeds", ["hospitalization_id"])

    op.create_table(
        "hospitalization_fluids",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("solution", sa.Text(), nullable=True),
        sa.Column("route", sa.String(30), nullable=True),
        sa.Column("rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("rate_unit", sa.String(20), nullable=True),
        sa.Column("volume", sa.Numeric(10, 2), nullable=True),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_fluids_clinic", "hospitalization_fluids", ["clinic_id"])
    op.create_index("ix_hosp_fluids_hosp", "hospitalization_fluids", ["hospitalization_id"])

    op.create_table(
        "hospitalization_eliminations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column(
            "kind",
            sa.String(20),
            nullable=False,
        ),
        sa.Column("present", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("quantity", sa.String(30), nullable=True),
        sa.Column("consistency", sa.String(30), nullable=True),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_elim_clinic", "hospitalization_eliminations", ["clinic_id"])
    op.create_index("ix_hosp_elim_hosp", "hospitalization_eliminations", ["hospitalization_id"])

    op.create_table(
        "hospitalization_pain_scores",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("hospitalization_id", sa.Uuid(), sa.ForeignKey("hospitalizations.id"), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("scale", sa.String(50), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hosp_pain_clinic", "hospitalization_pain_scores", ["clinic_id"])
    op.create_index("ix_hosp_pain_hosp", "hospitalization_pain_scores", ["hospitalization_id"])


def downgrade() -> None:
    op.drop_table("hospitalization_pain_scores")
    op.drop_table("hospitalization_eliminations")
    op.drop_table("hospitalization_fluids")
    op.drop_table("hospitalization_feeds")
