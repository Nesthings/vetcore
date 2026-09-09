"""Tickets de soporte.

El staff de una clínica reporta un problema (asunto + descripción + archivos)
y el super-admin los atiende desde el panel de plataforma, pudiendo marcarlos
como resueltos con notas y adjuntos.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, require_roles, require_staff
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_PDF_EXTENSIONS,
    public_url,
    read_upload_limited,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import Clinic, SupportTicket, SupportTicketAttachment

router = APIRouter(prefix="/support-tickets", tags=["support-tickets"])

ALLOWED_TICKET_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_PDF_EXTENSIONS
MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024  # 10 MB por archivo


def _super_admin(user: CurrentUser = Depends(require_roles("super-admin"))) -> CurrentUser:
    return user


def _ticket_dict(
    ticket: SupportTicket,
    clinic_name: str | None = None,
    attachments: list[dict] | None = None,
) -> dict:
    return {
        "id": str(ticket.id),
        "reporter_name": ticket.reporter_name,
        "reporter_email": ticket.reporter_email,
        "clinic_id": str(ticket.clinic_id) if ticket.clinic_id else None,
        "clinic_name": clinic_name,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "resolution_notes": ticket.resolution_notes,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "created_at": ticket.created_at.isoformat(),
        "attachments": attachments or [],
    }


def _read_files(files: list[UploadFile]) -> list[tuple[str, bytes]]:
    """Valida extensión y tamaño de los adjuntos y lee su contenido.

    Se ejecuta ANTES de crear/mutar el ticket para no dejar datos huérfanos
    si un archivo es inválido.
    """
    validated: list[tuple[str, bytes]] = []
    for file in files:
        filename = file.filename or ""
        try:
            validate_extension(filename, ALLOWED_TICKET_EXTENSIONS)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
        try:
            content = read_upload_limited(file, MAX_TICKET_FILE_BYTES)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
            ) from None
        validated.append((filename, content))
    return validated


def _save_files(db: Session, ticket_id, validated: list[tuple[str, bytes]]) -> list[dict]:
    """Guarda los adjuntos ya validados de un ticket y devuelve su representación."""
    saved: list[dict] = []
    for filename, content in validated:
        rel = save_media(f"tickets/{ticket_id}", filename, content)
        attachment = SupportTicketAttachment(
            ticket_id=ticket_id,
            file_type="image" if filename.lower().endswith(tuple(ALLOWED_IMAGE_EXTENSIONS)) else "file",
            url=public_url(rel),
        )
        db.add(attachment)
        saved.append({"id": str(attachment.id), "file_type": attachment.file_type, "url": attachment.url})
    return saved


@router.post("", status_code=status.HTTP_201_CREATED, summary="Reporta un problema (ticket de soporte)")
def create_ticket(
    subject: str = Form(..., min_length=1, max_length=200),
    description: str = Form(..., min_length=1, max_length=5000),
    files: list[UploadFile] = File(default=[]),
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> dict:
    reporter = db.execute(
        text("SELECT full_name, email FROM users WHERE id = :uid"),
        {"uid": user.sub},
    ).mappings().first()
    if reporter is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    validated = _read_files(files)

    ticket = SupportTicket(
        reporter_user_id=user.sub,
        reporter_name=reporter["full_name"],
        reporter_email=reporter["email"],
        clinic_id=user.clinic_id,
        subject=subject,
        description=description,
        status="open",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    _save_files(db, ticket.id, validated)
    db.commit()

    return _ticket_dict(ticket, attachments=[])  # adjuntos ya en GET /{id} y /admin


@router.get("", summary="Mis tickets de soporte (staff)")
def list_my_tickets(
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> list[dict]:
    tickets = list(
        db.scalars(
            select(SupportTicket)
            .where(SupportTicket.reporter_user_id == user.sub)
            .order_by(SupportTicket.created_at.desc())
            .limit(100)
        )
    )
    if not tickets:
        return []

    attachments: dict[str, list[dict]] = {}
    rows = db.scalars(
        select(SupportTicketAttachment).where(
            SupportTicketAttachment.ticket_id.in_([t.id for t in tickets])
        )
    ).all()
    for r in rows:
        attachments.setdefault(str(r.ticket_id), []).append(
            {
                "id": str(r.id),
                "file_type": r.file_type,
                "url": r.url,
                "created_at": r.created_at.isoformat(),
            }
        )

    return [
        _ticket_dict(t, attachments=attachments.get(str(t.id), [])) for t in tickets
    ]


@router.get("/admin", summary="Todos los tickets (super-admin)")
def list_all_tickets(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(_super_admin),
) -> list[dict]:
    tickets = list(
        db.scalars(
            select(SupportTicket).order_by(SupportTicket.created_at.desc()).limit(200)
        )
    )
    if not tickets:
        return []

    clinic_ids = {t.clinic_id for t in tickets if t.clinic_id}
    clinic_names: dict[str, str] = {}
    if clinic_ids:
        clinics = db.scalars(select(Clinic).where(Clinic.id.in_(clinic_ids))).all()
        clinic_names = {str(c.id): c.name for c in clinics}

    attachments: dict[str, list[dict]] = {}
    rows = db.scalars(
        select(SupportTicketAttachment).where(
            SupportTicketAttachment.ticket_id.in_([t.id for t in tickets])
        )
    ).all()
    for r in rows:
        attachments.setdefault(str(r.ticket_id), []).append(
            {
                "id": str(r.id),
                "file_type": r.file_type,
                "url": r.url,
                "created_at": r.created_at.isoformat(),
            }
        )

    return [
        _ticket_dict(t, clinic_name=clinic_names.get(str(t.clinic_id)), attachments=attachments.get(str(t.id), []))
        for t in tickets
    ]


@router.get("/{ticket_id}", summary="Detalle de un ticket (autor o super-admin)")
def ticket_detail(
    ticket_id: str,
    user: CurrentUser = Depends(require_roles("super-admin", "admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> dict:
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado")

    if user.role != "super-admin" and str(ticket.reporter_user_id) != user.sub:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para ver este ticket"
        )

    clinic_name = None
    if ticket.clinic_id:
        clinic = db.get(Clinic, ticket.clinic_id)
        clinic_name = clinic.name if clinic else None

    att_rows = db.scalars(
        select(SupportTicketAttachment)
        .where(SupportTicketAttachment.ticket_id == ticket_id)
        .order_by(SupportTicketAttachment.created_at)
    ).all()
    attachments = [
        {
            "id": str(r.id),
            "file_type": r.file_type,
            "url": r.url,
            "created_at": r.created_at.isoformat(),
        }
        for r in att_rows
    ]
    return _ticket_dict(ticket, clinic_name=clinic_name, attachments=attachments)


@router.post("/{ticket_id}/resolve", summary="Marca un ticket como resuelto (super-admin)")
def resolve_ticket(
    ticket_id: str,
    notes: str = Form(default="", max_length=5000),
    files: list[UploadFile] = File(default=[]),
    me: CurrentUser = Depends(_super_admin),
    db: Session = Depends(get_db),
) -> dict:
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado")

    validated = _read_files(files)

    _save_files(db, ticket.id, validated)
    ticket.status = "resolved"
    ticket.resolution_notes = notes or None
    ticket.resolved_by = me.sub
    ticket.resolved_at = datetime.now(UTC)
    db.commit()
    db.refresh(ticket)

    return _ticket_dict(ticket)


@router.post("/{ticket_id}/reopen", summary="Reabre un ticket resuelto (super-admin)")
def reopen_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(_super_admin),
) -> dict:
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket no encontrado")

    ticket.status = "open"
    ticket.resolved_at = None
    db.commit()
    db.refresh(ticket)
    return _ticket_dict(ticket)