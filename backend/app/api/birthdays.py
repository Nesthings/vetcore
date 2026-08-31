"""Cumpleaños del día — felicitaciones a los dueños de las mascotas.

El dashboard muestra las mascotas que cumplen años hoy y permite enviar una
felicitación por los canales configurados en Configuración (correo/whatsapp).
Al igual que el motor de recordatorios, el envío se registra en
`outbound_notifications` con status 'sent' (stub hasta configurar proveedor),
deduplicado por plantilla `bday:<pet_id>:<fecha>` para no felicitar dos veces.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, require_component
from app.db.session import get_db
from app.models import OutboundNotification
from app.services.queue import dispatch
from app.services.whatsapp import normalize_mx

router = APIRouter(prefix="/birthdays", tags=["birthdays"])

VALID_CHANNELS = ("email", "whatsapp")

DEFAULT_BIRTHDAY_MESSAGE = (
    "🎂 ¡Feliz cumpleaños {mascota}! 🎉 Hoy cumples {edad} años. "
    "Te deseamos un año más de salud, juego y cariño. — {clínica}"
)


class CelebrateBody(BaseModel):
    channels: list[str] = []


def _settings(db: Session, clinic_id: str) -> dict:
    row = db.execute(
        text(
            "SELECT name, birthday_message, birthday_send_email, birthday_send_whatsapp "
            "FROM clinics WHERE id = :cid"
        ),
        {"cid": clinic_id},
    ).mappings().first()
    return {
        "clinic_name": row["name"] if row else "",
        "message": (row["birthday_message"] if row else None) or DEFAULT_BIRTHDAY_MESSAGE,
        "send_email": bool(row["birthday_send_email"]) if row else False,
        "send_whatsapp": bool(row["birthday_send_whatsapp"]) if row else False,
    }


def _age(birth_date: date) -> int:
    today = date.today()
    born = (birth_date.month, birth_date.day)
    return today.year - birth_date.year - ((today.month, today.day) < born)


def _render(
    template: str, pet_name: str, age: int | None, owner_name: str, clinic_name: str
) -> str:
    return (
        (template or DEFAULT_BIRTHDAY_MESSAGE)
        .replace("{mascota}", pet_name or "")
        .replace("{edad}", str(age) if age is not None else "")
        .replace("{dueño}", owner_name or "")
        .replace("{clínica}", clinic_name or "")
    )


@router.get("/today", summary="Mascotas que cumplen años hoy")
def birthdays_today(
    ctx: CurrentClinic = Depends(require_component("dashboard")),
    db: Session = Depends(get_db),
) -> dict:
    today = date.today()
    settings = _settings(db, ctx.clinic["id"])
    rows = db.execute(
        text(
            "SELECT p.id AS pet_id, p.name AS pet_name, p.clinical_photo_url AS pet_photo, "
            "p.birth_date, o.id AS owner_id, o.full_name AS owner_name, o.phone AS owner_phone, "
            "o.email AS owner_email "
            "FROM pets p "
            "LEFT JOIN owner_pet_links l ON l.pet_id = p.id AND l.clinic_id = p.clinic_id "
            "  AND l.is_active = true "
            "LEFT JOIN owners o ON o.id = l.owner_id "
            "WHERE p.clinic_id = :cid AND p.is_active = true AND p.birth_date IS NOT NULL "
            "  AND EXTRACT(MONTH FROM p.birth_date) = :m AND EXTRACT(DAY FROM p.birth_date) = :d "
            "ORDER BY p.name"
        ),
        {"cid": ctx.clinic["id"], "m": today.month, "d": today.day},
    ).mappings().all()

    day_token = today.isoformat()
    templates = [f"bday:{r['pet_id']}:{day_token}" for r in rows]
    sent_templates: set[str] = set()
    if templates:
        sent_templates = set(
            db.execute(
                text(
                    "SELECT template FROM outbound_notifications "
                    "WHERE clinic_id = :c AND template = ANY(:templates)"
                ),
                {"c": ctx.clinic["id"], "templates": templates},
            ).scalars().all()
        )
    pets = [
        {
            "pet_id": str(r["pet_id"]),
            "pet_name": r["pet_name"],
            "pet_photo": r["pet_photo"],
            "age": _age(r["birth_date"]) if r["birth_date"] else None,
            "owner_name": r["owner_name"],
            "owner_phone": r["owner_phone"],
            "owner_email": r["owner_email"],
            "already_sent": f"bday:{r['pet_id']}:{day_token}" in sent_templates,
        }
        for r in rows
    ]
    return {"pets": pets, "settings": settings}


@router.post("/{pet_id}/celebrate", summary="Envía la felicitación de cumpleaños")
def celebrate(
    pet_id: str,
    body: CelebrateBody,
    ctx: CurrentClinic = Depends(require_component("dashboard")),
    db: Session = Depends(get_db),
) -> dict:
    channels = list(dict.fromkeys(body.channels))
    invalid = [c for c in channels if c not in VALID_CHANNELS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Canal inválido: {', '.join(invalid)}")
    if not channels:
        raise HTTPException(
            status_code=400,
            detail="No hay canales configurados para enviar felicitaciones. "
            "Configúralos en Configuración de la clínica.",
        )

    pet = db.execute(
        text(
            "SELECT id, name, birth_date, clinical_photo_url FROM pets "
            "WHERE id = :pid AND clinic_id = :cid AND is_active = true"
        ),
        {"pid": pet_id, "cid": ctx.clinic["id"]},
    ).mappings().first()
    if pet is None:
        raise HTTPException(status_code=404, detail="Mascota no encontrada")

    owner = db.execute(
        text(
            "SELECT o.id, o.full_name, o.email, o.phone FROM owner_pet_links l "
            "JOIN owners o ON o.id = l.owner_id "
            "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
            "ORDER BY l.linked_at DESC LIMIT 1"
        ),
        {"pid": pet_id, "cid": ctx.clinic["id"]},
    ).mappings().first()

    settings = _settings(db, ctx.clinic["id"])
    today = date.today()
    template = f"bday:{pet_id}:{today.isoformat()}"
    exists = db.scalar(
        text(
            "SELECT count(*) FROM outbound_notifications "
            "WHERE clinic_id = :c AND template = :t AND status = 'sent'"
        ),
        {"c": ctx.clinic["id"], "t": template},
    )

    if exists:
        return {"sent": [], "already_sent": True, "message": None}

    age = _age(pet["birth_date"]) if pet["birth_date"] else None
    message = _render(
        settings["message"],
        pet["name"],
        age,
        (owner["full_name"] if owner else None),
        settings["clinic_name"],
    )
    sent: list[str] = []
    failed: list[str] = []
    not_configured: list[str] = []
    for ch in channels:
        if ch == "whatsapp":
            to = normalize_mx(owner["phone"] if owner else None)
            if not to:
                not_configured.append(ch)
                db.add(
                    OutboundNotification(
                        clinic_id=ctx.clinic["id"],
                        owner_id=(owner["id"] if owner else None),
                        channel=ch,
                        template=template,
                        recipient=None,
                        error="sin teléfono del dueño",
                        status="failed",
                    )
                )
                continue
            res = dispatch(
                db,
                ctx.clinic["id"],
                "birthday",
                to,
                message,
                [
                    pet["name"],
                    str(age) if age is not None else "",
                    settings["clinic_name"],
                ],
                template,
                owner["id"] if owner else None,
            )
            if res["ok"]:
                sent.append(ch)
            elif res["error"] == "not_configured":
                not_configured.append(ch)
            else:
                failed.append(ch)
        else:
            # email: sin proveedor configurado todavía (stub registrado como sent)
            db.add(
                OutboundNotification(
                    clinic_id=ctx.clinic["id"],
                    owner_id=(owner["id"] if owner else None),
                    channel=ch,
                    template=template,
                    status="sent",
                )
            )
            sent.append(ch)
    db.commit()
    return {
        "sent": sent,
        "failed": failed,
        "not_configured": not_configured,
        "already_sent": False,
        "message": message,
    }
