"""Llena el expediente de la mascota demo "Oreo" (Clínica Veterinaria del Norte)
en PRODUCCIÓN: la convierte en una perra Beagle, con pesos con más de un año de
historia, cartilla de vacunación canina (carnet + plan + dosis) y alerta clínica.

Uso:
    DATABASE_URL=... .venv-linux/bin/python -m scripts.seed_oreo_cartilla
"""

import random
from datetime import date, datetime, time

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models import (
    ClinicalAlert,
    PetCarnetRecord,
    PetVaccinationDose,
    PetVaccinationPlan,
    PetWeightRecord,
)

CLINIC_NAME = "Clínica Veterinaria del Norte"
PET_NAME = "Oreo"
PET_SPECIES = "perro"
PET_BREED = "Keeshond"

# Peso mensual de una perra Keeshond (nacida 2025-05-27): cachorra → adulta.
# El rango arranca en 2025-06 (hace más de un año) hasta hoy.
WEIGHTS = [
    (date(2025, 6, 20), 2.80),
    (date(2025, 7, 18), 5.00),
    (date(2025, 8, 19), 7.50),
    (date(2025, 9, 18), 9.80),
    (date(2025, 10, 17), 11.50),
    (date(2025, 11, 19), 12.80),
    (date(2025, 12, 16), 13.80),
    (date(2026, 1, 20), 14.60),
    (date(2026, 2, 18), 15.20),
    (date(2026, 3, 17), 15.60),
    (date(2026, 4, 15), 15.90),
    (date(2026, 5, 20), 16.10),
    (date(2026, 6, 18), 16.20),
    (date(2026, 7, 15), 16.30),
    (date(2026, 8, 19), 16.40),
    (date(2026, 9, 2), 16.50),
]

# Cartilla canina: vacunas aplicadas (carnet) — coherentes con los planes.
CARNET = [
    # (fecha, vacuna, brand, dosis, plan_nombre)
    (date(2025, 7, 15), "Cuádruple / séptuple canina (DHPP + Leptospira)", "Canigen DHPPi/L", "1ª dosis", "Cuádruple / séptuple canina (DHPP + Leptospira)"),
    (date(2025, 8, 12), "Cuádruple / séptuple canina (DHPP + Leptospira)", "Canigen DHPPi/L", "Refuerzo", "Cuádruple / séptuple canina (DHPP + Leptospira)"),
    (date(2025, 9, 9), "Cuádruple / séptuple canina (DHPP + Leptospira)", "Canigen DHPPi/L", "Refuerzo final", "Cuádruple / séptuple canina (DHPP + Leptospira)"),
    (date(2025, 8, 5), "Bordetella (tos de perrera)", "Bronchine CAe", "1ª dosis", "Bordetella (tos de perrera)"),
    (date(2025, 8, 5), "Giardia", "GiardiaVax", "1ª dosis", "Giardia"),
    (date(2025, 9, 10), "Rabia", "Rabigen Mono", "1ª dosis", "Rabia"),
    (date(2026, 7, 15), "Cuádruple / séptuple canina (DHPP + Leptospira)", "Canigen DHPPi/L", "Refuerzo anual", "Cuádruple / séptuple canina (DHPP + Leptospira)"),
    (date(2026, 8, 5), "Bordetella (tos de perrera)", "Bronchine CAe", "Refuerzo anual", "Bordetella (tos de perrera)"),
    (date(2026, 8, 5), "Giardia", "GiardiaVax", "Refuerzo anual", "Giardia"),
    (date(2026, 9, 10), "Rabia", "Rabigen Mono", "Refuerzo anual", "Rabia"),
]

# Próximas dosis (programadas) por plan.
NEXT_DOSES = [
    ("Cuádruple / séptuple canina (DHPP + Leptospira)", date(2027, 7, 15)),
    ("Bordetella (tos de perrera)", date(2027, 8, 5)),
    ("Giardia", date(2027, 8, 5)),
    ("Rabia", date(2027, 9, 10)),
]

NOTES = ["Dosis aplicada sin reacciones", "Toleró bien el procedimiento", "Sin novedades"]


def main() -> None:
    db = SessionLocal()
    cid = db.scalar(text("SELECT id FROM clinics WHERE name = :n"), {"n": CLINIC_NAME})
    pet = db.execute(
        text("SELECT id, birth_date FROM pets WHERE name = :n AND clinic_id = :c"),
        {"n": PET_NAME, "c": cid},
    ).first()
    if not pet:
        raise SystemExit(f"'{PET_NAME}' no encontrada en '{CLINIC_NAME}'")
    pid = pet.id
    db.execute(
        text("UPDATE pets SET species = :s, breed = :b WHERE id = :p"),
        {"s": PET_SPECIES, "b": PET_BREED, "p": pid},
    )
    bid = db.scalar(
        text("SELECT id FROM clinic_branches WHERE clinic_id = :c LIMIT 1"), {"c": cid}
    )
    vets = db.execute(
        text("SELECT id FROM users WHERE clinic_id = :c AND role = 'veterinario'"),
        {"c": cid},
    ).scalars().all()
    if not vets:
        raise SystemExit("Sin veterinarios en la clínica")
    plan_rows = db.execute(
        text("SELECT id, name FROM vaccination_plans WHERE clinic_id = :c AND species = :s"),
        {"c": cid, "s": PET_SPECIES},
    ).fetchall()
    plans = {r.name: r.id for r in plan_rows}

    # --- Pesos (historia > 1 año) ---
    db.execute(text("DELETE FROM pet_weight_records WHERE pet_id = :p"), {"p": pid})
    for d, w in WEIGHTS:
        db.add(PetWeightRecord(
            pet_id=pid, clinic_id=cid,
            weight_kg=round(w + random.uniform(-0.05, 0.05), 2),
            recorded_at=datetime.combine(d, time(random.randint(9, 18), random.randint(0, 59))),
        ))

    # --- Cartilla (carnet + plan + dosis) ---
    db.execute(text("DELETE FROM pet_carnet_records WHERE pet_id = :p"), {"p": pid})
    db.execute(text(
        "DELETE FROM pet_vaccination_doses WHERE pet_vaccination_plan_id IN "
        "(SELECT id FROM pet_vaccination_plans WHERE pet_id = :p)"
    ), {"p": pid})
    db.execute(text("DELETE FROM pet_vaccination_plans WHERE pet_id = :p"), {"p": pid})

    for d, vaccine, brand, dosis, plan_name in CARNET:
        vet = random.choice(vets)
        plan_id = plans.get(plan_name)
        pvp_id = None
        if plan_id:
            existing_pvp = db.execute(
                text("SELECT id FROM pet_vaccination_plans WHERE pet_id = :p AND plan_id = :pl"),
                {"p": pid, "pl": plan_id},
            ).scalar()
            if existing_pvp:
                pvp_id = existing_pvp
            else:
                pvp = PetVaccinationPlan(
                    clinic_id=cid, pet_id=pid, plan_id=plan_id, branch_id=bid,
                    vet_user_id=vet,
                    start_date=d, start_time=time(10, 0), duration_minutes=30,
                    created_by=vet, created_at=datetime.combine(d, time(10, 0)),
                )
                db.add(pvp)
                db.flush()
                pvp_id = pvp.id
            dose = PetVaccinationDose(
                pet_vaccination_plan_id=pvp_id, label=dosis,
                due_date=d, status="completed",
                created_at=datetime.combine(d, time(10, 0)),
                date_applied=d,
                lot=f"L{dosis[:1].upper()}{vaccine[:2].upper()}{random.randint(100000, 999999)}",
                brand=brand, applied_by=vet,
            )
            db.add(dose)
            db.flush()
            dose_id = dose.id
        else:
            dose_id = None
        # Registro de carnet
        db.add(PetCarnetRecord(
            clinic_id=cid, pet_id=pid,
            vaccine=vaccine, brand=brand,
            date_applied=d,
            lot=f"L{dosis[:1].upper()}{vaccine[:2].upper()}{random.randint(100000, 999999)}",
            vet_user_id=vet,
            notes=random.choice(NOTES),
            created_at=datetime.combine(d, time(10, 0)),
            dose_id=dose_id,
        ))

    # Próximas dosis programadas (sobre los planes ya creados)
    for plan_name, due in NEXT_DOSES:
        plan_id = plans.get(plan_name)
        if not plan_id:
            continue
        pvp_id = db.execute(
            text("SELECT id FROM pet_vaccination_plans WHERE pet_id = :p AND plan_id = :pl"),
            {"p": pid, "pl": plan_id},
        ).scalar()
        if not pvp_id:
            continue
        db.add(PetVaccinationDose(
            pet_vaccination_plan_id=pvp_id, label="Refuerzo anual",
            due_date=due, status="scheduled",
            created_at=datetime.combine(due, time(10, 0)),
        ))

    # --- Alerta clínica ---
    db.execute(text("DELETE FROM clinical_alerts WHERE pet_id = :p"), {"p": pid})
    db.add(ClinicalAlert(
        pet_id=pid, type="alergia",
        description="Alergia a pulgas: mantener control ambiental y antipulgas mensual.",
    ))

    db.commit()
    pet_now = db.execute(
        text("SELECT species, breed, sex FROM pets WHERE id = :p"), {"p": pid}
    ).first()
    nw = db.execute(text("SELECT count(*) FROM pet_weight_records WHERE pet_id=:p"), {"p": pid}).scalar()
    nc = db.execute(text("SELECT count(*) FROM pet_carnet_records WHERE pet_id=:p"), {"p": pid}).scalar()
    np_ = db.execute(text("SELECT count(*) FROM pet_vaccination_plans WHERE pet_id=:p"), {"p": pid}).scalar()
    nd = db.execute(text("SELECT count(*) FROM pet_vaccination_doses WHERE pet_vaccination_plan_id IN "
                         "(SELECT id FROM pet_vaccination_plans WHERE pet_id=:p)"), {"p": pid}).scalar()
    print(f"Oreo ({pid}) — {pet_now.species}/{pet_now.sex} {pet_now.breed} | "
          f"pesos: {nw} | carnet: {nc} | planes: {np_} | dosis: {nd}")


if __name__ == "__main__":
    main()