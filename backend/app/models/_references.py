"""Registros Core de tablas referenciadas por FKs pero sin modelo ORM todavía.

Estas tablas YA existen en la base (migración 0001). Se registran como
`Table` de SQLAlchemy Core únicamente para que el mapper resuelva las
foreign keys de los modelos actuales. No tienen clase ORM: sus modelos
llegan en sus respectivas subfases (owners → 1.7, templates → 2.1,
service_catalog → 1.5).
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.session import Base

owners = Table(
    "owners",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("phone", String(30), unique=True),
    Column("email", String(200), unique=True),
    Column("password_hash", Text),
    Column("profile_photo_url", Text),
    Column("profile_photo_prev_url", Text),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

consultation_templates = Table(
    "consultation_templates",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("clinic_id", UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False),
    Column("name", String(150), nullable=False),
    Column("species", String(50)),
    Column("fields_json", JSONB, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

service_catalog = Table(
    "service_catalog",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("clinic_id", UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=False),
    Column("name", String(200), nullable=False),
    Column("price", Numeric(10, 2), nullable=False),
)
