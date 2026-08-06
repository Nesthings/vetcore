"""Registros Core de tablas referenciadas por FKs pero sin modelo ORM todavía.

Estas tablas YA existen en la base (migración 0001). Se registran como
`Table` de SQLAlchemy Core únicamente para que el mapper resuelva las
foreign keys de los modelos actuales. La tabla `owners` se modela en la
Subfase 1.7 como parte de la identidad global del dueño.
"""

from sqlalchemy import Column, DateTime, String, Table, Text, func
from sqlalchemy.dialects.postgresql import UUID

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
