"""Alertas inteligentes: reglas y avisos deterministas.

1. `smart_alert_rules`: catálogo de reglas (clinic_id NULL = regla global por
   defecto; no nulo = override por clínica).
2. `smart_alerts`: avisos generados por el motor de evaluación. Un mismo
   (clinic_id, rule_key, entity_type, entity_id) solo puede tener UN aviso
   'active' a la vez (índice único parcial), lo que evita duplicados entre
   ejecuciones del motor.

Revision ID: 0046_smart_alerts
Revises: 0045_cartilla_send
Create Date: 2026-08-12

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0046_smart_alerts"
down_revision: str | None = "0045_cartilla_send"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "smart_alert_rules",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=True),
        sa.Column("rule_key", sa.String(50), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("message_template", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("params", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_smart_alert_rules_clinic", "smart_alert_rules", ["clinic_id"])
    # Una sola regla global por key (clinic_id NULL) y una sola por clínica.
    op.execute(
        "CREATE UNIQUE INDEX uq_smart_alert_rules_global "
        "ON smart_alert_rules (rule_key) WHERE clinic_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_smart_alert_rules_clinic "
        "ON smart_alert_rules (clinic_id, rule_key) WHERE clinic_id IS NOT NULL"
    )

    op.create_table(
        "smart_alerts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("clinic_branches.id"), nullable=True),
        sa.Column("rule_key", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(30), nullable=False, server_default="pet"),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="active"
        ),
        sa.Column("triggered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("link", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_smart_alerts_clinic", "smart_alerts", ["clinic_id"])
    op.create_index("ix_smart_alerts_rule", "smart_alerts", ["rule_key"])
    op.create_index("ix_smart_alerts_entity", "smart_alerts", ["entity_id"])
    op.create_index("ix_smart_alerts_status", "smart_alerts", ["status"])
    # Anti-duplicados: un único aviso activo por regla+entidad+clínica.
    op.execute(
        "CREATE UNIQUE INDEX uq_smart_alerts_active "
        "ON smart_alerts (clinic_id, rule_key, entity_type, entity_id) "
        "WHERE status = 'active'"
    )


def downgrade() -> None:
    op.drop_index("uq_smart_alerts_active", table_name="smart_alerts")
    op.drop_index("ix_smart_alerts_status", table_name="smart_alerts")
    op.drop_index("ix_smart_alerts_entity", table_name="smart_alerts")
    op.drop_index("ix_smart_alerts_rule", table_name="smart_alerts")
    op.drop_index("ix_smart_alerts_clinic", table_name="smart_alerts")
    op.drop_table("smart_alerts")
    op.execute("DROP INDEX IF EXISTS uq_smart_alert_rules_global")
    op.execute("DROP INDEX IF EXISTS uq_smart_alert_rules_clinic")
    op.drop_index("ix_smart_alert_rules_clinic", table_name="smart_alert_rules")
    op.drop_table("smart_alert_rules")
