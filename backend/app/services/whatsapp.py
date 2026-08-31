"""Integración con WhatsApp Business (Meta Cloud API).

Permite enviar mensajes de texto desde la clínica usando su cuenta de
WhatsApp Business (numero, phone number id y access token cifrado con Fernet).
El access token NUNCA se expone en respuestas ni en logs.
"""

import base64
import hashlib
import json
import logging
import urllib.error
import urllib.request

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Clinic, OutboundNotification

logger = logging.getLogger("uvicorn.error")

# Código de país por defecto para normalizar teléfonos de dueños (México).
DEFAULT_COUNTRY_CODE = "52"


def _fernet() -> Fernet:
    # Clave determinística derivada del jwt_secret (Fernet requiere 32 bytes
    # en base64). En producción, jwt_secret debe ser un secreto real.
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.jwt_secret.encode()).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(cipher: str | None) -> str | None:
    if not cipher:
        return None
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def normalize_mx(phone: str | None) -> str | None:
    """Normaliza un teléfono a E.164 asumiendo México (52) si falta prefijo."""
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if not digits:
        return None
    if len(digits) == 10:
        return f"+{DEFAULT_COUNTRY_CODE}{digits}"
    if len(digits) == 12 and digits.startswith(DEFAULT_COUNTRY_CODE):
        return f"+{digits}"
    if len(digits) == 13 and digits.startswith(DEFAULT_COUNTRY_CODE):
        return f"+{DEFAULT_COUNTRY_CODE}{digits[2:]}"
    return f"+{digits}"


def normalize_any(phone: str | None) -> str | None:
    """Normaliza respetando el prefijo que traiga (para el test de conexión)."""
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if not digits:
        return None
    if phone.strip().startswith("+") or len(digits) >= 12:
        return f"+{digits}"
    return normalize_mx(phone)


def clinic_whatsapp(db: Session, clinic_id) -> dict:
    clinic = db.get(Clinic, clinic_id)
    if clinic is None:
        return {
            "enabled": False,
            "phone_number": None,
            "phone_number_id": None,
            "business_account_id": None,
            "token_configured": False,
            "reminder_template": None,
            "birthday_template": None,
            "receipt_template": None,
            "receipt_document_template": None,
            "cartilla_template": None,
            "template_language": "es_MX",
        }
    return {
        "enabled": clinic.whatsapp_enabled,
        "phone_number": clinic.whatsapp_phone_number,
        "phone_number_id": clinic.whatsapp_phone_number_id,
        "business_account_id": clinic.whatsapp_business_account_id,
        "token_configured": bool(clinic.whatsapp_access_token),
        "reminder_template": clinic.whatsapp_reminder_template,
        "birthday_template": clinic.whatsapp_birthday_template,
        "receipt_template": clinic.whatsapp_receipt_template,
        "receipt_document_template": clinic.whatsapp_receipt_document_template,
        "cartilla_template": clinic.whatsapp_cartilla_template,
        "template_language": clinic.whatsapp_template_language or "es_MX",
    }


def _post_message(db: Session, clinic_id, to: str, payload: dict) -> dict:
    clinic = db.get(Clinic, clinic_id)
    if clinic is None or not clinic.whatsapp_enabled or not clinic.whatsapp_phone_number_id:
        return {"ok": False, "external_id": None, "error": "not_configured"}
    token = decrypt_token(clinic.whatsapp_access_token)
    if not token:
        return {"ok": False, "external_id": None, "error": "invalid_token"}
    url = (
        f"{settings.whatsapp_graph_base}/{settings.whatsapp_api_version}/"
        f"{clinic.whatsapp_phone_number_id}/messages"
    )
    full = {"messaging_product": "whatsapp", "to": to, **payload}
    req = urllib.request.Request(url, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=json.dumps(full).encode(), timeout=20) as resp:
            body = json.loads(resp.read().decode())
        messages = body.get("messages") or []
        result = {
            "ok": True,
            "external_id": messages[0].get("id") if messages else None,
            "error": None,
        }
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        result = {"ok": False, "external_id": None, "error": f"HTTP {e.code}: {raw[:400]}"}
    except Exception as e:  # noqa: BLE001 - el proveedor falla por muchas razones
        result = {"ok": False, "external_id": None, "error": str(e)[:400]}
    logger.info(
        "whatsapp send clinic=%s to=%s type=%s ok=%s external_id=%s error=%s",
        clinic_id,
        to,
        payload.get("type"),
        result["ok"],
        result["external_id"],
        (result["error"] or "")[:300],
    )
    return result


def send_text(db: Session, clinic_id, to: str, message: str) -> dict:
    """Envía un texto por la Cloud API de Meta (solo dentro de la ventana 24h)."""
    payload = {"type": "text", "text": {"preview_url": False, "body": message}}
    return _post_message(db, clinic_id, to, payload)


def send_template(
    db: Session,
    clinic_id,
    to: str,
    template_name: str,
    language: str = "es_MX",
    body_params: list[str] | None = None,
    header_document_url: str | None = None,
    header_document_filename: str | None = None,
) -> dict:
    """Envía una plantilla aprobada (entregable fuera de la ventana 24h).

    Si `header_document_url` se indica, agrega una cabecera de documento (PDF).
    """
    template: dict = {"name": template_name, "language": {"code": language}}
    components: list[dict] = []
    if header_document_url:
        document: dict = {"link": header_document_url}
        if header_document_filename:
            document["filename"] = header_document_filename
        components.append(
            {
                "type": "header",
                "parameters": [{"type": "document", "document": document}],
            }
        )
    if body_params:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": p} for p in body_params],
            }
        )
    if components:
        template["components"] = components
    payload = {"type": "template", "template": template}
    return _post_message(db, clinic_id, to, payload)


def send_document(
    db: Session,
    clinic_id,
    to: str,
    document_url: str,
    filename: str | None = None,
    caption: str | None = None,
) -> dict:
    """Envía un documento (PDF) por WhatsApp usando su URL pública."""
    document: dict = {"link": document_url, "caption": caption or ""}
    if filename:
        document["filename"] = filename
    payload = {"type": "document", "document": document}
    return _post_message(db, clinic_id, to, payload)


AUTOMATION_TEMPLATE_FIELDS = {
    "reminder": "whatsapp_reminder_template",
    "birthday": "whatsapp_birthday_template",
    "receipt": "whatsapp_receipt_template",
    "cartilla": "whatsapp_cartilla_template",
}


def send_automation(
    db: Session,
    clinic_id,
    to: str,
    kind: str,
    text: str,
    body_params: list[str] | None = None,
    document_url: str | None = None,
    document_filename: str | None = None,
    document_caption: str | None = None,
) -> dict:
    """Envía una automatización: plantilla con cabecera de documento, documento,
    plantilla configurada o texto libre."""
    clinic = db.get(Clinic, clinic_id)
    # Recibo con PDF: prioridad a la plantilla con cabecera de documento.
    if (
        kind == "receipt"
        and document_url
        and clinic
        and clinic.whatsapp_receipt_document_template
    ):
        language = (clinic.whatsapp_template_language if clinic else None) or "es_MX"
        return send_template(
            db,
            clinic_id,
            to,
            clinic.whatsapp_receipt_document_template,
            language,
            body_params,
            header_document_url=document_url,
            header_document_filename=document_filename,
        )
    if document_url:
        return send_document(db, clinic_id, to, document_url, document_filename, document_caption)
    field = AUTOMATION_TEMPLATE_FIELDS.get(kind)
    template = getattr(clinic, field, None) if clinic and field else None
    if template:
        language = (clinic.whatsapp_template_language if clinic else None) or "es_MX"
        return send_template(db, clinic_id, to, template, language, body_params)
    return send_text(db, clinic_id, to, text)


def record_outbound(
    db: Session,
    clinic_id,
    channel: str,
    template: str,
    status: str,
    owner_id=None,
    recipient=None,
    external_id=None,
    error=None,
) -> OutboundNotification:
    row = OutboundNotification(
        clinic_id=clinic_id,
        owner_id=owner_id,
        channel=channel,
        template=template,
        recipient=recipient,
        external_id=external_id,
        error=error,
        status=status,
    )
    db.add(row)
    return row


def send_receipt_summary(
    db: Session,
    clinic_id,
    owner_id,
    pet_name: str,
    total: float,
    clinic_name: str,
    invoice_ref: str,
    invoice_id,
    receipt_pdf_url: str | None = None,
):
    """Envía el recibo por WhatsApp: PDF adjunto si hay URL, si no texto/plantilla."""
    owner = None
    if owner_id:
        owner = db.execute(
            text("SELECT phone FROM owners WHERE id = :o"), {"o": owner_id}
        ).mappings().first()
    to = normalize_mx(owner["phone"] if owner else None)
    if not to:
        return None
    caption = f"{clinic_name}: recibo {invoice_ref} · {pet_name} · Total ${total:.2f}"
    msg = caption + ". Tu recibo en PDF se adjunta."
    from app.services.queue import dispatch

    return dispatch(
        db,
        clinic_id,
        "receipt",
        to,
        msg,
        [clinic_name, invoice_ref, f"${total:.2f}"],
        f"receipt:{invoice_id}",
        owner_id,
        document_url=receipt_pdf_url,
        document_filename=f"recibo_{invoice_ref}.pdf",
        document_caption=caption,
    )
