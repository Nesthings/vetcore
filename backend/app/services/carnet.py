"""Builder único del carnet de vacunación.

Fuente de verdad compartida por el expediente (`pets.py`), la cartilla del
dueño (`share.py`) y el portal (`owner.py`). Produce una estructura con:
- `steps`: dosis estructuradas del esquema (label + offset_days).
- `doses`: las dosis REALES de la mascota si tiene el plan asignado (con estado).
- `applications`: aplicaciones unificadas (dosis completadas + registros
  manuales), sin duplicar las que provienen de una dosis (`dose_id`).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.seed_vaccination_plans import ensure_standard_plans
from app.data.vaccine_brands import brands_for_species
from app.models import (
    Appointment,
    ClinicBranch,
    Pet,
    PetCarnetRecord,
    PetVaccinationDose,
    PetVaccinationPlan,
    User,
    VaccinationPlan,
)


def _application_from_dose(dose: PetVaccinationDose, vet_names: dict) -> dict:
    return {
        "id": str(dose.id),
        "source": "plan",
        "date_applied": dose.date_applied.isoformat(),
        "brand": dose.brand,
        "lot": dose.lot,
        "notes": None,
        "vet_name": vet_names.get(str(dose.applied_by)),
    }


def _application_from_record(record: PetCarnetRecord, vet_names: dict) -> dict:
    return {
        "id": str(record.id),
        "source": "manual",
        "date_applied": record.date_applied.isoformat(),
        "brand": record.brand,
        "lot": record.lot,
        "notes": record.notes,
        "vet_name": vet_names.get(str(record.vet_user_id)),
    }


def build_carnet(db: Session, pet: Pet) -> dict:
    ensure_standard_plans(db, pet.clinic_id)

    records = list(
        db.scalars(
            select(PetCarnetRecord)
            .where(PetCarnetRecord.pet_id == pet.id)
            .order_by(PetCarnetRecord.date_applied.desc())
        )
    )

    assignments = list(
        db.scalars(
            select(PetVaccinationPlan)
            .options(selectinload(PetVaccinationPlan.doses))
            .where(PetVaccinationPlan.pet_id == pet.id)
        )
    )
    assigned_plan_ids = {a.plan_id for a in assignments}

    plans = list(
        db.scalars(
            select(VaccinationPlan)
            .options(selectinload(VaccinationPlan.steps))
            .where(
                VaccinationPlan.clinic_id == pet.clinic_id,
                VaccinationPlan.active.is_(True),
                (
                    (VaccinationPlan.species == pet.species)
                    | (VaccinationPlan.id.in_(assigned_plan_ids))
                ),
            )
        )
    )

    # dosis completadas con datos de aplicación
    completed_doses: list[PetVaccinationDose] = []
    if assignments:
        completed_doses = list(
            db.scalars(
                select(PetVaccinationDose)
                .where(
                    PetVaccinationDose.pet_vaccination_plan_id.in_([a.id for a in assignments]),
                    PetVaccinationDose.status == "completed",
                    PetVaccinationDose.date_applied.isnot(None),
                )
            )
        )

    user_ids = {
        str(r.vet_user_id)
        for r in records
        if r.vet_user_id
    } | {str(d.applied_by) for d in completed_doses if d.applied_by}
    vet_names = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids))).all())
        if user_ids
        else {}
    )

    plan_by_id = {str(p.id): p for p in plans}
    doses_by_plan: dict[str, list[PetVaccinationDose]] = {}
    assign_plan_name: dict[str, str] = {}
    for a in assignments:
        doses_by_plan[str(a.plan_id)] = list(a.doses)
        plan = plan_by_id.get(str(a.plan_id))
        if plan is not None:
            assign_plan_name[str(a.id)] = plan.name

    def _vaccine_key(plan: VaccinationPlan) -> str:
        return plan.name

    by_vaccine: dict[str, list[dict]] = {}
    for record in records:
        if record.dose_id is not None:
            continue  # ya representado por la dosis
        by_vaccine.setdefault(record.vaccine, []).append(
            _application_from_record(record, vet_names)
        )

    vaccines: list[dict] = []
    seen = set()
    for plan in plans:
        name = _vaccine_key(plan)
        seen.add(name)
        app_from_doses = [
            _application_from_dose(d, vet_names)
            for d in completed_doses
            if assign_plan_name.get(str(d.pet_vaccination_plan_id)) == name
        ]
        # dedupe por fecha: un registro manual que ya cubre una dosis completada
        app_dates = {a["date_applied"] for a in app_from_doses}
        app_from_records = [
            a for a in by_vaccine.get(name, []) if a["date_applied"] not in app_dates
        ]
        applications = app_from_doses + app_from_records
        applications.sort(key=lambda a: a["date_applied"], reverse=True)

        assigned_doses = doses_by_plan.get(str(plan.id), [])
        vaccines.append(
            {
                "name": name,
                "prevents": plan.prevents,
                "brand": plan.brand,
                "schedule": plan.notes,
                "steps": [
                    {"label": s.label, "offset_days": s.offset_days}
                    for s in (plan.steps or [])
                ],
                "doses": [
                    {
                        "id": str(d.id),
                        "label": d.label,
                        "due_date": d.due_date.isoformat(),
                        "status": d.status,
                        "appointment_id": str(d.appointment_id) if d.appointment_id else None,
                    }
                    for d in assigned_doses
                ],
                "applications": applications,
            }
        )

    # Vacunas con registros manuales que no están en los planes
    for vaccine, apps in by_vaccine.items():
        if vaccine not in seen:
            vaccines.append(
                {
                    "name": vaccine,
                    "prevents": None,
                    "brand": None,
                    "schedule": None,
                    "steps": [],
                    "doses": [],
                    "applications": apps,
                }
            )
            seen.add(vaccine)

    vaccines.sort(key=lambda v: v["name"])
    return {
        "species": pet.species,
        "vaccines": vaccines,
        "brands": brands_for_species(pet.species),
    }


def build_vaccination(db: Session, pet: Pet) -> list[dict]:
    """Planes de vacunación asignados a la mascota con sus dosis (solo lectura)."""
    assignments = list(
        db.scalars(
            select(PetVaccinationPlan)
            .options(selectinload(PetVaccinationPlan.doses))
            .where(PetVaccinationPlan.pet_id == pet.id)
        )
    )
    plan_ids = {a.plan_id for a in assignments}
    plans = (
        {
            p.id: p
            for p in db.scalars(select(VaccinationPlan).where(VaccinationPlan.id.in_(plan_ids)))
        }
        if plan_ids
        else {}
    )
    branch_ids = {a.branch_id for a in assignments}
    branches = (
        dict(
            db.execute(
                select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
            ).all()
        )
        if branch_ids
        else {}
    )
    vet_ids = {a.vet_user_id for a in assignments if a.vet_user_id}
    vets = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(vet_ids))).all())
        if vet_ids
        else {}
    )
    dose_ids = [d.id for a in assignments for d in a.doses]
    starts = (
        dict(
            db.execute(
                select(PetVaccinationDose.id, Appointment.start_time)
                .join(Appointment, Appointment.id == PetVaccinationDose.appointment_id)
                .where(PetVaccinationDose.id.in_(dose_ids))
            ).all()
        )
        if dose_ids
        else {}
    )

    result: list[dict] = []
    for a in assignments:
        plan = plans.get(a.plan_id)
        result.append(
            {
                "id": str(a.id),
                "plan_id": str(a.plan_id),
                "plan_name": plan.name if plan else None,
                "compound": plan.compound if plan else None,
                "prevents": plan.prevents if plan else None,
                "branch_name": branches.get(a.branch_id),
                "vet_name": vets.get(a.vet_user_id),
                "start_date": a.start_date.isoformat(),
                "start_time": a.start_time.isoformat(),
                "doses": [
                    {
                        "id": str(d.id),
                        "label": d.label,
                        "due_date": d.due_date.isoformat(),
                        "status": d.status,
                        "appointment_start": starts.get(d.id),
                    }
                    for d in a.doses
                ],
            }
        )
    return result
