"""Emails de seguridad: aviso de nuevo inicio de sesión."""

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.email import email_configured, send_email
from app.services.email_templates import login_alert_email


def _geo_hint(ip: str) -> str:
    """Ubicación aproximada (mock ligero). En producción se puede conectar a
    un servicio de geolocalización por IP; aquí se devuelve la IP."""
    return f"IP {ip}"


def send_login_alert(
    db: Session,
    role: str,
    user_id: str,
    ip: str,
    when: datetime | None = None,
) -> dict:
    """Envía un correo avisando de un nuevo inicio de sesión.

    Roles soportados: staff de clínica (`users`) y super-admin (`super_admins`).
    Nunca falla el login: cualquier error del proveedor se registra y se ignora.
    """
    if not email_configured():
        return {"ok": False, "error": "not_configured"}

    table = "users" if role in ("admin", "veterinario", "recepcion") else "super_admins"
    account = (
        db.execute(
            text(f"SELECT email, full_name, clinic_id FROM {table} WHERE id = :uid"),
            {"uid": user_id},
        )
        .mappings()
        .first()
    )
    if account is None:
        return {"ok": False, "error": "account_not_found"}

    when = when or datetime.now()
    time_str = when.strftime("%d/%m/%Y %H:%M")
    clinic_id = account.get("clinic_id") if role != "super-admin" else None
    try:
        result = send_email(
            db,
            clinic_id,
            account["email"],
            "Nuevo inicio de sesión en tu cuenta de VetCore",
            (
                f"Hola, {account['full_name']}: detectamos un inicio de sesión en tu cuenta "
                f"el {time_str} desde {_geo_hint(ip)}. Si no fuiste tú, cambia tu contraseña."
            ),
            template="login-alert",
            html=login_alert_email(account["full_name"], time_str, ip, _geo_hint(ip)),
        )
    except Exception:  # noqa: BLE001 - nunca romper el login por un email
        return {"ok": False, "error": "email_failed"}
    return result
