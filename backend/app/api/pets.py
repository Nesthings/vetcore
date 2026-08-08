"""CRUD de pacientes (mascotas) y registros de peso — por-tenant.

El peso es histórico (una fila por consulta, principio 4 del documento):
la lectura de mascotas expone el último peso como default visual.
Incluye la foto clínica del expediente (distinta de la foto de la Cartilla,
principio 5) y la línea de tiempo que fusiona consultas y citas.
"""

import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentClinic,
    CurrentUser,
    get_current_clinic,
    require_clinic_roles,
    require_component,
    require_staff,
)
from app.core.events import notify_roles, record_audit
from app.core.security import (
    InvalidTokenError,
    create_share_token,
    decode_share_token,
)
from app.core.seed_vaccination_plans import ensure_standard_plans
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.data.breeds import (
    BREEDS_BY_SPECIES,
    breeds_for,
    colors_for,
    markings_for,
    species_options,
)
from app.data.vaccine_brands import brands_for_species
from app.db.session import get_db
from app.models import (
    Appointment,
    ClinicalAlert,
    Consultation,
    ConsultationAttachment,
    CustomBreed,
    Pet,
    PetCarnetRecord,
    PetPhoto,
    PetWeightRecord,
    User,
    VaccinationPlan,
)
from app.schemas.crm import PhotoEvolutionItem
from app.schemas.pet import (
    ClinicalAlertCreate,
    ClinicalAlertRead,
    ClinicalAlertUpdate,
    OwnerContactUpdate,
    OwnerLinkRead,
    OwnerTransferRequest,
    OwnerTransferResponse,
    PetCreate,
    PetRead,
    PetUpdate,
    PetWeightCreate,
    PetWeightRead,
)

router = APIRouter(
    prefix="/pets",
    tags=["pets"],
    dependencies=[Depends(require_component("pets"))],
)

PET_MUTATORS = ("admin", "veterinario")

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


class InvitationCreate(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=30)
    contact_email: str | None = Field(default=None, max_length=200)
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InvitationResponse(BaseModel):
    token: str
    activation_url: str
    expires_at: datetime


class CarnetCreate(BaseModel):
    vaccine: str = Field(min_length=1, max_length=150)
    brand: str | None = Field(default=None, max_length=100)
    date_applied: date
    lot: str | None = Field(default=None, max_length=100)
    vet_user_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=255)


@router.get(
    "/breeds-catalog",
    summary="Catálogo de especies y razas (base + personalizadas de la clínica)",
)
def breeds_catalog(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    custom = {}
    rows = db.execute(
        select(CustomBreed.species, CustomBreed.breed)
        .where(CustomBreed.clinic_id == ctx.clinic["id"])
        .order_by(CustomBreed.breed)
    ).all()
    for species, breed in rows:
        custom.setdefault(species, []).append(breed)

    breeds = {
        key: list(dict.fromkeys([*breeds_for(key), *custom.get(key, [])]))
        for key in BREEDS_BY_SPECIES
    }
    for species, extra in custom.items():
        breeds.setdefault(species, list(dict.fromkeys(extra)))
    return {
        "species": species_options(),
        "breeds": breeds,
        "colors": {key: colors_for(key) for key in BREEDS_BY_SPECIES},
        "markings": {key: markings_for(key) for key in BREEDS_BY_SPECIES},
    }


class BreedCreate(BaseModel):
    species: str = Field(min_length=1, max_length=50)
    breed: str = Field(min_length=1, max_length=100)


@router.post(
    "/breeds",
    status_code=status.HTTP_201_CREATED,
    summary="Agrega una raza personalizada a la clínica",
)
def add_custom_breed(
    body: BreedCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.scalar(
        select(CustomBreed).where(
            CustomBreed.clinic_id == ctx.clinic["id"],
            CustomBreed.species == body.species,
            CustomBreed.breed == body.breed,
        )
    )
    if existing is None:
        db.add(
            CustomBreed(
                clinic_id=ctx.clinic["id"],
                species=body.species,
                breed=body.breed,
            )
        )
        db.commit()
    return {"species": body.species, "breed": body.breed, "created": existing is None}


@router.get("", response_model=list[PetRead])
def list_pets(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    active_only: bool = Query(default=True),
    search: str | None = Query(default=None, max_length=150),
    species: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Pet]:
    stmt = select(Pet).where(Pet.clinic_id == ctx.clinic["id"])
    if active_only:
        stmt = stmt.where(Pet.is_active.is_(True))
    if search:
        stmt = stmt.where(Pet.name.ilike(f"%{search}%"))
    if species:
        stmt = stmt.where(Pet.species == species)
    stmt = stmt.order_by(Pet.name).limit(limit).offset(offset)
    pets = list(db.scalars(stmt))
    if pets:
        pet_ids = [p.id for p in pets]
        counts = dict(
            db.execute(
                select(ClinicalAlert.pet_id, func.count())
                .where(ClinicalAlert.pet_id.in_(pet_ids))
                .group_by(ClinicalAlert.pet_id)
            ).all()
        )
        for pet in pets:
            pet.alert_count = counts.get(pet.id, 0)
    return [_with_owners(db, _pet_with_latest_weight(db, pet)) for pet in pets]


@router.get("/species", summary="Especies presentes en la clínica (con conteo)")
def pet_species(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.execute(
        select(Pet.species, func.count().label("count"))
        .where(Pet.clinic_id == ctx.clinic["id"], Pet.is_active.is_(True))
        .group_by(Pet.species)
        .order_by(func.count().desc())
    ).all()
    return [{"species": r.species, "count": r.count} for r in rows]


@router.post(
    "/photos/walkin",
    status_code=status.HTTP_201_CREATED,
    summary="Sube foto walk-in (mascota no registrada)",
)
def create_walkin_photo(
    file: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=150),
    label: str = Form(default="", max_length=200),
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )
    rel = save_media(f"walkin/{date.today().isoformat()}", file.filename or "photo.jpg", content)
    photo = PetPhoto(
        clinic_id=ctx.clinic["id"],
        pet_id=None,
        walk_in_name=name.strip(),
        vet_user_id=ctx.user.sub,
        url=public_url(rel),
        label=label.strip() or None,
        taken_at=datetime.now(UTC),
    )
    db.add(photo)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="walkin_photo_uploaded",
        entity_type="pet_photo",
        entity_id=photo.id,
        metadata={"name": photo.walk_in_name},
    )
    db.commit()
    return {
        "id": str(photo.id),
        "url": photo.url,
        "label": photo.label,
        "walk_in_name": photo.walk_in_name,
        "taken_at": photo.taken_at.isoformat(),
    }


@router.get("/photos/walkin", summary="Busca fotos walk-in por nombre")
def list_walkin_photos(
    name: str = Query(..., max_length=150),
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    photos = db.scalars(
        select(PetPhoto)
        .where(
            PetPhoto.clinic_id == ctx.clinic["id"],
            PetPhoto.walk_in_name.ilike(f"%{name.strip()}%"),
        )
        .order_by(PetPhoto.taken_at.desc())
    ).all()
    return [
        {
            "id": str(p.id),
            "url": p.url,
            "label": p.label,
            "walk_in_name": p.walk_in_name,
            "taken_at": p.taken_at.isoformat(),
        }
        for p in photos
    ]


@router.delete("/photos/walkin/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_walkin_photo(
    photo_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    photo = db.scalar(
        select(PetPhoto).where(
            PetPhoto.id == photo_id,
            PetPhoto.clinic_id == ctx.clinic["id"],
            PetPhoto.pet_id.is_(None),
        )
    )
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    db.delete(photo)
    db.commit()


def _pet_with_latest_weight(db: Session, pet: Pet) -> Pet:
    latest = db.scalar(
        select(PetWeightRecord.weight_kg)
        .where(PetWeightRecord.pet_id == pet.id)
        .order_by(PetWeightRecord.recorded_at.desc(), PetWeightRecord.id.desc())
        .limit(1)
    )
    pet.latest_weight_kg = Decimal(latest) if latest is not None else None
    return pet


def _with_owners(db: Session, pet: Pet) -> Pet:
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
    pet.owners = [OwnerLinkRead(**dict(r)) for r in rows]
    return pet


def _get_or_create_owner(
    db: Session, phone: str | None, email: str | None, full_name: str | None
) -> str | None:
    """Reutiliza un owner existente (por email o teléfono) o crea uno nuevo.

    Regla de identidad global: nunca se duplica la cuenta del dueño.
    Devuelve el id del owner o None si no se pudo determinar.
    """
    if email:
        owner = db.execute(
            text("SELECT id FROM owners WHERE email = :email"), {"email": email}
        ).scalar()
    if owner is None and phone:
        owner = db.execute(
            text("SELECT id FROM owners WHERE phone = :phone"), {"phone": phone}
        ).scalar()

    if owner is None:
        try:
            owner = db.execute(
                text(
                    "INSERT INTO owners (phone, email, full_name) "
                    "VALUES (:phone, :email, :name) RETURNING id"
                ),
                {"phone": phone, "email": email, "name": full_name},
            ).scalar()
        except IntegrityError:
            db.rollback()
            # Otro request pudo crear al dueño con el mismo teléfono/correo:
            # reintenta el lookup y reutiliza.
            owner = db.execute(
                text(
                    "SELECT id FROM owners WHERE (:phone IS NOT NULL AND phone = :phone) "
                    "OR (:email IS NOT NULL AND email = :email) "
                    "LIMIT 1"
                ),
                {"phone": phone, "email": email},
            ).scalar()
    elif full_name:
        db.execute(
            text(
                "UPDATE owners SET full_name = "
                "COALESCE(NULLIF(:name, ''), full_name) WHERE id = :oid"
            ),
            {"name": full_name, "oid": owner},
        )
    return owner


def _get_pet_or_404(db: Session, clinic_id: str, pet_id: str) -> Pet:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return pet


def ensure_qr_token(db: Session, pet: Pet) -> str:
    """Devuelve (y genera si falta) el token QR permanente de la mascota."""
    if not pet.qr_token:
        pet.qr_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(pet)
    return pet.qr_token


def _pet_from_qr_or_share_token(db: Session, token: str) -> Pet | None:
    """Resuelve una mascota desde un token de cartilla JWT o un qr_token."""
    try:
        pet_id = decode_share_token(token)
        return db.get(Pet, pet_id)
    except InvalidTokenError:
        return db.scalar(select(Pet).where(Pet.qr_token == token))


@router.get("/{pet_id}", response_model=PetRead)
def get_pet(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> Pet:
    return _with_owners(
        db, _pet_with_latest_weight(db, _get_pet_or_404(db, ctx.clinic["id"], pet_id))
    )


@router.post("", response_model=PetRead, status_code=status.HTTP_201_CREATED)
def create_pet(
    body: PetCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> Pet:
    pet = Pet(clinic_id=ctx.clinic["id"], **body.model_dump(exclude={"owner"}))
    db.add(pet)
    db.flush()

    if body.owner is not None and (body.owner.phone or body.owner.email):
        owner = _get_or_create_owner(
            db, body.owner.phone, body.owner.email, body.owner.full_name
        )
        if owner is not None and body.owner.alt_contact_name:
            db.execute(
                text(
                    "UPDATE owners SET alt_contact_name = :alt, alt_phone = :altp "
                    "WHERE id = :oid"
                ),
                {
                    "alt": body.owner.alt_contact_name,
                    "altp": body.owner.alt_phone,
                    "oid": owner,
                },
            )
        if owner is not None:
            db.execute(
                text(
                    "INSERT INTO owner_pet_links (owner_id, pet_id, clinic_id, is_active) "
                    "VALUES (:oid, :pid, :cid, true) "
                    "ON CONFLICT (owner_id, pet_id) "
                    "DO UPDATE SET is_active = true, revoked_at = NULL"
                ),
                {"oid": owner, "pid": pet.id, "cid": ctx.clinic["id"]},
            )
        if owner is not None:
            db.execute(
                text(
                    "INSERT INTO owner_preferences "
                    "(owner_id, accepts_reminders, accepts_reminders_at) "
                    "VALUES (:oid, :ar, CASE WHEN :ar THEN now() ELSE NULL END) "
                    "ON CONFLICT (owner_id) DO UPDATE SET "
                    "accepts_reminders = EXCLUDED.accepts_reminders, "
                    "accepts_reminders_at = EXCLUDED.accepts_reminders_at"
                ),
                {"oid": owner, "ar": bool(body.owner.accepts_reminders)},
            )

    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="pet_created",
        entity_type="pet",
        entity_id=pet.id,
    )
    db.commit()
    db.refresh(pet)
    return _with_owners(db, _pet_with_latest_weight(db, pet))


@router.patch("/{pet_id}", response_model=PetRead)
def update_pet(
    pet_id: str,
    body: PetUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> Pet:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    fields = body.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(pet, field, value)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="pet_updated",
        entity_type="pet",
        entity_id=pet.id,
        metadata={"fields": list(fields.keys())},
    )
    db.commit()
    db.refresh(pet)
    return _with_owners(db, _pet_with_latest_weight(db, pet))


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_pet(
    pet_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    """Desactiva el paciente (soft-delete via is_active)."""
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    pet.is_active = False
    db.commit()


@router.get("/{pet_id}/weights", response_model=list[PetWeightRead])
def list_weights(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[PetWeightRecord]:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    stmt = (
        select(PetWeightRecord)
        .where(
            PetWeightRecord.pet_id == pet_id,
            PetWeightRecord.clinic_id == ctx.clinic["id"],
        )
        .order_by(PetWeightRecord.recorded_at.desc())
    )
    return list(db.scalars(stmt))


@router.post(
    "/{pet_id}/weights",
    response_model=PetWeightRead,
    status_code=status.HTTP_201_CREATED,
)
def create_weight(
    pet_id: str,
    body: PetWeightCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> PetWeightRecord:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    record = PetWeightRecord(
        pet_id=pet_id,
        clinic_id=ctx.clinic["id"],
        weight_kg=body.weight_kg,
        consultation_id=body.consultation_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post(
    "/{pet_id}/photo",
    response_model=PetRead,
    summary="Sube la foto clínica del expediente del paciente",
)
def upload_pet_photo(
    pet_id: str,
    file: UploadFile = File(...),
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> Pet:
    """Foto CLÍNICA del expediente. Es un campo distinto de la foto de la
    Cartilla digital (principio 5): nunca se sobrescriben entre sí."""
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )

    rel = save_media(f"pets/{pet_id}", file.filename or "photo.jpg", content)
    pet.clinical_photo_url = public_url(rel)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="photo_uploaded",
        entity_type="pet",
        entity_id=pet.id,
        metadata={"kind": "clinical"},
    )
    db.commit()
    db.refresh(pet)
    return _pet_with_latest_weight(db, pet)


@router.get("/{pet_id}/photos", summary="Fotos de la sesión del veterinario")
def pet_photos_list(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    photos = db.scalars(
        select(PetPhoto)
        .where(PetPhoto.clinic_id == ctx.clinic["id"], PetPhoto.pet_id == pet.id)
        .order_by(PetPhoto.taken_at.desc())
    ).all()
    return [
        {
            "id": str(p.id),
            "url": p.url,
            "label": p.label,
            "taken_at": p.taken_at.isoformat(),
        }
        for p in photos
    ]


@router.post(
    "/{pet_id}/photos",
    status_code=status.HTTP_201_CREATED,
    summary="Sube una foto de la sesión del veterinario",
)
def create_pet_photo(
    pet_id: str,
    file: UploadFile = File(...),
    label: str = Form(default="", max_length=200),
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )
    rel = save_media(f"pets/{pet_id}/photos", file.filename or "photo.jpg", content)
    photo = PetPhoto(
        clinic_id=ctx.clinic["id"],
        pet_id=pet.id,
        walk_in_name=None,
        vet_user_id=ctx.user.sub,
        url=public_url(rel),
        label=label.strip() or None,
        taken_at=datetime.now(UTC),
    )
    db.add(photo)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="pet_photo_uploaded",
        entity_type="pet_photo",
        entity_id=photo.id,
        metadata={"pet_id": pet_id},
    )
    db.commit()
    return {
        "id": str(photo.id),
        "url": photo.url,
        "label": photo.label,
        "taken_at": photo.taken_at.isoformat(),
    }


@router.delete("/{pet_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet_photo(
    pet_id: str,
    photo_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    photo = db.scalar(
        select(PetPhoto).where(
            PetPhoto.id == photo_id,
            PetPhoto.pet_id == pet.id,
            PetPhoto.clinic_id == ctx.clinic["id"],
        )
    )
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    db.delete(photo)
    db.commit()


@router.get(
    "/{pet_id}/family",
    summary="Familia: otras mascotas con el mismo nombre de dueño",
)
def pet_family(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Devuelve las demás mascotas de la clínica cuyo dueño tiene el MISMO
    nombre exacto (full_name) que el dueño de esta mascota. La relación se
    etiqueta como hermano/hermana según el sexo de la otra mascota."""
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    owner_names = list(
        db.execute(
            text(
                "SELECT DISTINCT trim(o.full_name) AS full_name "
                "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
                "AND o.full_name IS NOT NULL AND trim(o.full_name) <> ''"
            ),
            {"pid": pet.id, "cid": ctx.clinic["id"]},
        ).scalars()
    )
    if not owner_names:
        return []

    placeholders = ",".join(f":nm{i}" for i in range(len(owner_names)))
    params: dict = {"cid": ctx.clinic["id"], "pid": pet.id}
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

    out = []
    for r in rows:
        sex = r["sex"]
        relation = (
            "hermano"
            if sex in ("M", "macho", "Macho")
            else "hermana" if sex in ("H", "hembra", "Hembra") else "hermano(a)"
        )
        out.append(
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
    return out


@router.get(
    "/{pet_id}/carnet",
    summary="Carnet de vacunación (esquema estándar + aplicaciones)",
)
def pet_carnet(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    ensure_standard_plans(db, ctx.clinic["id"])

    rows = db.execute(
        text(
            "SELECT r.id, r.vaccine, r.brand, r.date_applied, r.lot, r.notes, "
            "r.vet_user_id, u.full_name AS vet_name "
            "FROM pet_carnet_records r LEFT JOIN users u ON u.id = r.vet_user_id "
            "WHERE r.pet_id = :pid ORDER BY r.date_applied DESC"
        ),
        {"pid": pet.id},
    ).mappings().all()

    by_vaccine: dict[str, list[dict]] = {}
    for row in rows:
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
                VaccinationPlan.clinic_id == ctx.clinic["id"],
                VaccinationPlan.species == pet.species,
                VaccinationPlan.active.is_(True),
            )
        )
    ]
    # Aplicaciones de vacunas no incluidas en los planes activos de la especie
    for vaccine, apps in by_vaccine.items():
        if vaccine not in {v["name"] for v in vaccines}:
            vaccines.append(
                {
                    "name": vaccine,
                    "prevents": None,
                    "schedule": None,
                    "applications": apps,
                }
            )

    return {"species": pet.species, "vaccines": vaccines, "brands": brands_for_species(pet.species)}


@router.post(
    "/{pet_id}/carnet",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Registra una aplicación de vacuna en el carnet",
)
def create_carnet_record(
    pet_id: str,
    body: CarnetCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    record = PetCarnetRecord(
        clinic_id=ctx.clinic["id"],
        pet_id=pet.id,
        vaccine=body.vaccine,
        brand=body.brand,
        date_applied=body.date_applied,
        lot=body.lot,
        vet_user_id=body.vet_user_id,
        notes=body.notes,
    )
    db.add(record)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="carnet_record_created",
        entity_type="carnet_record",
        entity_id=record.id,
        metadata={"pet_id": str(pet.id), "vaccine": body.vaccine},
    )
    db.commit()
    vet_name = None
    if record.vet_user_id:
        vet_name = db.scalar(select(User.full_name).where(User.id == record.vet_user_id))
    return {
        "id": str(record.id),
        "vaccine": record.vaccine,
        "brand": record.brand,
        "date_applied": record.date_applied.isoformat(),
        "lot": record.lot,
        "notes": record.notes,
        "vet_name": vet_name,
    }


@router.delete("/{pet_id}/carnet/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_carnet_record(
    pet_id: str,
    record_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    record = db.scalar(
        select(PetCarnetRecord).where(
            PetCarnetRecord.id == record_id, PetCarnetRecord.pet_id == pet.id
        )
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    db.delete(record)
    db.commit()


@router.get(
    "/{pet_id}/timeline",
    summary="Línea de tiempo del paciente (consultas + citas)",
)
def pet_timeline(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    consultations = db.scalars(
        select(Consultation)
        .where(Consultation.pet_id == pet.id, Consultation.clinic_id == ctx.clinic["id"])
        .order_by(Consultation.created_at.desc())
    ).all()

    appointments = db.scalars(
        select(Appointment)
        .where(Appointment.pet_id == pet.id, Appointment.clinic_id == ctx.clinic["id"])
        .order_by(Appointment.start_time.desc())
    ).all()

    vet_ids = {c.vet_user_id for c in consultations}
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )

    photo_vets = db.execute(
        text(
            "SELECT p.id, p.label, p.url, p.taken_at, u.full_name AS vet_name "
            "FROM pet_photos p LEFT JOIN users u ON u.id = p.vet_user_id "
            "WHERE p.pet_id = :pid AND p.clinic_id = :cid"
        ),
        {"pid": pet.id, "cid": ctx.clinic["id"]},
    ).mappings().all()

    events: list[dict] = []
    for c in consultations:
        events.append(
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
        events.append(
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
    for p in photo_vets:
        events.append(
            {
                "type": "foto",
                "id": str(p["id"]),
                "title": p["label"] or "Foto de la consulta",
                "subtitle": "",
                "author": p["vet_name"],
                "date": p["taken_at"].isoformat(),
                "status": None,
                "url": p["url"],
            }
        )

    events.sort(key=lambda e: e["date"], reverse=True)
    return events


@router.post(
    "/{pet_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Genera la invitación del dueño (token de activación)",
)
def create_invitation(
    pet_id: str,
    body: InvitationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> InvitationResponse:
    """Cierra el flujo de invitación (Subfase 1.7): la clínica capturó el
    teléfono/correo del dueño en persona y genera el token. El link se
    comparte por WhatsApp/email (en dev se devuelve en la respuesta)."""
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    if not body.contact_phone and not body.contact_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Se necesita al menos un teléfono o correo de contacto",
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)
    db.execute(
        text(
            "INSERT INTO owner_invitations "
            "(clinic_id, pet_id, contact_phone, contact_email, token, status, "
            "expires_at, created_by) "
            "VALUES (:c, :p, :phone, :email, :token, 'pending', :expires, :by)"
        ),
        {
            "c": ctx.clinic["id"],
            "p": pet_id,
            "phone": body.contact_phone,
            "email": body.contact_email,
            "token": token,
            "expires": expires_at,
            "by": ctx.user.sub,
        },
    )
    db.commit()
    return InvitationResponse(
        token=token,
        activation_url=f"/activate?token={token}",
        expires_at=expires_at,
    )


@router.post(
    "/{pet_id}/share-link",
    summary="Genera el enlace de la cartilla para el dueño (sin login)",
)
def create_share_link(
    pet_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    token, expires_at = create_share_token(str(pet.id))
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="cartilla_share_link_created",
        entity_type="pet",
        entity_id=pet.id,
    )
    db.commit()
    return {"url": f"/cartilla?token={token}", "expires_at": expires_at.isoformat()}


class QrResolveRequest(BaseModel):
    token: str = Field(min_length=1)


@router.get("/{pet_id}/qr", summary="Token QR permanente de la mascota")
def get_pet_qr(
    pet_id: str,
    me: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> dict:
    pet = _get_pet_or_404(db, str(me.clinic_id), pet_id)
    token = ensure_qr_token(db, pet)
    return {"token": token, "url": f"/cartilla?token={token}"}


@router.post("/{pet_id}/qr/regenerate", summary="Regenera (revoca) el QR permanente")
def regenerate_pet_qr(
    pet_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    pet.qr_token = secrets.token_urlsafe(32)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="pet_qr_regenerated",
        entity_type="pet",
        entity_id=pet.id,
    )
    db.commit()
    db.refresh(pet)
    return {"token": pet.qr_token, "url": f"/cartilla?token={pet.qr_token}"}


@router.post("/resolve-qr", summary="Resuelve un QR escaneado y devuelve el paciente")
def resolve_pet_qr(
    body: QrResolveRequest,
    me: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> dict:
    pet = _pet_from_qr_or_share_token(db, body.token.strip())
    if pet is None or not pet.is_active or str(pet.clinic_id) != me.clinic_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return {"pet_id": str(pet.id), "pet_name": pet.name}


@router.get(
    "/{pet_id}/owner-links",
    response_model=list[OwnerLinkRead],
    summary="Dueños vinculados a la mascota",
)
def pet_owner_links(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[OwnerLinkRead]:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    rows = (
        db.execute(
            text(
                "SELECT o.id AS owner_id, o.phone, o.email, l.linked_at, l.is_active "
                "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                "WHERE l.pet_id = :pid AND l.clinic_id = :cid "
                "ORDER BY l.linked_at DESC"
            ),
            {"pid": pet_id, "cid": ctx.clinic["id"]},
        )
        .mappings()
        .all()
    )
    return [OwnerLinkRead(**dict(r)) for r in rows]


@router.put(
    "/{pet_id}/owner-contact",
    response_model=OwnerLinkRead,
    summary="Actualiza el contacto del dueño activo (recepción certifica los datos)",
)
def update_owner_contact(
    pet_id: str,
    body: OwnerContactUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> OwnerLinkRead:
    """Edita el contacto del dueño activo de la mascota. Lo usa el checkout de
    'Nueva consulta' para que la recepción certifique/corrija los datos."""
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    row = (
        db.execute(
            text(
                "SELECT o.id AS owner_id, o.full_name, o.phone, o.email, "
                "o.alt_contact_name, o.alt_phone, l.linked_at, l.is_active "
                "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
                "ORDER BY l.linked_at DESC LIMIT 1"
            ),
            {"pid": pet_id, "cid": ctx.clinic["id"]},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La mascota no tiene un dueño activo",
        )
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No hay campos para actualizar",
        )
    assignments = ", ".join(f"{col} = :{col}" for col in data)
    params = {col: value for col, value in data.items()}
    params["oid"] = row["owner_id"]
    db.execute(text(f"UPDATE owners SET {assignments} WHERE id = :oid"), params)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="owner_contact_updated",
        entity_type="pet",
        entity_id=pet_id,
        metadata={"fields": list(data.keys())},
    )
    db.commit()
    fresh = (
        db.execute(
            text(
                "SELECT o.id AS owner_id, o.full_name, o.phone, o.email, "
                "o.alt_contact_name, o.alt_phone, l.linked_at, l.is_active "
                "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                "WHERE l.pet_id = :pid AND l.clinic_id = :cid AND l.is_active = true "
                "ORDER BY l.linked_at DESC LIMIT 1"
            ),
            {"pid": pet_id, "cid": ctx.clinic["id"]},
        )
        .mappings()
        .first()
    )
    return OwnerLinkRead(**dict(fresh))


@router.post(
    "/{pet_id}/owner-transfer",
    response_model=OwnerTransferResponse,
    summary="Transfiere la mascota a otro dueño (reutiliza o crea owner)",
)
def transfer_owner(
    pet_id: str,
    body: OwnerTransferRequest,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> OwnerTransferResponse:
    """Cambia el dueño de la mascota. Regla global: si ya existe un `owner`
    con ese teléfono/correo, se reutiliza (nunca se duplica). Los links
    anteriores quedan revocados y el nuevo dueño recibe una invitación."""
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    if not body.contact_phone and not body.contact_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Se necesita al menos un teléfono o correo del nuevo dueño",
        )

    if body.contact_email:
        owner = db.execute(
            text("SELECT id FROM owners WHERE email = :email"), {"email": body.contact_email}
        ).scalar()
    elif body.contact_phone:
        owner = db.execute(
            text("SELECT id FROM owners WHERE phone = :phone"), {"phone": body.contact_phone}
        ).scalar()

    reused = owner is not None
    if owner is None:
        owner = db.execute(
            text("INSERT INTO owners (phone, email) VALUES (:phone, :email) RETURNING id"),
            {"phone": body.contact_phone, "email": body.contact_email},
        ).scalar()

    revoked = db.execute(
        text(
            "UPDATE owner_pet_links SET is_active = false, revoked_at = now() "
            "WHERE pet_id = :pid AND clinic_id = :cid AND is_active = true"
        ),
        {"pid": pet_id, "cid": ctx.clinic["id"]},
    ).rowcount

    db.execute(
        text(
            "INSERT INTO owner_pet_links (owner_id, pet_id, clinic_id, is_active) "
            "VALUES (:oid, :pid, :cid, true)"
        ),
        {"oid": owner, "pid": pet_id, "cid": ctx.clinic["id"]},
    )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    db.execute(
        text(
            "INSERT INTO owner_invitations "
            "(clinic_id, pet_id, contact_phone, contact_email, token, status, "
            "expires_at, created_by) "
            "VALUES (:c, :p, :phone, :email, :token, 'pending', :expires, :by)"
        ),
        {
            "c": ctx.clinic["id"],
            "p": pet_id,
            "phone": body.contact_phone,
            "email": body.contact_email,
            "token": token,
            "expires": expires_at,
            "by": ctx.user.sub,
        },
    )
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="owner_transferred",
        entity_type="pet",
        entity_id=pet_id,
        metadata={"new_owner": str(owner), "reused": reused},
    )
    db.commit()

    return OwnerTransferResponse(
        owner_id=owner,
        reused=reused,
        links_revoked=revoked,
        invitation={
            "token": token,
            "activation_url": f"/activate?token={token}",
            "expires_at": expires_at.isoformat(),
        },
    )


@router.get(
    "/{pet_id}/alerts",
    response_model=list[ClinicalAlertRead],
    summary="Alertas clínicas del paciente",
)
def pet_alerts(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[ClinicalAlert]:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    return list(
        db.scalars(
            select(ClinicalAlert)
            .where(ClinicalAlert.pet_id == pet_id)
            .order_by(ClinicalAlert.created_at.desc())
        )
    )


@router.post(
    "/{pet_id}/alerts",
    response_model=ClinicalAlertRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una alerta clínica del paciente",
)
def create_alert(
    pet_id: str,
    body: ClinicalAlertCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> ClinicalAlert:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    alert = ClinicalAlert(pet_id=pet_id, type=body.type, description=body.description)
    db.add(alert)
    db.flush()  # asigna alert.id para la auditoría
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="alert_created",
        entity_type="alert",
        entity_id=alert.id,
        metadata={"pet_id": pet_id, "type": body.type},
    )
    notify_roles(
        db,
        clinic_id=ctx.clinic["id"],
        roles=["veterinario", "admin"],
        type_="clinical_alert",
        message=f"Nueva alerta clínica: {body.type} — {body.description}",
    )
    db.commit()
    db.refresh(alert)
    return alert


@router.patch(
    "/{pet_id}/alerts/{alert_id}",
    response_model=ClinicalAlertRead,
    summary="Edita una alerta clínica",
)
def update_alert(
    pet_id: str,
    alert_id: str,
    body: ClinicalAlertUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> ClinicalAlert:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    alert = _get_alert_or_404(db, pet_id, alert_id)
    if body.type is not None:
        alert.type = body.type
    if body.description is not None:
        alert.description = body.description
    db.commit()
    db.refresh(alert)
    return alert


@router.delete(
    "/{pet_id}/alerts/{alert_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Elimina (resuelve) una alerta clínica",
)
def delete_alert(
    pet_id: str,
    alert_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PET_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    _get_pet_or_404(db, ctx.clinic["id"], pet_id)
    alert = _get_alert_or_404(db, pet_id, alert_id)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="alert_deleted",
        entity_type="alert",
        entity_id=alert.id,
        metadata={"pet_id": pet_id, "type": alert.type},
    )
    db.delete(alert)
    db.commit()


def _get_alert_or_404(db: Session, pet_id: str, alert_id: str) -> ClinicalAlert:
    alert = db.scalar(
        select(ClinicalAlert).where(ClinicalAlert.id == alert_id, ClinicalAlert.pet_id == pet_id)
    )
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
    return alert


@router.get(
    "/{pet_id}/photo-evolution",
    response_model=list[PhotoEvolutionItem],
    summary="Fotos de las consultas (evolución) en orden cronológico",
)
def photo_evolution(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[PhotoEvolutionItem]:
    pet = _get_pet_or_404(db, ctx.clinic["id"], pet_id)

    out: list[PhotoEvolutionItem] = []

    consultations = list(
        db.scalars(
            select(Consultation)
            .where(Consultation.pet_id == pet.id, Consultation.clinic_id == ctx.clinic["id"])
            .order_by(Consultation.created_at.asc())
        )
    )
    if consultations:
        consultation_ids = [c.id for c in consultations]
        attachments = list(
            db.scalars(
                select(ConsultationAttachment)
                .where(
                    ConsultationAttachment.consultation_id.in_(consultation_ids),
                    ConsultationAttachment.type == "photo",
                )
                .order_by(ConsultationAttachment.created_at.asc())
            )
        )
        consult_by_id = {c.id: c for c in consultations}
        for att in attachments:
            c = consult_by_id.get(att.consultation_id)
            if c is None:
                continue
            out.append(
                PhotoEvolutionItem(
                    url=att.url,
                    consultation_id=c.id,
                    consultation_date=c.created_at,
                    reason=c.reason,
                )
            )

    pet_photos = list(
        db.scalars(
            select(PetPhoto)
            .where(PetPhoto.clinic_id == ctx.clinic["id"], PetPhoto.pet_id == pet.id)
            .order_by(PetPhoto.taken_at.asc())
        )
    )
    for p in pet_photos:
        out.append(
            PhotoEvolutionItem(
                url=p.url,
                consultation_id=p.id,
                consultation_date=p.taken_at,
                reason=p.label or "Sesión del veterinario",
            )
        )
    return out
