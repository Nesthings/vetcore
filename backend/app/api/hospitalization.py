"""Hospitalización (Milestone 1): estancias + espacios/jaulas.

- Espacios/jaulas por clínica y sucursal.
- Hospitalizaciones con ciclo de vida validado y ocupación de espacio.
- Multi-tenant estricto: todo se filtra por `ctx.clinic["id"]`.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentClinic,
    get_current_clinic,
    require_clinic_roles,
    require_component,
)
from app.core.events import record_audit
from app.db.session import get_db
from app.models import (
    ClinicBranch,
    Hospitalization,
    HospitalizationAccommodation,
    Pet,
    User,
)
from app.schemas.hospitalization import (
    AccommodationCreate,
    AccommodationRead,
    AccommodationUpdate,
    HospitalizationCreate,
    HospitalizationRead,
    HospitalizationUpdate,
)

router = APIRouter(
    prefix="/hospitalization",
    tags=["hospitalization"],
    dependencies=[Depends(require_component("hospitalization"))],
)

MUTATORS = ("admin", "veterinario")

ACTIVE_STATUSES = ("planned", "admitted", "active", "discharge_pending")

TRANSITIONS: dict[str, set[str]] = {
    "planned": {"admitted", "cancelled"},
    "admitted": {"active", "discharge_pending", "cancelled"},
    "active": {"discharge_pending", "cancelled"},
    "discharge_pending": {"active", "discharged"},
    "discharged": set(),
    "cancelled": set(),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_hospitalization_or_404(db: Session, clinic_id, hosp_id: str) -> Hospitalization:
    row = db.scalar(
        select(Hospitalization).where(
            Hospitalization.id == hosp_id,
            Hospitalization.clinic_id == clinic_id,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hospitalización no encontrada"
        )
    return row


def _get_accommodation_or_404(db: Session, clinic_id, acc_id: str) -> HospitalizationAccommodation:
    row = db.scalar(
        select(HospitalizationAccommodation).where(
            HospitalizationAccommodation.id == acc_id,
            HospitalizationAccommodation.clinic_id == clinic_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Espacio no encontrado")
    return row


def _validate_branch(db: Session, clinic_id, branch_id: str) -> None:
    branch = db.scalar(
        select(ClinicBranch).where(
            ClinicBranch.id == branch_id, ClinicBranch.clinic_id == clinic_id
        )
    )
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sucursal no encontrada")


def _check_occupancy(
    db: Session, clinic_id, accommodation_id: str | None, exclude_hosp: str | None = None
) -> None:
    """Evita que un espacio individual quede sobre-ocupado."""
    if not accommodation_id:
        return
    acc = _get_accommodation_or_404(db, clinic_id, accommodation_id)
    stmt = (
        select(func.count())
        .select_from(Hospitalization)
        .where(
            Hospitalization.clinic_id == clinic_id,
            Hospitalization.accommodation_id == accommodation_id,
            Hospitalization.status.in_(ACTIVE_STATUSES),
        )
    )
    if exclude_hosp:
        stmt = stmt.where(Hospitalization.id != exclude_hosp)
    active = db.scalar(stmt) or 0
    if active >= acc.capacity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El espacio {acc.code} está ocupado (capacidad {acc.capacity}).",
        )


def _enrich_hospitalizations(db: Session, clinic_id, rows: list[Hospitalization]) -> list[dict]:
    if not rows:
        return []
    pet_ids = [r.pet_id for r in rows]
    vet_ids = [r.vet_user_id for r in rows if r.vet_user_id]
    acc_ids = [r.accommodation_id for r in rows if r.accommodation_id]

    pets = {
        p.id: p
        for p in db.scalars(
            select(Pet).where(Pet.clinic_id == clinic_id, Pet.id.in_(pet_ids))
        ).all()
    }
    vets = {}
    if vet_ids:
        vets = {u.id: u for u in db.scalars(select(User).where(User.id.in_(vet_ids))).all()}
    accs = {}
    if acc_ids:
        accs = {
            a.id: a
            for a in db.scalars(
                select(HospitalizationAccommodation).where(
                    HospitalizationAccommodation.clinic_id == clinic_id,
                    HospitalizationAccommodation.id.in_(acc_ids),
                )
            ).all()
        }

    # Último peso en batch.
    weights: dict = {}
    if pet_ids:
        weight_rows = db.execute(
            text(
                "SELECT pet_id, weight_kg FROM ("
                "  SELECT pet_id, weight_kg, ROW_NUMBER() OVER (PARTITION BY pet_id "
                "    ORDER BY recorded_at DESC, id DESC) AS rn "
                "  FROM pet_weight_records WHERE clinic_id = :cid AND pet_id = ANY(:ids)"
                ") t WHERE rn = 1"
            ),
            {"cid": clinic_id, "ids": list(pet_ids)},
        ).all()
        weights = {pet_id: weight_kg for pet_id, weight_kg in weight_rows}

    # Dueño (contacto) en batch.
    owners: dict = {}
    if pet_ids:
        owner_rows = (
            db.execute(
                text(
                    "SELECT l.pet_id AS pet_id, o.id AS owner_id, o.full_name, o.phone "
                    "FROM owner_pet_links l JOIN owners o ON o.id = l.owner_id "
                    "WHERE l.clinic_id = :cid AND l.pet_id = ANY(:ids) AND l.is_active = true "
                    "ORDER BY l.linked_at DESC"
                ),
                {"cid": clinic_id, "ids": list(pet_ids)},
            )
            .mappings()
            .all()
        )
        for r in owner_rows:
            owners.setdefault(
                r["pet_id"],
                {"owner_id": r["owner_id"], "full_name": r["full_name"], "phone": r["phone"]},
            )

    now = datetime.now(UTC)
    out = []
    for r in rows:
        pet = pets.get(r.pet_id)
        vet = vets.get(r.vet_user_id) if r.vet_user_id else None
        acc = accs.get(r.accommodation_id) if r.accommodation_id else None
        owner = owners.get(r.pet_id)
        out.append(
            {
                "id": str(r.id),
                "clinic_id": str(r.clinic_id),
                "branch_id": str(r.branch_id),
                "pet_id": str(r.pet_id),
                "status": r.status,
                "accommodation_id": str(r.accommodation_id) if r.accommodation_id else None,
                "vet_user_id": str(r.vet_user_id) if r.vet_user_id else None,
                "reason": r.reason,
                "diagnosis": r.diagnosis,
                "monitoring_level": r.monitoring_level,
                "operational_status": r.operational_status,
                "isolation_status": r.isolation_status,
                "admitted_at": r.admitted_at.isoformat() if r.admitted_at else None,
                "expected_discharge_at": (
                    r.expected_discharge_at.isoformat() if r.expected_discharge_at else None
                ),
                "actual_discharge_at": r.actual_discharge_at.isoformat()
                if r.actual_discharge_at
                else None,
                "notes": r.notes,
                "created_at": r.created_at.isoformat(),
                "updated_at": r.updated_at.isoformat(),
                "elapsed_minutes": int((now - r.admitted_at).total_seconds() // 60),
                "pet": {
                    "id": str(pet.id) if pet else None,
                    "name": pet.name if pet else "—",
                    "species": pet.species if pet else None,
                    "breed": pet.breed if pet else None,
                    "sex": pet.sex if pet else None,
                    "photo_url": pet.clinical_photo_url if pet else None,
                    "birth_date": pet.birth_date.isoformat() if pet and pet.birth_date else None,
                    "latest_weight_kg": float(weights[r.pet_id]) if r.pet_id in weights else None,
                }
                if pet
                else None,
                "owner": owner,
                "accommodation": (
                    {
                        "id": str(acc.id),
                        "code": acc.code,
                        "name": acc.name,
                        "type": acc.type,
                        "capacity": acc.capacity,
                    }
                    if acc
                    else None
                ),
                "vet": {"id": str(vet.id), "full_name": vet.full_name} if vet else None,
            }
        )
    return out


# ---------------------------------------------------------------------------
# Espacios / jaulas
# ---------------------------------------------------------------------------


@router.get("/accommodations", response_model=list[AccommodationRead])
def list_accommodations(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
) -> list[HospitalizationAccommodation]:
    stmt = select(HospitalizationAccommodation).where(
        HospitalizationAccommodation.clinic_id == ctx.clinic["id"]
    )
    if branch_id:
        stmt = stmt.where(HospitalizationAccommodation.branch_id == branch_id)
    if not include_inactive:
        stmt = stmt.where(HospitalizationAccommodation.active.is_(True))
    stmt = stmt.order_by(HospitalizationAccommodation.code)
    return list(db.scalars(stmt))


@router.post(
    "/accommodations", response_model=AccommodationRead, status_code=status.HTTP_201_CREATED
)
def create_accommodation(
    body: AccommodationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationAccommodation:
    _validate_branch(db, ctx.clinic["id"], str(body.branch_id))
    exists = db.scalar(
        select(HospitalizationAccommodation).where(
            HospitalizationAccommodation.clinic_id == ctx.clinic["id"],
            HospitalizationAccommodation.branch_id == body.branch_id,
            HospitalizationAccommodation.code == body.code,
        )
    )
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un espacio con el código {body.code}.",
        )
    row = HospitalizationAccommodation(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(row)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="accommodation_created",
        entity_type="hospitalization_accommodation",
        entity_id=row.id,
        metadata={"code": body.code},
    )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/accommodations/{accommodation_id}", response_model=AccommodationRead)
def update_accommodation(
    accommodation_id: str,
    body: AccommodationUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationAccommodation:
    row = _get_accommodation_or_404(db, ctx.clinic["id"], accommodation_id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="accommodation_updated",
        entity_type="hospitalization_accommodation",
        entity_id=row.id,
        metadata={"fields": list(data.keys())},
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/accommodations/{accommodation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_accommodation(
    accommodation_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    row = _get_accommodation_or_404(db, ctx.clinic["id"], accommodation_id)
    active = db.scalar(
        select(func.count())
        .select_from(Hospitalization)
        .where(
            Hospitalization.clinic_id == ctx.clinic["id"],
            Hospitalization.accommodation_id == row.id,
            Hospitalization.status.in_(ACTIVE_STATUSES),
        )
    )
    if active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar un espacio con hospitalizaciones activas.",
        )
    db.delete(row)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="accommodation_deleted",
        entity_type="hospitalization_accommodation",
        entity_id=row.id,
    )
    db.commit()


# ---------------------------------------------------------------------------
# Hospitalizaciones
# ---------------------------------------------------------------------------


@router.get("/hospitalizations")
def list_hospitalizations(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    branch_id: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=150),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[dict]:
    stmt = select(Hospitalization).where(Hospitalization.clinic_id == ctx.clinic["id"])
    if status_filter:
        stmt = stmt.where(Hospitalization.status == status_filter)
    if branch_id:
        stmt = stmt.where(Hospitalization.branch_id == branch_id)
    if search:
        pet_ids = db.scalars(
            select(Pet.id).where(
                Pet.clinic_id == ctx.clinic["id"],
                Pet.name.ilike(f"%{search}%"),
            )
        ).all()
        if not pet_ids:
            return []
        stmt = stmt.where(Hospitalization.pet_id.in_(pet_ids))
    stmt = stmt.order_by(Hospitalization.admitted_at.desc()).limit(limit)
    rows = list(db.scalars(stmt))
    return _enrich_hospitalizations(db, ctx.clinic["id"], rows)


@router.get("/hospitalizations/{hosp_id}")
def get_hospitalization(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return _enrich_hospitalizations(db, ctx.clinic["id"], [row])[0]


@router.post(
    "/hospitalizations", response_model=HospitalizationRead, status_code=status.HTTP_201_CREATED
)
def create_hospitalization(
    body: HospitalizationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    if body.status not in ("planned", "admitted"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El estado inicial debe ser 'planned' o 'admitted'.",
        )
    _validate_branch(db, ctx.clinic["id"], str(body.branch_id))
    pet = db.scalar(select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == ctx.clinic["id"]))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    if body.accommodation_id:
        _check_occupancy(db, ctx.clinic["id"], str(body.accommodation_id))
    data = body.model_dump()
    row = Hospitalization(
        clinic_id=ctx.clinic["id"],
        status=data["status"],
        admitted_at=datetime.now(UTC),
        **{k: v for k, v in data.items() if k not in ("status",)},
    )
    db.add(row)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="hospitalization_created",
        entity_type="hospitalization",
        entity_id=row.id,
        metadata={"pet_id": str(row.pet_id), "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/hospitalizations/{hosp_id}", response_model=HospitalizationRead)
def update_hospitalization(
    hosp_id: str,
    body: HospitalizationUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    data = body.model_dump(exclude_unset=True)

    if "accommodation_id" in data:
        new_acc = data["accommodation_id"]
        if new_acc != row.accommodation_id:
            _check_occupancy(db, ctx.clinic["id"], new_acc, exclude_hosp=str(row.id))

    changed: list[str] = []
    for field, value in data.items():
        if getattr(row, field, None) != value:
            changed.append(field)
        setattr(row, field, value)

    if changed:
        db.flush()
        record_audit(
            db,
            clinic_id=ctx.clinic["id"],
            actor_type="user",
            actor_id=ctx.user.sub,
            action="hospitalization_updated",
            entity_type="hospitalization",
            entity_id=row.id,
            metadata={"fields": changed},
        )
    db.commit()
    db.refresh(row)
    return row


def _transition(
    db: Session, ctx, row: Hospitalization, new_status: str, action: str
) -> Hospitalization:
    if new_status not in TRANSITIONS.get(row.status, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transición inválida de '{row.status}' a '{new_status}'.",
        )
    old_status = row.status
    row.status = new_status
    if new_status == "admitted":
        row.admitted_at = datetime.now(UTC)
    if new_status == "discharged":
        row.actual_discharge_at = datetime.now(UTC)
    if new_status in ("discharged", "cancelled"):
        row.accommodation_id = None
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action=action,
        entity_type="hospitalization",
        entity_id=row.id,
        metadata={"from": old_status, "to": new_status},
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/hospitalizations/{hosp_id}/admit", response_model=HospitalizationRead)
def admit_hospitalization(
    hosp_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    if row.accommodation_id:
        _check_occupancy(db, ctx.clinic["id"], str(row.accommodation_id), exclude_hosp=str(row.id))
    return _transition(db, ctx, row, "admitted", "hospitalization_admitted")


@router.post("/hospitalizations/{hosp_id}/activate", response_model=HospitalizationRead)
def activate_hospitalization(
    hosp_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return _transition(db, ctx, row, "active", "hospitalization_activated")


@router.post("/hospitalizations/{hosp_id}/request-discharge", response_model=HospitalizationRead)
def request_discharge(
    hosp_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return _transition(db, ctx, row, "discharge_pending", "hospitalization_discharge_requested")


@router.post("/hospitalizations/{hosp_id}/complete-discharge", response_model=HospitalizationRead)
def complete_discharge(
    hosp_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return _transition(db, ctx, row, "discharged", "hospitalization_discharged")


@router.post("/hospitalizations/{hosp_id}/cancel", response_model=HospitalizationRead)
def cancel_hospitalization(
    hosp_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> Hospitalization:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return _transition(db, ctx, row, "cancelled", "hospitalization_cancelled")
