"""Seed de la clínica demo "Clínica Veterinaria del Norte".

Crea un tenant demo con datos ficticios pero realistas:

- 1 admin, 5 veterinarios y 2 recepcionistas (mínimo un miembro por rol).
- ~160 dueños con datos completos (contacto + alternativo + preferencias).
- 210 mascotas con TODOS los campos llenos. ~39 dueños comparten 2-3 mascotas
  para demostrar la vista de familia (owner_pet_links).
- Nombres de mascotas SIN números, tomados de registros reales:
  * Perros: top 100 macho + 100 hembra reales de EUA (namedat.com, basado en
    registros Sniffspot / American Kennel Club).
  * Gatos: nombres populares reales (Rover / Friskies / Sniffspot).
- Fotos de internet para perros (dog.ceo API) y gatos (cataas.com), guardadas
  en media local y expuestas vía /media/...
- Registros desde 2026-07-29 hasta 2026-08-29 (un mes):
  citas, bloques, lista de espera, consultas + items, pesos, facturas + items,
  catálogo de servicios y productos + lotes/movimientos, alertas clínicas,
  vacunas (planes estándar + carnet), recordatorios salientes, notificaciones
  internas y auditoría.

Idempotente: si la clínica ya existe, la elimina (con sus dependencias) y la
recrea. Uso:

    .venv-linux/bin/python -m scripts.seed_clinica_norte
"""

import json
import random
import threading
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select, text

from app.core.security import hash_password
from app.core.seed_vaccination_plans import ensure_standard_plans
from app.core.storage import public_url, save_media
from app.db.session import SessionLocal
from app.models import (
    Appointment,
    AppointmentWaitlist,
    AuditLog,
    ClinicalAlert,
    Clinic,
    ClinicBranch,
    ClinicSubscriptionEvent,
    Consultation,
    ConsultationItem,
    InternalNotification,
    InventoryLot,
    InventoryMovement,
    InventoryProduct,
    Invoice,
    InvoiceItem,
    OutboundNotification,
    Pet,
    PetCarnetRecord,
    PetVaccinationDose,
    PetVaccinationPlan,
    PetWeightRecord,
    ScheduleBlock,
    ServiceCatalog,
    User,
    VaccinationPlan,
)

CLINIC_NAME = "Clínica Veterinaria del Norte"
BRANCH_NAME = "Sede Norte"
STAFF_PASSWORD = "Norte2026!"
OWNER_PASSWORD = "dueño2026"

FROM_DATE = date(2026, 7, 29)
TODAY = date(2026, 8, 29)

random.seed(20260829)

# ---------------------------------------------------------------------------
# Nombres reales de perros (namedat.com — registros Sniffspot/AKC, EUA)
# ---------------------------------------------------------------------------
DOG_MALE = [
    "Rocky", "Buddy", "Max", "Duke", "Zeus", "Milo", "Bruno", "Lucky", "Bear", "Tucker",
    "Apollo", "Charlie", "Chase", "Toby", "Blue", "King", "Jasper", "Tank", "Hank", "Eddie",
    "Murphy", "Roscoe", "Diesel", "Oliver", "Tommy", "Levi", "Buck", "Jack", "Buster", "Arlo",
    "Leo", "Rambo", "Ollie", "Oreo", "Jax", "Tito", "Cash", "Scout", "Bubba", "Archie",
    "Cooper", "Lincoln", "Maverick", "Scooby", "Ace", "Bentley", "Draco", "Moose", "Mikey", "Ghost",
    "Rex", "Hudson", "Winston", "Chance", "Rudy", "Petey", "Bandit", "Rusty", "Walter", "Brownie",
    "Randy", "Dusty", "Teddy", "Romeo", "Billy", "Coco", "Brutus", "Boomer", "Simba", "Harry",
    "Mickey", "Bolt", "Tyson", "Louie", "Kevin", "Prince", "Theo", "Wilson", "Jake", "Mack",
    "Shadow", "Dale", "Dallas", "Rocco", "Dodger", "Nash", "Ronnie", "Ranger", "Harley", "Archer",
    "Colby", "Marley", "Finn", "Casper", "Smokey", "Copper", "Gus", "Vader", "Canelo", "Thor",
]
DOG_FEMALE = [
    "Daisy", "Bella", "Luna", "Honey", "Maggie", "Willow", "Nala", "Lucy", "Athena", "Sadie",
    "Stella", "Millie", "Molly", "Penny", "Gracie", "Sasha", "Diamond", "Ruby", "Rosie", "Rose",
    "Nova", "Winnie", "Piper", "Hazel", "Annie", "Bailey", "Xena", "Lilly", "Sugar", "Sandy",
    "Bonnie", "Ellie", "Cookie", "Abby", "Snow", "Ginger", "Lulu", "Lola", "Sally", "Mia",
    "Maya", "Dixie", "Missy", "Poppy", "Angel", "Fiona", "Charlotte", "Mabel", "Peaches", "Aurora",
    "Misty", "Princess", "Lady", "Betty", "Melody", "Maddie", "Tina", "Petunia", "Lily", "Holly",
    "Trixie", "Opal", "Pearl", "Evie", "Roxie", "Olive", "Roxy", "Lexi", "Selena", "Belle",
    "Star", "Sheba", "Darla", "Rosa", "Layla", "Harper", "Nora", "Delilah", "Peach", "Sissy",
    "Kira", "Violet", "Jade", "Sage", "Paloma", "Eden", "Grace", "Bridget", "Brandy", "Hope",
    "Pinky", "Onyx", "Dottie", "Sophie", "Ember", "Pixie", "Dolly", "Iris", "Emma", "Canela",
]
# Nombres reales de gatos (Rover/Friskies/Sniffspot)
CAT_NAMES = [
    "Simba", "Milo", "Luna", "Oliver", "Bella", "Lucy", "Charlie", "Max", "Kitty", "Leo",
    "Lily", "Nala", "Cleo", "Felix", "Momo", "Chloe", "Tigger", "Sasha", "Salem", "Whiskers",
    "Tom", "Mia", "Oreo", "Pelusa", "Gato", "Michi", "Canela", "Negro", "Blanco", "Ronroneo",
    "Nube", "Coco", "Ginger", "Toby", "Pipa", "Moka", "Kiwi", "Trufa", "Minty", "Ambar",
]
# Otros nombres reales para especies distintas a perro/gato
OTHER_NAMES = [
    "Kiwi", "Pipa", "Canela", "Chispa", "Nube", "Mango", "Trufa", "Churro", "Pancha", "Peluche",
    "Fideo", "Mantequilla", "Almendra", "Tostada", "Pecas", "Mapache", "Bombón", "Nieve", "Cacao",
    "Gordito", "Diamante", "Jade", "Tornillo", "Canica", "Waffle", "Polvo", "Tinta", "Maple",
    "Brisa", "Sol", "Tequila", "Caspian", "Moka", "Tila", "Copito", "Rayito", "Duna", "Lluvia",
]

MEX_FIRST = [
    "María", "José", "Ana", "Juan", "Carmen", "Luis", "Laura", "Carlos", "Sofía", "Miguel",
    "Elena", "Jorge", "Mónica", "Raúl", "Lucía", "Pedro", "Isabel", "Andrés", "Rosa", "David",
    "Patricia", "Óscar", "Marta", "Fernando", "Claudia", "Sergio", "Paula", "Alejandro", "Julia",
    "Ricardo", "Gabriela", "Hugo", "Natalia", "Rubén", "Silvia", "Arturo", "Verónica", "Iván",
    "Cristina", "Manuel", "Valeria", "Diego", "Adriana", "Emilio", "Daniela", "Rodrigo", "Camila",
    "Santiago", "Renata", "Ximena", "Sebastián", "Mariana", "Ángel", "Regina", "Pablo", "Andrea",
]
MEX_LAST = [
    "García", "Rodríguez", "López", "Martínez", "Hernández", "González", "Pérez", "Sánchez",
    "Ramírez", "Torres", "Flores", "Rivera", "Cruz", "Morales", "Ortiz", "Vargas", "Castillo",
    "Rojas", "Chávez", "Medina", "Guzmán", "Lara", "Aguilar", "Delgado", "Fuentes", "Campos",
    "Peña", "Vega", "Mendoza", "Reyes", "Soto", "Ibarra", "Tapia", "León", "Castro", "Ríos",
    "Salas", "Acosta", "Navarro", "Espinoza", "Ruiz", "Molina", "Juárez", "Domínguez", "Cabrera",
    "Álvarez", "Cárdenas", "Pacheco", "Gutiérrez", "Núñez",
]

SPECIES_BREEDS = {
    "perro": [
        ("Mestizo", None), ("Labrador Retriever", "labrador"), ("Pastor Alemán", "germanshepherd"),
        ("Chihuahua", "chihuahua"), ("Pug", "pug"), ("Bulldog Francés", "frenchbulldog"),
        ("Golden Retriever", "goldenretriever"), ("Beagle", "beagle"), ("Caniche (Poodle)", "poodle"),
        ("Bóxer", "boxer"), ("Husky Siberiano", "husky"), ("Dálmata", "dalmatian"),
        ("Cocker Spaniel", "cocker spaniel"), ("Shih Tzu", "shih tzu"),
        ("Yorkshire Terrier", "yorkshire"), ("Pomerania", "pomeranian"),
        ("Rottweiler", "rottweiler"), ("Doberman", "doberman"), ("Bull Terrier", "bullterrier"),
        ("Teckel (Dachshund)", "dachshund"),
    ],
    "gato": [
        ("Mestizo", None), ("Siamés", None), ("Persa", None), ("British Shorthair", None),
        ("Maine Coon", None), ("Bengalí", None), ("Ragdoll", None), ("Sphynx", None),
        ("Abisinio", None), ("Angora", None), ("Cornish Rex", None), ("Oriental", None),
        ("Siberiano", None), ("Birmano", None),
    ],
    "ave": [
        "Perico Australiano", "Cacatúa", "Cotorra", "Canario", "Periquito", "Agapornis", "Guacamaya",
    ],
    "conejo": [
        "Cabeza de León", "Holland Lop", "Belier", "Angora", "Rex", "Gigante de Flandes", "Mestizo",
    ],
    "roedor": [
        "Hámster Sirio", "Hámster Enano", "Cuyo (Cobaya)", "Chinchilla", "Jerbo", "Ratón",
    ],
    "reptil": [
        "Tortuga de Agua", "Gecko Leopardo", "Tortuga Rusa", "Serpiente del Maíz", "Iguana", "Camaleón",
    ],
    "hurones": ["Hurón Europeo", "Hurón Americano", "Hurón Albino"],
    "peces": ["Goldfish", "Beta", "Guppy", "Tetra Neón", "Molly", "Disco"],
    "anfibio": ["Rana Toro", "Axolote", "Rana Arbórea", "Salamandra"],
    "equino": ["Cuarto de Milla", "Pura Sangre", "Árabe", "Criollo", "Poni Shetland", "Appaloosa"],
    "otro": ["Mestizo", "Cerdo Miniatura", "Erizo", "Hurón"],
}
# Pesos relativos: 80% perro, 10% gato, 10% repartido en el resto
SPECIES_ORDER = ["perro", "gato", "ave", "conejo", "roedor", "reptil", "hurones", "peces", "anfibio", "equino", "otro"]
SPECIES_WEIGHTS = [80, 10, 2, 2, 2, 1, 1, 1, 0, 1, 0]

COLORS = [
    "Café", "Negro", "Blanco", "Gris", "Dorado", "Crema", "Atigrado", "Bicolor", "Tricolor",
    "Cobrizo", "Gris azulado", "Marrón claro", "Negro y blanco", "Naranja", "Chocolate", "Plateado",
]
MARKINGS = ["Mancha en el lomo", "Cicatriz en oreja", "Pata blanca", "Estrella en la frente", "Corbata blanca", "Oreja caída", "Punto en la cola"]
ALLERGIES = ["Alergia alimentaria", "Penicilina", "Pulgas", "Alergia a pollo", "Dermatitis atópica", "Ácaros"]
ALERT_TEXTS = [
    "Requiere dieta especial baja en sodio",
    "Epiléptico, medicación diaria",
    "Cardiópata en seguimiento",
    "Diabético, requiere control de glucosa",
    "Artrosis avanzada, evitar saltos",
    "Sensible al manejo en consulta",
]

PROCEDURES = [
    "Consulta", "Consulta de control", "Vacunación", "Desparasitación", "Cirugía", "Baño y corte",
    "Corte de uñas", "Urgencia", "Limpieza dental", "Rayos X", "Ultrasonido", "Certificado de salud",
    "Estética", "Corte de pelo", "Consulta dermatológica", "Chequeo geriátrico",
]
REASONS = [
    "El paciente llega con vómito y decaimiento",
    "Control periódico de salud",
    "Le notaron una bolita en el abdomen",
    "Fiebre y falta de apetito desde ayer",
    "Cojera en pata trasera derecha",
    "Come mucho pero baja de peso",
    "Tos seca persistente",
    "Picazón intensa y pérdida de pelo",
    "Revisión de rutina post-vacunación",
    "Accidente doméstico leve",
    "Seguimiento de tratamiento anterior",
    "Primera consulta del paciente",
    "Problemas para orinar",
    "Mal aliento y sarro dental",
    "Cambio de comportamiento repentino",
]
DIAGNOSIS = [
    "Gastroenteritis aguda", "Otitis externa", "Dermatitis alérgica", "Infección respiratoria leve",
    "Sobrepeso sin complicaciones", "Displasia de cadera", "Conjuntivitis", "Parasitosis intestinal",
    "Ansiedad por separación", "Artritis leve", "Sin hallazgos patológicos", "Cálculo dental",
    "Infección urinaria", "Alergia alimentaria", "Herida superficial",
]
TREATMENTS = [
    "Antibiótico por 7 días + protectores gástricos",
    "Limpieza de oído y gotas óticas por 10 días",
    "Cambio de dieta hipoalergénica + baños medicados",
    "Antiparasitario oral y refuerzo de higiene",
    "Plan de dieta y ejercicio; control en 4 semanas",
    "Antiinflamatorio y reposo; valorar fisioterapia",
    "Colirio antibiótico 2 veces al día",
    "Desparasitación completa y control coprológico",
    "Fomentar rutinas y feromonas; seguimiento conductual",
    "Analgésico y suplemento articular",
    "Sin tratamiento; vigilancia en casa",
    "Limpieza dental con ultrasonido",
    "Antibiótico + incremento de ingesta de agua",
    "Dieta de eliminación durante 6 semanas",
    "Curaciones diarias y vendaje oclusivo",
]
CARE_INSTRUCTIONS = [
    "Reposo relativo y agua fresca en abundancia",
    "Aplicar medicamento a la misma hora todos los días",
    "Evitar baños por una semana",
    "Mantener en lugar cálido y seco",
    "Regresar si no mejora en 48 horas",
    "Control de peso quincenal en casa",
    "Mantener al día el esquema de vacunación",
    "Cepillado diario durante la muda",
]

SERVICE_CATALOG = [
    ("Consulta general", 350.0), ("Consulta de control", 250.0), ("Consulta a domicilio", 600.0),
    ("Vacunación (dosis)", 300.0), ("Desparasitación interna", 180.0), ("Desparasitación externa", 220.0),
    ("Baño y corte completo", 450.0), ("Baño medicado", 420.0), ("Corte de uñas", 90.0),
    ("Limpieza dental", 1200.0), ("Rayos X (placa)", 500.0), ("Ultrasonido abdominal", 700.0),
    ("Cirugía menor", 1800.0), ("Esterilización canina", 2200.0), ("Esterilización felina", 1500.0),
    ("Certificado de salud", 350.0), ("Urgencia (recargo)", 500.0), ("Estética básica", 380.0),
    ("Chequeo geriátrico", 550.0), ("Consulta dermatológica", 400.0), ("Ecografía cardiaca", 900.0),
]
INVENTORY_PRODUCTS = [
    ("Vacuna DHPP", "biológico", "dosis", 320.0), ("Vacuna antirrábica", "biológico", "dosis", 280.0),
    ("Vacuna triple felina", "biológico", "dosis", 350.0), ("Antiparasitario oral", "farmacia", "tableta", 120.0),
    ("Antiparasitario tópico", "farmacia", "pipeta", 160.0), ("Amoxicilina 250mg", "farmacia", "tableta", 15.0),
    ("Antiinflamatorio canino", "farmacia", "tableta", 18.0), ("Colirio antibiótico", "farmacia", "frasco", 140.0),
    ("Gotas óticas", "farmacia", "frasco", 130.0), ("Shampoo hipoalergénico", "estética", "frasco", 220.0),
    ("Shampoo medicado", "estética", "frasco", 260.0), ("Suero oral", "farmacia", "sobre", 12.0),
    ("Alimento renal", "alimento", "bolsa", 650.0), ("Alimento hipoalergénico", "alimento", "bolsa", 720.0),
    ("Snacks dentales", "alimento", "bolsa", 110.0), ("Arena aglomerante", "insumos", "bolsa", 95.0),
    ("Cama ortopédica", "accesorios", "pieza", 850.0), ("Collar isabelino", "accesorios", "pieza", 120.0),
    ("Vendas y gasas", "insumos", "pieza", 45.0), ("Jeringas 5ml", "insumos", "caja", 60.0),
    ("Guantes de látex", "insumos", "caja", 75.0), ("Desinfectante", "insumos", "litro", 130.0),
    ("Anestésico local", "farmacia", "frasco", 380.0), ("Hilo de sutura", "insumos", "pieza", 90.0),
    ("Suero fisiológico", "farmacia", "bolsa", 95.0), ("Microchip de identificación", "accesorios", "pieza", 320.0),
    ("Cepillo dental para mascotas", "accesorios", "pieza", 85.0), ("Prenatal vitaminas", "farmacia", "frasco", 210.0),
]
SUPPLIERS = [
    "Distribuidora Veterinaria del Bajío", "Insumos Veterinarios del Norte S.A.",
    "Laboratorios Agropec", "Proveedora Vetmax", "Grupo Médico Veterinario de Monterrey",
    "Alimentos y Farmacia Animal Noroeste",
]
BLOCK_REASONS = ["Junta de staff", "Mantenimiento", "Capacitación", "Feriado", "Descanso", "Inventario"]
VACCINES_PER_SPECIES = {
    "perro": ["Cuádruple / séptuple canina (DHPP + Leptospira)", "Rabia", "Bordetella (tos de perrera)", "Giardia"],
    "gato": ["Triple felina (panleucopenia, rinotraqueítis, calicivirus)", "Leucemia felina (FeLV)", "Rabia"],
    "equino": ["Tétanos (toxoide tetánico)", "Influenza equina", "Rabia"],
    "hurones": ["Moquillo canino (monovalente)", "Rabia"],
    "conejo": ["Enfermedad Hemorrágica Viral (RHD)"],
}
VACCINE_BRANDS = {
    "Cuádruple / séptuple canina (DHPP + Leptospira)": "Canigen DHPPi/L",
    "Rabia": "Rabigen Mono",
    "Bordetella (tos de perrera)": "Bronchine CAe",
    "Giardia": "GiardiaVax",
    "Triple felina (panleucopenia, rinotraqueítis, calicivirus)": "Feligen CRP",
    "Leucemia felina (FeLV)": "Leucogen",
    "Tétanos (toxoide tetánico)": "Toxoide Tetánico",
    "Influenza equina": "Fluvac Innovator",
    "Moquillo canino (monovalente)": "Purevax Ferret",
    "Enfermedad Hemorrágica Viral (RHD)": "Pestorin",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rand_date(start_year=2015, end_year=2025):
    start = date(start_year, 1, 1).toordinal()
    end = date(end_year, 12, 31).toordinal()
    return date.fromordinal(random.randint(start, end))


def rand_dt(day: date, hour_from=8, hour_to=19):
    hour = random.randint(hour_from, hour_to)
    minute = random.choice([0, 15, 30, 45])
    return datetime.combine(day, time(hour, minute))


def unique_phone(used: set) -> str:
    while True:
        phone = f"+52 55 {random.randint(1000, 9999)} {random.randint(1000, 9999)}"
        if phone not in used:
            used.add(phone)
            return phone


def _download(url: str, timeout: int = 45) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (VetCore-seed)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            if resp.status != 200 or not data:
                return None
            return data
    except Exception:
        return None


DOG_CEO_SLUG_ALIASES = {
    "cocker spaniel": "cocker spaniel", "shih tzu": "shih tzu",
    "yorkshire": "yorkshire", "bullterrier": "bull terrier",
}


def _dog_breed_images(breed_slug: str) -> list[str]:
    """Devuelve hasta 25 URLs de fotos de una raza vía dog.ceo."""
    if breed_slug is None:
        return []
    slug = DOG_CEO_SLUG_ALIASES.get(breed_slug, breed_slug)
    try:
        url = f"https://dog.ceo/api/breed/{slug}/images/random/25"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (VetCore-seed)"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read())
        return payload.get("message") if payload and payload.get("status") == "success" else []
    except Exception:
        return []


def _download_pet_photo(pet_id, name, url) -> str | None:
    """Descarga la imagen y la guarda en media; devuelve la URL pública."""
    content = _download(url)
    if not content:
        return None
    if len(content) < 500:
        return None
    try:
        rel = save_media(f"pets/{pet_id}", f"{name}.jpg", content)
        return public_url(rel)
    except Exception:
        return None


def _species_for_index(i: int) -> str:
    r = random.random() * 100
    acc = 0
    for sp, w in zip(SPECIES_ORDER, SPECIES_WEIGHTS):
        acc += w
        if r < acc:
            return sp
    return "perro"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    db = SessionLocal()

    # --- Limpieza idempotente ---
    existing = db.scalar(
        text("SELECT id FROM clinics WHERE name = :n"), {"n": CLINIC_NAME}
    )
    if existing:
        cid = str(existing)
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
        db.execute(delete(Clinic).where(Clinic.id == existing))
        # owners es global (sin clinic_id): limpia los creados por este seed
        db.execute(text("DELETE FROM owner_preferences WHERE owner_id IN "
                        "(SELECT id FROM owners WHERE email LIKE '%@correo.demo')"))
        db.execute(text("DELETE FROM owners WHERE email LIKE '%@correo.demo'"))
        db.commit()
        print(f"Clínica previa '{CLINIC_NAME}' eliminada.")

    # --- Clínica y sucursal ---
    clinic = Clinic(
        name=CLINIC_NAME,
        contact_name="Ricardo Mendoza Valdez",
        contact_phone="+52 55 1000 2000",
        contact_email="contacto@clinicaveterinariadelnorte.mx",
        subscription_status="active",
        timezone="America/Mexico_City",
        address="Av. Insurgentes Norte 1420, Col. Lindavista, 07300 Ciudad de México, CDMX",
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
        address="Av. Insurgentes Norte 1420, Col. Lindavista, 07300 Ciudad de México, CDMX",
        phone="+52 55 1000 2000",
    )
    db.add(branch)
    db.flush()
    bid = branch.id

    db.add(ClinicSubscriptionEvent(
        clinic_id=cid, event_type="activated", notes="Alta de clínica demo",
    ))

    # --- Staff: 1 admin, 5 veterinarios, 2 recepcionistas ---
    staff = []
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
    staff.append(admin)

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
    vet_users = []
    for name, email, spec, title, cedula, desc in vets:
        u = User(
            clinic_id=cid, branch_id=bid, role="veterinario",
            full_name=name, email=email, phone=unique_phone(set()),
            password_hash=hash_password(STAFF_PASSWORD),
            professional_title=title, cedula=cedula, job_title="Médico Veterinario",
            description=desc, specialty=spec,
            signature_url="/media/clinics/default/signature-vet.png",
            reports_to=admin.id,
            is_visible_on_login=True,
        )
        db.add(u)
        staff.append(u)
        vet_users.append(u)

    receps = [
        ("Mariana Delgado Fuentes", "mariana.delgado@clinicanorte.mx"),
        ("Ángel Cárdenas Núñez", "angel.cardenas@clinicanorte.mx"),
    ]
    recep_users = []
    for name, email in receps:
        u = User(
            clinic_id=cid, branch_id=bid, role="recepcion",
            full_name=name, email=email, phone=unique_phone(set()),
            password_hash=hash_password(STAFF_PASSWORD),
            job_title="Recepcionista",
            description="Atención al cliente y agenda",
            is_visible_on_login=True,
        )
        db.add(u)
        staff.append(u)
        recep_users.append(u)

    # --- Catálogo de servicios y productos ---
    services = []
    for sname, price in SERVICE_CATALOG:
        s = ServiceCatalog(clinic_id=cid, name=sname, price=price)
        db.add(s)
        services.append(s)

    products = []
    product_price = {}
    for pname, cat, unit, price in INVENTORY_PRODUCTS:
        p = InventoryProduct(clinic_id=cid, branch_id=bid, name=pname, category=cat, unit=unit)
        db.add(p)
        db.flush()
        product_price[p.id] = price
        products.append(p)
        lot = InventoryLot(
            product_id=p.id,
            lot_number=f"LOT-{random.randint(1000, 9999)}-{random.randint(2026, 2027)}",
            expiration_date=date(random.choice([2027, 2028]), random.randint(1, 12), random.randint(1, 28)),
            quantity=round(random.uniform(20, 200), 2),
        )
        db.add(lot)
        db.flush()
        db.add(InventoryMovement(
            product_id=p.id, lot_id=lot.id, quantity_delta=lot.quantity,
            reason="initial_stock", created_by=admin.id,
        ))
    db.flush()

    # --- Dueños ---
    owner_ids = []
    owner_info = {}
    owner_phone_seen = set(
        db.execute(text("SELECT phone FROM owners WHERE phone IS NOT NULL")).scalars()
    )
    n_owners = 160
    for i in range(n_owners):
        oid = uuid.uuid4()
        full = f"{random.choice(MEX_FIRST)} {random.choice(MEX_LAST)} {random.choice(MEX_LAST)}"
        first_l = full.split()[0].lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
        email = f"{first_l}.{i}@correo.demo"
        phone = unique_phone(owner_phone_seen)
        alt_name = f"{random.choice(MEX_FIRST)} {random.choice(MEX_LAST)}"
        alt_phone = unique_phone(owner_phone_seen)
        db.execute(
            text(
                "INSERT INTO owners (id, phone, email, password_hash, full_name, "
                "alt_contact_name, alt_phone, profile_photo_url, created_at) "
                "VALUES (:id, :phone, :email, :phash, :full, :altn, :altp, NULL, :created)"
            ),
            {
                "id": oid, "phone": phone, "email": email,
                "phash": hash_password(OWNER_PASSWORD), "full": full,
                "altn": alt_name, "altp": alt_phone,
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
        owner_info[oid] = {"full": full, "phone": phone, "email": email}
    db.commit()
    print(f"Dueños: {len(owner_ids)}")

    # --- Mascotas ---
    used_dog_male = set()
    used_dog_female = set()
    used_cat = set()
    used_other = set()

    def pick_name(species: str, sex: str) -> str:
        if species == "perro":
            pool = DOG_MALE if sex == "macho" else DOG_FEMALE
            used = used_dog_male if sex == "macho" else used_dog_female
        elif species == "gato":
            pool, used = CAT_NAMES, used_cat
        else:
            pool, used = OTHER_NAMES, used_other
        avail = [n for n in pool if n not in used]
        if not avail:
            avail = [n for n in pool]
        name = random.choice(avail)
        used.add(name)
        return name

    # Distribución de mascotas por dueño (39 dueños multi-mascota)
    multi = owner_ids[:39]
    pet_plan: list[tuple] = []  # (owner_id)
    for i, oid in enumerate(multi):
        extra = 2 if i < 28 else 3
        for _ in range(extra):
            pet_plan.append(oid)
    for oid in owner_ids[39:]:
        pet_plan.append(oid)
    assert len(pet_plan) == 210, f"Esperado 210, {len(pet_plan)}"

    # Selección de especies coherente
    pet_entries = []
    for oid in pet_plan:
        species = _species_for_index(0)
        sex = random.choice(["macho", "hembra"])
        if species == "perro":
            breed, _slug = random.choice(SPECIES_BREEDS["perro"])
        else:
            breed = random.choice(SPECIES_BREEDS[species])
        pet_entries.append((oid, species, breed, sex))
    pet_entries.sort(key=lambda e: (e[1], e[2]))
    random.shuffle(pet_entries)

    pets = []
    for oid, species, breed, sex in pet_entries:
        name = pick_name(species, sex)
        pet = Pet(
            clinic_id=cid,
            name=name,
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
    print(f"Mascotas: {len(pets)}")

    # --- Fotos de internet (perros y gatos) ---
    print("Descargando fotos de perros (dog.ceo) y gatos (cataas)…")
    breed_cache: dict[str, list[str]] = {}
    photo_lock = threading.Lock()

    def photo_url_for(pet: Pet) -> str | None:
        if pet.species == "perro":
            slug = None
            for b, sl in SPECIES_BREEDS["perro"]:
                if b == pet.breed:
                    slug = sl
                    break
            if slug is None:
                # Mestizo u otra: foto aleatoria de cualquier perro
                url = "https://dog.ceo/api/breeds/image/random"
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (VetCore-seed)"})
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        data = json.loads(resp.read())
                    if data and data.get("status") == "success":
                        return data["message"]
                except Exception:
                    return None
                return None
            with photo_lock:
                urls = breed_cache.get(slug)
                if not urls:
                    urls = _dog_breed_images(slug)
                    breed_cache[slug] = urls
            if not urls:
                return None
            with photo_lock:
                url = urls.pop(0)
                if not urls:
                    urls2 = _dog_breed_images(slug)
                    if urls2:
                        urls.extend(urls2)
            return url
        if pet.species == "gato":
            return "https://cataas.com/cat?type=medium&ts=" + uuid.uuid4().hex[:8]
        return None

    def process_photo(pet: Pet) -> tuple[uuid.UUID, str | None]:
        src = photo_url_for(pet)
        if not src:
            return pet.id, None
        url = _download_pet_photo(pet.id, f"{pet.name}_{pet.id.hex[:8]}", src)
        return pet.id, url

    photo_results: dict[uuid.UUID, str | None] = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(process_photo, p) for p in pets if p.species in ("perro", "gato")]
        done = 0
        for fut in as_completed(futures):
            pid, url = fut.result()
            photo_results[pid] = url
            done += 1
            if done % 25 == 0:
                print(f"  fotos descargadas: {done}/{len(futures)}")
    n_photos = sum(1 for v in photo_results.values() if v)
    print(f"Fotos guardadas: {n_photos}/{len(pets)}")

    # Aplicar URLs de foto
    for pet in pets:
        url = photo_results.get(pet.id)
        if url:
            pet.clinical_photo_url = url
            pet.cartilla_photo_url = url
    db.commit()

    # --- Pesos (en el último mes) ---
    print("Registrando pesos…")
    for pet in pets:
        base = round(random.uniform(0.5, 42.0), 2)
        db.add(PetWeightRecord(
            pet_id=pet.id, clinic_id=cid,
            weight_kg=round(base + random.uniform(-0.3, 0.3), 2),
            recorded_at=rand_dt(FROM_DATE + timedelta(days=random.randint(0, 12)), 8, 18),
        ))
    db.commit()
    print(f"Pesos: {len(pets)}")

    # --- Citas en el último mes ---
    print("Generando citas…")
    appointments = []
    n_days = (TODAY - FROM_DATE).days + 1
    total_slots = 0
    for offset in range(n_days):
        day = FROM_DATE + timedelta(days=offset)
        weekday = day.weekday()
        count = random.randint(2, 5) if weekday >= 5 else random.randint(7, 13)
        slots = set()
        attempts = 0
        while len(slots) < count and attempts < 200:
            attempts += 1
            hour = random.randint(8, 19)
            minute = random.choice([0, 30])
            slots.add(time(hour, minute))
        for slot in sorted(slots):
            start = datetime.combine(day, slot)
            end = start + timedelta(minutes=random.choice([30, 45, 60]))
            if day < TODAY:
                status = random.choices(
                    ["completed", "completed", "completed", "cancelled", "cancelled", "no_show"],
                    weights=[30, 30, 25, 10, 5, 0],
                )[0]
                status = random.choices(["completed", "cancelled", "no_show"], weights=[60, 28, 12])[0]
            else:
                status = random.choices(["scheduled", "confirmed", "completed"], weights=[35, 40, 25])[0]
            walk_in = random.random() < 0.05
            pet = random.choice(pets) if not walk_in else None
            appt = Appointment(
                clinic_id=cid, branch_id=bid,
                pet_id=pet.id if pet else None,
                walk_in_name=f"Paciente {random.choice(DOG_MALE)}" if walk_in else None,
                vet_user_id=random.choice(vet_users).id if random.random() < 0.7 else None,
                procedure_type=random.choice(PROCEDURES),
                start_time=start, end_time=end, status=status,
            )
            db.add(appt)
            appointments.append(appt)
            total_slots += 1
    db.commit()
    print(f"Citas: {total_slots}")

    # --- Bloques de horario y lista de espera ---
    for _ in range(10):
        day = FROM_DATE + timedelta(days=random.randint(0, n_days - 1))
        if day > TODAY:
            day = TODAY
        start = rand_dt(day, 9, 17)
        db.add(ScheduleBlock(
            clinic_id=cid, branch_id=bid,
            vet_user_id=random.choice(vet_users).id if random.random() < 0.5 else None,
            start_time=start, end_time=start + timedelta(hours=1),
            reason=random.choice(BLOCK_REASONS),
        ))
    for _ in range(8):
        day = TODAY + timedelta(days=random.randint(1, 6))
        db.add(AppointmentWaitlist(
            clinic_id=cid, branch_id=bid,
            pet_id=random.choice(pets).id,
            desired_from=datetime.combine(day, time(10, 0)),
            desired_to=datetime.combine(day, time(18, 0)),
            status=random.choices(["waiting", "offered"], weights=[80, 20])[0],
        ))
    db.commit()

    # --- Consultas e items (para citas completadas con mascota) ---
    print("Generando consultas…")
    completed = [a for a in appointments if a.status == "completed" and a.pet_id]
    consultations = []
    for appt in completed:
        if random.random() > 0.75:
            continue
        cons = Consultation(
            clinic_id=cid, branch_id=bid, pet_id=appt.pet_id,
            vet_user_id=appt.vet_user_id or random.choice(vet_users).id,
            reason=random.choice(REASONS),
            diagnosis=random.choice(DIAGNOSIS),
            treatment=random.choice(TREATMENTS),
            care_instructions=random.choice(CARE_INSTRUCTIONS),
            next_appointment_suggestion=(
                TODAY + timedelta(days=random.randint(7, 21))
                if random.random() < 0.4 else None
            ),
            performed_at=appt.start_time + timedelta(minutes=random.randint(5, 40)),
            created_at=appt.start_time,
        )
        db.add(cons)
        db.flush()
        n_items = random.randint(1, 3)
        for _ in range(n_items):
            if random.random() < 0.55:
                db.add(ConsultationItem(
                    consultation_id=cons.id,
                    description=random.choice(SERVICE_CATALOG)[0],
                    quantity=1,
                ))
            else:
                prod = random.choice(products)
                db.add(ConsultationItem(
                    consultation_id=cons.id, product_id=prod.id,
                    description=prod.name,
                    quantity=round(random.uniform(1, 2), 0),
                ))
        consultations.append(cons)
    db.commit()
    print(f"Consultas: {len(consultations)}")

    # --- Pesos vinculados a consultas ---
    for cons in consultations:
        db.add(PetWeightRecord(
            pet_id=cons.pet_id, clinic_id=cid,
            weight_kg=round(random.uniform(1.0, 40.0), 2),
            recorded_at=cons.performed_at,
            consultation_id=cons.id,
        ))
    db.commit()

    # --- Facturas e items ---
    print("Generando facturas…")
    invoices = []
    for cons in consultations:
        if random.random() > 0.92:
            continue
        owner_id = db.execute(
            text("SELECT owner_id FROM owner_pet_links WHERE pet_id = :p LIMIT 1"),
            {"p": cons.pet_id},
        ).scalar()
        items = []
        total = 0.0
        # 1-2 servicios
        for _ in range(random.randint(1, 2)):
            svc = random.choice(services)
            qty = 1
            total += float(svc.price) * qty
            items.append((svc.id, svc.name, qty, float(svc.price)))
        # 0-2 productos
        for _ in range(random.randint(0, 2)):
            prod = random.choice(products)
            qty = random.choice([1, 1, 1, 2])
            unit = product_price[prod.id]
            total += unit * qty
            items.append((None, prod.name, qty, unit))
        inv = Invoice(
            clinic_id=cid, branch_id=bid,
            owner_id=owner_id,
            pet_id=cons.pet_id,
            consultation_id=cons.id,
            total=round(total, 2),
            status=random.choices(["paid", "pending"], weights=[92, 8])[0],
            created_at=cons.performed_at,
        )
        db.add(inv)
        db.flush()
        for sid, desc, qty, unit in items:
            db.add(InvoiceItem(
                invoice_id=inv.id, service_id=sid, description=desc,
                quantity=qty, unit_price=round(unit, 2), discount_percent=0,
            ))
        invoices.append(inv)
    db.commit()
    print(f"Facturas: {len(invoices)}")

    # --- Movimientos de inventario (ventas) ---
    for inv in invoices[:80]:
        for item in inv.items:
            if item.product_id:
                db.add(InventoryMovement(
                    product_id=item.product_id,
                    quantity_delta=-float(item.quantity),
                    reason="sale",
                    reference_id=inv.id,
                    created_by=random.choice(vet_users).id,
                ))
    db.commit()

    # --- Planes estándar de vacunación ---
    ensure_standard_plans(db, str(cid))
    standard_plans = list(db.scalars(
        select(VaccinationPlan).where(
            VaccinationPlan.clinic_id == cid,
            VaccinationPlan.is_standard.is_(True),
        )
    ))
    db.commit()
    print(f"Planes de vacunación: {len(standard_plans)}")

    # --- Carnet de vacunas aplicadas en el mes ---
    carnet_count = 0
    for pet in pets:
        species_vaccines = VACCINES_PER_SPECIES.get(pet.species)
        if not species_vaccines or random.random() > 0.42:
            continue
        vaccine = random.choice(species_vaccines)
        day = FROM_DATE + timedelta(days=random.randint(0, n_days - 1))
        if day > TODAY:
            day = TODAY
        db.add(PetCarnetRecord(
            clinic_id=cid, pet_id=pet.id,
            vaccine=vaccine,
            brand=VACCINE_BRANDS.get(vaccine),
            date_applied=day,
            lot=f"L{vaccine[:2].upper()}{random.randint(100000, 999999)}",
            vet_user_id=random.choice(vet_users).id,
            notes=random.choice(["Dosis aplicada sin reacciones", "Toleró bien el procedimiento", None, None, None]),
        ))
        carnet_count += 1
    db.commit()
    print(f"Registros de carnet: {carnet_count}")

    # --- Planes de vacunación asignados (mascotas jóvenes) ---
    young = [p for p in pets if p.birth_date and (date.today() - p.birth_date).days <= 365 * 2]
    assigned = 0
    for pet in young[:18]:
        candidates = [pl for pl in standard_plans if pl.species == pet.species]
        if not candidates:
            continue
        plan = random.choice(candidates)
        start = FROM_DATE + timedelta(days=random.randint(0, n_days - 1))
        pvp = PetVaccinationPlan(
            clinic_id=cid, pet_id=pet.id, plan_id=plan.id, branch_id=bid,
            vet_user_id=random.choice(vet_users).id,
            start_date=start, start_time=time(10, 0), duration_minutes=30,
            created_by=random.choice(vet_users).id,
        )
        db.add(pvp)
        db.flush()
        for i, step in enumerate(plan.steps[:2]):
            due = start + timedelta(days=step.offset_days + (28 * i if i else 0))
            if due <= TODAY and random.random() < 0.8:
                db.add(PetVaccinationDose(
                    pet_vaccination_plan_id=pvp.id, label=step.label,
                    due_date=due, status="completed",
                    date_applied=due,
                    lot=f"L{plan.name[:2].upper()}{random.randint(100000, 999999)}",
                    brand=plan.brand,
                    applied_by=random.choice(vet_users).id,
                ))
            else:
                db.add(PetVaccinationDose(
                    pet_vaccination_plan_id=pvp.id, label=step.label,
                    due_date=due, status="scheduled",
                ))
        assigned += 1
    db.commit()
    print(f"Planes asignados: {assigned}")

    # --- Alertas clínicas ---
    alert_count = 0
    for pet in pets:
        if random.random() < 0.15:
            atype = random.choice(["alergia", "recordatorio", "crónico"])
            db.add(ClinicalAlert(
                pet_id=pet.id, type=atype,
                description=pet.clinical_alert_text or random.choice([
                    "Alergia a pulgas, mantener control ambiental",
                    "Requiere recordatorio de medicación diaria",
                    "Enfermedad crónica en seguimiento trimestral",
                ]),
            ))
            alert_count += 1
    db.commit()
    print(f"Alertas clínicas: {alert_count}")

    # --- Notificaciones salientes e internas ---
    notif_owners = [oid for oid in owner_ids if random.random() < 0.45]
    outbound = 0
    for oid in notif_owners:
        if random.random() < 0.5:
            continue
        day = FROM_DATE + timedelta(days=random.randint(0, n_days - 1))
        if day > TODAY:
            day = TODAY
        db.add(OutboundNotification(
            clinic_id=cid, owner_id=oid,
            channel=random.choices(["whatsapp", "sms", "email"], weights=[70, 20, 10])[0],
            template="rem:generic:reminder",
            recipient=owner_info[oid]["phone"],
            status=random.choices(["sent", "delivered", "failed"], weights=[80, 15, 5])[0],
            sent_at=rand_dt(day, 8, 20),
        ))
        outbound += 1
    for _ in range(12):
        u = random.choice(staff)
        db.add(InternalNotification(
            clinic_id=cid, user_id=u.id,
            type=random.choice(["cita", "sistema", "recordatorio"]),
            message=random.choice([
                "Nueva cita confirmada para esta tarde",
                "Paciente con alerta clínica pendiente de revisión",
                "Se completó la facturación de una consulta",
                "Recordatorio: actualizar precios del catálogo",
            ]),
            created_at=rand_dt(FROM_DATE + timedelta(days=random.randint(0, 20)), 8, 20),
        ))
    db.commit()
    print(f"Notificaciones salientes: {outbound}")

    # --- Auditoría ---
    for _ in range(14):
        day = FROM_DATE + timedelta(days=random.randint(0, n_days - 1))
        if day > TODAY:
            day = TODAY
        actor = random.choice(staff)
        db.add(AuditLog(
            clinic_id=cid, actor_type="user", actor_id=actor.id,
            action=random.choice(["pet_created", "appointment_updated", "consultation_recorded",
                                  "invoice_created", "photo_uploaded", "vaccine_applied"]),
            entity_type=random.choice(["pet", "appointment", "consultation", "invoice", "pet_photo", "pet_carnet_record"]),
            entity_id=random.choice(pets).id,
            metadata_json={"seed": True},
            created_at=rand_dt(day, 8, 20),
        ))
    db.commit()

    db.close()
    print("\n=== Seed completado ===")
    print(f"Clínica: {CLINIC_NAME} (id={cid})")
    print(f"Sucursal: {BRANCH_NAME} (id={bid})")
    print(f"Staff: 1 admin, {len(vet_users)} veterinarios, {len(recep_users)} recepcionistas")
    print(f"Dueños: {len(owner_ids)} | Mascotas: {len(pets)} | Fotos: {n_photos}")
    print(f"Citas: {total_slots} | Consultas: {len(consultations)} | Facturas: {len(invoices)}")
    print(f"Carnet: {carnet_count} | Alertas: {alert_count} | Salientes: {outbound}")
    print(f"Staff password: {STAFF_PASSWORD}")
    print(f"Admin: ricardo.mendoza@clinicanorte.mx")


if __name__ == "__main__":
    main()