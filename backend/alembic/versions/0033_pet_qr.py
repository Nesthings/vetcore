"""QR permanente por mascota.

Agrega `pets.qr_token`: un identificador opaco, único y SIN expiración que
codifica el QR de la cartilla. Se genera perezosamente la primera vez que se
solicita y permite abrir la cartilla de la mascota (o resolverla desde el
lector del staff) de forma permanente.

Revision ID: 0033_pet_qr
Revises: 0032_notification_link
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0033_pet_qr"
down_revision: Union[str, None] = "0032_notification_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pets", sa.Column("qr_token", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_pets_qr_token", "pets", ["qr_token"])


def downgrade() -> None:
    op.drop_constraint("uq_pets_qr_token", "pets", type_="unique")
    op.drop_column("pets", "qr_token")
