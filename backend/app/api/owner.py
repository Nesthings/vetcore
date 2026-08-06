"""Portal del dueño — Cartilla digital (solo lectura) y foto compartida.

La identidad del owner es GLOBAL: un dueño puede tener mascotas en varias
clínicas de la red. El acceso NO se bloquea por suscripción (principio 8):
si la clínica está suspendida, el dueño conserva lectura (badge read_only).
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentUser, get_current_owner
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
    Pet,
    PetWeightRecord,
    User,
)

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
    pet, _ = _linked_pet(db, owner.sub, pet_id)

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
    pet, _ = _linked_pet(db, owner.sub, pet_id)
    if not pet.cartilla_photo_prev_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay foto anterior para restaurar",
        )
    pet.cartilla_photo_url = pet.cartilla_photo_prev_url
    pet.cartilla_photo_prev_url = None
    db.commit()
    db.refresh(pet)
    return {"cartilla_photo_url": pet.cartilla_photo_url, "revertible": False}
