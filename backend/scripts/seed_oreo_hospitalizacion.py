"""Enriquece el expediente demo de "Oreo" (Clínica Veterinaria del Norte):

1. Consultas en la línea de tiempo (con items y peso vinculado).
2. Dos cachorros Keeshond en la familia (mismo dueño).
3. Hospitalización ACTIVA con valores reales en el módulo: signos vitales,
   órdenes de medicación + administraciones, fluidoterapia, alimentación,
   eliminaciones, dolor, notas, incidencias, tareas y turnos.

Idempotente (re-ejecutable). Uso:
    DATABASE_URL=... .venv-linux/bin/python -m scripts.seed_oreo_hospitalizacion
"""

import random
import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models import (
    Consultation,
    ConsultationItem,
    Hospitalization,
    HospitalizationAccommodation,
    HospitalizationElimination,
    HospitalizationFeed,
    HospitalizationFluid,
    HospitalizationIncident,
    HospitalizationMedicationAdministration,
    HospitalizationMedicationOrder,
    HospitalizationNote,
    HospitalizationPainScore,
    HospitalizationShift,
    HospitalizationTask,
    HospitalizationVital,
    Pet,
    PetWeightRecord,
)

from scripts.seed_clinica_norte import COLORS

CLINIC_NAME = "Clínica Veterinaria del Norte"
PET_NAME = "Oreo"


def dt(d: date, h: int = 12, m: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)


def cleanup(db, cid, pid) -> None:
    db.execute(text("DELETE FROM consultation_items WHERE consultation_id IN "
                    "(SELECT id FROM consultations WHERE pet_id = :p)"), {"p": pid})
    db.execute(text("DELETE FROM consultations WHERE pet_id = :p"), {"p": pid})
    db.execute(text("DELETE FROM pet_weight_records WHERE pet_id = :p AND consultation_id IS NOT NULL"),
               {"p": pid})
    hosp_ids = db.execute(
        text("SELECT id FROM hospitalizations WHERE pet_id = :p"), {"p": pid}
    ).scalars().all()
    if hosp_ids:
        ids = list(hosp_ids)
        db.execute(text("DELETE FROM hospitalization_photos WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_discharges WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_incidents WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_shifts WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_pain_scores WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_eliminations WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_feeds WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_fluids WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_medication_administrations WHERE order_id IN "
                        "(SELECT id FROM hospitalization_medication_orders WHERE hospitalization_id = ANY(:ids))"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_medication_orders WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_notes WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_tasks WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalization_vitals WHERE hospitalization_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM hospitalizations WHERE id = ANY(:ids)"), {"ids": ids})
    db.execute(text("DELETE FROM hospitalization_accommodations WHERE clinic_id = :c"), {"c": cid})
    for name in ("Thor", "Nala"):
        p = db.execute(text("SELECT id FROM pets WHERE name = :n AND clinic_id = :c"), {"n": name, "c": cid}).scalar()
        if p:
            db.execute(text("DELETE FROM pet_weight_records WHERE pet_id = :p"), {"p": p})
            db.execute(text("DELETE FROM owner_pet_links WHERE pet_id = :p"), {"p": p})
            db.execute(text("DELETE FROM pets WHERE id = :p"), {"p": p})


def main() -> None:
    db = SessionLocal()
    cid = db.scalar(text("SELECT id FROM clinics WHERE name = :n"), {"n": CLINIC_NAME})
    pid = db.scalar(text("SELECT id FROM pets WHERE name = :n AND clinic_id = :c"), {"n": PET_NAME, "c": cid})
    if not pid:
        raise SystemExit(f"'{PET_NAME}' no encontrada en '{CLINIC_NAME}'")
    oid = db.scalar(
        text("SELECT owner_id FROM owner_pet_links WHERE pet_id = :p AND clinic_id = :c AND is_active = true"),
        {"p": pid, "c": cid},
    )
    bid = db.scalar(text("SELECT id FROM clinic_branches WHERE clinic_id = :c LIMIT 1"), {"c": cid})
    vets = db.execute(
        text("SELECT id FROM users WHERE clinic_id = :c AND role = 'veterinario'"),
        {"c": cid},
    ).scalars().all()
    if not vets or not oid:
        raise SystemExit("Faltan dueño/veterinarios en la clínica")

    cleanup(db, cid, pid)
    db.commit()

    vet1, vet2 = vets[0], vets[1]

    # ======================================================================
    # 1. Consultas (línea de tiempo) con items y peso vinculado
    # ======================================================================
    service_ids = {
        r.name: r.id
        for r in db.execute(
            text("SELECT id, name FROM service_catalog WHERE clinic_id = :c"), {"c": cid}
        ).fetchall()
    }
    prod = db.execute(
        text("SELECT id, name FROM inventory_products WHERE clinic_id = :c LIMIT 1"), {"c": cid}
    ).first()

    consultations_data = [
        dict(date=date(2026, 7, 15), h=10, m=30, vet=vet1,
             reason="Aplicación de refuerzo anual de vacunación",
             diagnosis="Paciente sano; esquema de vacunación completo",
             treatment="Refuerzo anual aplicado sin complicaciones",
             care_instructions="Reposo 24h y observar sitio de aplicación",
             items=[("Vacunación (dosis)", 1), ("Consulta de control", 1)], weight=16.3),
        dict(date=date(2026, 8, 19), h=12, m=15, vet=vet2,
             reason="Control de peso y alergia a pulgas",
             diagnosis="Dermatitis alérgica por pulgas, leve",
             treatment="Antipulgas tópico mensual; baño medicado",
             care_instructions="Revisar piel cada 2 semanas; control ambiental",
             items=[("Consulta de control", 1), ("Desparasitación externa", 1)], weight=16.4),
        dict(date=date(2026, 8, 29), h=9, m=45, vet=vet1,
             reason="Vómito y decaimiento de 24h",
             diagnosis="Gastroenteritis aguda (sospecha alimentaria)",
             treatment="Ayuno 12h, fluidoterapia y antiemético; valorar hospitalización",
             care_instructions="Vigilar hidratación y apetito; regresar si persiste",
             items=[("Consulta general", 1), ("Consulta de control", 1)], weight=16.5),
    ]
    cons_ids = []
    for cd in consultations_data:
        cons = Consultation(
            clinic_id=cid, branch_id=bid, pet_id=pid, vet_user_id=cd["vet"],
            reason=cd["reason"], diagnosis=cd["diagnosis"], treatment=cd["treatment"],
            care_instructions=cd["care_instructions"],
            performed_at=dt(cd["date"], cd["h"], cd["m"] + 10),
            created_at=dt(cd["date"], cd["h"], cd["m"]),
        )
        db.add(cons)
        db.flush()
        for sname, qty in cd["items"]:
            db.add(ConsultationItem(
                consultation_id=cons.id,
                product_id=prod.id if sname == "Desparasitación externa" and prod else None,
                description=sname,
                quantity=qty,
            ))
        db.add(PetWeightRecord(
            pet_id=pid, clinic_id=cid,
            weight_kg=cd["weight"],
            recorded_at=dt(cd["date"], cd["h"], cd["m"] + 10),
            consultation_id=cons.id,
        ))
        cons_ids.append(cons.id)
    db.commit()

    # ======================================================================
    # 2. Familia: dos cachorros Keeshond del mismo dueño
    # ======================================================================
    puppies = [
        dict(name="Thor", sex="macho", birth=date(2026, 3, 18),
             weights=[(date(2026, 4, 20), 4.2), (date(2026, 6, 20), 9.5), (date(2026, 8, 20), 13.0)]),
        dict(name="Nala", sex="hembra", birth=date(2026, 4, 25),
             weights=[(date(2026, 5, 20), 3.8), (date(2026, 7, 20), 8.5), (date(2026, 8, 25), 11.0)]),
    ]
    for pd in puppies:
        p = Pet(
            clinic_id=cid, name=pd["name"], species="perro", breed="Keeshond",
            color_primary=random.choice(COLORS),
            color_secondary=random.choice(COLORS) if random.random() < 0.4 else None,
            sex=pd["sex"], birth_date=pd["birth"], is_active=True,
            qr_token=uuid.uuid4().hex[:24],
            created_at=dt(pd["birth"] + __import__("datetime").timedelta(days=7)),
        )
        db.add(p)
        db.flush()
        db.execute(
            text("INSERT INTO owner_pet_links (id, owner_id, pet_id, clinic_id, is_active, linked_at) "
                 "VALUES (:id, :o, :p, :c, true, :l)"),
            {"id": uuid.uuid4(), "o": oid, "p": p.id, "c": cid,
             "l": dt(pd["birth"], 12, 0)},
        )
        for wd, w in pd["weights"]:
            db.add(PetWeightRecord(
                pet_id=p.id, clinic_id=cid, weight_kg=w, recorded_at=dt(wd, 12, 0),
            ))
    db.commit()

    # ======================================================================
    # 3. Hospitalización ACTIVA con valores reales
    # ======================================================================
    acc = HospitalizationAccommodation(
        clinic_id=cid, branch_id=bid, code="H-01",
        name="Jaula hospitalización canina", type="general",
        capacity=1, status="occupied", max_isolation="normal", active=True,
    )
    db.add(acc)
    db.flush()

    hosp = Hospitalization(
        clinic_id=cid, branch_id=bid, pet_id=pid,
        status="admitted", accommodation_id=acc.id, vet_user_id=vet1,
        reason="Gastroenteritis aguda con vómito y deshidratación",
        diagnosis="Gastroenteritis aguda (sospecha alimentaria)",
        monitoring_level="intermediate", operational_status="stable",
        isolation_status="normal",
        admitted_at=dt(date(2026, 9, 2), 11, 0),
        expected_discharge_at=dt(date(2026, 9, 4), 18, 0),
        notes="Paciente en observación por gastroenteritis aguda; fluidoterapia IV y dieta blanda.",
    )
    db.add(hosp)
    db.flush()
    hid = hosp.id

    # Signos vitales (monitoreo intermedio)
    vitals = [
        (dt(date(2026, 9, 2), 11, 15), "temperature", 38.9, "°C", None),
        (dt(date(2026, 9, 2), 11, 15), "heart_rate", 132, "lpm", None),
        (dt(date(2026, 9, 2), 11, 15), "respiratory_rate", 26, "rpm", None),
        (dt(date(2026, 9, 2), 11, 15), "weight", 16.5, "kg", "Al ingreso"),
        (dt(date(2026, 9, 2), 11, 15), "pain", 4, "/10", None),
        (dt(date(2026, 9, 2), 15, 0), "temperature", 38.7, "°C", None),
        (dt(date(2026, 9, 2), 15, 0), "heart_rate", 126, "lpm", None),
        (dt(date(2026, 9, 2), 15, 0), "respiratory_rate", 24, "rpm", None),
        (dt(date(2026, 9, 2), 15, 0), "pain", 3, "/10", None),
        (dt(date(2026, 9, 2), 19, 0), "temperature", 38.6, "°C", None),
        (dt(date(2026, 9, 2), 19, 0), "heart_rate", 120, "lpm", None),
        (dt(date(2026, 9, 2), 19, 0), "respiratory_rate", 22, "rpm", None),
        (dt(date(2026, 9, 2), 19, 0), "pain", 3, "/10", None),
        (dt(date(2026, 9, 2), 23, 0), "temperature", 38.8, "°C", None),
        (dt(date(2026, 9, 2), 23, 0), "heart_rate", 118, "lpm", None),
        (dt(date(2026, 9, 2), 23, 0), "respiratory_rate", 22, "rpm", None),
        (dt(date(2026, 9, 2), 23, 0), "pain", 2, "/10", None),
        (dt(date(2026, 9, 3), 7, 0), "temperature", 38.5, "°C", None),
        (dt(date(2026, 9, 3), 7, 0), "heart_rate", 116, "lpm", None),
        (dt(date(2026, 9, 3), 7, 0), "respiratory_rate", 20, "rpm", None),
        (dt(date(2026, 9, 3), 7, 0), "weight", 16.3, "kg", "Control matutino"),
        (dt(date(2026, 9, 3), 7, 0), "pain", 2, "/10", None),
    ]
    for when, param, value, unit, obs in vitals:
        db.add(HospitalizationVital(
            clinic_id=cid, hospitalization_id=hid, parameter=param,
            value=value, unit=unit, observed_at=when, user_id=vet1, observation=obs,
        ))

    # Órdenes de medicación + administraciones
    orders = [
        dict(name="Metoclopramida", dose="5 mg", unit="mg", route="IV",
             interval_hours=8, start=dt(date(2026, 9, 2), 12, 0), vet=vet1,
             observations="Antiemético c/8h",
             admins=[(dt(date(2026, 9, 2), 12, 0), "administered"), (dt(date(2026, 9, 2), 20, 0), "administered"),
                     (dt(date(2026, 9, 3), 4, 0), "administered"), (dt(date(2026, 9, 3), 12, 0), "pending")]),
        dict(name="Metronidazol", dose="165 mg", unit="mg", route="VO",
             interval_hours=12, start=dt(date(2026, 9, 2), 14, 0), vet=vet2,
             observations="Antibiótico gastrointestinal c/12h",
             admins=[(dt(date(2026, 9, 2), 14, 0), "administered"), (dt(date(2026, 9, 3), 2, 0), "administered"),
                     (dt(date(2026, 9, 3), 14, 0), "pending")]),
    ]
    for od in orders:
        order = HospitalizationMedicationOrder(
            clinic_id=cid, branch_id=bid, hospitalization_id=hid,
            name=od["name"], dose=od["dose"], unit=od["unit"], route=od["route"],
            interval_hours=od["interval_hours"], start_at=od["start"],
            observations=od["observations"], vet_user_id=od["vet"], active=True,
        )
        db.add(order)
        db.flush()
        for when, status in od["admins"]:
            admin = HospitalizationMedicationAdministration(
                clinic_id=cid, order_id=order.id, scheduled_at=when, status=status,
                administered_at=when if status == "administered" else None,
                administered_by=od["vet"] if status == "administered" else None,
                dose_actual=od["dose"] if status == "administered" else None,
                route_actual=od["route"] if status == "administered" else None,
                observation="Sin reacciones" if status == "administered" else None,
            )
            db.add(admin)

    # Fluidoterapia
    db.add(HospitalizationFluid(
        clinic_id=cid, hospitalization_id=hid,
        solution="Solución Hartmann", route="IV",
        rate=50, rate_unit="ml/h", volume=500, unit="ml",
        started_at=dt(date(2026, 9, 2), 11, 30), ended_at=dt(date(2026, 9, 2), 21, 30),
        user_id=vet1,
        observations="Primera bolsa completada; se reevalúa hidratación.",
    ))

    # Alimentación
    feeds = [
        (dt(date(2026, 9, 2), 13, 30), 200, 120, False),
        (dt(date(2026, 9, 2), 19, 30), 200, 200, False),
        (dt(date(2026, 9, 3), 8, 0), 250, 200, False),
    ]
    for when, offered, consumed, rejected in feeds:
        db.add(HospitalizationFeed(
            clinic_id=cid, hospitalization_id=hid,
            diet="Royal Canin Gastrointestinal (húmedo)", type="húmeda",
            amount_offered=offered, amount_consumed=consumed, unit="g",
            offered_at=when, user_id=vet1, rejected=rejected, vomited=False,
            observations=None if consumed == offered else "Queda algo en el plato",
        ))

    # Eliminaciones
    elims = [
        (dt(date(2026, 9, 2), 14, 10), "orina", True, "normal", None),
        (dt(date(2026, 9, 2), 16, 30), "heces", True, "moderada", "blanda"),
        (dt(date(2026, 9, 3), 6, 40), "heces", True, "normal", "normal"),
    ]
    for when, kind, present, qty, consis in elims:
        db.add(HospitalizationElimination(
            clinic_id=cid, hospitalization_id=hid, kind=kind, present=present,
            quantity=qty, consistency=consis, observed_at=when, user_id=vet1,
        ))

    # Dolor
    for when, score in [(dt(date(2026, 9, 2), 11, 15), 4), (dt(date(2026, 9, 2), 19, 0), 3),
                        (dt(date(2026, 9, 3), 7, 0), 2)]:
        db.add(HospitalizationPainScore(
            clinic_id=cid, hospitalization_id=hid, score=score,
            scale="Escala numérica 0-10", observed_at=when, user_id=vet1,
        ))

    # Notas de evolución
    db.add(HospitalizationNote(
        clinic_id=cid, hospitalization_id=hid, category="evolution", user_id=vet1,
        text="Paciente estable, sin vómito desde las 14:00. Continúa con fluidoterapia y dieta blanda. Se mantiene con analgesia.",
        created_at=dt(date(2026, 9, 2), 18, 0),
    ))
    db.add(HospitalizationNote(
        clinic_id=cid, hospitalization_id=hid, category="evolution", user_id=vet2,
        text="Buena evolución: come y tolera agua. Signos vitales en rango. Se programa alta para el 04/09 si mantiene la mejoría.",
        created_at=dt(date(2026, 9, 3), 8, 0),
    ))

    # Incidencia
    db.add(HospitalizationIncident(
        clinic_id=cid, hospitalization_id=hid, severity="medium", user_id=vet1,
        description="Episodio de vómito único posterior al inicio de la fluidoterapia.",
        actions_taken="Se suspendió la alimentación 2 horas; sin recurrencia posterior.",
        observed_at=dt(date(2026, 9, 2), 13, 45),
    ))

    # Tareas operativas
    tasks = [
        (dt(date(2026, 9, 2), 15, 0), "vitals", "Signos vitales", "completed", vet1, dt(date(2026, 9, 2), 15, 5)),
        (dt(date(2026, 9, 2), 19, 30), "feeding", "Alimentación (dieta blanda)", "completed", vet1, dt(date(2026, 9, 2), 19, 35)),
        (dt(date(2026, 9, 2), 20, 0), "medication", "Metoclopramida IV", "completed", vet1, dt(date(2026, 9, 2), 20, 5)),
        (dt(date(2026, 9, 3), 7, 0), "vitals", "Signos vitales y peso", "completed", vet2, dt(date(2026, 9, 3), 7, 10)),
        (dt(date(2026, 9, 3), 14, 0), "medication", "Metronidazol VO", "pending", None, None),
        (dt(date(2026, 9, 3), 15, 0), "vitals", "Signos vitales", "pending", None, None),
    ]
    for when, ttype, desc, status, done_by, done_at in tasks:
        db.add(HospitalizationTask(
            clinic_id=cid, hospitalization_id=hid, type=ttype, description=desc,
            scheduled_at=when, priority="normal", status=status,
            assigned_user_id=done_by or vet1,
            completed_by=done_by, completed_at=done_at,
            observation="OK" if status == "completed" else None,
        ))

    # Turnos con nota de entrega
    db.add(HospitalizationShift(
        clinic_id=cid, user_id=vet1,
        started_at=dt(date(2026, 9, 2), 7, 0), ended_at=dt(date(2026, 9, 2), 15, 0),
        handover_note="Ingreso por gastroenteritis; siguiente medicación (metoclopramida) 20:00.",
    ))
    db.add(HospitalizationShift(
        clinic_id=cid, user_id=vet2,
        started_at=dt(date(2026, 9, 2), 15, 0), ended_at=dt(date(2026, 9, 2), 23, 0),
        handover_note="Sin vómito desde las 14:00; buena tolerancia a dieta blanda.",
    ))
    db.add(HospitalizationShift(
        clinic_id=cid, user_id=vet1,
        started_at=dt(date(2026, 9, 3), 7, 0), ended_at=None,
        handover_note="Mañana: verificar tolerancia alimentaria y preparar alta para el 04/09.",
    ))

    db.commit()

    nc = db.execute(text("SELECT count(*) FROM consultations WHERE pet_id=:p"), {"p": pid}).scalar()
    npets = db.execute(text("SELECT count(*) FROM pets WHERE clinic_id=:c AND name IN ('Thor','Nala')"), {"c": cid}).scalar()
    nh = db.execute(text("SELECT count(*) FROM hospitalizations WHERE pet_id=:p"), {"p": pid}).scalar()
    nv = db.execute(text("SELECT count(*) FROM hospitalization_vitals WHERE hospitalization_id=:h"), {"h": hid}).scalar()
    print(f"Consultas Oreo: {nc} | Cachorros familia: {npets} | Hospitalización: {nh} (activa) | Vitals: {nv}")


if __name__ == "__main__":
    main()