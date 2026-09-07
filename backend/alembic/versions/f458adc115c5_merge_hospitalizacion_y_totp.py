"""merge hospitalizacion y totp

Revision ID: f458adc115c5
Revises: 0056_hospitalization_fk_cascade, 0057_user_totp
Create Date: 2026-09-06 18:51:15.077114

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f458adc115c5'
down_revision: Union[str, None] = ('0056_hospitalization_fk_cascade', '0057_user_totp')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
