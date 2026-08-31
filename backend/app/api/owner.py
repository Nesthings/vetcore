"""Portal del dueño — Cartilla digital (solo lectura) y foto compartida.

La identidad del owner es GLOBAL: un dueño puede tener mascotas en varias
clínicas de la red. El acceso NO se bloquea por suscripción (principio 8):
si la clínica está suspendida, el dueño conserva lectura (badge read_only).
Incluye preferencias (opt-in WhatsApp, principio 10) y encuestas (2.4).
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentUser, get_current_owner
from app.core.events import record_audit
from app.core.images import process_cartilla_photo
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import (
    Appointment,
    Clinic,
    Consultation,
    ConsultationSummaryPdf,
    Invoice,
    Pet,
    PetWeightRecord,
    User,
)
from app.schemas.crm import (
    OwnerPreferencesRead,
    OwnerPreferencesUpdate,
    SurveyCreate,
    SurveyRead,
)
from app.services.carnet import build_carnet, build_vaccination

router = APIRouter(prefix="/owner", tags=["owner"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _linked_pet(db: Session, owner_id: str, pet_id: str) -> tuple[Pet, dict]:
    """Mascota vinculada al dueño (activa). Devuelve pet + datos de la clínica."""
    link = (
        db.execute(
            text(
                "SELECT clinic_id FROM owner_pet_links "
                "WHERE owner_id = :oid AND pet_id = :pid AND is_active = true"
            ),
            {"oid": owner_id, "pid": pet_id},
        )
        .mappings()
        .first()
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mascota no vinculada a tu cuenta",
        )
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.is_active.is_(True)))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mascota no encontrada")
    clinic = db.get(Clinic, link["clinic_id"])
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clínica no encontrada")
    return pet, {
        "id": str(clinic.id),
        "name": clinic.name,
        "subscription_status": clinic.subscription_status,
    }


def _latest_weight(db: Session, pet_id: str) -> Decimal | None:
    return db.scalar(
        select(PetWeightRecord.weight_kg)
        .where(PetWeightRecord.pet_id == pet_id)
        .order_by(PetWeightRecord.recorded_at.desc(), PetWeightRecord.id.desc())
        .limit(1)
    )


def _pet_cartilla(db: Session, pet: Pet, clinic: dict) -> dict:
    latest = _latest_weight(db, str(pet.id))
    return {
        "pet": {
            "id": str(pet.id),
            "name": pet.name,
            "species": pet.species,
            "breed": pet.breed,
            "sex": pet.sex,
            "birth_date": pet.birth_date.isoformat() if pet.birth_date else None,
            "cartilla_photo_url": pet.cartilla_photo_url,
            "latest_weight_kg": float(latest) if latest is not None else None,
        },
        "clinic_id": clinic["id"],
        "clinic_name": clinic["name"],
        "clinic_status": clinic["subscription_status"],
        "read_only": clinic["subscription_status"] not in ("active", "trial"),
    }


@router.get("/pets", summary="Mascotas del dueño (en todas sus clínicas)")
def owner_pets(
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.execute(
            text(
                "SELECT l.pet_id, c.id AS clinic_id, c.name AS clinic_name, c.subscription_status "
                "FROM owner_pet_links l JOIN clinics c ON c.id = l.clinic_id "
                "WHERE l.owner_id = :oid AND l.is_active = true "
                "ORDER BY c.name"
            ),
            {"oid": owner.sub},
        )
        .mappings()
        .all()
    )

    out = []
    for row in rows:
        pet = db.scalar(select(Pet).where(Pet.id == row["pet_id"], Pet.is_active.is_(True)))
        if pet is None:
            continue
        clinic = {
            "id": row["clinic_id"],
            "name": row["clinic_name"],
            "subscription_status": row["subscription_status"],
        }
        out.append(_pet_cartilla(db, pet, clinic))
    return out


@router.get("/pets/{pet_id}", summary="Detalle de la cartilla (solo lectura)")
def owner_pet_detail(
    pet_id: str,
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> dict:
    pet, clinic = _linked_pet(db, owner.sub, pet_id)
    base = _pet_cartilla(db, pet, clinic)
    base["carnet"] = build_carnet(db, pet)
    base["vaccination"] = build_vaccination(db, pet)

    consultations = list(
        db.scalars(
            select(Consultation)
            .options(selectinload(Consultation.items))
            .where(Consultation.pet_id == pet.id)
            .order_by(Consultation.created_at.desc())
        )
    )
    vet_ids = {c.vet_user_id for c in consultations}
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )
    pdfs = {
        row.consultation_id: row.pdf_url
        for row in db.execute(
            select(ConsultationSummaryPdf.consultation_id, ConsultationSummaryPdf.pdf_url)
        ).all()
    }
    surveys = {
        row.consultation_id: {"rating": row.rating, "comments": row.comments}
        for row in db.execute(
            text("SELECT consultation_id, rating, comments FROM consultation_surveys")
        ).mappings()
    }

    base["consultations"] = [
        {
            "id": str(c.id),
            "date": c.created_at.isoformat(),
            "reason": c.reason,
            "diagnosis": c.diagnosis,
            "treatment": c.treatment,
            "care_instructions": c.care_instructions,
            "vet_name": vets.get(c.vet_user_id),
            "items": [
                {"description": i.description, "quantity": float(i.quantity)} for i in c.items
            ],
            "summary_pdf_url": pdfs.get(c.id),
            "survey": surveys.get(c.id),
        }
        for c in consultations
    ]

    appointments = list(
        db.scalars(
            select(Appointment)
            .where(Appointment.pet_id == pet.id, Appointment.start_time >= func.now())
            .order_by(Appointment.start_time)
        )
    )
    base["appointments"] = [
        {
            "id": str(a.id),
            "procedure_type": a.procedure_type,
            "start_time": a.start_time.isoformat(),
            "end_time": a.end_time.isoformat(),
            "status": a.status,
        }
        for a in appointments
    ]
    return base


@router.put(
    "/pets/{pet_id}/photo",
    summary="Sube la foto de la Cartilla (compresión, crop, sin EXIF)",
)
def upload_cartilla_photo(
    pet_id: str,
    file: UploadFile = File(...),
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> dict:
    pet, clinic = _linked_pet(db, owner.sub, pet_id)

    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )
    try:
        processed = process_cartilla_photo(content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rel = save_media(f"cartilla/{pet.id}", "cartilla.jpg", processed)
    pet.cartilla_photo_prev_url = pet.cartilla_photo_url
    pet.cartilla_photo_url = public_url(rel)
    record_audit(
        db,
        clinic_id=clinic["id"],
        actor_type="owner",
        actor_id=owner.sub,
        action="cartilla_photo_updated",
        entity_type="pet",
        entity_id=pet.id,
    )
    db.commit()
    db.refresh(pet)
    return {
        "cartilla_photo_url": pet.cartilla_photo_url,
        "revertible": bool(pet.cartilla_photo_prev_url),
    }


@router.post(
    "/pets/{pet_id}/photo/revert",
    summary="Restaura la foto anterior de la Cartilla",
)
def revert_cartilla_photo(
    pet_id: str,
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> dict:
    pet, clinic = _linked_pet(db, owner.sub, pet_id)
    if not pet.cartilla_photo_prev_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay foto anterior para restaurar",
        )
    pet.cartilla_photo_url = pet.cartilla_photo_prev_url
    pet.cartilla_photo_prev_url = None
    record_audit(
        db,
        clinic_id=clinic["id"],
        actor_type="owner",
        actor_id=owner.sub,
        action="cartilla_photo_reverted",
        entity_type="pet",
        entity_id=pet.id,
    )
    db.commit()
    db.refresh(pet)
    return {"cartilla_photo_url": pet.cartilla_photo_url, "revertible": False}


def _owner_consultation(db: Session, owner_id: str, consultation_id: str) -> Consultation:
    """Consulta de una mascota vinculada al dueño, o 404."""
    consultation = db.get(Consultation, consultation_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consulta no encontrada")
    link = db.execute(
        text(
            "SELECT 1 FROM owner_pet_links WHERE owner_id = :o AND pet_id = :p AND is_active = true"
        ),
        {"o": owner_id, "p": consultation.pet_id},
    ).scalar()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La consulta no pertenece a una mascota tuya",
        )
    return consultation


@router.post(
    "/consultations/{consultation_id}/survey",
    response_model=SurveyRead,
    status_code=status.HTTP_201_CREATED,
    summary="Califica la consulta (encuesta post-consulta)",
)
def submit_survey(
    consultation_id: str,
    body: SurveyCreate,
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> SurveyRead:
    consultation = _owner_consultation(db, owner.sub, consultation_id)
    existing = db.execute(
        text("SELECT id FROM consultation_surveys WHERE consultation_id = :c"),
        {"c": consultation.id},
    ).scalar()
    if existing:
        db.execute(
            text("UPDATE consultation_surveys SET rating = :r, comments = :cm WHERE id = :id"),
            {"r": body.rating, "cm": body.comments, "id": existing},
        )
        db.commit()
        row = (
            db.execute(
                text(
                    "SELECT id, consultation_id, rating, comments, created_at "
                    "FROM consultation_surveys WHERE id = :id"
                ),
                {"id": existing},
            )
            .mappings()
            .first()
        )
    else:
        row = (
            db.execute(
                text(
                    "INSERT INTO consultation_surveys (consultation_id, rating, comments) "
                    "VALUES (:c, :r, :cm) "
                    "RETURNING id, consultation_id, rating, comments, created_at"
                ),
                {"c": consultation.id, "r": body.rating, "cm": body.comments},
            )
            .mappings()
            .first()
        )
    db.commit()
    return SurveyRead(**dict(row))


@router.get(
    "/consultations/{consultation_id}/survey",
    response_model=SurveyRead | None,
    summary="Encuesta de la consulta (si existe)",
)
def get_survey(
    consultation_id: str,
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> SurveyRead | None:
    _owner_consultation(db, owner.sub, consultation_id)
    row = (
        db.execute(
            text(
                "SELECT id, consultation_id, rating, comments, created_at "
                "FROM consultation_surveys WHERE consultation_id = :c"
            ),
            {"c": consultation_id},
        )
        .mappings()
        .first()
    )
    return SurveyRead(**dict(row)) if row else None


@router.get(
    "/appointments",
    summary="Próximas citas del dueño (todas sus mascotas)",
)
def owner_appointments(
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.execute(
            text(
                "SELECT a.id, a.pet_id, a.clinic_id, a.procedure_type, a.start_time, a.end_time, "
                "a.status, c.name AS clinic_name, p.name AS pet_name "
                "FROM owner_pet_links l "
                "JOIN appointments a ON a.pet_id = l.pet_id "
                "JOIN clinics c ON c.id = a.clinic_id "
                "JOIN pets p ON p.id = a.pet_id "
                "WHERE l.owner_id = :o AND l.is_active = true "
                "AND a.start_time >= now() "
                "ORDER BY a.start_time"
            ),
            {"o": owner.sub},
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.get(
    "/invoices",
    summary="Facturas de las mascotas del dueño",
)
def owner_invoices(
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.execute(
            text(
                "SELECT i.id, i.pet_id, i.clinic_id, i.branch_id, i.total, i.status, i.created_at, "
                "c.name AS clinic_name, p.name AS pet_name, b.name AS branch_name "
                "FROM owner_pet_links l "
                "JOIN invoices i ON i.pet_id = l.pet_id "
                "JOIN clinics c ON c.id = i.clinic_id "
                "JOIN pets p ON p.id = i.pet_id "
                "LEFT JOIN clinic_branches b ON b.id = i.branch_id "
                "WHERE l.owner_id = :o AND l.is_active = true AND i.status != 'cancelled' "
                "ORDER BY i.created_at DESC"
            ),
            {"o": owner.sub},
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.get(
    "/invoices/{invoice_id}/receipt",
    summary="Recibo PDF de una factura del dueño",
)
def owner_invoice_receipt(
    invoice_id: str,
    owner: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> Response:
    from app.api.invoices import receipt_response

    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    link = db.execute(
        text(
            "SELECT 1 FROM owner_pet_links WHERE owner_id = :o AND pet_id = :p AND is_active = true"
        ),
        {"o": owner.sub, "p": invoice.pet_id},
    ).scalar()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La factura no pertenece a una mascota tuya",
        )
    return receipt_response(db, invoice)


def _preferences_read(db: Session, owner_id: str) -> OwnerPreferencesRead:
    row = (
        db.execute(
            text(
                "SELECT preferred_channel, accepts_reminders, accepts_reminders_at "
                "FROM owner_preferences WHERE owner_id = :o"
            ),
            {"o": owner_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        return OwnerPreferencesRead(
            preferred_channel="whatsapp", accepts_reminders=False, accepts_reminders_at=None
        )
    return OwnerPreferencesRead(**dict(row))


@router.get("/preferences", response_model=OwnerPreferencesRead)
def get_preferences(
    user: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> OwnerPreferencesRead:
    """Preferencias de contacto del dueño (opt-in para recordatorios, principio 10)."""
    return _preferences_read(db, user.sub)


@router.put("/preferences", response_model=OwnerPreferencesRead)
def update_preferences(
    body: OwnerPreferencesUpdate,
    user: CurrentUser = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> OwnerPreferencesRead:
    """Actualiza preferencias. Al aceptar recordatorios se guarda el timestamp."""
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No hay campos para actualizar",
        )
    if data.get("accepts_reminders"):
        data["accepts_reminders_at"] = datetime.now(UTC)
    columns = ", ".join(data.keys())
    placeholders = ", ".join(f":{c}" for c in data)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in data)
    params = {c: v for c, v in data.items()}
    params["owner_id"] = user.sub
    db.execute(
        text(
            f"INSERT INTO owner_preferences (owner_id, {columns}) "
            f"VALUES (:owner_id, {placeholders}) "
            f"ON CONFLICT (owner_id) DO UPDATE SET {updates}"
        ),
        params,
    )
    db.commit()
    return _preferences_read(db, user.sub)
