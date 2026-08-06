"""Bandeja de dashboards (Inicio) — datos de agregación no financieros.

Cada "dashboard" es un dataset con forma genérica de gráfica (listas de
{name/value} o series). NO incluye montos de dinero (esos son del módulo
Financiero). El frontend arma la gráfica según el `slug`.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic
from app.db.session import get_db

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

PERIOD_30D = "now() - interval '30 days'"
PERIOD_14D = "now() - interval '14 days'"
PERIOD_6M = "now() - interval '6 months'"

_HEATMAP_DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]


def _species(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT species AS name, count(*) AS value FROM pets "
            "WHERE clinic_id = :c AND is_active = true GROUP BY species ORDER BY value DESC"
        ),
        {"c": cid},
    ).all()
    return [{"name": r.name, "value": r.value} for r in rows]


def _breeds(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT COALESCE(NULLIF(breed, ''), 'Sin raza') AS name, count(*) AS value "
            "FROM pets WHERE clinic_id = :c AND is_active = true "
            "GROUP BY breed ORDER BY value DESC LIMIT 8"
        ),
        {"c": cid},
    ).all()
    return [{"name": r.name, "value": r.value} for r in rows]


def _new_pets(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS label, "
            "count(*) AS value "
            "FROM pets WHERE clinic_id = :c AND is_active = true AND created_at >= "
            f"{PERIOD_6M} GROUP BY 1 ORDER BY 1"
        ),
        {"c": cid},
    ).all()
    return [{"label": r.label, "value": r.value} for r in rows]


def _appt_heatmap(db: Session, cid: str) -> dict:
    rows = db.execute(
        text(
            "SELECT extract(dow from start_time)::int AS day, "
            "extract(hour from start_time)::int AS hour, count(*) AS value "
            "FROM appointments WHERE clinic_id = :c AND start_time >= "
            f"{PERIOD_14D} AND status <> 'cancelled' GROUP BY 1, 2"
        ),
        {"c": cid},
    ).all()
    return {
        "days": _HEATMAP_DAYS,
        "hours": list(range(8, 21)),
        "data": [{"day": r.day, "hour": r.hour, "value": r.value} for r in rows],
    }


def _appt_funnel(db: Session, cid: str) -> list[dict]:
    total = db.execute(
        text(
            "SELECT count(*) FROM appointments WHERE clinic_id = :c AND start_time >= "
            f"{PERIOD_30D} AND status <> 'cancelled'"
        ),
        {"c": cid},
    ).scalar() or 0
    confirmed = db.execute(
        text(
            "SELECT count(*) FROM appointments WHERE clinic_id = :c AND start_time >= "
            f"{PERIOD_30D} AND status = 'confirmed'"
        ),
        {"c": cid},
    ).scalar() or 0
    completed = db.execute(
        text(
            "SELECT count(*) FROM appointments WHERE clinic_id = :c AND start_time >= "
            f"{PERIOD_30D} AND status = 'completed'"
        ),
        {"c": cid},
    ).scalar() or 0
    surveyed = db.execute(
        text(
            "SELECT count(*) FROM consultation_surveys s "
            "JOIN consultations c ON c.id = s.consultation_id "
            "WHERE c.clinic_id = :cid AND c.created_at >= " + PERIOD_30D
        ),
        {"cid": cid},
    ).scalar() or 0
    return [
        {"name": "Agendadas", "value": total},
        {"name": "Confirmadas", "value": confirmed},
        {"name": "Completadas", "value": completed},
        {"name": "Encuestadas", "value": surveyed},
    ]


def _procedures(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT procedure_type AS name, count(*) AS value FROM appointments "
            "WHERE clinic_id = :c AND start_time >= "
            f"{PERIOD_30D} AND status <> 'cancelled' "
            "GROUP BY 1 ORDER BY value DESC LIMIT 8"
        ),
        {"c": cid},
    ).all()
    return [{"name": r.name, "value": r.value} for r in rows]


def _vet_load(db: Session, cid: str) -> dict:
    citas = db.execute(
        text(
            "SELECT vet_user_id, count(*) AS value FROM appointments "
            "WHERE clinic_id = :c AND vet_user_id IS NOT NULL AND start_time >= "
            f"{PERIOD_30D} GROUP BY 1"
        ),
        {"c": cid},
    ).all()
    completadas = db.execute(
        text(
            "SELECT vet_user_id, count(*) AS value FROM appointments "
            "WHERE clinic_id = :c AND vet_user_id IS NOT NULL AND start_time >= "
            f"{PERIOD_30D} AND status = 'completed' GROUP BY 1"
        ),
        {"c": cid},
    ).all()
    no_show = db.execute(
        text(
            "SELECT vet_user_id, count(*) AS value FROM appointments "
            "WHERE clinic_id = :c AND vet_user_id IS NOT NULL AND start_time >= "
            f"{PERIOD_30D} AND status = 'no_show' GROUP BY 1"
        ),
        {"c": cid},
    ).all()
    consultas = db.execute(
        text(
            "SELECT vet_user_id, count(*) AS value FROM consultations "
            "WHERE clinic_id = :c AND vet_user_id IS NOT NULL AND created_at >= "
            f"{PERIOD_30D} GROUP BY 1"
        ),
        {"c": cid},
    ).all()

    def _map(rows, key):
        return {str(r.vet_user_id): r.value for r in rows}

    citas_map, comp_map, noshow_map, cons_map = (
        _map(citas, "citas"),
        _map(completadas, "completadas"),
        _map(no_show, "no_show"),
        _map(consultas, "consultas"),
    )

    vets = sorted(
        citas_map,
        key=lambda vid: citas_map.get(vid, 0),
        reverse=True,
    )[:5]
    if not vets:
        return {"metrics": [], "vets": [], "data": []}

    names_rows = db.execute(
        text("SELECT id, full_name FROM users WHERE id = ANY(:ids)"),
        {"ids": vets},
    ).all()
    names = {str(r.id): r.full_name for r in names_rows}

    metrics = ["Citas", "Completadas", "Consultas", "No-show"]
    data = [
        {
            "metric": "Citas",
            **{names[v]: citas_map.get(v, 0) for v in vets},
        },
        {
            "metric": "Completadas",
            **{names[v]: comp_map.get(v, 0) for v in vets},
        },
        {
            "metric": "Consultas",
            **{names[v]: cons_map.get(v, 0) for v in vets},
        },
        {
            "metric": "No-show",
            **{names[v]: noshow_map.get(v, 0) for v in vets},
        },
    ]
    return {
        "metrics": metrics,
        "vets": [names.get(v, "Sin nombre") for v in vets],
        "data": data,
    }


def _vaccination(db: Session, cid: str) -> list[dict]:
    labels = {"completed": "Completadas", "scheduled": "Programadas", "skipped": "Omitidas"}
    rows = db.execute(
        text(
            "SELECT d.status AS name, count(*) AS value FROM pet_vaccination_doses d "
            "JOIN pet_vaccination_plans p ON p.id = d.pet_vaccination_plan_id "
            "WHERE p.clinic_id = :c GROUP BY d.status"
        ),
        {"c": cid},
    ).all()
    return [{"name": labels.get(r.name, r.name), "value": r.value} for r in rows]


def _upcoming_doses(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT to_char(due_date, 'MM-DD') AS label, count(*) AS value "
            "FROM pet_vaccination_doses d "
            "JOIN pet_vaccination_plans p ON p.id = d.pet_vaccination_plan_id "
            "WHERE p.clinic_id = :c AND d.status = 'scheduled' "
            "AND d.due_date BETWEEN current_date AND current_date + 60 "
            "GROUP BY due_date ORDER BY due_date"
        ),
        {"c": cid},
    ).all()
    return [{"label": r.label, "value": r.value} for r in rows]


def _stock_levels(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT CASE WHEN stock_quantity <= 0 THEN 'Agotado' "
            "WHEN stock_quantity <= 5 THEN 'Bajo' ELSE 'Sano' END AS name, count(*) AS value "
            "FROM sale_products WHERE clinic_id = :c GROUP BY 1"
        ),
        {"c": cid},
    ).all()
    return [{"name": r.name, "value": r.value} for r in rows]


def _inv_movements(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT to_char(date_trunc('month', m.created_at), 'YYYY-MM') AS label, "
            "sum(CASE WHEN m.quantity_delta > 0 THEN m.quantity_delta ELSE 0 END) AS fin, "
            "abs(sum(CASE WHEN m.quantity_delta < 0 THEN m.quantity_delta ELSE 0 END)) AS fout "
            "FROM inventory_movements m "
            "JOIN inventory_products p ON p.id = m.product_id "
            "WHERE p.clinic_id = :c AND m.created_at >= "
            f"{PERIOD_6M} GROUP BY 1 ORDER BY 1"
        ),
        {"c": cid},
    ).all()
    return [{"label": r.label, "in": float(r.fin or 0), "out": float(r.fout or 0)} for r in rows]


def _reasons(db: Session, cid: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT COALESCE(NULLIF(reason, ''), 'Sin motivo') AS name, count(*) AS value "
            "FROM consultations WHERE clinic_id = :c AND created_at >= "
            f"{PERIOD_30D} AND reason IS NOT NULL GROUP BY reason ORDER BY value DESC LIMIT 8"
        ),
        {"c": cid},
    ).all()
    return [{"name": r.name, "value": r.value} for r in rows]


_BUILDERS = {
    "species": _species,
    "breeds": _breeds,
    "new_pets": _new_pets,
    "appt_heatmap": _appt_heatmap,
    "appt_funnel": _appt_funnel,
    "procedures": _procedures,
    "vet_load": _vet_load,
    "vaccination": _vaccination,
    "upcoming_doses": _upcoming_doses,
    "stock_levels": _stock_levels,
    "inv_movements": _inv_movements,
    "reasons": _reasons,
}


@router.get("/data")
def dashboard_data(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    slugs: str | None = Query(default=None),
) -> dict:
    """Devuelve el dataset de cada dashboard pedido (o de todos)."""
    wanted = [s for s in slugs.split(",") if s in _BUILDERS] if slugs else list(_BUILDERS)
    return {slug: _BUILDERS[slug](db, ctx.clinic["id"]) for slug in wanted}
