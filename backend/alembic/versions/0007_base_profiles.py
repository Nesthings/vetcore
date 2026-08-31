"""Campos base de perfiles de staff y clínica.

Prepara el esquema para las ideas diferidas (IDEAS.txt): login con selección
de usuario con foto, y setup wizard tipo Ubuntu con organigrama. Sin cambiar
el modelo de roles: el "super usuario" de la clínica es el rol `admin`.

Agrega:
- users: photo_url, professional_title, cedula, job_title, description,
  specialty, reports_to (organigrama), last_login_at, is_visible_on_login
- clinics: logo_url, timezone, address, rfc, fiscal_name, currency,
  setup_completed (default true para no romper tenants existentes)
- super_admins: photo_url

Revision ID: 0007_base_profiles
Revises: 0006_kit_price
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0007_base_profiles"
down_revision: Union[str, None] = "0006_kit_price"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("photo_url", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("professional_title", sa.String(150), nullable=True))
    op.add_column("users", sa.Column("cedula", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("job_title", sa.String(150), nullable=True))
    op.add_column("users", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("specialty", sa.String(150), nullable=True))
    op.add_column(
        "users",
        sa.Column("reports_to", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key("fk_users_reports_to", "users", "users", ["reports_to"], ["id"])
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_visible_on_login",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.add_column("clinics", sa.Column("logo_url", sa.String(255), nullable=True))
    op.add_column(
        "clinics",
        sa.Column("timezone", sa.String(50), nullable=False, server_default="UTC"),
    )
    op.add_column("clinics", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("clinics", sa.Column("rfc", sa.String(50), nullable=True))
    op.add_column("clinics", sa.Column("fiscal_name", sa.String(200), nullable=True))
    op.add_column(
        "clinics",
        sa.Column("currency", sa.String(10), nullable=False, server_default="MXN"),
    )
    op.add_column(
        "clinics",
        sa.Column(
            "setup_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.add_column("super_admins", sa.Column("photo_url", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("super_admins", "photo_url")
    op.drop_column("clinics", "setup_completed")
    op.drop_column("clinics", "currency")
    op.drop_column("clinics", "fiscal_name")
    op.drop_column("clinics", "rfc")
    op.drop_column("clinics", "address")
    op.drop_column("clinics", "timezone")
    op.drop_column("clinics", "logo_url")

    op.drop_constraint("fk_users_reports_to", "users", type_="foreignkey")
    op.drop_column("users", "reports_to")
    op.drop_column("users", "is_visible_on_login")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "specialty")
    op.drop_column("users", "description")
    op.drop_column("users", "job_title")
    op.drop_column("users", "cedula")
    op.drop_column("users", "professional_title")
    op.drop_column("users", "photo_url")
