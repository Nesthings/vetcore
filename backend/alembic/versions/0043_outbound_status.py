"""Amplía el CHECK de status en outbound_notifications.

Con el pipeline asíncrono (SQS) se necesita el estado 'queued' (encolado) y
'not_configured' (sin proveedor), que la constraint original (0001) no permite.

Revision ID: 0043_outbound_status
Revises: 0042_whatsapp_templates
Create Date: 2026-08-11

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0043_outbound_status"
down_revision: Union[str, None] = "0042_whatsapp_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "outbound_notifications_status_check"


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, "outbound_notifications", type_="check")
    op.create_check_constraint(
        CONSTRAINT,
        "outbound_notifications",
        "status IN ('sent','delivered','failed','queued','not_configured')",
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "outbound_notifications", type_="check")
    op.create_check_constraint(
        CONSTRAINT,
        "outbound_notifications",
        "status IN ('sent','delivered','failed')",
    )
