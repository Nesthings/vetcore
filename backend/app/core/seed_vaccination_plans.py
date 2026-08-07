"""Siembra idempotente de los esquemas estándar de vacunación.

Inserta los planes estándar (app/data/vaccine_carnet.py) en la clínica la
primera vez que se pide el módulo de Planes o el carnet. Se ejecuta solo si la
clínica no tiene ningún plan marcado como `is_standard`, así los cambios del
veterinario (editar/eliminar) se respetan hasta que borre todos los estándar.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.data.vaccine_carnet import SPECIES_CARNET
from app.models import VaccinationPlan, VaccinationPlanStep


def ensure_standard_plans(db: Session, clinic_id: str) -> None:
    has_standard = db.scalar(
        select(func.count())
        .select_from(VaccinationPlan)
        .where(
            VaccinationPlan.clinic_id == clinic_id,
            VaccinationPlan.is_standard.is_(True),
        )
    )
    if has_standard:
        return

    for species, vaccines in SPECIES_CARNET.items():
        for vaccine in vaccines:
            plan = VaccinationPlan(
                clinic_id=clinic_id,
                name=vaccine["name"],
                compound=vaccine["name"],
                species=species,
                brand=vaccine.get("brand"),
                prevents=vaccine.get("prevents"),
                notes=vaccine.get("schedule"),
                active=True,
                is_standard=True,
            )
            for i, step in enumerate(vaccine.get("steps", [])):
                plan.steps.append(
                    VaccinationPlanStep(
                        label=step["label"], offset_days=step["offset_days"], position=i
                    )
                )
            db.add(plan)
    db.commit()
