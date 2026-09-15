"""Invitaciones de staff: generan un token de un solo uso y envían el email.

El staff invitado no tiene contraseña: se crea inactivo con un hash inutilizable
y recibe un enlace (`APP_BASE_URL/accept-invite?token=...`) para definir su
propia contraseña. Al completar la activación, el usuario queda activo y
`email_verified_at` se marca.
"""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.email import send_email
from app.services.email_templates import staff_invitation_email

INVITE_EXPIRE_HOURS = 72

# Hash de marcador: nunca coincide con una contraseña real.
UNUSABLE_PASSWORD_HASH = "!unusable-invite"


def create_staff_invitation(
    db: Session,
    clinic_id: UUID,
    user_id: UUID,
    user_email: str,
    user_name: str,
    clinic_name: str,
    commit: bool = True,
) -> dict:
    """Crea una invitación, registra el envío por email y devuelve el resultado.

    Idempotente por token nuevo: cada llamada revoca el acceso de invitaciones
    anteriores del mismo usuario (se marcan usadas).
    """
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=INVITE_EXPIRE_HOURS)

    # Revoca invitaciones previas pendientes del mismo usuario.
    db.execute(
        text(
            "UPDATE staff_invitations SET used_at = now() WHERE user_id = :uid AND used_at IS NULL"
        ),
        {"uid": str(user_id)},
    )
    db.execute(
        text(
            "INSERT INTO staff_invitations (user_id, clinic_id, token, expires_at) "
            "VALUES (:uid, :cid, :token, :expires)"
        ),
        {
            "uid": str(user_id),
            "cid": str(clinic_id),
            "token": token,
            "expires": expires_at,
        },
    )
    if commit:
        db.commit()

    invite_url = f"{settings.app_base_url}/accept-invite?token={token}"
    result = send_email(
        db,
        clinic_id,
        user_email,
        "Te invitaron a VetCore",
        (
            f"Hola, {user_name}: el administrador de {clinic_name} te invitó a VetCore. "
            f"Activa tu cuenta en este enlace: {invite_url}"
        ),
        clinic_name=clinic_name,
        template=f"staff-invite:{user_id}",
        html=staff_invitation_email(user_name, invite_url, clinic_name),
    )
    if commit:
        db.commit()
    return {"ok": result["ok"], "error": result.get("error"), "invite_url": invite_url}


def accept_staff_invitation(db: Session, token: str, password: str) -> dict:
    """Valida el token de invitación y activa la cuenta con la contraseña dada."""
    from app.core.security import hash_password

    row = (
        db.execute(
            text(
                "SELECT i.id, i.user_id, i.clinic_id, i.expires_at, i.used_at, "
                "       u.is_active, u.email_verified_at "
                "FROM staff_invitations i "
                "JOIN users u ON u.id = i.user_id "
                "WHERE i.token = :token"
            ),
            {"token": token},
        )
        .mappings()
        .first()
    )
    if row is None or row["used_at"] is not None or row["expires_at"] < datetime.now(UTC):
        raise ValueError("Enlace de invitación inválido o expirado")

    db.execute(
        text(
            "UPDATE users SET password_hash = :hash, is_active = true, "
            "email_verified_at = now() WHERE id = :uid"
        ),
        {"hash": hash_password(password), "uid": row["user_id"]},
    )
    db.execute(
        text("UPDATE staff_invitations SET used_at = now() WHERE id = :rid"),
        {"rid": row["id"]},
    )
    db.commit()
    return {"user_id": str(row["user_id"]), "clinic_id": str(row["clinic_id"])}
