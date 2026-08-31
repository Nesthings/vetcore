"""Hospitalización (Milestone 1): estancias + espacios/jaulas.

- Espacios/jaulas por clínica y sucursal.
- Hospitalizaciones con ciclo de vida validado y ocupación de espacio.
- Multi-tenant estricto: todo se filtra por `ctx.clinic["id"]`.
"""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentClinic,
    get_current_clinic,
    require_clinic_roles,
    require_component,
)
from app.api.inventory import allocate_fifo
from app.core.events import record_audit
from app.db.session import get_db
from app.models import (
    ClinicBranch,
    Hospitalization,
    HospitalizationAccommodation,
    HospitalizationMedicationAdministration,
    HospitalizationMedicationOrder,
    HospitalizationTask,
    HospitalizationVital,
    InventoryMovement,
    InventoryProduct,
    Pet,
    User,
)
from app.schemas.hospitalization import (
    AccommodationCreate,
    AccommodationRead,
    AccommodationUpdate,
    HospitalizationCreate,
    HospitalizationRead,
    HospitalizationTaskCreate,
    HospitalizationTaskRead,
    HospitalizationUpdate,
    HospitalizationVitalRead,
    MedicationAdministrationCreate,
    MedicationAdministrationRead,
    MedicationOrderCreate,
    MedicationOrderRead,
    VitalBatchCreate,
)
from app.services import hospitalization as hosp_service

router = APIRouter(
    prefix="/hospitalization",
    tags=["hospitalization"],
    dependencies=[Depends(require_component("hospitalizacion"))],
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


@router.get("/overview")
def hospitalization_overview(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
) -> dict:
    """Resumen operativo del módulo + ocupación de espacios."""
    clinic_id = ctx.clinic["id"]
    base = [Hospitalization.clinic_id == clinic_id, Hospitalization.status.in_(ACTIVE_STATUSES)]
    if branch_id:
        base.append(Hospitalization.branch_id == branch_id)

    def count(*extra) -> int:
        return (
            db.scalar(select(func.count()).select_from(Hospitalization).where(*base, *extra)) or 0
        )

    start_today = datetime.combine(date.today(), time.min, tzinfo=UTC)
    end_today = datetime.combine(date.today(), time.max, tzinfo=UTC)

    summary = {
        "active": count(),
        "critical": count(Hospitalization.operational_status == "critical"),
        "monitoring": count(Hospitalization.operational_status == "monitoring"),
        "delicate": count(Hospitalization.operational_status == "delicate"),
        "isolation": count(Hospitalization.isolation_status != "normal"),
        "discharge_pending": count(Hospitalization.status == "discharge_pending"),
        "admitted_today": count(Hospitalization.admitted_at >= start_today),
        "expected_discharge_today": count(
            Hospitalization.expected_discharge_at.is_not(None),
            Hospitalization.expected_discharge_at <= end_today,
        ),
    }

    acc_stmt = select(HospitalizationAccommodation).where(
        HospitalizationAccommodation.clinic_id == clinic_id,
        HospitalizationAccommodation.active.is_(True),
    )
    if branch_id:
        acc_stmt = acc_stmt.where(HospitalizationAccommodation.branch_id == branch_id)
    accommodations = list(db.scalars(acc_stmt.order_by(HospitalizationAccommodation.code)))

    occ_stmt = (
        select(Hospitalization.accommodation_id, func.count())
        .where(
            Hospitalization.clinic_id == clinic_id,
            Hospitalization.status.in_(ACTIVE_STATUSES),
            Hospitalization.accommodation_id.is_not(None),
        )
        .group_by(Hospitalization.accommodation_id)
    )
    if branch_id:
        occ_stmt = occ_stmt.where(Hospitalization.branch_id == branch_id)
    active_counts = dict(db.execute(occ_stmt).all())

    acc_payload = [
        {
            "id": str(a.id),
            "code": a.code,
            "name": a.name,
            "type": a.type,
            "capacity": a.capacity,
            "status": a.status,
            "max_isolation": a.max_isolation,
            "active_count": active_counts.get(a.id, 0),
            "occupied": (active_counts.get(a.id, 0) or 0) >= a.capacity,
        }
        for a in accommodations
    ]
    return {"summary": summary, "accommodations": acc_payload}


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
        if status_filter == "active":
            # "active" es un concepto de UI: incluye todas las estancias en curso.
            stmt = stmt.where(Hospitalization.status.in_(ACTIVE_STATUSES))
        else:
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
    hosp_service.sync_monitoring_tasks(db, row)
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
    if "monitoring_level" in data:
        hosp_service.sync_monitoring_tasks(db, row)
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


# ---------------------------------------------------------------------------
# Tareas de hospitalización
# ---------------------------------------------------------------------------


@router.get("/{hosp_id}/tasks", response_model=list[HospitalizationTaskRead])
def list_hospitalization_tasks(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationTask]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    hosp_service.sync_monitoring_tasks(db, row)
    return list(
        db.scalars(
            select(HospitalizationTask)
            .where(
                HospitalizationTask.clinic_id == ctx.clinic["id"],
                HospitalizationTask.hospitalization_id == row.id,
            )
            .order_by(HospitalizationTask.scheduled_at)
        ).all()
    )


@router.post(
    "/{hosp_id}/tasks", response_model=HospitalizationTaskRead, status_code=status.HTTP_201_CREATED
)
def create_hospitalization_task(
    hosp_id: str,
    body: HospitalizationTaskCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationTask:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    task = HospitalizationTask(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        **body.model_dump(),
    )
    db.add(task)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="hospitalization_task_created",
        entity_type="hospitalization_task",
        entity_id=task.id,
        metadata={"hospitalization_id": str(row.id), "type": body.type},
    )
    db.commit()
    db.refresh(task)
    return task


def _get_task_or_404(db: Session, clinic_id, task_id: str) -> HospitalizationTask:
    task = db.scalar(
        select(HospitalizationTask).where(
            HospitalizationTask.id == task_id,
            HospitalizationTask.clinic_id == clinic_id,
        )
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
    return task


def _finish_task(
    db: Session,
    ctx,
    task: HospitalizationTask,
    status_value: str,
    observation: str | None,
    action: str,
) -> HospitalizationTask:
    if task.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La tarea ya está {task.status}.",
        )
    task.status = status_value
    if status_value == "completed":
        task.completed_by = ctx.user.sub
        task.completed_at = datetime.now(UTC)
    task.observation = observation
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action=action,
        entity_type="hospitalization_task",
        entity_id=task.id,
        metadata={"status": status_value, "hospitalization_id": str(task.hospitalization_id)},
    )
    db.commit()
    db.refresh(task)
    return task


@router.post("/tasks/{task_id}/complete", response_model=HospitalizationTaskRead)
def complete_task(
    task_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
    observation: str | None = None,
) -> HospitalizationTask:
    task = _get_task_or_404(db, ctx.clinic["id"], task_id)
    return _finish_task(db, ctx, task, "completed", observation, "hospitalization_task_completed")


@router.post("/tasks/{task_id}/skip", response_model=HospitalizationTaskRead)
def skip_task(
    task_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
    observation: str | None = None,
) -> HospitalizationTask:
    task = _get_task_or_404(db, ctx.clinic["id"], task_id)
    return _finish_task(db, ctx, task, "skipped", observation, "hospitalization_task_skipped")


@router.post("/tasks/{task_id}/cancel", response_model=HospitalizationTaskRead)
def cancel_task(
    task_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationTask:
    task = _get_task_or_404(db, ctx.clinic["id"], task_id)
    return _finish_task(db, ctx, task, "cancelled", None, "hospitalization_task_cancelled")


@router.get("/tasks/overdue-count")
def overdue_tasks_count(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
) -> dict:
    """Tareas atrasadas (pending con scheduled_at < ahora) en estancias activas."""
    now = datetime.now(UTC)
    stmt = (
        select(func.count())
        .select_from(HospitalizationTask)
        .join(
            Hospitalization,
            Hospitalization.id == HospitalizationTask.hospitalization_id,
        )
        .where(
            HospitalizationTask.clinic_id == ctx.clinic["id"],
            HospitalizationTask.status == "pending",
            HospitalizationTask.scheduled_at < now,
            Hospitalization.status.in_(ACTIVE_STATUSES),
        )
    )
    if branch_id:
        stmt = stmt.where(Hospitalization.branch_id == branch_id)
    return {"count": db.scalar(stmt) or 0}


# ---------------------------------------------------------------------------
# Signos vitales
# ---------------------------------------------------------------------------


@router.get("/{hosp_id}/vitals", response_model=list[HospitalizationVitalRead])
def list_vitals(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    parameter: str | None = Query(default=None, max_length=30),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[HospitalizationVital]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    stmt = (
        select(HospitalizationVital)
        .where(
            HospitalizationVital.clinic_id == ctx.clinic["id"],
            HospitalizationVital.hospitalization_id == row.id,
        )
        .order_by(HospitalizationVital.observed_at.desc())
        .limit(limit)
    )
    if parameter:
        stmt = stmt.where(HospitalizationVital.parameter == parameter)
    return list(db.scalars(stmt))


@router.get("/{hosp_id}/vitals/latest")
def latest_vitals(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    """Última medición de cada parámetro (para la cabecera/dashboard)."""
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    rows = (
        db.execute(
            text(
                "SELECT DISTINCT ON (parameter) parameter, value, unit, observed_at, "
                "observation, user_id FROM hospitalization_vitals "
                "WHERE clinic_id = :cid AND hospitalization_id = :hid "
                "ORDER BY parameter, observed_at DESC, id DESC"
            ),
            {"cid": ctx.clinic["id"], "hid": row.id},
        )
        .mappings()
        .all()
    )
    return {
        str(r["parameter"]): {
            "value": float(r["value"]) if r["value"] is not None else None,
            "unit": r["unit"],
            "observed_at": r["observed_at"].isoformat(),
            "observation": r["observation"],
            "user_id": str(r["user_id"]) if r["user_id"] else None,
        }
        for r in rows
    }


@router.post(
    "/{hosp_id}/vitals/batch",
    response_model=list[HospitalizationVitalRead],
    status_code=status.HTTP_201_CREATED,
)
def record_vitals_batch(
    hosp_id: str,
    body: VitalBatchCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> list[HospitalizationVital]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    observed_at = body.observed_at or datetime.now(UTC)
    created: list[HospitalizationVital] = []
    for m in body.measurements:
        vital = HospitalizationVital(
            clinic_id=ctx.clinic["id"],
            hospitalization_id=row.id,
            parameter=m.parameter,
            value=m.value,
            unit=m.unit,
            observed_at=observed_at,
            user_id=ctx.user.sub,
            observation=m.observation,
        )
        db.add(vital)
        created.append(vital)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="hospitalization_vitals_recorded",
        entity_type="hospitalization",
        entity_id=row.id,
        metadata={"parameters": [m.parameter for m in body.measurements]},
    )
    db.commit()
    for v in created:
        db.refresh(v)
    # La captura completa la próxima tarea de signos vitales (trazabilidad).
    hosp_service.complete_next_vitals_task(db, row.id, ctx.user.sub, observed_at)
    return created


# ---------------------------------------------------------------------------
# Medicamentos (integración con inventario)
# ---------------------------------------------------------------------------


@router.get("/{hosp_id}/medications")
def list_medications(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    orders = list(
        db.scalars(
            select(HospitalizationMedicationOrder)
            .where(
                HospitalizationMedicationOrder.clinic_id == ctx.clinic["id"],
                HospitalizationMedicationOrder.hospitalization_id == row.id,
            )
            .order_by(HospitalizationMedicationOrder.created_at)
        ).all()
    )
    order_ids = [o.id for o in orders]
    admins: dict = {}
    if order_ids:
        rows = db.scalars(
            select(HospitalizationMedicationAdministration)
            .where(
                HospitalizationMedicationAdministration.clinic_id == ctx.clinic["id"],
                HospitalizationMedicationAdministration.order_id.in_(order_ids),
            )
            .order_by(HospitalizationMedicationAdministration.scheduled_at)
        ).all()
        for a in rows:
            admins.setdefault(a.order_id, []).append(
                {
                    "id": str(a.id),
                    "scheduled_at": a.scheduled_at.isoformat(),
                    "status": a.status,
                    "administered_at": a.administered_at.isoformat() if a.administered_at else None,
                    "administered_by": str(a.administered_by) if a.administered_by else None,
                    "dose_actual": a.dose_actual,
                    "route_actual": a.route_actual,
                    "observation": a.observation,
                }
            )
    return [
        {
            "id": str(o.id),
            "name": o.name,
            "inventory_product_id": str(o.inventory_product_id) if o.inventory_product_id else None,
            "dose": o.dose,
            "unit": o.unit,
            "route": o.route,
            "interval_hours": o.interval_hours,
            "start_at": o.start_at.isoformat(),
            "end_at": o.end_at.isoformat() if o.end_at else None,
            "observations": o.observations,
            "vet_user_id": str(o.vet_user_id) if o.vet_user_id else None,
            "active": o.active,
            "administrations": admins.get(o.id, []),
        }
        for o in orders
    ]


@router.post(
    "/{hosp_id}/medications",
    response_model=MedicationOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_medication_order(
    hosp_id: str,
    body: MedicationOrderCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationMedicationOrder:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    if body.inventory_product_id:
        product = db.scalar(
            select(InventoryProduct.id).where(
                InventoryProduct.id == body.inventory_product_id,
                InventoryProduct.clinic_id == ctx.clinic["id"],
            )
        )
        if product is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Insumo no encontrado"
            )
    order = HospitalizationMedicationOrder(
        clinic_id=ctx.clinic["id"],
        branch_id=row.branch_id,
        hospitalization_id=row.id,
        inventory_product_id=body.inventory_product_id,
        name=body.name,
        dose=body.dose,
        unit=body.unit,
        route=body.route,
        interval_hours=body.interval_hours,
        start_at=body.start_at,
        end_at=body.end_at,
        observations=body.observations,
        vet_user_id=body.vet_user_id,
    )
    db.add(order)
    db.flush()

    # Genera las dosis programadas por intervalo (start_at → end_at | +48h).
    if body.interval_hours:
        end = body.end_at or (body.start_at + timedelta(hours=48))
        slot = body.start_at
        while slot <= end:
            db.add(
                HospitalizationMedicationAdministration(
                    clinic_id=ctx.clinic["id"],
                    order_id=order.id,
                    scheduled_at=slot,
                    status="pending",
                )
            )
            slot += timedelta(hours=body.interval_hours)

    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="hospitalization_medication_ordered",
        entity_type="hospitalization",
        entity_id=row.id,
        metadata={"medication": body.name},
    )
    db.commit()
    db.refresh(order)
    return order


@router.post(
    "/medications/orders/{order_id}/administrations",
    response_model=MedicationAdministrationRead,
    status_code=status.HTTP_201_CREATED,
)
def add_medication_administration(
    order_id: str,
    body: MedicationAdministrationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationMedicationAdministration:
    order = db.scalar(
        select(HospitalizationMedicationOrder).where(
            HospitalizationMedicationOrder.id == order_id,
            HospitalizationMedicationOrder.clinic_id == ctx.clinic["id"],
        )
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    admin = HospitalizationMedicationAdministration(
        clinic_id=ctx.clinic["id"],
        order_id=order.id,
        scheduled_at=body.scheduled_at,
        dose_actual=body.dose,
        route_actual=body.route,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _get_administration_or_404(
    db: Session, clinic_id, admin_id: str
) -> HospitalizationMedicationAdministration:
    admin = db.scalar(
        select(HospitalizationMedicationAdministration).where(
            HospitalizationMedicationAdministration.id == admin_id,
            HospitalizationMedicationAdministration.clinic_id == clinic_id,
        )
    )
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Administración no encontrada"
        )
    return admin


def _consume_inventory(
    db: Session, clinic_id, order: HospitalizationMedicationOrder, hospitalization_id
) -> None:
    """Consume stock del insumo vía movimientos de inventario (trazabilidad)."""
    if not order.inventory_product_id:
        return
    consumed = Decimal("1")
    for lot_id, qty in allocate_fifo(db, str(order.inventory_product_id), 1):
        db.add(
            InventoryMovement(
                product_id=order.inventory_product_id,
                lot_id=lot_id,
                quantity_delta=-Decimal(str(qty)),
                reason="hospitalization",
                reference_id=hospitalization_id,
                created_by=None,
            )
        )
        consumed -= Decimal(str(qty))
    if consumed > 0:
        db.add(
            InventoryMovement(
                product_id=order.inventory_product_id,
                quantity_delta=-consumed,
                reason="hospitalization",
                reference_id=hospitalization_id,
            )
        )


@router.post(
    "/medications/administrations/{admin_id}/administer",
    response_model=MedicationAdministrationRead,
)
def administer_medication(
    admin_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationMedicationAdministration:
    admin = _get_administration_or_404(db, ctx.clinic["id"], admin_id)
    if admin.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La administración ya está {admin.status}.",
        )
    order = db.scalar(
        select(HospitalizationMedicationOrder).where(
            HospitalizationMedicationOrder.id == admin.order_id,
            HospitalizationMedicationOrder.clinic_id == ctx.clinic["id"],
        )
    )
    admin.status = "administered"
    admin.administered_at = datetime.now(UTC)
    admin.administered_by = ctx.user.sub
    db.flush()
    if order is not None:
        _consume_inventory(db, ctx.clinic["id"], order, order.hospitalization_id)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="hospitalization_medication_administered",
        entity_type="hospitalization_medication_administration",
        entity_id=admin.id,
        metadata={"order_id": str(admin.order_id)},
    )
    db.commit()
    db.refresh(admin)
    return admin


def _finish_administration(db: Session, ctx, admin_id: str, status_value: str, action: str):
    admin = _get_administration_or_404(db, ctx.clinic["id"], admin_id)
    if admin.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La administración ya está {admin.status}.",
        )
    admin.status = status_value
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action=action,
        entity_type="hospitalization_medication_administration",
        entity_id=admin.id,
        metadata={"status": status_value},
    )
    db.commit()
    db.refresh(admin)
    return admin


@router.post(
    "/medications/administrations/{admin_id}/skip", response_model=MedicationAdministrationRead
)
def skip_medication(
    admin_id: str, ctx=Depends(require_clinic_roles(*MUTATORS)), db=Depends(get_db)
):
    return _finish_administration(
        db, ctx, admin_id, "skipped", "hospitalization_medication_skipped"
    )


@router.post(
    "/medications/administrations/{admin_id}/refuse", response_model=MedicationAdministrationRead
)
def refuse_medication(
    admin_id: str, ctx=Depends(require_clinic_roles(*MUTATORS)), db=Depends(get_db)
):
    return _finish_administration(
        db, ctx, admin_id, "refused", "hospitalization_medication_refused"
    )


@router.post(
    "/medications/administrations/{admin_id}/cancel", response_model=MedicationAdministrationRead
)
def cancel_medication(
    admin_id: str, ctx=Depends(require_clinic_roles(*MUTATORS)), db=Depends(get_db)
):
    return _finish_administration(
        db, ctx, admin_id, "cancelled", "hospitalization_medication_cancelled"
    )


# ---------------------------------------------------------------------------
# Cuidados: alimentación, fluidoterapia, eliminación y dolor
# ---------------------------------------------------------------------------

from app.models import (  # noqa: E402
    HospitalizationElimination,
    HospitalizationFeed,
    HospitalizationFluid,
    HospitalizationPainScore,
)
from app.schemas.hospitalization import (  # noqa: E402
    EliminationCreate,
    EliminationRead,
    FeedCreate,
    FeedRead,
    FluidCreate,
    FluidRead,
    PainCreate,
    PainRead,
)


def _record_entity(db, ctx, entity_id, action, entity_type, metadata=None):
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata,
    )


@router.post("/{hosp_id}/feeds", response_model=FeedRead, status_code=status.HTTP_201_CREATED)
def create_feed(
    hosp_id: str,
    body: FeedCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationFeed:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    feed = HospitalizationFeed(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        **body.model_dump(exclude={"offered_at"}),
    )
    if body.offered_at:
        feed.offered_at = body.offered_at
    db.add(feed)
    db.flush()
    _record_entity(db, ctx, feed.id, "hospitalization_feed_recorded", "hospitalization_feed")
    db.commit()
    db.refresh(feed)
    return feed


@router.get("/{hosp_id}/feeds", response_model=list[FeedRead])
def list_feeds(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationFeed]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationFeed)
            .where(
                HospitalizationFeed.clinic_id == ctx.clinic["id"],
                HospitalizationFeed.hospitalization_id == row.id,
            )
            .order_by(HospitalizationFeed.offered_at.desc())
        ).all()
    )


@router.post("/{hosp_id}/fluids", response_model=FluidRead, status_code=status.HTTP_201_CREATED)
def create_fluid(
    hosp_id: str,
    body: FluidCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationFluid:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    fluid = HospitalizationFluid(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        **body.model_dump(),
    )
    db.add(fluid)
    db.flush()
    _record_entity(db, ctx, fluid.id, "hospitalization_fluid_started", "hospitalization_fluid")
    db.commit()
    db.refresh(fluid)
    return fluid


@router.get("/{hosp_id}/fluids", response_model=list[FluidRead])
def list_fluids(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationFluid]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationFluid)
            .where(
                HospitalizationFluid.clinic_id == ctx.clinic["id"],
                HospitalizationFluid.hospitalization_id == row.id,
            )
            .order_by(HospitalizationFluid.started_at.desc())
        ).all()
    )


@router.post("/fluids/{fluid_id}/stop", response_model=FluidRead)
def stop_fluid(
    fluid_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationFluid:
    fluid = db.scalar(
        select(HospitalizationFluid).where(
            HospitalizationFluid.id == fluid_id,
            HospitalizationFluid.clinic_id == ctx.clinic["id"],
        )
    )
    if fluid is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fluidoterapia no encontrada"
        )
    fluid.ended_at = datetime.now(UTC)
    db.commit()
    db.refresh(fluid)
    return fluid


@router.post(
    "/{hosp_id}/eliminations", response_model=EliminationRead, status_code=status.HTTP_201_CREATED
)
def create_elimination(
    hosp_id: str,
    body: EliminationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationElimination:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    elim = HospitalizationElimination(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        **body.model_dump(exclude={"observed_at"}),
    )
    if body.observed_at:
        elim.observed_at = body.observed_at
    db.add(elim)
    db.flush()
    _record_entity(
        db, ctx, elim.id, "hospitalization_elimination_recorded", "hospitalization_elimination"
    )
    db.commit()
    db.refresh(elim)
    return elim


@router.get("/{hosp_id}/eliminations", response_model=list[EliminationRead])
def list_eliminations(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationElimination]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationElimination)
            .where(
                HospitalizationElimination.clinic_id == ctx.clinic["id"],
                HospitalizationElimination.hospitalization_id == row.id,
            )
            .order_by(HospitalizationElimination.observed_at.desc())
        ).all()
    )


@router.post("/{hosp_id}/pain", response_model=PainRead, status_code=status.HTTP_201_CREATED)
def create_pain_score(
    hosp_id: str,
    body: PainCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationPainScore:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    pain = HospitalizationPainScore(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        **body.model_dump(exclude={"observed_at"}),
    )
    if body.observed_at:
        pain.observed_at = body.observed_at
    db.add(pain)
    db.flush()
    _record_entity(db, ctx, pain.id, "hospitalization_pain_recorded", "hospitalization_pain")
    db.commit()
    db.refresh(pain)
    return pain


@router.get("/{hosp_id}/pain", response_model=list[PainRead])
def list_pain_scores(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationPainScore]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationPainScore)
            .where(
                HospitalizationPainScore.clinic_id == ctx.clinic["id"],
                HospitalizationPainScore.hospitalization_id == row.id,
            )
            .order_by(HospitalizationPainScore.observed_at.desc())
        ).all()
    )


# ---------------------------------------------------------------------------
# Evolución: notas, incidencias, fotos y timeline
# ---------------------------------------------------------------------------

from fastapi import File, Form, UploadFile  # noqa: E402

from app.core.images import process_cartilla_photo  # noqa: E402
from app.core.storage import (  # noqa: E402
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.models import (  # noqa: E402
    HospitalizationIncident,
    HospitalizationNote,
    HospitalizationPhoto,
    HospitalizationShift,
)
from app.schemas.hospitalization import (  # noqa: E402
    HospitalizationPhotoRead,
    IncidentCreate,
    IncidentRead,
    NoteCreate,
    NoteRead,
)

MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/{hosp_id}/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(
    hosp_id: str,
    body: NoteCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationNote:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    note = HospitalizationNote(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        **body.model_dump(),
    )
    db.add(note)
    db.flush()
    _record_entity(db, ctx, note.id, "hospitalization_note_created", "hospitalization_note")
    db.commit()
    db.refresh(note)
    return note


@router.get("/{hosp_id}/notes", response_model=list[NoteRead])
def list_notes(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationNote]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationNote)
            .where(
                HospitalizationNote.clinic_id == ctx.clinic["id"],
                HospitalizationNote.hospitalization_id == row.id,
            )
            .order_by(HospitalizationNote.created_at.desc())
        ).all()
    )


@router.post(
    "/{hosp_id}/incidents", response_model=IncidentRead, status_code=status.HTTP_201_CREATED
)
def create_incident(
    hosp_id: str,
    body: IncidentCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationIncident:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    incident = HospitalizationIncident(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        **body.model_dump(exclude={"observed_at"}),
    )
    if body.observed_at:
        incident.observed_at = body.observed_at
    db.add(incident)
    db.flush()
    _record_entity(
        db, ctx, incident.id, "hospitalization_incident_created", "hospitalization_incident"
    )
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/{hosp_id}/incidents", response_model=list[IncidentRead])
def list_incidents(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationIncident]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationIncident)
            .where(
                HospitalizationIncident.clinic_id == ctx.clinic["id"],
                HospitalizationIncident.hospitalization_id == row.id,
            )
            .order_by(HospitalizationIncident.observed_at.desc())
        ).all()
    )


@router.post(
    "/{hosp_id}/photos",
    response_model=HospitalizationPhotoRead,
    status_code=status.HTTP_201_CREATED,
)
def upload_hospitalization_photo(
    hosp_id: str,
    file: UploadFile = File(...),
    label: str | None = Form(default=None),
    category: str | None = Form(default=None),
    description: str | None = Form(default=None),
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationPhoto:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
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
    rel = save_media(f"hospitalizations/{row.id}", "foto.jpg", processed)
    photo = HospitalizationPhoto(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        url=public_url(rel),
        label=label,
        category=category,
        description=description,
        user_id=ctx.user.sub,
    )
    db.add(photo)
    db.flush()
    _record_entity(db, ctx, photo.id, "hospitalization_photo_uploaded", "hospitalization_photo")
    db.commit()
    db.refresh(photo)
    return photo


@router.get("/{hosp_id}/photos", response_model=list[HospitalizationPhotoRead])
def list_photos(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[HospitalizationPhoto]:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    return list(
        db.scalars(
            select(HospitalizationPhoto)
            .where(
                HospitalizationPhoto.clinic_id == ctx.clinic["id"],
                HospitalizationPhoto.hospitalization_id == row.id,
            )
            .order_by(HospitalizationPhoto.taken_at.desc())
        ).all()
    )


@router.get("/{hosp_id}/timeline")
def hospitalization_timeline(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Timeline cronológica (desc) que mezcla toda la actividad de la estancia."""
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    cid = ctx.clinic["id"]
    events: list[dict] = []

    for v in db.scalars(
        select(HospitalizationVital).where(
            HospitalizationVital.clinic_id == cid, HospitalizationVital.hospitalization_id == row.id
        )
    ).all():
        events.append(
            {
                "type": "vitals",
                "at": v.observed_at,
                "title": "Signos vitales",
                "description": (
                    f"{VITAL_LABELS.get(v.parameter, v.parameter)}: {v.value} {v.unit or ''}"
                ).strip(),
                "user_id": v.user_id,
            }
        )

    for f in db.scalars(
        select(HospitalizationFeed).where(
            HospitalizationFeed.clinic_id == cid, HospitalizationFeed.hospitalization_id == row.id
        )
    ).all():
        events.append(
            {
                "type": "feeding",
                "at": f.offered_at,
                "title": "Alimentación",
                "description": (
                    f"{f.diet} · ofrecido {f.amount_offered} {f.unit or ''} · "
                    f"consumido {f.amount_consumed or 0} {f.unit or ''}"
                ).strip(),
                "user_id": f.user_id,
            }
        )

    for e in db.scalars(
        select(HospitalizationElimination).where(
            HospitalizationElimination.clinic_id == cid,
            HospitalizationElimination.hospitalization_id == row.id,
        )
    ).all():
        events.append(
            {
                "type": "elimination",
                "at": e.observed_at,
                "title": f"Eliminación · {e.kind}",
                "description": e.quantity or e.consistency or "Registrado",
                "user_id": e.user_id,
            }
        )

    for p in db.scalars(
        select(HospitalizationPainScore).where(
            HospitalizationPainScore.clinic_id == cid,
            HospitalizationPainScore.hospitalization_id == row.id,
        )
    ).all():
        events.append(
            {
                "type": "pain",
                "at": p.observed_at,
                "title": "Dolor",
                "description": f"Puntuación {p.score}/10" + (f" · {p.scale}" if p.scale else ""),
                "user_id": p.user_id,
            }
        )

    for n in db.scalars(
        select(HospitalizationNote).where(
            HospitalizationNote.clinic_id == cid, HospitalizationNote.hospitalization_id == row.id
        )
    ).all():
        events.append(
            {
                "type": f"note:{n.category}",
                "at": n.created_at,
                "title": f"Nota · {NOTE_CATEGORY_LABELS.get(n.category, n.category)}",
                "description": n.text,
                "user_id": n.user_id,
            }
        )

    for inc in db.scalars(
        select(HospitalizationIncident).where(
            HospitalizationIncident.clinic_id == cid,
            HospitalizationIncident.hospitalization_id == row.id,
        )
    ).all():
        events.append(
            {
                "type": "incident",
                "at": inc.observed_at,
                "title": f"Incidencia · {inc.severity}",
                "description": inc.description
                + (f" · Acciones: {inc.actions_taken}" if inc.actions_taken else ""),
                "user_id": inc.user_id,
            }
        )

    for ph in db.scalars(
        select(HospitalizationPhoto).where(
            HospitalizationPhoto.clinic_id == cid, HospitalizationPhoto.hospitalization_id == row.id
        )
    ).all():
        events.append(
            {
                "type": "photo",
                "at": ph.taken_at,
                "title": "Fotografía" + (f" · {ph.label}" if ph.label else ""),
                "description": ph.description or "",
                "user_id": ph.user_id,
                "photo_url": ph.url,
            }
        )

    for a in db.scalars(
        select(HospitalizationMedicationAdministration)
        .join(
            HospitalizationMedicationOrder,
            HospitalizationMedicationOrder.id == HospitalizationMedicationAdministration.order_id,
        )
        .where(
            HospitalizationMedicationAdministration.clinic_id == cid,
            HospitalizationMedicationOrder.hospitalization_id == row.id,
            HospitalizationMedicationAdministration.status.in_(
                ("administered", "skipped", "refused")
            ),
        )
    ).all():
        events.append(
            {
                "type": "medication",
                "at": a.administered_at or a.scheduled_at,
                "title": f"Medicación · {a.status}",
                "description": f"{a.dose_actual or ''} {a.route_actual or ''}".strip() or "Dosis",
                "user_id": a.administered_by,
            }
        )

    events.sort(key=lambda e: e["at"], reverse=True)
    for e in events:
        e["at"] = e["at"].isoformat()
        e["user_id"] = str(e["user_id"]) if e["user_id"] else None
    return events


VITAL_LABELS = {
    "temperature": "Temperatura",
    "heart_rate": "Frec. cardíaca",
    "respiratory_rate": "Frec. respiratoria",
    "weight": "Peso",
    "spo2": "SpO2",
    "blood_pressure": "Presión arterial",
    "glucose": "Glucosa",
    "pain": "Dolor",
}

NOTE_CATEGORY_LABELS = {
    "evolution": "Evolución",
    "incident": "Incidencia",
    "review": "Revisión",
    "procedure": "Procedimiento",
    "communication": "Comunicación",
    "other": "Otra",
}


# ---------------------------------------------------------------------------
# Cambio de turno
# ---------------------------------------------------------------------------


def _shift_summary(db: Session, clinic_id, branch_id: str | None) -> dict:
    base = [Hospitalization.clinic_id == clinic_id, Hospitalization.status.in_(ACTIVE_STATUSES)]
    if branch_id:
        base.append(Hospitalization.branch_id == branch_id)
    hosps = list(db.scalars(select(Hospitalization).where(*base)).all())
    if not hosps:
        return {"rows": [], "counts": {"patients": 0, "overdue": 0, "pending_meds": 0}}

    hosp_ids = [h.id for h in hosps]
    pet_ids = list({h.pet_id for h in hosps})
    pets = {
        p.id: p
        for p in db.scalars(
            select(Pet).where(Pet.clinic_id == clinic_id, Pet.id.in_(pet_ids))
        ).all()
    }
    accs = {}
    acc_ids = [h.accommodation_id for h in hosps if h.accommodation_id]
    if acc_ids:
        accs = {
            a.id: a
            for a in db.scalars(
                select(HospitalizationAccommodation).where(
                    HospitalizationAccommodation.id.in_(acc_ids)
                )
            ).all()
        }

    last_vitals = dict(
        db.execute(
            select(
                HospitalizationVital.hospitalization_id, func.max(HospitalizationVital.observed_at)
            )
            .where(HospitalizationVital.hospitalization_id.in_(hosp_ids))
            .group_by(HospitalizationVital.hospitalization_id)
        ).all()
    )
    next_task = dict(
        db.execute(
            select(
                HospitalizationTask.hospitalization_id, func.min(HospitalizationTask.scheduled_at)
            )
            .where(
                HospitalizationTask.hospitalization_id.in_(hosp_ids),
                HospitalizationTask.status == "pending",
            )
            .group_by(HospitalizationTask.hospitalization_id)
        ).all()
    )
    now = datetime.now(UTC)
    overdue = dict(
        db.execute(
            select(HospitalizationTask.hospitalization_id, func.count())
            .where(
                HospitalizationTask.hospitalization_id.in_(hosp_ids),
                HospitalizationTask.status == "pending",
                HospitalizationTask.scheduled_at < now,
            )
            .group_by(HospitalizationTask.hospitalization_id)
        ).all()
    )
    pending_meds = dict(
        db.execute(
            select(HospitalizationMedicationOrder.hospitalization_id, func.count())
            .select_from(HospitalizationMedicationAdministration)
            .join(
                HospitalizationMedicationOrder,
                HospitalizationMedicationOrder.id
                == HospitalizationMedicationAdministration.order_id,
            )
            .where(
                HospitalizationMedicationOrder.hospitalization_id.in_(hosp_ids),
                HospitalizationMedicationAdministration.status == "pending",
            )
            .group_by(HospitalizationMedicationOrder.hospitalization_id)
        ).all()
    )
    incidents = dict(
        db.execute(
            select(HospitalizationIncident.hospitalization_id, func.count())
            .where(
                HospitalizationIncident.hospitalization_id.in_(hosp_ids),
                HospitalizationIncident.observed_at >= now - timedelta(hours=24),
            )
            .group_by(HospitalizationIncident.hospitalization_id)
        ).all()
    )

    rows = []
    for h in hosps:
        pet = pets.get(h.pet_id)
        rows.append(
            {
                "hospitalization_id": str(h.id),
                "pet_id": str(h.pet_id),
                "pet_name": pet.name if pet else "—",
                "status": h.status,
                "operational_status": h.operational_status,
                "isolation_status": h.isolation_status,
                "accommodation": accs.get(h.accommodation_id).code
                if h.accommodation_id and accs.get(h.accommodation_id)
                else None,
                "last_vitals_at": last_vitals.get(h.id).isoformat()
                if last_vitals.get(h.id)
                else None,
                "next_task_at": next_task.get(h.id).isoformat() if next_task.get(h.id) else None,
                "overdue_count": overdue.get(h.id, 0),
                "pending_meds": pending_meds.get(h.id, 0),
                "incidents_24h": incidents.get(h.id, 0),
            }
        )

    return {
        "rows": rows,
        "counts": {
            "patients": len(rows),
            "overdue": sum(r["overdue_count"] for r in rows),
            "pending_meds": sum(r["pending_meds"] for r in rows),
        },
    }


@router.get("/shifts/current")
def current_shift(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
) -> dict:
    shift = db.scalar(
        select(HospitalizationShift)
        .where(
            HospitalizationShift.clinic_id == ctx.clinic["id"],
            HospitalizationShift.ended_at.is_(None),
        )
        .order_by(HospitalizationShift.started_at.desc())
        .limit(1)
    )
    return {
        "shift": (
            {
                "id": str(shift.id),
                "user_id": str(shift.user_id) if shift.user_id else None,
                "started_at": shift.started_at.isoformat(),
                "handover_note": shift.handover_note,
            }
            if shift
            else None
        ),
        "summary": _shift_summary(db, ctx.clinic["id"], branch_id),
    }


@router.post("/shifts/start", status_code=status.HTTP_201_CREATED)
def start_shift(
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.scalar(
        select(HospitalizationShift)
        .where(
            HospitalizationShift.clinic_id == ctx.clinic["id"],
            HospitalizationShift.ended_at.is_(None),
        )
        .limit(1)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay un turno abierto para esta clínica.",
        )
    shift = HospitalizationShift(clinic_id=ctx.clinic["id"], user_id=ctx.user.sub)
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return {"id": str(shift.id), "started_at": shift.started_at.isoformat()}


@router.post("/shifts/{shift_id}/complete")
def complete_shift(
    shift_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
    handover_note: str | None = None,
) -> dict:
    shift = db.scalar(
        select(HospitalizationShift).where(
            HospitalizationShift.id == shift_id,
            HospitalizationShift.clinic_id == ctx.clinic["id"],
        )
    )
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turno no encontrado")
    shift.ended_at = datetime.now(UTC)
    shift.handover_note = handover_note
    _record_entity(db, ctx, shift.id, "hospitalization_shift_completed", "hospitalization_shift")
    db.commit()
    return {"id": str(shift.id), "ended_at": shift.ended_at.isoformat()}


@router.get("/shifts")
def list_shifts(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[dict]:
    shifts = db.scalars(
        select(HospitalizationShift)
        .where(HospitalizationShift.clinic_id == ctx.clinic["id"])
        .order_by(HospitalizationShift.started_at.desc())
        .limit(limit)
    ).all()
    user_ids = [s.user_id for s in shifts if s.user_id]
    names = {}
    if user_ids:
        names = {
            u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()
        }
    return [
        {
            "id": str(s.id),
            "user_id": str(s.user_id) if s.user_id else None,
            "user_name": names.get(s.user_id),
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "handover_note": s.handover_note,
        }
        for s in shifts
    ]


# ---------------------------------------------------------------------------
# Costos (estancia configurable + facturación existente)
# ---------------------------------------------------------------------------


@router.get("/{hosp_id}/costs")
def hospitalization_costs(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    acc_type = None
    if row.accommodation_id:
        acc = _get_accommodation_or_404(db, ctx.clinic["id"], str(row.accommodation_id))
        acc_type = acc.type

    stay = hosp_service.compute_stay_cost(
        db,
        ctx.clinic["id"],
        row.admitted_at,
        row.actual_discharge_at,
        acc_type,
        row.monitoring_level,
    )

    billed = dict(
        db.execute(
            text(
                "SELECT CASE WHEN ii.service_id IS NOT NULL THEN 'servicios' "
                "              WHEN ii.product_id IS NOT NULL THEN 'productos' "
                "              ELSE 'otros' END AS category, "
                "       SUM(ii.quantity * ii.unit_price "
                "           * (1 - ii.discount_percent / 100.0)) AS total "
                "FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id "
                "WHERE inv.clinic_id = :cid AND inv.pet_id = :pet AND inv.status = 'paid' "
                "  AND inv.created_at >= :admitted "
                "GROUP BY 1"
            ),
            {"cid": ctx.clinic["id"], "pet": row.pet_id, "admitted": row.admitted_at},
        ).all()
    )

    breakdown = {
        "hospitalizacion": float(stay["total"]),
        "servicios": float(billed.get("servicios", 0) or 0),
        "productos": float(billed.get("productos", 0) or 0),
        "otros": float(billed.get("otros", 0) or 0),
    }
    return {
        "stay": stay,
        "breakdown": breakdown,
        "total": round(sum(breakdown.values()), 2),
    }


@router.get("/config/stay")
def get_stay_config(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    return {
        "stay_prices": hosp_service.get_config(
            db, ctx.clinic["id"], "stay_prices", hosp_service.STAY_PRICE_DEFAULTS
        ),
        "monitoring_surcharge": hosp_service.get_config(
            db, ctx.clinic["id"], "monitoring_surcharge", hosp_service.MONITORING_SURCHARGE_DEFAULTS
        ),
        "monitoring_intervals": hosp_service.get_config(
            db, ctx.clinic["id"], "monitoring_intervals", hosp_service.MONITORING_INTERVAL_MINUTES
        ),
        "discharge_checklist": hosp_service.get_config(
            db, ctx.clinic["id"], "discharge_checklist", {}
        ),
    }


@router.put("/config/stay")
def update_stay_config(
    body: dict,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    from app.models import HospitalizationConfig

    allowed = {"stay_prices", "monitoring_surcharge", "monitoring_intervals", "discharge_checklist"}
    for key, value in body.items():
        if key not in allowed:
            continue
        row = db.scalar(
            select(HospitalizationConfig).where(
                HospitalizationConfig.clinic_id == ctx.clinic["id"],
                HospitalizationConfig.key == key,
            )
        )
        if row is None:
            db.add(HospitalizationConfig(clinic_id=ctx.clinic["id"], key=key, value=value))
        else:
            row.value = value
    db.commit()
    return get_stay_config(ctx, db)


# ---------------------------------------------------------------------------
# Alta formal + resumen + seguimiento
# ---------------------------------------------------------------------------

from app.models import Appointment, HospitalizationDischarge  # noqa: E402
from app.schemas.hospitalization import DischargeCreate, DischargeRead  # noqa: E402

DEFAULT_DISCHARGE_CHECKLIST = [
    "Medicamentos entregados",
    "Instrucciones entregadas",
    "Documentos completados",
    "Factura revisada",
    "Propietario informado",
    "Cita de seguimiento",
    "Paciente entregado",
]


@router.get("/{hosp_id}/discharge", response_model=DischargeRead | None)
def get_discharge(
    hosp_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
):
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    discharge = db.scalar(
        select(HospitalizationDischarge).where(
            HospitalizationDischarge.clinic_id == ctx.clinic["id"],
            HospitalizationDischarge.hospitalization_id == row.id,
        )
    )
    return discharge


@router.get("/discharge-checklist/default")
def default_discharge_checklist(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    saved = hosp_service.get_config(db, ctx.clinic["id"], "discharge_checklist", {})
    items = saved.get("items") or DEFAULT_DISCHARGE_CHECKLIST
    return {"items": items}


@router.post(
    "/{hosp_id}/discharge",
    response_model=DischargeRead,
    status_code=status.HTTP_201_CREATED,
)
def discharge_hospitalization(
    hosp_id: str,
    body: DischargeCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*MUTATORS)),
    db: Session = Depends(get_db),
) -> HospitalizationDischarge:
    row = _get_hospitalization_or_404(db, ctx.clinic["id"], hosp_id)
    if row.status not in ("active", "admitted", "discharge_pending"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede dar de alta una estancia en estado '{row.status}'.",
        )

    discharge = HospitalizationDischarge(
        clinic_id=ctx.clinic["id"],
        hospitalization_id=row.id,
        user_id=ctx.user.sub,
        reason=body.reason,
        summary=body.summary,
        checklist=[c.model_dump() for c in body.checklist],
        follow_up_date=body.follow_up_date,
        follow_up_reason=body.follow_up_reason,
        follow_up_vet_user_id=body.follow_up_vet_user_id,
    )
    db.add(discharge)

    # Cita de seguimiento post-alta (integración con Agenda).
    if body.follow_up_date is not None:
        start = datetime.combine(body.follow_up_date, time(10, 0), tzinfo=UTC)
        db.add(
            Appointment(
                clinic_id=ctx.clinic["id"],
                branch_id=row.branch_id,
                pet_id=row.pet_id,
                vet_user_id=body.follow_up_vet_user_id,
                procedure_type="Seguimiento post-alta",
                start_time=start,
                end_time=start + timedelta(minutes=30),
                status="scheduled",
            )
        )

    row.status = "discharged"
    row.actual_discharge_at = datetime.now(UTC)
    row.accommodation_id = None
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="hospitalization_discharged",
        entity_type="hospitalization",
        entity_id=row.id,
        metadata={"follow_up": str(body.follow_up_date) if body.follow_up_date else None},
    )
    db.commit()
    db.refresh(discharge)
    return discharge


@router.get("/vitals/latest-all")
def latest_all_vitals(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    branch_id: str | None = Query(default=None),
) -> dict:
    """Última medición por parámetro de cada estancia activa (para el 3D)."""
    base = [
        Hospitalization.clinic_id == ctx.clinic["id"],
        Hospitalization.status.in_(ACTIVE_STATUSES),
    ]
    if branch_id:
        base.append(Hospitalization.branch_id == branch_id)
    hosp_ids = list(db.scalars(select(Hospitalization.id).where(*base)).all())
    if not hosp_ids:
        return {}
    rows = db.execute(
        text(
            "SELECT DISTINCT ON (hospitalization_id, parameter) "
            "  hospitalization_id, parameter, value, unit, observed_at "
            "FROM hospitalization_vitals "
            "WHERE clinic_id = :cid AND hospitalization_id = ANY(:ids) "
            "ORDER BY hospitalization_id, parameter, observed_at DESC, id DESC"
        ),
        {"cid": ctx.clinic["id"], "ids": list(hosp_ids)},
    ).mappings().all()
    out: dict = {}
    for r in rows:
        out.setdefault(str(r["hospitalization_id"]), {})[r["parameter"]] = {
            "value": float(r["value"]) if r["value"] is not None else None,
            "unit": r["unit"],
            "observed_at": r["observed_at"].isoformat(),
        }
    return out
