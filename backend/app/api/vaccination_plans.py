"""Planes de vacunación y programación automática de citas.

El admin define planes (nombre, compuesto activo y una lista de dosis con su
intervalo). Al asignar un plan a una mascota se generan TODAS las dosis de
golpe y una cita por dosis en la agenda (agenda de vacunación automática).
"""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.core.events import record_audit
from app.core.seed_vaccination_plans import ensure_standard_plans
from app.db.session import get_db
from app.models import (
    Appointment,
    ClinicBranch,
    Pet,
    PetVaccinationDose,
    PetVaccinationPlan,
    User,
    VaccinationPlan,
    VaccinationPlanStep,
)
from app.schemas.vaccination import (
    DoseRead,
    DoseUpdate,
    PetVaccinationPlanRead,
    VaccinationAssignRequest,
    VaccinationPlanCreate,
    VaccinationPlanRead,
    VaccinationPlanUpdate,
)
from app.services.carnet import sync_dose_to_carnet, unsync_dose_from_carnet

router = APIRouter(
    prefix="/vaccination-plans",
    tags=["vaccination-plans"],
    dependencies=[Depends(require_component("vaccination_plans"))],
)

PLAN_MUTATORS = ("admin",)
ASSIGN_MUTATORS = ("admin", "veterinario")


def _with_steps(db: Session, plans: Sequence[VaccinationPlan]) -> list[dict]:
    return [VaccinationPlanRead.model_validate(p).model_dump() for p in plans]


def _get_plan_or_404(db: Session, clinic_id: str, plan_id: str) -> VaccinationPlan:
    plan = db.scalar(
        select(VaccinationPlan)
        .options(selectinload(VaccinationPlan.steps))
        .where(VaccinationPlan.id == plan_id, VaccinationPlan.clinic_id == clinic_id)
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan no encontrado")
    return plan


def _get_pet_vaccination_plan(
    db: Session, clinic_id: str, assignment_id: str
) -> PetVaccinationPlan:
    row = db.scalar(
        select(PetVaccinationPlan)
        .options(selectinload(PetVaccinationPlan.doses))
        .where(
            PetVaccinationPlan.id == assignment_id,
            PetVaccinationPlan.clinic_id == clinic_id,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asignación de plan no encontrada",
        )
    return row


def _enrich_assignment(db: Session, assignment: PetVaccinationPlan) -> dict:
    data = PetVaccinationPlanRead.model_validate(assignment).model_dump()
    plan = db.scalar(select(VaccinationPlan).where(VaccinationPlan.id == assignment.plan_id))
    branch = db.scalar(select(ClinicBranch).where(ClinicBranch.id == assignment.branch_id))
    vet = None
    if assignment.vet_user_id:
        vet = db.scalar(select(User).where(User.id == assignment.vet_user_id))
    data.update(
        plan_name=plan.name if plan else None,
        compound=plan.compound if plan else None,
        prevents=plan.prevents if plan else None,
        branch_name=branch.name if branch else None,
        vet_name=vet.full_name if vet else None,
    )
    if plan is not None:
        steps_rows = db.scalars(
            select(VaccinationPlanStep)
            .where(VaccinationPlanStep.plan_id == plan.id)
            .order_by(VaccinationPlanStep.position)
        ).all()
        data["steps"] = [
            {
                "id": str(s.id),
                "label": s.label,
                "offset_days": s.offset_days,
                "position": s.position,
            }
            for s in steps_rows
        ]
    dose_ids = [d.id for d in assignment.doses]
    starts = (
        dict(
            db.execute(
                select(PetVaccinationDose.id, Appointment.start_time).join(
                    Appointment,
                    Appointment.id == PetVaccinationDose.appointment_id,
                ).where(PetVaccinationDose.id.in_(dose_ids))
            ).all()
        )
        if dose_ids
        else {}
    )
    doses = data["doses"]
    for dose in doses:
        dose["appointment_start"] = starts.get(dose["id"])
    return data


@router.get("", response_model=list[VaccinationPlanRead])
def list_plans(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    active_only: bool = Query(default=False),
    species: str | None = Query(default=None, max_length=50),
) -> list[dict]:
    ensure_standard_plans(db, ctx.clinic["id"])
    stmt = (
        select(VaccinationPlan)
        .options(selectinload(VaccinationPlan.steps))
        .where(VaccinationPlan.clinic_id == ctx.clinic["id"])
    )
    if active_only:
        stmt = stmt.where(VaccinationPlan.active.is_(True))
    if species:
        stmt = stmt.where(VaccinationPlan.species == species)
    stmt = stmt.order_by(VaccinationPlan.species, VaccinationPlan.name)
    return _with_steps(db, list(db.scalars(stmt)))


@router.get("/{plan_id}", response_model=VaccinationPlanRead)
def get_plan(
    plan_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    plan = _get_plan_or_404(db, ctx.clinic["id"], plan_id)
    return _with_steps(db, [plan])[0]


@router.post("", response_model=VaccinationPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    body: VaccinationPlanCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PLAN_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    plan = VaccinationPlan(
        clinic_id=ctx.clinic["id"],
        name=body.name,
        compound=body.compound,
        species=body.species,
        brand=body.brand,
        prevents=body.prevents,
        notes=body.notes,
        active=body.active,
    )
    for i, step in enumerate(body.steps):
        plan.steps.append(
            VaccinationPlanStep(label=step.label, offset_days=step.offset_days, position=i)
        )
    db.add(plan)
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="plan_created",
        entity_type="vaccination_plan",
        entity_id=plan.id,
    )
    db.commit()
    return _with_steps(db, [_get_plan_or_404(db, ctx.clinic["id"], str(plan.id))])[0]


@router.patch("/{plan_id}", response_model=VaccinationPlanRead)
def update_plan(
    plan_id: str,
    body: VaccinationPlanUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PLAN_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    plan = _get_plan_or_404(db, ctx.clinic["id"], plan_id)
    data = body.model_dump(exclude_unset=True)
    steps = data.pop("steps", None)
    for field, value in data.items():
        setattr(plan, field, value)
    if steps is not None:
        plan.steps.clear()
        for i, step in enumerate(steps):
            plan.steps.append(
                VaccinationPlanStep(
                    label=step["label"], offset_days=step["offset_days"], position=i
                )
            )
    db.flush()
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="plan_updated",
        entity_type="vaccination_plan",
        entity_id=plan.id,
        metadata={"fields": list(data.keys())},
    )
    db.commit()
    return _with_steps(db, [_get_plan_or_404(db, ctx.clinic["id"], plan_id)])[0]


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*PLAN_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    plan = _get_plan_or_404(db, ctx.clinic["id"], plan_id)
    has_assignments = (
        db.scalar(
            select(func.count())
            .select_from(PetVaccinationPlan)
            .where(PetVaccinationPlan.plan_id == plan.id)
        )
        or 0
    )
    if has_assignments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede borrar: el plan está asignado a mascotas. Desasigna primero.",
        )
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="plan_deleted",
        entity_type="vaccination_plan",
        entity_id=plan.id,
    )
    db.delete(plan)
    db.commit()


@router.post("/assign", response_model=PetVaccinationPlanRead, status_code=status.HTTP_201_CREATED)
def assign_plan(
    body: VaccinationAssignRequest,
    ctx: CurrentClinic = Depends(require_clinic_roles(*ASSIGN_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    clinic_id = ctx.clinic["id"]
    pet = db.scalar(select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    plan = _get_plan_or_404(db, clinic_id, str(body.plan_id))
    if not plan.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El plan está inactivo")
    if not plan.steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="El plan no tiene dosis definidas"
        )
    branch = db.scalar(
        select(ClinicBranch).where(
            ClinicBranch.id == body.branch_id, ClinicBranch.clinic_id == clinic_id
        )
    )
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sucursal no encontrada")
    if body.vet_user_id:
        vet = db.scalar(
            select(User).where(
                User.id == body.vet_user_id,
                User.clinic_id == clinic_id,
                User.role.in_(("admin", "veterinario")),
            )
        )
        if vet is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Veterinario no encontrado"
            )
    existing = db.scalar(
        select(PetVaccinationPlan).where(
            PetVaccinationPlan.pet_id == body.pet_id,
            PetVaccinationPlan.plan_id == body.plan_id,
            PetVaccinationPlan.clinic_id == clinic_id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La mascota ya tiene este plan de vacunación",
        )

    assignment = PetVaccinationPlan(
        clinic_id=clinic_id,
        pet_id=body.pet_id,
        plan_id=body.plan_id,
        branch_id=body.branch_id,
        vet_user_id=body.vet_user_id,
        start_date=body.start_date,
        start_time=body.start_time,
        duration_minutes=body.duration_minutes,
        created_by=ctx.user.sub,
    )
    db.add(assignment)
    db.flush()

    cumulative = 0
    for step in plan.steps:
        cumulative += step.offset_days
        due_date = body.start_date + timedelta(days=cumulative)
        start = datetime.combine(due_date, body.start_time, tzinfo=UTC)
        appointment = Appointment(
            clinic_id=clinic_id,
            branch_id=body.branch_id,
            pet_id=body.pet_id,
            vet_user_id=body.vet_user_id,
            procedure_type=f"Vacunación: {plan.compound}"[:50],
            start_time=start,
            end_time=start + timedelta(minutes=body.duration_minutes),
            status="scheduled",
        )
        db.add(appointment)
        db.flush()
        db.add(
            PetVaccinationDose(
                pet_vaccination_plan_id=assignment.id,
                label=step.label,
                due_date=due_date,
                status="scheduled",
                appointment_id=appointment.id,
            )
        )

    record_audit(
        db,
        clinic_id=clinic_id,
        actor_type="user",
        actor_id=ctx.user.sub,
        action="vaccination_plan_assigned",
        entity_type="pet",
        entity_id=body.pet_id,
        metadata={"plan_id": str(body.plan_id), "plan_name": plan.name, "doses": len(plan.steps)},
    )
    db.commit()
    assignment = _get_pet_vaccination_plan(db, clinic_id, str(assignment.id))
    return _enrich_assignment(db, assignment)


@router.get("/pets/{pet_id}", response_model=list[PetVaccinationPlanRead])
def pet_vaccination_history(
    pet_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.clinic_id == ctx.clinic["id"]))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    assignments = list(
        db.scalars(
            select(PetVaccinationPlan)
            .options(selectinload(PetVaccinationPlan.doses))
            .where(
                PetVaccinationPlan.pet_id == pet_id,
                PetVaccinationPlan.clinic_id == ctx.clinic["id"],
            )
            .order_by(PetVaccinationPlan.created_at)
        )
    )
    return [_enrich_assignment(db, a) for a in assignments]


@router.patch("/doses/{dose_id}", response_model=DoseRead)
def update_dose(
    dose_id: str,
    body: DoseUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*ASSIGN_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    dose = db.scalar(
        select(PetVaccinationDose)
        .join(
            PetVaccinationPlan,
            PetVaccinationPlan.id == PetVaccinationDose.pet_vaccination_plan_id,
        )
        .where(
            PetVaccinationDose.id == dose_id,
            PetVaccinationPlan.clinic_id == ctx.clinic["id"],
        )
    )
    if dose is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dosis no encontrada")

    data = body.model_dump(exclude_unset=True)
    new_status = data.get("status", dose.status)

    if new_status == "completed":
        dose.status = "completed"
        if data.get("date_applied") is not None:
            dose.date_applied = data["date_applied"]
        elif dose.date_applied is None:
            dose.date_applied = dose.due_date
        dose.applied_by = ctx.user.sub
        if data.get("due_date") is not None:
            dose.due_date = data["due_date"]
        if data.get("lot") is not None:
            dose.lot = data["lot"]
        if data.get("brand") is not None:
            dose.brand = data["brand"]
    else:
        dose.status = new_status
        if data.get("due_date") is not None:
            dose.due_date = data["due_date"]
        if data.get("date_applied") is not None:
            dose.date_applied = data["date_applied"]
        if data.get("lot") is not None:
            dose.lot = data["lot"]
        if data.get("brand") is not None:
            dose.brand = data["brand"]
        if new_status == "scheduled":
            dose.applied_by = None

    assignment = db.get(PetVaccinationPlan, dose.pet_vaccination_plan_id)
    if dose.status == "completed":
        sync_dose_to_carnet(
            db,
            dose,
            dose.date_applied,
            ctx.user.sub,
            assignment.clinic_id,
            assignment.pet_id,
        )
        if dose.appointment_id:
            appt = db.get(Appointment, dose.appointment_id)
            if appt is not None and appt.status != "completed":
                appt.status = "completed"
    else:
        unsync_dose_from_carnet(db, dose)
        if dose.appointment_id:
            appt = db.get(Appointment, dose.appointment_id)
            if appt is not None and appt.status == "completed":
                appt.status = "scheduled"

    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="vaccination_dose_updated",
        entity_type="vaccination_dose",
        entity_id=dose.id,
        metadata={"status": dose.status},
    )
    db.commit()
    db.refresh(dose)

    appointment_start = None
    if dose.appointment_id:
        appt = db.get(Appointment, dose.appointment_id)
        appointment_start = appt.start_time if appt else None
    return {
        "id": str(dose.id),
        "label": dose.label,
        "due_date": dose.due_date.isoformat(),
        "status": dose.status,
        "appointment_id": str(dose.appointment_id) if dose.appointment_id else None,
        "appointment_start": appointment_start,
        "date_applied": dose.date_applied.isoformat() if dose.date_applied else None,
        "lot": dose.lot,
        "brand": dose.brand,
    }


@router.delete(
    "/pets/{pet_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unassign_plan(
    pet_id: str,
    assignment_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*ASSIGN_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    assignment = _get_pet_vaccination_plan(db, ctx.clinic["id"], assignment_id)
    if str(assignment.pet_id) != pet_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asignación de plan no encontrada"
        )
    for dose in assignment.doses:
        unsync_dose_from_carnet(db, dose)
        if dose.appointment_id:
            appt = db.get(Appointment, dose.appointment_id)
            if appt is not None:
                db.delete(appt)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="vaccination_plan_unassigned",
        entity_type="pet",
        entity_id=pet_id,
        metadata={"assignment_id": assignment_id},
    )
    db.delete(assignment)
    db.commit()
