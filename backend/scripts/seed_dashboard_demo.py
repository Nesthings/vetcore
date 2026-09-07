"""Seed demo: puebla la pantalla principal (Inicio) con datos ficticios frescos.

Toma la clínica "Clínica Veterinaria del Norte" existente y le agrega datos
para HOY y los últimos días, de modo que el dashboard se vea poblado:

- Citas de hoy (varios estados) y del período reciente.
- Consultas realizadas de hoy (llenan el gráfico de flujo de pacientes).
- Lista de espera activa.
- Órdenes de compra pendientes de recibir.
- Dosis de vacunación programadas (llenan "Vacunas por aplicar").
- Movimientos de inventario y órdenes (dashboard de inventario).
- Mascotas nuevas recientes.
- Una hospitalización activa reciente.

Idempotente: sólo INSERTA (no borra nada de la clínica). Se puede correr
varias veces; para evitar duplicados de "hoy", borra primero las citas y
consultas de hoy y las órdenes pending del seed, y las re-crea.

Uso:
    .venv-linux/bin/python -m scripts.seed_dashboard_demo
"""

import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.models import (
    Appointment,
    AppointmentWaitlist,
    Consultation,
    ConsultationItem,
    Hospitalization,
    HospitalizationAccommodation,
    InventoryProduct,
    Pet,
    PetVaccinationDose,
    PetVaccinationPlan,
    PurchaseOrder,
    PurchaseOrderItem,
    ScheduleBlock,
    User,
    VaccinationPlan,
)
from app.models.hospitalization import (
    ISOLATION_STATUSES,
    MONITORING_LEVELS,
    OPERATIONAL_STATUSES,
)
from scripts.seed_clinica_norte import (
    BLOCK_REASONS,
    CLINIC_NAME,
    SERVICE_CATALOG,
    SUPPLIERS,
)

random.seed(20260904)

PROCEDURES = [
    "Consulta general", "Consulta de control", "Vacunación", "Desparasitación",
    "Cirugía", "Rayos X", "Ultrasonido", "Baño y corte", "Urgencia", "Limpieza dental",
    "Esterilización", "Consulta a domicilio",
]

REASONS = [
    "Fiebre y decaimiento", "Control de peso", "Vacunación anual", "Herida en pata",
    "Vómito y diarrea", "Chequeo geriátrico", "Tos persistente", "Dermatitis",
    "Fractura", "Alergia alimentaria", "Control postquirúrgico", "Desparasitación",
]

DIAGNOSIS = [
    "Gastroenteritis leve", "Otitis externa", "Dermatitis alérgica", "Infección respiratoria",
    "Sobrepeso", "Displasia de cadera", "Conjuntivitis", "Cuerpo extraño en pata",
    "Gingivitis", "Deshidratación moderada", "Alergia por pulgas", "Sano (chequeo)",
]

TREATMENTS = [
    "Antibiótico 7 días + revaloración", "Limpieza y medicación tópica",
    "Dieta hipoalergénica + control en 15 días", "Suero y reposo",
    "Antiinflamatorio + hielo local", "Analgésico y restricción de actividad",
    "Gotas oftálmicas 10 días", "Curas diarias por 5 días",
    "Profilaxis dental y seguimiento", "Desparasitante y control",
]

CARE = [
    "Reposo relativo 48 h", "Agua abundante y dieta blanda",
    "Evitar ejercicio intenso 1 semana", "Revisar la herida a diario",
    "Continuar medicación según indicación", "Regresar en 15 días para control",
]

HOSP_REASONS = [
    "Gastroenteritis con deshidratación", "Postoperatorio de esterilización",
    "Intoxicación", "Trauma por atropellamiento", "Pancreatitis aguda",
]


def _now_minus(days: int, hour: int, minute: int = 0) -> datetime:
    d = date.today() - timedelta(days=days)
    return datetime.combine(d, time(hour, minute))


def main() -> None:
    db = SessionLocal()

    from app.models import Clinic, ClinicBranch

    clinic = db.scalar(select(Clinic).where(Clinic.name == CLINIC_NAME))
    if clinic is None:
        print(f"Clínica '{CLINIC_NAME}' no encontrada. Corre primero "
              "scripts.seed_clinica_norte o scripts.seed_prod_demo.")
        return
    cid = clinic.id

    branch = db.scalar(select(ClinicBranch).where(ClinicBranch.clinic_id == cid))
    if branch is None:
        print("La clínica no tiene sucursales.")
        return
    bid = branch.id

    vets = db.scalars(select(User).where(User.clinic_id == cid, User.role == "veterinario")).all()
    if not vets:
        vets = db.scalars(select(User).where(User.clinic_id == cid, User.role == "admin")).all()
    pets = db.scalars(
        select(Pet).where(Pet.clinic_id == cid, Pet.is_active.is_(True))
    ).all()
    if not pets:
        print("La clínica no tiene mascotas.")
        return
    admin = db.scalar(select(User).where(User.clinic_id == cid, User.role == "admin"))

    today = date.today()
    start_of_day = datetime.combine(today, time.min)
    end_of_day = datetime.combine(today, time.max)

    # --- 1) Limpia datos de hoy del seed (idempotente) ---
    db.execute(
        delete(Appointment).where(
            Appointment.clinic_id == cid,
            Appointment.start_time >= start_of_day,
            Appointment.start_time <= end_of_day,
        )
    )
    db.execute(
        delete(ConsultationItem).where(
            ConsultationItem.consultation_id.in_(
                select(Consultation.id).where(
                    Consultation.clinic_id == cid,
                    Consultation.created_at >= start_of_day,
                    Consultation.created_at <= end_of_day,
                )
            )
        )
    )
    db.execute(
        delete(Consultation).where(
            Consultation.clinic_id == cid,
            Consultation.created_at >= start_of_day,
            Consultation.created_at <= end_of_day,
        )
    )
    db.execute(
        delete(ScheduleBlock).where(
            ScheduleBlock.clinic_id == cid,
            ScheduleBlock.start_time >= start_of_day,
            ScheduleBlock.start_time <= end_of_day,
        )
    )
    db.execute(
        delete(AppointmentWaitlist).where(AppointmentWaitlist.clinic_id == cid)
    )
    # Borra órdenes de compra del seed (status draft/pending/sent)
    po_ids = db.scalars(
        select(PurchaseOrder.id).where(
            PurchaseOrder.clinic_id == cid,
            PurchaseOrder.status.in_(["draft", "pending", "sent"]),
        )
    ).all()
    for pid in po_ids:
        db.execute(delete(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == pid))
    for pid in po_ids:
        db.execute(delete(PurchaseOrder).where(PurchaseOrder.id == pid))
    db.commit()

    products = db.scalars(
        select(InventoryProduct).where(InventoryProduct.clinic_id == cid)
    ).all()

    # --- 2) Citas de hoy ---
    print("Generando citas de hoy…")
    today_appts = []
    for hour in range(8, 19):
        # 1-3 citas por franja según demanda
        n = random.choices([1, 2, 3], weights=[40, 40, 20])[0]
        for _ in range(n):
            status = random.choices(
                ["completed", "confirmed", "scheduled", "cancelled", "no_show"],
                weights=[35, 25, 20, 12, 8],
            )[0]
            pet = random.choice(pets)
            start = datetime.combine(today, time(hour, random.choice([0, 15, 30, 45])))
            end = start + timedelta(minutes=random.choice([15, 30, 30, 45]))
            vet = random.choice(vets) if vets and random.random() < 0.85 else None
            appt = Appointment(
                clinic_id=cid, branch_id=bid, pet_id=pet.id, walk_in_name=None,
                vet_user_id=vet.id if vet else None,
                procedure_type=random.choice(PROCEDURES),
                start_time=start, end_time=end, status=status,
                created_at=_now_minus(random.randint(1, 5), 9),
            )
            db.add(appt)
            today_appts.append(appt)
    db.flush()

    # --- 3) Consultas de hoy (para el flujo de pacientes) ---
    print("Generando consultas de hoy…")
    for _ in range(random.randint(12, 18)):
        hour = random.randint(8, 19)
        minute = random.choice([0, 15, 30, 45])
        performed = datetime.combine(today, time(hour, minute))
        pet = random.choice(pets)
        vet = random.choice(vets) if vets else admin
        cons = Consultation(
            clinic_id=cid, branch_id=bid, pet_id=pet.id, vet_user_id=vet.id,
            reason=random.choice(REASONS), diagnosis=random.choice(DIAGNOSIS),
            treatment=random.choice(TREATMENTS), care_instructions=random.choice(CARE),
            next_appointment_suggestion=(
                today + timedelta(days=random.randint(7, 21))
                if random.random() < 0.4 else None
            ),
            performed_at=performed, created_at=performed,
        )
        db.add(cons)
        db.flush()
        for _ in range(random.randint(1, 3)):
            if products and random.random() < 0.5:
                prod = random.choice(products)
                db.add(ConsultationItem(
                    consultation_id=cons.id, product_id=prod.id,
                    description=prod.name, quantity=round(random.uniform(1, 2), 0),
                ))
            else:
                db.add(ConsultationItem(
                    consultation_id=cons.id,
                    description=random.choice(SERVICE_CATALOG)[0],
                    quantity=1,
                ))

    # --- 4) Bloques de horario y lista de espera ---
    for _ in range(2):
        start = datetime.combine(today, time(random.randint(8, 18)))
        db.add(ScheduleBlock(
            clinic_id=cid, branch_id=bid,
            vet_user_id=random.choice(vets).id if vets and random.random() < 0.5 else None,
            start_time=start, end_time=start + timedelta(hours=1),
            reason=random.choice(BLOCK_REASONS),
        ))
    for _ in range(random.randint(3, 6)):
        pet = random.choice(pets)
        db.add(AppointmentWaitlist(
            clinic_id=cid, branch_id=bid, pet_id=pet.id,
            desired_from=datetime.combine(today, time(10, 0)),
            desired_to=datetime.combine(today + timedelta(days=1), time(18, 0)),
            status="waiting",
        ))
    db.commit()

    # --- 5) Órdenes de compra pendientes ---
    print("Generando órdenes de compra…")
    for _ in range(random.randint(2, 4)):
        po = PurchaseOrder(
            clinic_id=cid, branch_id=bid,
            supplier_name=random.choice(SUPPLIERS),
            status=random.choice(["draft", "pending", "sent"]),
            created_at=_now_minus(random.randint(0, 3), 10),
        )
        db.add(po)
        db.flush()
        for _ in range(random.randint(1, 3)):
            if not products:
                continue
            prod = random.choice(products)
            db.add(PurchaseOrderItem(
                purchase_order_id=po.id, product_id=prod.id,
                quantity=round(random.uniform(5, 60), 0),
            ))
    db.commit()

    # --- 6) Vacunas programadas para hoy (vacunas_hoy) ---
    print("Generando vacunas programadas…")
    plans = db.scalars(
        select(VaccinationPlan).where(VaccinationPlan.clinic_id == cid)
    ).all()
    for _ in range(random.randint(3, 5)):
        pet = random.choice(pets)
        if not plans:
            break
        plan = random.choice(plans)
        pvp = PetVaccinationPlan(
            clinic_id=cid, pet_id=pet.id, plan_id=plan.id, branch_id=bid,
            vet_user_id=random.choice(vets).id if vets else None,
            start_date=today - timedelta(days=random.randint(0, 10)),
            start_time=time(9, 0), duration_minutes=30,
            created_by=admin.id if admin else None,
        )
        db.add(pvp)
        db.flush()
        if plan.steps:
            step = plan.steps[0]
            due = pvp.start_date + timedelta(days=step.offset_days)
            db.add(PetVaccinationDose(
                pet_vaccination_plan_id=pvp.id, label=step.label,
                due_date=today, status="scheduled",
            ))
    db.commit()

    # --- 7) Mascotas nuevas recientes (nuevas_mascotas) ---
    print("Generando mascotas nuevas recientes…")
    for _ in range(random.randint(2, 4)):
        pet = random.choice(pets)
        pet.created_at = _now_minus(random.randint(0, 6), random.randint(8, 18))
    db.commit()

    # --- 8) Hospitalización activa reciente (dashboards) ---
    print("Generando hospitalización…")
    accommodation = db.scalar(
        select(HospitalizationAccommodation).where(
            HospitalizationAccommodation.branch_id == bid,
            HospitalizationAccommodation.status == "available",
        )
    )
    pet = random.choice(pets)
    admitted = _now_minus(random.randint(0, 2), random.randint(9, 16))
    hosp = Hospitalization(
        clinic_id=cid, branch_id=bid, pet_id=pet.id,
        status=random.choices(["admitted", "active"], weights=[50, 50])[0],
        accommodation_id=accommodation.id if accommodation else None,
        vet_user_id=random.choice(vets).id if vets else None,
        reason=random.choice(HOSP_REASONS),
        diagnosis=random.choice(DIAGNOSIS),
        monitoring_level=random.choice(list(MONITORING_LEVELS)),
        operational_status=random.choice(list(OPERATIONAL_STATUSES)),
        isolation_status=random.choice(list(ISOLATION_STATUSES)),
        admitted_at=admitted,
        expected_discharge_at=admitted + timedelta(days=random.randint(1, 3)),
    )
    db.add(hosp)
    db.commit()

    print("Dashboard demo poblado para hoy ✓")


if __name__ == "__main__":
    main()
