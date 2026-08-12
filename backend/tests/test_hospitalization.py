"""Pruebas de Hospitalización (M1: estancias/espacios; M2: overview/ocupación)."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.main import app
from app.models import Hospitalization


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _admin_token(clinic_id) -> str:
    return create_access_token(subject=str(uuid4()), role="admin", clinic_id=str(clinic_id))


def _recepcion_token(clinic_id) -> str:
    return create_access_token(subject=str(uuid4()), role="recepcion", clinic_id=str(clinic_id))


def _make_accommodation(client, clinic_id, branch_id, code="J1", capacity=1):
    res = client.post(
        "/api/v1/hospitalization/accommodations",
        headers={"Authorization": f"Bearer {_admin_token(clinic_id)}"},
        json={
            "code": code,
            "name": f"Jaula {code}",
            "branch_id": str(branch_id),
            "capacity": capacity,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _make_hospitalization(client, clinic_id, pet_id, branch_id, accommodation_id=None):
    res = client.post(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic_id)}"},
        json={
            "pet_id": str(pet_id),
            "branch_id": str(branch_id),
            "status": "admitted",
            "accommodation_id": str(accommodation_id) if accommodation_id else None,
            "operational_status": "stable",
            "isolation_status": "normal",
        },
    )
    return res


def test_crear_hospitalizacion_y_listar(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")

    res = _make_hospitalization(client, clinic.id, pet.id, branch.id)
    assert res.status_code == 201, res.text
    hosp_id = res.json()["id"]

    listing = client.get(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    )
    assert listing.status_code == 200
    assert any(h["id"] == hosp_id for h in listing.json())
    assert any(h["pet"]["name"] == "Max" for h in listing.json())


def test_ocupacion_impide_sobre_ocupar(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet_a = make_pet(clinic, "Max")
    pet_b = make_pet(clinic, "Rex")
    acc = _make_accommodation(client, clinic.id, branch.id, "J1", capacity=1)

    first = _make_hospitalization(client, clinic.id, pet_a.id, branch.id, acc["id"])
    assert first.status_code == 201

    second = _make_hospitalization(client, clinic.id, pet_b.id, branch.id, acc["id"])
    assert second.status_code == 409


def test_transicion_invalida_rechazada(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id).json()["id"]

    res = client.post(
        f"/api/v1/hospitalization/hospitalizations/{hosp_id}/complete-discharge",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    )
    assert res.status_code == 409


def test_ciclo_de_vida_completo(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    # planned → admitted → active → discharge_pending → discharged
    res = client.post(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={"pet_id": str(pet.id), "branch_id": str(branch.id), "status": "planned"},
    )
    assert res.status_code == 201
    hosp_id = res.json()["id"]
    h = db_session.get(Hospitalization, hosp_id)
    assert h.status == "planned"

    def act(path):
        return client.post(
            f"/api/v1/hospitalization/hospitalizations/{hosp_id}/{path}",
            headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        )

    assert act("admit").status_code == 200
    assert act("activate").status_code == 200
    assert act("request-discharge").status_code == 200
    assert act("complete-discharge").status_code == 200
    db_session.refresh(h)
    assert h.status == "discharged"
    assert h.actual_discharge_at is not None


def test_overview_resumen_y_ocupacion(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    acc = _make_accommodation(client, clinic.id, branch.id, "J1", 1)
    _make_hospitalization(client, clinic.id, pet.id, branch.id, acc["id"])

    res = client.get(
        "/api/v1/hospitalization/overview",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["active"] == 1
    assert data["summary"]["admitted_today"] == 1
    assert data["accommodations"][0]["occupied"] is True
    assert data["accommodations"][0]["active_count"] == 1


def test_multi_tenant_aislamiento(db_session, client, make_clinic, make_pet):
    clinic_a, branch_a = make_clinic("Clínica A")
    pet_a = make_pet(clinic_a, "MaxA")
    _make_hospitalization(client, clinic_a.id, pet_a.id, branch_a.id)

    clinic_b, branch_b = make_clinic("Clínica B")
    pet_b = make_pet(clinic_b, "MaxB")
    _make_hospitalization(client, clinic_b.id, pet_b.id, branch_b.id)

    listing = client.get(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic_a.id)}"},
    )
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert all(h["clinic_id"] == str(clinic_a.id) for h in items)
    assert all(h["pet"]["name"] == "MaxA" for h in items)


def test_recepcion_sin_permiso_recibe_403(db_session, client, make_clinic):
    clinic, _ = make_clinic()
    res = client.get(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_recepcion_token(clinic.id)}"},
    )
    assert res.status_code == 403


def _make_user(db, clinic, branch, role="admin", name="Admin Test"):
    from app.models import User

    user = User(
        clinic_id=clinic.id,
        branch_id=branch.id,
        role=role,
        full_name=name,
        email=f"admin_{uuid4().hex}@test.fake",
        password_hash="x",
    )
    db.add(user)
    db.commit()
    return user


def test_monitorizacion_genera_tareas_y_no_duplica(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")

    res = client.post(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={
            "pet_id": str(pet.id),
            "branch_id": str(branch.id),
            "status": "admitted",
            "monitoring_level": "intensive",
        },
    )
    assert res.status_code == 201, res.text
    hosp_id = res.json()["id"]

    def vitals():
        r = client.get(
            f"/api/v1/hospitalization/{hosp_id}/tasks",
            headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        )
        assert r.status_code == 200
        return [t for t in r.json() if t["type"] == "vitals"]

    first = vitals()
    assert len(first) >= 1
    assert all(t["status"] == "pending" for t in first)

    second = vitals()
    assert len(second) == len(first)


def test_completar_tarea_registra_usuario(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))

    res = client.post(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={"pet_id": str(pet.id), "branch_id": str(branch.id), "status": "admitted"},
    )
    hosp_id = res.json()["id"]

    task_res = client.post(
        f"/api/v1/hospitalization/{hosp_id}/tasks",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={
            "type": "medication",
            "description": "Administrar cefalexina",
            "scheduled_at": datetime.now(UTC).isoformat(),
            "priority": "high",
        },
    )
    assert task_res.status_code == 201, task_res.text
    task_id = task_res.json()["id"]

    done = client.post(
        f"/api/v1/hospitalization/tasks/{task_id}/complete",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"
    assert done.json()["completed_by"] == str(user.id)
    assert done.json()["completed_at"] is not None


def test_tarea_atrasada_en_overview(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    res = client.post(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={
            "pet_id": str(pet.id),
            "branch_id": str(branch.id),
            "status": "admitted",
            "monitoring_level": "basic",
        },
    )
    hosp_id = res.json()["id"]
    # Tarea manual en el pasado (atrasada).
    client.post(
        f"/api/v1/hospitalization/{hosp_id}/tasks",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={
            "type": "review",
            "description": "Revisión pendiente",
            "scheduled_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
        },
    )
    r = client.get(
        "/api/v1/hospitalization/tasks/overdue-count",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    )
    assert r.status_code == 200
    assert r.json()["count"] >= 1


def test_registrar_signos_vitales_y_ultimos(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))
    token = _admin_token(clinic.id)
    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id).json()["id"]

    res = client.post(
        f"/api/v1/hospitalization/{hosp_id}/vitals/batch",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "measurements": [
                {"parameter": "temperature", "value": 38.4, "unit": "°C"},
                {"parameter": "heart_rate", "value": 120, "unit": "lpm"},
            ]
        },
    )
    assert res.status_code == 201, res.text
    assert len(res.json()) == 2

    listing = client.get(
        f"/api/v1/hospitalization/{hosp_id}/vitals",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 2

    latest = client.get(
        f"/api/v1/hospitalization/{hosp_id}/vitals/latest",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert latest.status_code == 200
    assert latest.json()["temperature"]["value"] == 38.4


def test_vitales_completan_tarea_de_monitorizacion(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))

    res = client.post(
        "/api/v1/hospitalization/hospitalizations",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={
            "pet_id": str(pet.id),
            "branch_id": str(branch.id),
            "status": "admitted",
            "monitoring_level": "basic",
        },
    )
    hosp_id = res.json()["id"]

    tasks = client.get(
        f"/api/v1/hospitalization/{hosp_id}/tasks",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    ).json()
    vitals_tasks = [t for t in tasks if t["type"] == "vitals"]
    assert len(vitals_tasks) >= 1
    target = min(vitals_tasks, key=lambda t: t["scheduled_at"])

    client.post(
        f"/api/v1/hospitalization/{hosp_id}/vitals/batch",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"measurements": [{"parameter": "temperature", "value": 38.1, "unit": "°C"}]},
    )

    tasks_after = client.get(
        f"/api/v1/hospitalization/{hosp_id}/tasks",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    ).json()
    done = next(t for t in tasks_after if t["id"] == target["id"])
    assert done["status"] == "completed"
    assert done["completed_by"] == str(user.id)


def test_medicamento_genera_dosis_y_administra_con_inventario(
    db_session, client, make_clinic, make_pet
):
    from app.models import InventoryLot, InventoryMovement, InventoryProduct

    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))

    prod = InventoryProduct(clinic_id=clinic.id, branch_id=branch.id, name="Cefalexina", unit="mg")
    db_session.add(prod)
    db_session.flush()
    lot = InventoryLot(product_id=prod.id, lot_number="L1", quantity=10)
    db_session.add(lot)
    db_session.commit()

    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id).json()["id"]

    order_res = client.post(
        f"/api/v1/hospitalization/{hosp_id}/medications",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
        json={
            "inventory_product_id": str(prod.id),
            "name": "Cefalexina",
            "dose": "500",
            "unit": "mg",
            "route": "PO",
            "interval_hours": 8,
            "start_at": datetime.now(UTC).isoformat(),
        },
    )
    assert order_res.status_code == 201, order_res.text

    meds = client.get(
        f"/api/v1/hospitalization/{hosp_id}/medications",
        headers={"Authorization": f"Bearer {_admin_token(clinic.id)}"},
    ).json()
    assert len(meds) == 1
    admins = meds[0]["administrations"]
    assert len(admins) >= 1
    admin_id = admins[0]["id"]

    done = client.post(
        f"/api/v1/hospitalization/medications/administrations/{admin_id}/administer",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "administered"
    assert done.json()["administered_by"] == str(user.id)

    db_session.refresh(lot)
    assert lot.quantity == 9

    movement = db_session.scalar(
        select(InventoryMovement).where(InventoryMovement.reference_id == hosp_id)
    )
    assert movement is not None
    assert movement.quantity_delta == -1
    assert movement.lot_id == lot.id


def test_cuidados_feed_fluido_eliminacion_dolor(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))
    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id).json()["id"]

    feed = client.post(
        f"/api/v1/hospitalization/{hosp_id}/feeds",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "diet": "Croquetas renales",
            "amount_offered": 100,
            "amount_consumed": 60,
            "unit": "g",
        },
    )
    assert feed.status_code == 201
    assert (
        len(
            client.get(
                f"/api/v1/hospitalization/{hosp_id}/feeds",
                headers={"Authorization": f"Bearer {user_token}"},
            ).json()
        )
        == 1
    )

    fluid = client.post(
        f"/api/v1/hospitalization/{hosp_id}/fluids",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "solution": "Hartmann",
            "route": "IV",
            "rate": 50,
            "started_at": datetime.now(UTC).isoformat(),
        },
    )
    assert fluid.status_code == 201
    fluid_id = fluid.json()["id"]
    stopped = client.post(
        f"/api/v1/hospitalization/fluids/{fluid_id}/stop",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert stopped.status_code == 200
    assert stopped.json()["ended_at"] is not None

    elim = client.post(
        f"/api/v1/hospitalization/{hosp_id}/eliminations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"kind": "urine", "present": True, "quantity": "moderada"},
    )
    assert elim.status_code == 201

    pain = client.post(
        f"/api/v1/hospitalization/{hosp_id}/pain",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"score": 3, "scale": "Glasgow"},
    )
    assert pain.status_code == 201
    assert (
        len(
            client.get(
                f"/api/v1/hospitalization/{hosp_id}/pain",
                headers={"Authorization": f"Bearer {user_token}"},
            ).json()
        )
        == 1
    )


def test_evolucion_nota_incidencia_y_timeline(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))
    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id).json()["id"]

    note = client.post(
        f"/api/v1/hospitalization/{hosp_id}/notes",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"category": "evolution", "text": "Paciente estable, come bien."},
    )
    assert note.status_code == 201

    incident = client.post(
        f"/api/v1/hospitalization/{hosp_id}/incidents",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "severity": "high",
            "description": "Vómito tras la medicación",
            "actions_taken": "Observación",
        },
    )
    assert incident.status_code == 201

    timeline = client.get(
        f"/api/v1/hospitalization/{hosp_id}/timeline",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert timeline.status_code == 200
    types = [e["type"] for e in timeline.json()]
    assert "note:evolution" in types
    assert "incident" in types
    # Orden descendente por tiempo.
    ats = [e["at"] for e in timeline.json()]
    assert ats == sorted(ats, reverse=True)


def test_cambio_de_turno(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))
    _make_hospitalization(client, clinic.id, pet.id, branch.id)

    start = client.post(
        "/api/v1/hospitalization/shifts/start",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert start.status_code == 201, start.text
    shift_id = start.json()["id"]

    # Segunda apertura → 409.
    dup = client.post(
        "/api/v1/hospitalization/shifts/start",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert dup.status_code == 409

    current = client.get(
        "/api/v1/hospitalization/shifts/current",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert current.status_code == 200
    assert current.json()["shift"]["id"] == shift_id
    assert current.json()["summary"]["counts"]["patients"] == 1
    assert current.json()["summary"]["rows"][0]["pet_name"] == "Max"

    done = client.post(
        f"/api/v1/hospitalization/shifts/{shift_id}/complete",
        headers={"Authorization": f"Bearer {user_token}"},
        params={"handover_note": "Paciente estable. Vigilar alimentación."},
    )
    assert done.status_code == 200
    assert done.json()["ended_at"] is not None

    current_after = client.get(
        "/api/v1/hospitalization/shifts/current",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert current_after.json()["shift"] is None

    history = client.get(
        "/api/v1/hospitalization/shifts",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert len(history.json()) == 1
    assert "Vigilar alimentación" in history.json()[0]["handover_note"]


def test_costos_de_estancia(db_session, client, make_clinic, make_pet):
    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))
    acc = _make_accommodation(client, clinic.id, branch.id, "J1", 1)
    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id, acc["id"]).json()["id"]

    costs = client.get(
        f"/api/v1/hospitalization/{hosp_id}/costs",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert costs.status_code == 200
    data = costs.json()
    assert data["stay"]["days"] >= 1
    assert data["breakdown"]["hospitalizacion"] == data["stay"]["total"]
    assert data["total"] >= data["breakdown"]["hospitalizacion"]

    # Actualiza precios y verifica el cambio.
    put = client.put(
        "/api/v1/hospitalization/config/stay",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "stay_prices": {
                "general": 1000,
                "uci": 1500,
                "isolation": 1200,
                "recovery": 900,
                "postop": 900,
                "other": 800,
            }
        },
    )
    assert put.status_code == 200
    assert put.json()["stay_prices"]["general"] == 1000

    costs2 = client.get(
        f"/api/v1/hospitalization/{hosp_id}/costs",
        headers={"Authorization": f"Bearer {user_token}"},
    ).json()
    assert costs2["stay"]["price_per_day"] == 1000


def test_alta_formal_con_seguimiento_crea_cita(db_session, client, make_clinic, make_pet):
    from datetime import date as date_cls

    from app.models import Appointment

    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    user = _make_user(db_session, clinic, branch)
    user_token = create_access_token(subject=str(user.id), role="admin", clinic_id=str(clinic.id))
    hosp_id = _make_hospitalization(client, clinic.id, pet.id, branch.id).json()["id"]

    res = client.post(
        f"/api/v1/hospitalization/{hosp_id}/discharge",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "reason": "Mejoría clínica",
            "summary": "Paciente estable, come bien.",
            "checklist": [
                {"item": "Medicamentos entregados", "done": True},
                {"item": "Factura revisada", "done": False},
            ],
            "follow_up_date": (date_cls.today() + timedelta(days=7)).isoformat(),
            "follow_up_reason": "Retiro de puntos",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["checklist"][0]["done"] is True

    # Estado y espacio liberados.
    h = db_session.get(Hospitalization, hosp_id)
    assert h.status == "discharged"
    assert h.accommodation_id is None

    # Cita de seguimiento creada en Agenda.
    appt = db_session.scalar(select(Appointment).where(Appointment.pet_id == pet.id))
    assert appt is not None
    assert appt.procedure_type == "Seguimiento post-alta"


def test_avisos_hospitalizacion_generan_y_no_duplican(db_session, make_clinic, make_pet):
    from sqlalchemy import func as _func

    from app.models import HospitalizationTask, SmartAlert
    from app.services import smart_alerts as alerts_engine

    clinic, branch = make_clinic()
    pet = make_pet(clinic, "Max")
    h = Hospitalization(clinic_id=clinic.id, branch_id=branch.id, pet_id=pet.id, status="active")
    db_session.add(h)
    db_session.flush()
    db_session.add(
        HospitalizationTask(
            clinic_id=clinic.id,
            hospitalization_id=h.id,
            type="vitals",
            description="Signos vitales",
            scheduled_at=datetime.now(UTC) - timedelta(hours=2),
            status="pending",
        )
    )
    db_session.commit()

    alerts_engine.evaluate_rules_for_clinic(db_session, clinic.id)
    alerts = db_session.scalars(
        select(SmartAlert).where(
            SmartAlert.clinic_id == clinic.id,
            SmartAlert.entity_type == "hospitalization",
        )
    ).all()
    assert any(a.rule_key == "hosp_vitals_overdue" for a in alerts)
    assert all(a.entity_id == h.id for a in alerts)

    alerts_engine.evaluate_rules_for_clinic(db_session, clinic.id)
    count = db_session.scalar(
        select(_func.count()).select_from(SmartAlert).where(
            SmartAlert.clinic_id == clinic.id,
            SmartAlert.rule_key == "hosp_vitals_overdue",
        )
    )
    assert count == 1
