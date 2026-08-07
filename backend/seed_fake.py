"""Seed TEMPORAL de datos falsos para pruebas (agosto 2026).

Crea dueños, mascotas, vínculos dueño-mascota, citas en todo el mes,
bloques de horario y pesos. Todos los dueños usan email en el dominio
`@seed.fake` para poder limpiarlo fácilmente:

    docker exec vetcore-db psql -U vetcore -d vetcore -c \
      "DELETE FROM owner_preferences WHERE owner_id IN (SELECT id FROM owners WHERE email LIKE '%@seed.fake'); \
       DELETE FROM owner_pet_links WHERE owner_id IN (SELECT id FROM owners WHERE email LIKE '%@seed.fake'); \
       DELETE FROM pets WHERE id IN (SELECT pet_id FROM owner_pet_links WHERE owner_id IN (SELECT id FROM owners WHERE email LIKE '%@seed.fake')); \
       DELETE FROM owners WHERE email LIKE '%@seed.fake';"

Uso:  .venv/bin/python seed_fake.py
"""

import random
import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models import Appointment, Pet, PetWeightRecord, ScheduleBlock

CLINIC_ID = "1da47294-4965-4c05-be14-93d5fe84b1f4"
BRANCH_ID = "3594fd62-cdce-4207-ac0e-7f13e621b621"
VET_IDS = [
    "80b3866e-6fad-44a0-999c-16b6f17ba672",  # Guillermo Wallace (admin)
    "77635a25-e541-4d68-b5d4-ba96f193c2ac",  # alejandro gonzalez (veterinario)
]

random.seed(20260807)

FIRST = [
    "María", "José", "Ana", "Juan", "Carmen", "Luis", "Laura", "Carlos", "Sofía", "Miguel",
    "Elena", "Jorge", "Mónica", "Raúl", "Lucía", "Pedro", "Isabel", "Andrés", "Rosa", "David",
    "Patricia", "Óscar", "Marta", "Fernando", "Claudia", "Sergio", "Paula", "Alejandro", "Julia",
    "Ricardo", "Gabriela", "Hugo", "Natalia", "Rubén", "Silvia", "Arturo", "Verónica", "Iván",
    "Cristina", "Manuel",
]
LAST = [
    "García", "Rodríguez", "López", "Martínez", "Hernández", "González", "Pérez", "Sánchez",
    "Ramírez", "Torres", "Flores", "Rivera", "Cruz", "Morales", "Ortiz", "Vargas", "Castillo",
    "Rojas", "Chávez", "Medina", "Guzmán", "Lara", "Aguilar", "Delgado", "Fuentes", "Campos",
    "Peña", "Vega", "Mendoza", "Reyes", "Soto", "Ibarra", "Tapia", "León", "Castro", "Ríos",
    "Salas", "Acosta", "Navarro", "Espinoza",
]
PET_NAMES = [
    "Toby", "Luna", "Rocky", "Milo", "Coco", "Nala", "Max", "Bella", "Simba", "Kiara", "Zeus",
    "Canela", "Thor", "Mochi", "Bruno", "Pipa", "Rex", "Lola", "Taco", "Mia", "Chispas", "Negro",
    "Duque", "Pancha", "Apolo", "Trufa", "Boby", "Peluche", "Sombra", "Firulais", "Waffle", "Nube",
    "Ambar", "Kira", "Gordito", "Bombón", "Nieve", "Cacao", "Mango", "Kiwi", "Tequila", "Pelusa",
    "Ginger", "Oreo", "Panda", "Salem", "Casper", "Duke", "Boss", "Princesa", "Rocky", "Ruby",
    "Chip", "Nico", "Pecas", "Tinta", "Polvo", "Mapache", "Tornillo", "Churro", "Fideo", "Mantequilla",
    "Tostada", "Almendra", "Pistacho", "Nuez", "Piña", "Fresa", "Limón", "Canica", "Diamante", "Jade",
]

SPECIES_BREEDS = {
    "perro": [
        "Mestizo", "Labrador Retriever", "Pastor Alemán", "Chihuahua", "Pug", "Bulldog Francés",
        "Golden Retriever", "Beagle", "Caniche (Poodle)", "Bóxer", "Husky Siberiano", "Dálmata",
        "Cocker Spaniel", "Shih Tzu", "Yorkshire Terrier", "Pomerania", "Rottweiler", "Doberman",
        "Bull Terrier", "Teckel (Dachshund)",
    ],
    "gato": [
        "Mestizo", "Siamés", "Persa", "British Shorthair", "Maine Coon", "Bengalí", "Ragdoll",
        "Sphynx", "Abisinio", "Angora", "Cornish Rex", "Oriental", "Siberiano", "Birmano",
    ],
    "conejo": ["Cabeza de León", "Holland Lop", "Belier", "Angora", "Rex", "Gigante de Flandes", "Mestizo"],
    "ave": ["Perico Australiano", "Cacatúa", "Cotorra", "Canario", "Periquito", "Agapornis", "Guacamaya"],
    "roedor": ["Hámster Sirio", "Hámster Enano", "Cuyo (Cobaya)", "Chinchilla", "Jerbo", "Ratón"],
    "reptil": ["Tortuga de Agua", "Gecko Leopardo", "Tortuga Rusa", "Serpiente del Maíz", "Iguana", "Camaleón"],
    "hurones": ["Hurón Europeo", "Hurón Americano", "Hurón Albino"],
    "peces": ["Goldfish", "Beta", "Guppy", "Tetra Neón", "Molly", "Disco"],
    "anfibio": ["Rana Toro", "Axolote", "Rana Arbórea", "Salamandra"],
    "otro": ["Mestizo", "Oveja", "Cerdo Miniatura", "Chinchilla de la Patagonia", "Erizo"],
}
SPECIES_LIST = list(SPECIES_BREEDS.keys())
SPECIES_WEIGHT = [55, 30, 4, 3, 3, 2, 2, 1, 0.5, 0.5]  # % aproximado perro/gato/...

COLORS = [
    "Café", "Negro", "Blanco", "Gris", "Dorado", "Crema", "Atigrado", "Bicolor", "Tricolor",
    "Cobrizo", "Gris azulado", "Marrón claro", "Negro y blanco", "Naranja", "Chocolate", "Plateado",
]
PROCEDURES = [
    "Consulta", "Consulta de control", "Vacunación", "Desparasitación", "Cirugía", "Baño y corte",
    "Corte de uñas", "Urgencia", "Limpieza dental", "Rayos X", "Ultrasonido", "Certificado de salud",
    "Estética", "Corte de pelo",
]
BLOCK_REASONS = ["Junta de staff", "Mantenimiento", "Capacitación", "Feriado", "Descanso", "Inventario"]

YEAR, MONTH = 2026, 8


def pick(seq):
    return random.choice(seq)


def rand_date(start_year=2019, end_year=2026):
    start = date(start_year, 1, 1).toordinal()
    end = date(end_year, 12, 31).toordinal()
    return date.fromordinal(random.randint(start, end))


def main() -> None:
    db = SessionLocal()
    today = date.today()

    # --- Dueños (raw SQL: owners / owner_preferences no tienen modelo ORM) ---
    owner_ids = []
    print("Creando dueños…")
    for i in range(130):
        oid = uuid.uuid4()
        full = f"{pick(FIRST)} {pick(LAST)} {pick(LAST)}"
        db.execute(
            text(
                "INSERT INTO owners (id, phone, email, created_at) "
                "VALUES (:id, :phone, :email, now())"
            ),
            {"id": oid, "phone": f"555 {random.randint(1000, 9999)} {random.randint(1000, 9999)}",
             "email": f"seed.owner.{i}@seed.fake"},
        )
        db.execute(
            text(
                "INSERT INTO owner_preferences (owner_id, preferred_channel, accepts_reminders) "
                "VALUES (:id, 'whatsapp', :acc)"
            ),
            {"id": oid, "acc": random.random() < 0.45},
        )
        owner_ids.append((oid, full))

    # --- Mascotas ---
    print("Creando mascotas…")
    pets = []
    for i in range(210):
        species = random.choices(SPECIES_LIST, weights=SPECIES_WEIGHT, k=1)[0]
        pet = Pet(
            clinic_id=CLINIC_ID,
            name=f"{pick(PET_NAMES)} {i + 1}",
            species=species,
            breed=pick(SPECIES_BREEDS[species]),
            color_primary=pick(COLORS),
            color_secondary=random.choice([pick(COLORS), None]),
            markings=random.choice([None, "Mancha en el lomo", "Cicatriz en oreja", "Pata blanca", "Ninguna"]),
            sex=random.choice(["hembra", "macho", None]),
            birth_date=rand_date(),
            allergies=random.choice([None, None, None, "Alergia alimentaria", "Penicilina", "Pulgas"]),
            is_active=True,
            created_at=datetime(2026, random.randint(1, 7), random.randint(1, 28), random.randint(8, 20), random.randint(0, 59)),
        )
        db.add(pet)
        db.flush()
        owner = pick(owner_ids)
        db.execute(
            text(
                "INSERT INTO owner_pet_links (id, owner_id, pet_id, clinic_id, is_active, linked_at) "
                "VALUES (:id, :oid, :pid, :cid, true, now())"
            ),
            {"id": uuid.uuid4(), "oid": owner[0], "pid": pet.id, "cid": CLINIC_ID},
        )
        pets.append(pet)
    db.commit()

    # --- Pesos ---
    print("Creando pesos…")
    for pet in pets:
        db.add(
            PetWeightRecord(
                pet_id=pet.id,
                clinic_id=CLINIC_ID,
                weight_kg=round(random.uniform(0.3, 45.0), 2),
                recorded_at=datetime(2026, random.randint(1, 7), random.randint(1, 28)),
            )
        )
    db.commit()

    # --- Citas en todo el mes de agosto ---
    print("Creando citas…")
    first_day = date(YEAR, MONTH, 1)
    last_day = date(YEAR, MONTH, 28)
    n_days = (last_day - first_day).days + 1
    total_citas = 0
    for offset in range(n_days):
        day = first_day + timedelta(days=offset)
        weekday = day.weekday()
        if weekday >= 5:  # fin de semana, menos carga
            count = random.randint(2, 5)
        else:
            count = random.randint(6, 13)
        slots = set()
        while len(slots) < count:
            hour = random.randint(8, 19)
            minute = random.choice([0, 30])
            slots.add(time(hour, minute))
        for slot in sorted(slots):
            start = datetime.combine(day, slot)
            end = start + timedelta(minutes=random.choice([30, 45, 60]))
            if end.time() > time(20, 30):
                end = start + timedelta(minutes=30)
            if day < today:
                status = random.choices(
                    ["completed", "completed", "cancelled", "no_show"],
                    weights=[6, 6, 2, 1],
                )[0]
            elif day == today:
                status = random.choices(
                    ["scheduled", "confirmed", "completed"], weights=[4, 4, 2]
                )[0]
            else:
                status = random.choices(["scheduled", "confirmed"], weights=[4, 6])[0]

            walk_in = random.random() < 0.06
            db.add(
                Appointment(
                    clinic_id=CLINIC_ID,
                    branch_id=BRANCH_ID,
                    pet_id=None if walk_in else pick(pets).id,
                    walk_in_name=f"Paciente {random.choice(PET_NAMES)}" if walk_in else None,
                    vet_user_id=pick(VET_IDS) if random.random() < 0.65 else None,
                    procedure_type=pick(PROCEDURES),
                    start_time=start,
                    end_time=end,
                    status=status,
                )
            )
            total_citas += 1
    db.commit()

    # --- Bloques de horario ---
    print("Creando bloques de horario…")
    for _ in range(26):
        day = first_day + timedelta(days=random.randint(0, n_days - 1))
        hour = random.randint(9, 18)
        start = datetime.combine(day, time(hour))
        db.add(
            ScheduleBlock(
                clinic_id=CLINIC_ID,
                branch_id=BRANCH_ID,
                vet_user_id=pick(VET_IDS) if random.random() < 0.5 else None,
                start_time=start,
                end_time=start + timedelta(hours=1),
                reason=pick(BLOCK_REASONS),
            )
        )
    db.commit()

    db.close()
    print(f"\nListo: {len(owner_ids)} dueños, {len(pets)} mascotas, "
          f"{total_citas} citas en agosto 1-28, 26 bloques, {len(pets)} pesos.")


if __name__ == "__main__":
    main()
