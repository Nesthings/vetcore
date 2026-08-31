"""Pruebas del motor de Alertas inteligentes (reglas deterministas).

Se ejecutan contra Postgres real (tests/conftest.py) para ejercitar el SQL.
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select

from app.models import SmartAlert
from app.services import smart_alerts as engine


def today() -> date:
    return date.today()


def now_utc() -> datetime:
    return datetime.now(UTC)


def _alerts(db, clinic_id, rule_key=None):
    stmt = select(SmartAlert).where(SmartAlert.clinic_id == clinic_id)
    if rule_key:
        stmt = stmt.where(SmartAlert.rule_key == rule_key)
    return list(db.scalars(stmt))


def test_vacuna_dentro_del_umbral_genera_aviso(db_session, make_clinic, make_pet, make_vaccination):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_vaccination(clinic, branch, pet, due=today() + timedelta(days=10))

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    assert any(a.rule_key == "vacuna_proxima" for a in _alerts(db_session, clinic.id))


def test_vacuna_fuera_del_umbral_no_genera_aviso(
    db_session, make_clinic, make_pet, make_vaccination
):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_vaccination(clinic, branch, pet, due=today() + timedelta(days=400))

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    assert _alerts(db_session, clinic.id, "vacuna_proxima") == []


def test_vacuna_vencida_genera_aviso(db_session, make_clinic, make_pet, make_vaccination):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_vaccination(clinic, branch, pet, due=today() - timedelta(days=12))

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    alerts = _alerts(db_session, clinic.id, "vacuna_vencida")
    assert len(alerts) == 1
    assert alerts[0].entity_id == pet.id
    assert alerts[0].metadata_json["days"] == 12


def test_ejecutar_dos_veces_no_duplica(db_session, make_clinic, make_pet, make_vaccination):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_vaccination(clinic, branch, pet, due=today() - timedelta(days=5))

    engine.evaluate_rules_for_clinic(db_session, clinic.id)
    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    count = db_session.scalar(
        select(func.count())
        .select_from(SmartAlert)
        .where(
            SmartAlert.clinic_id == clinic.id,
            SmartAlert.rule_key == "vacuna_vencida",
            SmartAlert.entity_id == pet.id,
        )
    )
    assert count == 1


def test_condicion_deja_de_cumplirse_resuelve(db_session, make_clinic, make_pet, make_vaccination):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    dose = make_vaccination(clinic, branch, pet, due=today() - timedelta(days=5))

    engine.evaluate_rules_for_clinic(db_session, clinic.id)
    alert = _alerts(db_session, clinic.id, "vacuna_vencida")[0]
    assert alert.status == "active"

    dose.status = "completed"
    db_session.commit()

    engine.evaluate_rules_for_clinic(db_session, clinic.id)
    db_session.refresh(alert)
    assert alert.status == "resolved"
    assert alert.resolved_at is not None


def test_peso_aumenta_sobre_umbral_genera_aviso(db_session, make_clinic, make_pet, make_weight):
    clinic, _ = make_clinic()
    pet = make_pet(clinic, "Max")
    make_weight(pet, 10.0, now_utc() - timedelta(days=30))
    make_weight(pet, 12.0, now_utc())

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    alerts = _alerts(db_session, clinic.id, "cambio_peso")
    assert len(alerts) == 1
    assert "aumentó 20.0%" in alerts[0].message


def test_peso_cambia_menos_del_umbral_no_genera(db_session, make_clinic, make_pet, make_weight):
    clinic, _ = make_clinic()
    pet = make_pet(clinic, "Max")
    make_weight(pet, 10.0, now_utc() - timedelta(days=30))
    make_weight(pet, 10.4, now_utc())

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    assert _alerts(db_session, clinic.id, "cambio_peso") == []


def test_cita_cancelada_sin_reprogramar_genera(db_session, make_clinic, make_pet, make_appointment):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_appointment(clinic, branch, pet, start=now_utc() - timedelta(days=5), status="cancelled")

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    alerts = _alerts(db_session, clinic.id, "cita_cancelada")
    assert len(alerts) == 1
    assert alerts[0].entity_id == pet.id


def test_cita_cancelada_con_reprogramacion_no_genera(
    db_session, make_clinic, make_pet, make_appointment
):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_appointment(clinic, branch, pet, start=now_utc() - timedelta(days=5), status="cancelled")
    make_appointment(clinic, branch, pet, start=now_utc() + timedelta(days=2), status="confirmed")

    engine.evaluate_rules_for_clinic(db_session, clinic.id)

    assert _alerts(db_session, clinic.id, "cita_cancelada") == []


def test_clinicas_distintas_nunca_comparten_avisos(
    db_session, make_clinic, make_pet, make_vaccination
):
    clinic_a, branch_a = make_clinic("Clínica A")
    pet_a = make_pet(clinic_a, "MaxA")
    make_vaccination(clinic_a, branch_a, pet_a, due=today() - timedelta(days=3))

    clinic_b, branch_b = make_clinic("Clínica B")
    pet_b = make_pet(clinic_b, "MaxB")
    make_vaccination(clinic_b, branch_b, pet_b, due=today() - timedelta(days=3))

    engine.evaluate_rules_for_clinic(db_session, clinic_a.id)
    engine.evaluate_rules_for_clinic(db_session, clinic_b.id)

    alerts_a = _alerts(db_session, clinic_a.id)
    alerts_b = _alerts(db_session, clinic_b.id)
    assert all(a.clinic_id == clinic_a.id for a in alerts_a)
    assert all(a.clinic_id == clinic_b.id for a in alerts_b)
    assert len(alerts_a) == 1 and len(alerts_b) == 1


def test_usuario_sin_permiso_no_accede_a_avisos(
    db_session, make_clinic, make_pet, make_vaccination
):
    from fastapi.testclient import TestClient

    from app.core.security import create_access_token
    from app.main import app

    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    make_vaccination(clinic, branch, pet, due=today() - timedelta(days=3))

    staff_token = create_access_token(
        subject=str(pet.id), role="recepcion", clinic_id=str(clinic.id)
    )
    owner_token = create_access_token(subject=str(pet.id), role="owner", clinic_id=str(clinic.id))

    with TestClient(app) as client:
        ok = client.get("/api/v1/alerts", headers={"Authorization": f"Bearer {staff_token}"})
        assert ok.status_code == 200
        assert ok.json()["summary"]["total"] >= 1

        denied = client.get("/api/v1/alerts", headers={"Authorization": f"Bearer {owner_token}"})
        assert denied.status_code in (401, 403)
