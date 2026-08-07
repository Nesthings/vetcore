"""Cartilla compartida del dueño (acceso por token, sin login).

El staff genera un enlace (`POST /pets/{id}/share-link`) con un token JWT
(scoped a la cartilla). Este router valida el token y expone una vista del
expediente adaptada al dueño:

- Lectura: datos de la mascota, dueños, alertas, carnet, línea de tiempo,
  pesos, fotos, consentimientos, vacunación y familia.
- Acciones puntuales del dueño: subir foto de perfil de la mascota (se ve en
  el sistema general), agregar/resolver alertas (máx. 20) y firmar
  consentimientos pendientes a distancia.

El resto del apartado (dueño, carnet, línea de tiempo, fotos, vacunación,
familia) es de solo lectura desde aquí.
"""

import base64
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.events import record_audit
from app.core.images import process_cartilla_photo
from app.core.security import InvalidTokenError, decode_share_token
from app.core.seed_vaccination_plans import ensure_standard_plans
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    read_media_bytes,
    save_media,
    validate_extension,
)
from app.data.vaccine_brands import brands_for_species
from app.db.session import get_db
from app.models import (
    Appointment,
    Clinic,
    ClinicalAlert,
    Consultation,
    ConsultationAttachment,
    DigitalConsent,
    Pet,
    PetPhoto,
    PetWeightRecord,
    User,
    VaccinationPlan,
)
from app.services.pdf import build_consent_pdf

router = APIRouter(prefix="/share", tags=["share"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALERT_LIMIT = 20


def _pet_from_token(token: str, db: Session) -> Pet:
    try:
        pet_id = decode_share_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    pet = db.get(Pet, pet_id)
    if pet is None or not pet.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return pet


def _with_owners(db: Session, pet: Pet) -> list[dict]:
    rows = (
        db.execute(
            text(
                "SELECT o.id AS owner_id, o.full_name, o.phone, o.email, "
                "o.profile_photo_url, o.alt_contact_name, o.alt_phone, "
                "l.linked_at, l.is_active "
                "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                "WHERE l.pet_id = :pid AND l.clinic_id = :cid "
                "ORDER BY l.linked_at DESC"
            ),
            {"pid": pet.id, "cid": pet.clinic_id},
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


def _pet_dict(db: Session, pet: Pet) -> dict:
    latest = db.scalar(
        select(PetWeightRecord.weight_kg)
        .where(PetWeightRecord.pet_id == pet.id)
        .order_by(PetWeightRecord.recorded_at.desc(), PetWeightRecord.id.desc())
        .limit(1)
    )
    data = {
        "id": str(pet.id),
        "name": pet.name,
        "species": pet.species,
        "breed": pet.breed,
        "color_primary": pet.color_primary,
        "color_secondary": pet.color_secondary,
        "markings": pet.markings,
        "sex": pet.sex,
        "birth_date": pet.birth_date.isoformat() if pet.birth_date else None,
        "allergies": pet.allergies,
        "clinical_photo_url": pet.clinical_photo_url,
        "is_active": pet.is_active,
        "latest_weight_kg": float(latest) if latest is not None else None,
    }
    data["owners"] = _with_owners(db, pet)
    return data


@router.get("/cartilla", summary="Datos de la cartilla del dueño (por token)")
def share_cartilla(
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    pet = _pet_from_token(token, db)
    clinic_id = pet.clinic_id

    alerts = db.scalars(
        select(ClinicalAlert)
        .where(ClinicalAlert.pet_id == pet.id)
        .order_by(ClinicalAlert.created_at.desc())
    ).all()

    ensure_standard_plans(db, clinic_id)
    records = db.execute(
        text(
            "SELECT r.id, r.vaccine, r.brand, r.date_applied, r.lot, r.notes, "
            "r.vet_user_id, u.full_name AS vet_name "
            "FROM pet_carnet_records r LEFT JOIN users u ON u.id = r.vet_user_id "
            "WHERE r.pet_id = :pid ORDER BY r.date_applied DESC"
        ),
        {"pid": pet.id},
    ).mappings().all()
    by_vaccine: dict[str, list[dict]] = {}
    for row in records:
        by_vaccine.setdefault(row["vaccine"], []).append(
            {
                "id": str(row["id"]),
                "brand": row["brand"],
                "date_applied": row["date_applied"].isoformat(),
                "lot": row["lot"],
                "notes": row["notes"],
                "vet_name": row["vet_name"],
            }
        )
    vaccines = [
        {
            "name": plan.name,
            "prevents": plan.prevents,
            "schedule": plan.notes,
            "applications": by_vaccine.get(plan.name, []),
        }
        for plan in db.scalars(
            select(VaccinationPlan).where(
                VaccinationPlan.clinic_id == clinic_id,
                VaccinationPlan.species == pet.species,
                VaccinationPlan.active.is_(True),
            )
        )
    ]
    for vaccine, apps in by_vaccine.items():
        if vaccine not in {v["name"] for v in vaccines}:
            vaccines.append(
                {"name": vaccine, "prevents": None, "schedule": None, "applications": apps}
            )

    consents = list(
        db.scalars(
            select(DigitalConsent)
            .where(DigitalConsent.pet_id == pet.id, DigitalConsent.clinic_id == clinic_id)
            .order_by(DigitalConsent.signed_at.desc())
        )
    )
    consents_payload = [
        {
            "id": str(c.id),
            "title": c.title,
            "body": c.body,
            "status": c.status,
            "signature_url": c.signature_url,
            "pdf_url": c.pdf_url,
            "signed_at": c.signed_at.isoformat(),
        }
        for c in consents
    ]

    weights = db.scalars(
        select(PetWeightRecord)
        .where(PetWeightRecord.pet_id == pet.id, PetWeightRecord.clinic_id == clinic_id)
        .order_by(PetWeightRecord.recorded_at.desc())
    ).all()

    consultations = list(
        db.scalars(
            select(Consultation)
            .where(Consultation.pet_id == pet.id, Consultation.clinic_id == clinic_id)
            .order_by(Consultation.created_at.desc())
        )
    )
    appointments = list(
        db.scalars(
            select(Appointment)
            .where(Appointment.pet_id == pet.id, Appointment.clinic_id == clinic_id)
            .order_by(Appointment.start_time.desc())
        )
    )
    vet_ids = {c.vet_user_id for c in consultations}
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )
    timeline: list[dict] = []
    for c in consultations:
        timeline.append(
            {
                "type": "consulta",
                "id": str(c.id),
                "title": c.reason or "Consulta",
                "subtitle": f"Diagnóstico: {c.diagnosis}" if c.diagnosis else "",
                "author": vets.get(c.vet_user_id),
                "date": c.created_at.isoformat(),
                "status": None,
            }
        )
    for a in appointments:
        timeline.append(
            {
                "type": "cita",
                "id": str(a.id),
                "title": a.procedure_type,
                "subtitle": "",
                "author": None,
                "date": a.start_time.isoformat(),
                "status": a.status,
            }
        )
    photo_rows = db.execute(
        text(
            "SELECT p.id, p.label, p.url, p.taken_at FROM pet_photos p "
            "WHERE p.pet_id = :pid AND p.clinic_id = :cid"
        ),
        {"pid": pet.id, "cid": clinic_id},
    ).mappings().all()
    for p in photo_rows:
        timeline.append(
            {
                "type": "foto",
                "id": str(p["id"]),
                "title": p["label"] or "Foto de la consulta",
                "subtitle": "",
                "author": None,
                "date": p["taken_at"].isoformat(),
                "status": None,
                "url": p["url"],
            }
        )
    timeline.sort(key=lambda e: e["date"], reverse=True)

    # Fotos de evolución (adjuntos de consulta + pet_photos)
    consult_ids = [c.id for c in consultations]
    attachments = (
        db.scalars(
            select(ConsultationAttachment)
            .where(
                ConsultationAttachment.consultation_id.in_(consult_ids),
                ConsultationAttachment.type == "photo",
            )
            .order_by(ConsultationAttachment.created_at.asc())
        ).all()
        if consult_ids
        else []
    )
    consult_by_id = {c.id: c for c in consultations}
    photos: list[dict] = []
    for att in attachments:
        c = consult_by_id.get(att.consultation_id)
        if c is None:
            continue
        photos.append(
            {
                "url": att.url,
                "consultation_date": c.created_at.isoformat(),
                "reason": c.reason,
            }
        )
    pet_photos = list(
        db.scalars(
            select(PetPhoto)
            .where(PetPhoto.clinic_id == clinic_id, PetPhoto.pet_id == pet.id)
            .order_by(PetPhoto.taken_at.asc())
        )
    )
    for p in pet_photos:
        photos.append(
            {
                "url": p.url,
                "consultation_date": p.taken_at.isoformat(),
                "reason": p.label or "Sesión del veterinario",
            }
        )

    # Familia: mismo nombre de dueño
    owner_names = list(
        db.execute(
            text(
                "SELECT DISTINCT trim(o.full_name) AS full_name "
                "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
                "AND o.full_name IS NOT NULL AND trim(o.full_name) <> ''"
            ),
            {"pid": pet.id, "cid": clinic_id},
        ).scalars()
    )
    family: list[dict] = []
    if owner_names:
        placeholders = ",".join(f":nm{i}" for i in range(len(owner_names)))
        params: dict = {"cid": clinic_id, "pid": pet.id}
        params.update({f"nm{i}": n for i, n in enumerate(owner_names)})
        rows = db.execute(
            text(
                "SELECT DISTINCT p.id, p.name, p.species, p.breed, p.sex, "
                "p.clinical_photo_url AS photo_url "
                "FROM owner_pet_links l "
                "JOIN owners o ON o.id = l.owner_id "
                "JOIN pets p ON p.id = l.pet_id "
                "WHERE l.clinic_id = :cid AND l.is_active = true "
                "AND p.id <> :pid AND p.is_active = true "
                f"AND trim(coalesce(o.full_name, '')) IN ({placeholders})"
            ),
            params,
        ).mappings().all()
        for r in rows:
            sex = r["sex"]
            relation = (
                "hermano"
                if sex in ("M", "macho", "Macho")
                else "hermana" if sex in ("H", "hembra", "Hembra") else "hermano(a)"
            )
            family.append(
                {
                    "id": str(r["id"]),
                    "name": r["name"],
                    "species": r["species"],
                    "breed": r["breed"],
                    "sex": sex,
                    "relation": relation,
                    "photo_url": r["photo_url"],
                }
            )

    return {
        "pet": _pet_dict(db, pet),
        "alerts": [
            {
                "id": str(a.id),
                "type": a.type,
                "description": a.description,
                "created_at": a.created_at.isoformat(),
            }
            for a in alerts
        ],
        "carnet": {
            "species": pet.species,
            "vaccines": vaccines,
            "brands": brands_for_species(pet.species),
        },
        "consents": consents_payload,
        "weights": [
            {
                "id": str(w.id),
                "weight_kg": float(w.weight_kg),
                "recorded_at": w.recorded_at.isoformat(),
            }
            for w in weights
        ],
        "timeline": timeline,
        "photos": photos,
        "family": family,
    }


@router.post("/cartilla/photo", summary="Sube la foto de perfil de la mascota")
def share_upload_photo(
    token: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    pet = _pet_from_token(token, db)
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
    rel = save_media(f"pets/{pet.id}", f"perfil_{uuid.uuid4().hex[:8]}.jpg", processed)
    pet.clinical_photo_url = public_url(rel)
    record_audit(
        db,
        clinic_id=pet.clinic_id,
        actor_type="owner",
        actor_id=pet.id,
        action="pet_photo_updated_owner",
        entity_type="pet",
        entity_id=pet.id,
    )
    db.commit()
    return {"clinical_photo_url": pet.clinical_photo_url}


@router.post("/cartilla/owner-photo", summary="El dueño sube/actualiza su propia foto de perfil")
def share_upload_owner_photo(
    token: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    pet = _pet_from_token(token, db)
    row = db.execute(
        text(
            "SELECT o.id, o.profile_photo_url FROM owner_pet_links l "
            "JOIN owners o ON o.id = l.owner_id "
            "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
            "ORDER BY l.linked_at DESC LIMIT 1"
        ),
        {"pid": pet.id, "cid": pet.clinic_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="La mascota no tiene un dueño activo"
        )
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
    rel = save_media(f"owners/{row.id}", f"profile_{uuid.uuid4().hex[:8]}.jpg", processed)
    db.execute(
        text(
            "UPDATE owners SET profile_photo_prev_url = profile_photo_url, "
            "profile_photo_url = :url WHERE id = :oid"
        ),
        {"url": public_url(rel), "oid": row.id},
    )
    record_audit(
        db,
        clinic_id=pet.clinic_id,
        actor_type="owner",
        actor_id=pet.id,
        action="owner_photo_updated_owner",
        entity_type="owner",
        entity_id=row.id,
        metadata={"pet_id": str(pet.id)},
    )
    db.commit()
    return {"profile_photo_url": public_url(rel), "revertible": bool(row.profile_photo_url)}


@router.post(
    "/cartilla/alerts",
    status_code=status.HTTP_201_CREATED,
    summary="El dueño agrega una alerta clínica (máx. 20)",
)
def share_create_alert(
    token: str = Form(...),
    type_: str = Form(..., alias="type"),
    description: str = Form(..., min_length=1, max_length=1000),
    db: Session = Depends(get_db),
) -> dict:
    pet = _pet_from_token(token, db)
    count = db.scalar(
        select(func.count())
        .select_from(ClinicalAlert)
        .where(ClinicalAlert.pet_id == pet.id)
    ) or 0
    if count >= ALERT_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Límite de {ALERT_LIMIT} alertas alcanzado",
        )
    alert = ClinicalAlert(pet_id=pet.id, type=type_, description=description)
    db.add(alert)
    db.flush()
    record_audit(
        db,
        clinic_id=pet.clinic_id,
        actor_type="owner",
        actor_id=pet.id,
        action="alert_created_owner",
        entity_type="alert",
        entity_id=alert.id,
        metadata={"pet_id": str(pet.id), "type": type_},
    )
    db.commit()
    return {"id": str(alert.id), "type": alert.type, "description": alert.description}


@router.delete("/cartilla/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def share_delete_alert(
    alert_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> None:
    pet = _pet_from_token(token, db)
    alert = db.scalar(
        select(ClinicalAlert).where(ClinicalAlert.id == alert_id, ClinicalAlert.pet_id == pet.id)
    )
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
    db.delete(alert)
    db.commit()


@router.post(
    "/cartilla/consents/{consent_id}/sign",
    summary="El dueño firma un consentimiento pendiente a distancia",
)
def share_sign_consent(
    consent_id: str,
    token: str = Form(...),
    signature_base64: str = Form(...),
    db: Session = Depends(get_db),
) -> dict:
    pet = _pet_from_token(token, db)
    consent = db.scalar(
        select(DigitalConsent).where(
            DigitalConsent.id == consent_id, DigitalConsent.pet_id == pet.id
        )
    )
    if consent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consentimiento no encontrado"
        )
    if consent.status == "signed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya está firmado")

    raw = signature_base64
    if raw.startswith("data:"):
        parts = raw.split(",", 1)
        if len(parts) > 1:
            raw = parts[1]
    try:
        signature_bytes = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Firma inválida"
        ) from exc

    sig_rel = save_media(f"consents/{pet.id}", f"firma_remota_{consent.id}.png", signature_bytes)
    signature_url = public_url(sig_rel)

    clinic = db.get(Clinic, pet.clinic_id)
    owner_row = db.execute(
        text(
            "SELECT o.full_name FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
            "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
            "ORDER BY l.linked_at DESC LIMIT 1"
        ),
        {"pid": pet.id, "cid": pet.clinic_id},
    ).scalar()
    owner_display = owner_row or "Dueño"

    vet_signature_bytes = None
    vet_name = None
    if consent.vet_user_id:
        vet_user = db.get(User, consent.vet_user_id)
        if vet_user is not None:
            vet_name = vet_user.full_name
            vet_signature_bytes = read_media_bytes(vet_user.signature_url)

    pdf_bytes = build_consent_pdf(
        {
            "clinic_name": clinic.name,
            "pet_name": pet.name,
            "owner_display": owner_display,
            "title": consent.title,
            "body": consent.body,
            "date_str": datetime.now(UTC).astimezone().strftime("%d/%m/%Y %H:%M"),
            "signature_bytes": signature_bytes,
            "vet_signature_bytes": vet_signature_bytes,
            "vet_name": vet_name,
        }
    )
    pdf_rel = save_media(f"consents/{pet.id}", f"consentimiento_{consent.id}.pdf", pdf_bytes)
    consent.status = "signed"
    consent.signature_url = signature_url
    consent.pdf_url = public_url(pdf_rel)
    consent.signed_at = datetime.now(UTC)
    record_audit(
        db,
        clinic_id=pet.clinic_id,
        actor_type="owner",
        actor_id=pet.id,
        action="consent_signed_owner",
        entity_type="consent",
        entity_id=consent.id,
        metadata={"pet_id": str(pet.id), "title": consent.title},
    )
    db.commit()
    return {"id": str(consent.id), "status": "signed", "pdf_url": consent.pdf_url}
