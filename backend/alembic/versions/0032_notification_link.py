"""Enlace de navegación en notificaciones internas.

Agrega `internal_notifications.link`: una ruta del frontend (ej.
`/pets/<id>?tab=consents&confirm=<id>`) para que al hacer clic en la
notificación se navegue directo a la acción (confirmar un consentimiento).

Revision ID: 0032_notification_link
Revises: 0031_owner_signature_attachment
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0032_notification_link"
down_revision: Union[str, None] = "0031_owner_signature_attachment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("internal_notifications", sa.Column("link", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("internal_notifications", "link")
