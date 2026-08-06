"""CRUD de pacientes (mascotas) y registros de peso — por-tenant.

El peso es histórico (una fila por consulta, principio 4 del documento):
la lectura de mascotas expone el último peso como default visual.
Incluye la foto clínica del expediente (distinta de la foto de la Cartilla,
principio 5) y la línea de tiempo que fusiona consultas y citas.
"""

import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.core.events import notify_roles, record_audit
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
from app.db.session import get_db
from app.models import (
    Appointment,
    ClinicalAlert,
    Consultation,
    ConsultationAttachment,
    CustomBreed,
    Pet,
    PetWeightRecord,
    User,
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
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Pet]:
    stmt = select(Pet).where(Pet.clinic_id == ctx.clinic["id"])
    if active_only:
        stmt = stmt.where(Pet.is_active.is_(True))
    if search:
        stmt = stmt.where(Pet.name.ilike(f"%{search}%"))
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
                "o.alt_contact_name, o.alt_phone, l.linked_at, l.is_active "
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
    elif phone:
        owner = db.execute(
            text("SELECT id FROM owners WHERE phone = :phone"), {"phone": phone}
        ).scalar()
    else:
        return None

    if owner is None:
        owner = db.execute(
            text(
                "INSERT INTO owners (phone, email, full_name) "
                "VALUES (:phone, :email, :name) RETURNING id"
            ),
            {"phone": phone, "email": email, "name": full_name},
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

    consultations = list(
        db.scalars(
            select(Consultation)
            .where(Consultation.pet_id == pet.id, Consultation.clinic_id == ctx.clinic["id"])
            .order_by(Consultation.created_at.asc())
        )
    )
    if not consultations:
        return []
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
    out = []
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
    return out
