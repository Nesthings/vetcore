"""Seed ligero de PRODUCCIÓN: "Clínica Veterinaria del Norte".

Versión reducida del seed demo (aproximadamente 25% del volumen):
- Clínica + sucursal + evento de suscripción.
- Staff completo: 1 admin, 5 veterinarios, 2 recepcionistas.
- Catálogo de servicios completo y productos con lote/stock inicial.
- Planes de vacunación estándar.
- 9 dueños y 10 mascotas (1 dueño con 2 mascotas para ver la vista "familia").

Sin fotos de mascotas: en producción el media vive en el contenedor ECS,
no es accesible desde aquí (no se guardan URLs rotas).

Idempotente: si la clínica ya existe, la elimina (con dependencias) y recrea.

Uso:
    .venv-linux/bin/python -m scripts.seed_prod_demo
"""

import random
import uuid
from datetime import date

from sqlalchemy import delete, text

from app.core.security import hash_password
from app.core.seed_vaccination_plans import ensure_standard_plans
from app.db.session import SessionLocal
from app.models import (
    Clinic,
    ClinicBranch,
    ClinicSubscriptionEvent,
    InventoryLot,
    InventoryMovement,
    InventoryProduct,
    Pet,
    ServiceCatalog,
    User,
)

from scripts.seed_clinica_norte import (
    ALERT_TEXTS,
    ALLERGIES,
    CAT_NAMES,
    CLINIC_NAME,
    COLORS,
    DOG_FEMALE,
    DOG_MALE,
    INVENTORY_PRODUCTS,
    MARKINGS,
    MEX_FIRST,
    MEX_LAST,
    OWNER_PASSWORD,
    SERVICE_CATALOG,
    SPECIES_BREEDS,
    STAFF_PASSWORD,
    rand_date,
    rand_dt,
    unique_phone,
)

N_OWNERS = 9
N_PETS = 10
BRANCH_NAME = "Sede Norte"
BRANCH_ADDRESS = "Av. Insurgentes Norte 1420, Col. Lindavista, 07300 Ciudad de México, CDMX"
BRANCH_PHONE = "+52 55 1000 2000"


def pick_name(species: str, sex: str) -> str:
    if species == "perro":
        pool = DOG_MALE if sex == "macho" else DOG_FEMALE
    else:
        pool = CAT_NAMES
    return random.choice(pool)


def cleanup(db, cid: str) -> None:
    db.execute(text("DELETE FROM pet_vaccination_doses WHERE pet_vaccination_plan_id IN "
                    "(SELECT id FROM pet_vaccination_plans WHERE clinic_id = :c)"), {"c": cid})
    db.execute(text("DELETE FROM pet_vaccination_plans WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM pet_carnet_records WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM clinical_alerts WHERE pet_id IN "
                    "(SELECT id FROM pets WHERE clinic_id = :c)"), {"c": cid})
    db.execute(text("DELETE FROM pet_weight_records WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM consultation_items WHERE consultation_id IN "
                    "(SELECT id FROM consultations WHERE clinic_id = :c)"), {"c": cid})
    db.execute(text("DELETE FROM invoice_items WHERE invoice_id IN "
                    "(SELECT id FROM invoices WHERE clinic_id = :c)"), {"c": cid})
    db.execute(text("DELETE FROM invoices WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM consultations WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM inventory_movements WHERE product_id IN "
                    "(SELECT id FROM inventory_products WHERE clinic_id = :c)"), {"c": cid})
    db.execute(text("DELETE FROM inventory_lots WHERE product_id IN "
                    "(SELECT id FROM inventory_products WHERE clinic_id = :c)"), {"c": cid})
    db.execute(text("DELETE FROM inventory_products WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM service_catalog WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM vaccination_plans WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM audit_log WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM clinic_subscription_events WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM appointment_waitlist WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM schedule_blocks WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM appointments WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM internal_notifications WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM outbound_notifications WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM owner_pet_links WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM pets WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM users WHERE clinic_id = :c"), {"c": cid})
    db.execute(text("DELETE FROM clinic_branches WHERE clinic_id = :c"), {"c": cid})
    db.execute(delete(Clinic).where(Clinic.id == cid))
    db.execute(text("DELETE FROM owner_preferences WHERE owner_id IN "
                    "(SELECT id FROM owners WHERE email LIKE '%@correo.demo')"))
    db.execute(text("DELETE FROM owners WHERE email LIKE '%@correo.demo'"))


def main() -> None:
    db = SessionLocal()

    existing = db.scalar(
        text("SELECT id FROM clinics WHERE name = :n"), {"n": CLINIC_NAME}
    )
    if existing:
        cleanup(db, str(existing))
        db.commit()
        print(f"Clínica previa '{CLINIC_NAME}' eliminada.")

    clinic = Clinic(
        name=CLINIC_NAME,
        contact_name="Ricardo Mendoza Valdez",
        contact_phone="+52 55 1000 2000",
        contact_email="contacto@clinicaveterinariadelnorte.mx",
        subscription_status="active",
        timezone="America/Mexico_City",
        address=BRANCH_ADDRESS,
        rfc="CVM010101XXX",
        fiscal_name="Clínica Veterinaria del Norte, S.A. de C.V.",
        currency="MXN",
        setup_completed=True,
        birthday_message="¡Feliz cumpleaños {nombre}! Te deseamos lo mejor desde la Clínica Veterinaria del Norte. 🎂",
        birthday_send_whatsapp=True,
        stock_alert_threshold=5,
    )
    db.add(clinic)
    db.flush()
    cid = clinic.id

    branch = ClinicBranch(
        clinic_id=cid,
        name=BRANCH_NAME,
        address=BRANCH_ADDRESS,
        phone=BRANCH_PHONE,
    )
    db.add(branch)
    db.flush()
    bid = branch.id

    db.add(ClinicSubscriptionEvent(
        clinic_id=cid, event_type="activated", notes="Alta de clínica (seed ligero producción)",
    ))

    # --- Staff ---
    admin = User(
        clinic_id=cid, branch_id=bid, role="admin",
        full_name="Dr. Ricardo Mendoza Valdez",
        email="ricardo.mendoza@clinicanorte.mx",
        phone="+52 55 1000 2001",
        password_hash=hash_password(STAFF_PASSWORD),
        professional_title="Médico Veterinario Zootecnista",
        cedula="MVZ-12345678",
        job_title="Director Médico",
        description="Director médico y fundador de la clínica, especialista en cirugía de pequeños animales.",
        specialty="Cirugía de tejidos blandos",
        signature_url="/media/clinics/default/signature-admin.png",
        is_visible_on_login=True,
    )
    db.add(admin)
    db.flush()

    vets = [
        ("Dra. Elena Ramírez Soto", "elena.ramirez@clinicanorte.mx", "Dermatología",
         "Médica Veterinaria Zootecnista", "MVZ-23456789", "Especialista en dermatología y alergias caninas"),
        ("Dr. Fernando Guzmán Lara", "fernando.guzman@clinicanorte.mx", "Medicina interna",
         "Médico Veterinario Zootecnista", "MVZ-34567890", "Medicina interna y cardiología de pequeños animales"),
        ("Dra. Valeria Ortiz Peña", "valeria.ortiz@clinicanorte.mx", "Imagenología",
         "Médica Veterinaria Zootecnista", "MVZ-45678901", "Diagnóstico por imagen: radiología y ultrasonido"),
        ("Dr. Emilio Castro Ríos", "emilio.castro@clinicanorte.mx", "Medicina felina",
         "Médico Veterinario Zootecnista", "MVZ-56789012", "Especialidad en medicina felina y manejo del estrés"),
        ("Dra. Renata Juárez Pacheco", "renata.juarez@clinicanorte.mx", "Urgencias y terapia intensiva",
         "Médica Veterinaria Zootecnista", "MVZ-67890123", "Atención de urgencias y cuidados críticos"),
    ]
    for name, email, spec, title, cedula, desc in vets:
        db.add(User(
            clinic_id=cid, branch_id=bid, role="veterinario",
            full_name=name, email=email, phone=unique_phone(set()),
            password_hash=hash_password(STAFF_PASSWORD),
            professional_title=title, cedula=cedula, job_title="Médico Veterinario",
            description=desc, specialty=spec,
            signature_url="/media/clinics/default/signature-vet.png",
            reports_to=admin.id,
            is_visible_on_login=True,
        ))

    receps = [
        ("Mariana Delgado Fuentes", "mariana.delgado@clinicanorte.mx"),
        ("Ángel Cárdenas Núñez", "angel.cardenas@clinicanorte.mx"),
    ]
    for name, email in receps:
        db.add(User(
            clinic_id=cid, branch_id=bid, role="recepcion",
            full_name=name, email=email, phone=unique_phone(set()),
            password_hash=hash_password(STAFF_PASSWORD),
            job_title="Recepcionista",
            description="Atención al cliente y agenda",
            is_visible_on_login=True,
        ))
    db.flush()

    # --- Catálogo de servicios y productos ---
    for sname, price in SERVICE_CATALOG:
        db.add(ServiceCatalog(clinic_id=cid, name=sname, price=price))

    for pname, cat, unit, price in INVENTORY_PRODUCTS:
        p = InventoryProduct(clinic_id=cid, branch_id=bid, name=pname, category=cat, unit=unit)
        db.add(p)
        db.flush()
        lot = InventoryLot(
            product_id=p.id,
            lot_number=f"LOT-{random.randint(1000, 9999)}",
            expiration_date=date(random.choice([2027, 2028]), random.randint(1, 12), random.randint(1, 28)),
            quantity=round(random.uniform(20, 200), 2),
        )
        db.add(lot)
        db.flush()
        db.add(InventoryMovement(
            product_id=p.id, lot_id=lot.id, quantity_delta=lot.quantity,
            reason="initial_stock", created_by=admin.id,
        ))

    ensure_standard_plans(db, str(cid))
    db.flush()

    # --- Dueños y mascotas ---
    owner_ids = []
    owner_phone_seen = set(
        db.execute(text("SELECT phone FROM owners WHERE phone IS NOT NULL")).scalars()
    )
    for i in range(N_OWNERS):
        oid = uuid.uuid4()
        full = f"{random.choice(MEX_FIRST)} {random.choice(MEX_LAST)} {random.choice(MEX_LAST)}"
        first_l = full.split()[0].lower()
        first_l = (first_l.replace("á", "a").replace("é", "e").replace("í", "i")
                   .replace("ó", "o").replace("ú", "u"))
        email = f"{first_l}.{i}@correo.demo"
        phone = unique_phone(owner_phone_seen)
        db.execute(
            text(
                "INSERT INTO owners (id, phone, email, password_hash, full_name, "
                "alt_contact_name, alt_phone, profile_photo_url, created_at) "
                "VALUES (:id, :phone, :email, :phash, :full, :altn, :altp, NULL, :created)"
            ),
            {
                "id": oid, "phone": phone, "email": email,
                "phash": hash_password(OWNER_PASSWORD), "full": full,
                "altn": f"{random.choice(MEX_FIRST)} {random.choice(MEX_LAST)}",
                "altp": unique_phone(owner_phone_seen),
                "created": rand_dt(date(2025, 1, 1), 8, 20),
            },
        )
        db.execute(
            text(
                "INSERT INTO owner_preferences (owner_id, preferred_channel, accepts_reminders, accepts_reminders_at) "
                "VALUES (:id, :ch, :acc, CASE WHEN :acc THEN now() ELSE NULL END)"
            ),
            {
                "id": oid,
                "ch": random.choices(["whatsapp", "email", "sms"], weights=[70, 25, 5])[0],
                "acc": random.random() < 0.65,
            },
        )
        owner_ids.append(oid)
    db.commit()

    pet_plan = [owner_ids[0], owner_ids[0]]
    for oid in owner_ids[1:]:
        pet_plan.append(oid)
    assert len(pet_plan) == N_PETS, f"Esperado {N_PETS}, {len(pet_plan)}"

    pets = []
    for oid in pet_plan:
        species = random.choice(["perro", "perro", "gato"])
        sex = random.choice(["macho", "hembra"])
        breed = (
            random.choice(SPECIES_BREEDS["perro"])[0]
            if species == "perro"
            else random.choice(SPECIES_BREEDS["gato"])[0]
        )
        pet = Pet(
            clinic_id=cid,
            name=pick_name(species, sex),
            species=species,
            breed=breed,
            color_primary=random.choice(COLORS),
            color_secondary=random.choice([random.choice(COLORS), None]),
            markings=random.choice([random.choice(MARKINGS), None]),
            sex=sex,
            birth_date=rand_date(),
            allergies=random.choice([None, None, None, None, *ALLERGIES]),
            clinical_alert_text=random.choice([None, None, None, None, *ALERT_TEXTS]),
            is_active=True,
            qr_token=uuid.uuid4().hex[:24],
            created_at=rand_dt(date(2024, 1, 1), 8, 20),
        )
        db.add(pet)
        db.flush()
        db.execute(
            text(
                "INSERT INTO owner_pet_links (id, owner_id, pet_id, clinic_id, is_active, linked_at) "
                "VALUES (:id, :oid, :pid, :cid, true, :linked)"
            ),
            {
                "id": uuid.uuid4(), "oid": oid, "pid": pet.id, "cid": cid,
                "linked": rand_dt(date(2024, 1, 1), 8, 20),
            },
        )
        pets.append(pet)
    db.commit()

    n_staff = db.execute(
        text("SELECT count(*) FROM users WHERE clinic_id = :c"), {"c": cid}
    ).scalar()
    print(f"Clínica: {CLINIC_NAME} (id={cid})")
    print(f"Staff: {n_staff} | Servicios: {len(SERVICE_CATALOG)} | "
          f"Productos: {len(INVENTORY_PRODUCTS)} | Dueños: {len(owner_ids)} | Mascotas: {len(pets)}")
    print("Credenciales staff (demo): ricardo.mendoza@clinicanorte.mx / " + STAFF_PASSWORD)
    print("Credenciales dueños (demo): <primer-nombre>.N@correo.demo / " + OWNER_PASSWORD)


if __name__ == "__main__":
    main()