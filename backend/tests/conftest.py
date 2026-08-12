"""Configuración de pruebas: crea una BD Postgres de prueba y aplica migraciones.

Las pruebas corren contra una base real (Postgres local de dev por defecto)
para ejercitar el SQL del motor de alertas (DISTINCT ON, JSONB, ANY, etc.).
"""

import os
from datetime import UTC, date, datetime, time, timedelta

import pytest
from sqlalchemy import create_engine, text

ADMIN_URL = os.environ.get(
    "VETCORE_TEST_ADMIN_URL",
    "postgresql+psycopg://vetcore:vetcore_dev@localhost:5433/postgres",
)
TEST_DB = os.environ.get("VETCORE_TEST_DB", "vetcore_test")
TEST_URL = f"postgresql+psycopg://vetcore:vetcore_dev@localhost:5433/{TEST_DB}?sslmode=disable"

# El settings del backend se lee del entorno al importar; apuntamos a la BD de
# prueba ANTES de importar cualquier módulo de la app.
os.environ["DATABASE_URL"] = TEST_URL


@pytest.fixture(scope="session", autouse=True)
def _database():
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    admin.dispose()

    from alembic.config import Config

    from alembic import command

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_URL)
    command.upgrade(cfg, "head")
    yield


@pytest.fixture
def db_session(_database):
    from app.db.session import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_tables(_database):
    from app.db.session import SessionLocal

    session = SessionLocal()
    try:
        session.execute(
            text(
                "TRUNCATE smart_alerts, smart_alert_rules, pet_vaccination_doses, "
                "pet_vaccination_plans, pet_carnet_records, pet_weight_records, "
                "consultations, appointments, pet_photos, vaccination_plan_steps, "
                "vaccination_plans, clinic_branches, pets, clinics "
                "RESTART IDENTITY CASCADE"
            )
        )
        session.commit()
    finally:
        session.close()


@pytest.fixture
def make_clinic(db_session):
    from app.models import Clinic, ClinicBranch

    def _make(name: str = "Clínica Test") -> tuple[Clinic, ClinicBranch]:
        clinic = Clinic(name=name, subscription_status="active", currency="MXN")
        db_session.add(clinic)
        db_session.flush()
        branch = ClinicBranch(clinic_id=clinic.id, name="Sucursal 1")
        db_session.add(branch)
        db_session.flush()
        db_session.commit()
        return clinic, branch

    return _make


@pytest.fixture
def make_pet(db_session):
    from app.models import Pet

    def _make(clinic, name: str = "Max") -> Pet:
        pet = Pet(clinic_id=clinic.id, name=name, species="perro", is_active=True)
        db_session.add(pet)
        db_session.flush()
        db_session.commit()
        return pet

    return _make


@pytest.fixture
def make_vaccination(db_session):
    from app.models import (
        PetVaccinationDose,
        PetVaccinationPlan,
        VaccinationPlan,
        VaccinationPlanStep,
    )

    def _make(
        clinic,
        branch,
        pet,
        due: date,
        vaccine: str = "Rabia",
        offset_days: int = 30,
    ) -> PetVaccinationDose:
        plan = VaccinationPlan(
            clinic_id=clinic.id,
            name=vaccine,
            compound=vaccine,
            species="perro",
            active=True,
        )
        db_session.add(plan)
        db_session.flush()
        step = VaccinationPlanStep(
            plan_id=plan.id, label="Dosis 1", offset_days=offset_days, position=1
        )
        db_session.add(step)
        db_session.flush()
        assignment = PetVaccinationPlan(
            clinic_id=clinic.id,
            pet_id=pet.id,
            plan_id=plan.id,
            branch_id=branch.id,
            start_date=due - timedelta(days=offset_days),
            start_time=time(10, 0),
        )
        db_session.add(assignment)
        db_session.flush()
        dose = PetVaccinationDose(
            pet_vaccination_plan_id=assignment.id,
            label="Dosis 1",
            due_date=due,
            status="scheduled",
        )
        db_session.add(dose)
        db_session.commit()
        return dose

    return _make


@pytest.fixture
def make_weight(db_session):
    from app.models import PetWeightRecord

    def _make(pet, weight_kg: float, recorded: datetime) -> PetWeightRecord:
        row = PetWeightRecord(
            pet_id=pet.id,
            clinic_id=pet.clinic_id,
            weight_kg=weight_kg,
            recorded_at=recorded,
        )
        db_session.add(row)
        db_session.commit()
        return row

    return _make


@pytest.fixture
def make_appointment(db_session):
    from app.models import Appointment

    def _make(
        clinic,
        branch,
        pet,
        start: datetime,
        status: str = "cancelled",
    ) -> Appointment:
        row = Appointment(
            clinic_id=clinic.id,
            branch_id=branch.id,
            pet_id=pet.id,
            procedure_type="Consulta",
            start_time=start,
            end_time=start + timedelta(minutes=30),
            status=status,
        )
        db_session.add(row)
        db_session.commit()
        return row

    return _make


def today() -> date:
    return date.today()


def now_utc() -> datetime:
    return datetime.now(UTC)
