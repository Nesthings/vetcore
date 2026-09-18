"""Seguridad: habilitar Row-Level Security y revocar acceso a anon/authenticated.

Remediación del aviso de Supabase (rls_disabled_in_public, sensitive_columns_exposed):
la API REST expone todo porque las tablas de `public` fueron creadas por migraciones
sin RLS y con permisos por defecto para los roles `anon`/`authenticated`.

La app accede vía el rol `postgres` (superusuario, ignora RLS), por lo que esta
protección no afecta su funcionamiento.

Revision ID: 0062_security_rls
Revises: 0061_password_reset_super_admin
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0062_security_rls"
down_revision: Union[str, None] = "0061_password_reset_super_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) RLS en todas las tablas existentes de public (idempotente).
    op.execute(
        """
        DO $$
        DECLARE t text;
        BEGIN
          FOR t IN
            SELECT c.relname FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
          LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
          END LOOP;
        END $$;
        """
    )
    # 2) Revocar permisos existentes a los roles de la API REST (si existen).
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
          END IF;
          IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # No se revierte por seguridad: re-exponer los datos sería incorrecto.
    pass