"""Envío de correos transaccionales.

Canal principal: Resend (API transaccional). Fallback: SMTP (smtplib) si no
hay `RESEND_API_KEY`. Registra cada envío en `outbound_notifications`
(channel email) y permite HTML y adjuntos.
"""

import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.whatsapp import record_outbound_optional_clinic

logger = logging.getLogger("uvicorn.error")

resend = None
try:  # import opcional: si no está instalado, se usa SMTP o falla limpio
    import resend  # type: ignore
except ImportError:  # pragma: no cover
    resend = None


def email_configured() -> bool:
    """True si hay un canal de envío configurado (Resend o SMTP)."""
    return bool(settings.resend_api_key) or (bool(settings.smtp_host and settings.smtp_from))


def _default_from() -> str:
    return settings.email_from or settings.smtp_from or "VetCore <no-reply@vetcore.app>"


def _send_via_resend(
    to: str, subject: str, html: str | None, text: str | None, attachments: list[dict] | None
) -> dict:
    params: dict = {"from": _default_from(), "to": [to], "subject": subject}
    if html:
        params["html"] = html
    if text and not html:
        params["text"] = text
    if attachments:
        params["attachments"] = attachments
    resp = resend.Emails.send(params)  # type: ignore[attr-defined]
    return {"ok": True, "external_id": str(resp.get("id") or ""), "error": None}


def _send_via_smtp(
    to: str, subject: str, html: str | None, text: str | None, attachments: list[dict] | None
) -> dict:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = _default_from()
    msg["To"] = to
    if text:
        msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_starttls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
    return {"ok": True, "external_id": None, "error": None}


def send_email(
    db: Session,
    clinic_id,
    to: str,
    subject: str,
    body: str,
    clinic_name: str | None = None,
    template: str | None = None,
    owner_id=None,
    *,
    html: str | None = None,
    attachments: list[dict] | None = None,
) -> dict:
    """Envía un correo (Resend → SMTP fallback) y registra el resultado.

    `body` es el texto plano; `html` (opcional) es la versión HTML. Si no hay
    canal configurado, devuelve `{"ok": False, "error": "not_configured"}`
    sin intentar el envío.
    """
    if not email_configured():
        return {"ok": False, "external_id": None, "error": "not_configured"}
    result: dict
    if settings.resend_api_key and resend is not None:
        try:
            resend.api_key = settings.resend_api_key  # type: ignore[attr-defined]
            result = _send_via_resend(to, subject, html, body, attachments)
        except Exception as e:  # noqa: BLE001 - el proveedor falla por muchas razones
            result = {"ok": False, "external_id": None, "error": str(e)[:400]}
    elif settings.smtp_host:
        try:
            result = _send_via_smtp(to, subject, html, body, attachments)
        except Exception as e:  # noqa: BLE001
            result = {"ok": False, "external_id": None, "error": str(e)[:400]}
    else:
        return {"ok": False, "external_id": None, "error": "not_configured"}

    record_outbound_optional_clinic(
        db,
        clinic_id,
        "email",
        template or f"email:{to[:20]}",
        "sent" if result["ok"] else "failed",
        owner_id=owner_id,
        recipient=to,
        external_id=result["external_id"],
        error=result["error"],
    )
    logger.info(
        "email send clinic=%s to=%s ok=%s error=%s",
        clinic_id,
        to,
        result["ok"],
        (result["error"] or "")[:300],
    )
    return result
