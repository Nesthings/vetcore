"""Motor de "Alertas inteligentes" — reglas deterministas por clínica.

Arquitectura:
- Una REGLA (SmartAlertRule) define cuándo aparece un aviso (umbrales,
  severidad, mensaje) y se evalúa de forma 100% determinista (sin IA).
- Un AVISO (SmartAlert) se genera para una entidad concreta (hoy: mascota).
- El estado evita duplicados: un único aviso `active` por
  (clinic_id, rule_key, entity_type, entity_id) gracias al índice único
  parcial; al dejar de cumplirse la condición, el aviso se auto-resuelve.

La evaluación ocurre SOLO en backend. El frontend consume los avisos.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Pet, SmartAlert, SmartAlertRule

logger = logging.getLogger(__name__)

SEVERITY_CRITICAL = "critical"
SEVERITY_WARNING = "warning"
SEVERITY_INFO = "info"
SEVERITY_SUCCESS = "success"

ALERT_ACTIVE = "active"
ALERT_RESOLVED = "resolved"
ALERT_DISMISSED = "dismissed"

ENTITY_PET = "pet"
ENTITY_HOSPITALIZATION = "hospitalization"


@dataclass
class EvaluatedAlert:
    rule_key: str
    entity_type: str
    entity_id: str
    message: str
    link: str
    metadata: dict = field(default_factory=dict)


@dataclass
class RuleDef:
    key: str
    name: str
    category: str
    severity: str
    message_template: str
    default_params: dict
    evaluate: object


# ---------------------------------------------------------------------------
# Evaluadores de reglas (queries en batch, sin N+1)
# ---------------------------------------------------------------------------


def _vaccination_rows(db: Session, clinic_id) -> list:
    return (
        db.execute(
            text(
                "SELECT DISTINCT ON (pvp.pet_id) "
                "  pvp.pet_id AS pet_id, p.name AS pet_name, "
                "  d.due_date AS due_date, COALESCE(vp.compound, vp.name, d.label) AS vaccine "
                "FROM pet_vaccination_doses d "
                "JOIN pet_vaccination_plans pvp ON pvp.id = d.pet_vaccination_plan_id "
                "  AND pvp.clinic_id = :cid "
                "JOIN vaccination_plans vp ON vp.id = pvp.plan_id "
                "JOIN pets p ON p.id = pvp.pet_id AND p.clinic_id = :cid AND p.is_active = true "
                "WHERE d.status = 'scheduled' "
                "ORDER BY pvp.pet_id, d.due_date ASC, d.id ASC"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )


def _evaluate_vacuna_proxima(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    threshold = int(params.get("upcoming_days", 30))
    today = date.today()
    out: list[EvaluatedAlert] = []
    for r in _vaccination_rows(db, clinic_id):
        days = (r["due_date"] - today).days
        if days < 0 or days > threshold:
            continue
        out.append(
            EvaluatedAlert(
                rule_key="vacuna_proxima",
                entity_type=ENTITY_PET,
                entity_id=str(r["pet_id"]),
                message=(
                    f"{r['pet_name']} tiene una vacuna ({r['vaccine']}) próxima en {days} días."
                ),
                link=f"/pets/{r['pet_id']}",
                metadata={
                    "pet_name": r["pet_name"],
                    "days": days,
                    "due_date": r["due_date"].isoformat(),
                    "vaccine": r["vaccine"],
                },
            )
        )
    return out


def _evaluate_vacuna_vencida(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    today = date.today()
    out: list[EvaluatedAlert] = []
    for r in _vaccination_rows(db, clinic_id):
        days = (r["due_date"] - today).days
        if days >= 0:
            continue
        out.append(
            EvaluatedAlert(
                rule_key="vacuna_vencida",
                entity_type=ENTITY_PET,
                entity_id=str(r["pet_id"]),
                message=(
                    f"{r['pet_name']} tiene una vacuna ({r['vaccine']}) vencida "
                    f"desde hace {abs(days)} días."
                ),
                link=f"/pets/{r['pet_id']}",
                metadata={
                    "pet_name": r["pet_name"],
                    "days": abs(days),
                    "due_date": r["due_date"].isoformat(),
                    "vaccine": r["vaccine"],
                },
            )
        )
    return out


def _evaluate_revision(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    threshold_days = int(params.get("days_since_consultation", 365))
    rows = (
        db.execute(
            text(
                "SELECT c.pet_id AS pet_id, p.name AS pet_name, "
                "  MAX(COALESCE(c.performed_at, c.created_at)) AS last_consult "
                "FROM consultations c "
                "JOIN pets p ON p.id = c.pet_id AND p.clinic_id = :cid AND p.is_active = true "
                "WHERE c.clinic_id = :cid AND c.pet_id IS NOT NULL "
                "GROUP BY c.pet_id, p.name"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )

    today = date.today()
    out: list[EvaluatedAlert] = []
    for r in rows:
        last = r["last_consult"]
        if last is None:
            continue
        days = (today - last.date()).days
        if days > threshold_days:
            months = max(1, round(days / 30))
            out.append(
                EvaluatedAlert(
                    rule_key="revision_preventiva",
                    entity_type=ENTITY_PET,
                    entity_id=str(r["pet_id"]),
                    message=f"{r['pet_name']} lleva {months} meses sin una consulta preventiva.",
                    link=f"/pets/{r['pet_id']}",
                    metadata={"pet_name": r["pet_name"], "days": days, "months": months},
                )
            )
    return out


def _evaluate_seguimiento(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    candidates = (
        db.execute(
            text(
                "SELECT c.pet_id AS pet_id, p.name AS pet_name, "
                "  MAX(c.next_appointment_suggestion) AS suggestion "
                "FROM consultations c "
                "JOIN pets p ON p.id = c.pet_id AND p.clinic_id = :cid AND p.is_active = true "
                "WHERE c.clinic_id = :cid AND c.next_appointment_suggestion IS NOT NULL "
                "GROUP BY c.pet_id, p.name "
                "HAVING MAX(c.next_appointment_suggestion) < CURRENT_DATE"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )
    if not candidates:
        return []

    pet_ids = [r["pet_id"] for r in candidates]
    future = {
        r["pet_id"]: r["next_appt"]
        for r in db.execute(
            text(
                "SELECT a.pet_id AS pet_id, MIN(a.start_time) AS next_appt "
                "FROM appointments a "
                "WHERE a.clinic_id = :cid AND a.pet_id = ANY(:ids) "
                "  AND a.status IN ('scheduled','confirmed') AND a.start_time > now() "
                "GROUP BY a.pet_id"
            ),
            {"cid": clinic_id, "ids": pet_ids},
        )
        .mappings()
        .all()
    }

    out: list[EvaluatedAlert] = []
    for r in candidates:
        if r["pet_id"] in future:
            continue
        suggestion = r["suggestion"]
        out.append(
            EvaluatedAlert(
                rule_key="seguimiento_pendiente",
                entity_type=ENTITY_PET,
                entity_id=str(r["pet_id"]),
                message=(
                    f"{r['pet_name']} tiene un seguimiento pendiente desde el "
                    f"{suggestion.strftime('%d/%m/%Y')}."
                ),
                link=f"/pets/{r['pet_id']}",
                metadata={"pet_name": r["pet_name"], "suggestion": suggestion.isoformat()},
            )
        )
    return out


def _evaluate_peso(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    threshold = Decimal(str(params.get("weight_pct", 10)))
    rows = (
        db.execute(
            text(
                "SELECT pet_id, weight_kg, rn FROM ("
                "  SELECT pet_id, weight_kg, "
                "         ROW_NUMBER() OVER (PARTITION BY pet_id "
                "           ORDER BY recorded_at DESC, id DESC) AS rn "
                "  FROM pet_weight_records WHERE clinic_id = :cid"
                ") t WHERE rn <= 2"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )

    per_pet: dict = {}
    for r in rows:
        per_pet.setdefault(r["pet_id"], {})[r["rn"]] = r["weight_kg"]

    names = {
        str(p.id): p.name
        for p in db.scalars(
            select(Pet).where(Pet.clinic_id == clinic_id, Pet.id.in_(list(per_pet.keys())))
        ).all()
    }

    out: list[EvaluatedAlert] = []
    for pet_id, weights in per_pet.items():
        latest = weights.get(1)
        prev = weights.get(2)
        if latest is None or prev is None or prev == 0:
            continue
        pct = (latest - prev) / prev * 100
        if abs(pct) < threshold:
            continue
        direction = "aumentó" if pct > 0 else "bajó"
        pet_name = names.get(str(pet_id), "El paciente")
        out.append(
            EvaluatedAlert(
                rule_key="cambio_peso",
                entity_type=ENTITY_PET,
                entity_id=str(pet_id),
                message=f"{pet_name} {direction} {abs(pct):.1f}% de peso desde su última medición.",
                link=f"/pets/{pet_id}",
                metadata={
                    "pet_name": pet_name,
                    "pct": float(pct),
                    "latest_weight": float(latest),
                    "previous_weight": float(prev),
                },
            )
        )
    return out


def _evaluate_cita_cancelada(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    threshold_days = int(params.get("days_without_reschedule", 3))
    rows = (
        db.execute(
            text(
                "SELECT a.id AS appointment_id, a.pet_id AS pet_id, p.name AS pet_name, "
                "  a.start_time AS start_time "
                "FROM appointments a "
                "JOIN pets p ON p.id = a.pet_id AND p.clinic_id = :cid AND p.is_active = true "
                "WHERE a.clinic_id = :cid AND a.status = 'cancelled' "
                "  AND a.start_time < :cutoff"
            ),
            {"cid": clinic_id, "cutoff": datetime.now(UTC) - timedelta(days=threshold_days)},
        )
        .mappings()
        .all()
    )
    if not rows:
        return []

    pet_ids = list({r["pet_id"] for r in rows})
    future = {
        r["pet_id"]: r["next_start"]
        for r in db.execute(
            text(
                "SELECT a.pet_id AS pet_id, MIN(a.start_time) AS next_start "
                "FROM appointments a "
                "WHERE a.clinic_id = :cid AND a.pet_id = ANY(:ids) "
                "  AND a.status IN ('scheduled','confirmed') AND a.start_time > now() "
                "GROUP BY a.pet_id"
            ),
            {"cid": clinic_id, "ids": pet_ids},
        )
        .mappings()
        .all()
    }

    today = date.today()
    out: list[EvaluatedAlert] = []
    for r in rows:
        if r["pet_id"] in future:
            continue
        days = (today - r["start_time"].date()).days
        out.append(
            EvaluatedAlert(
                rule_key="cita_cancelada",
                entity_type=ENTITY_PET,
                entity_id=str(r["pet_id"]),
                message=(
                    f"La cita de {r['pet_name']} fue cancelada hace {max(1, days)} días "
                    "y todavía no ha sido reprogramada."
                ),
                link=f"/pets/{r['pet_id']}",
                metadata={
                    "pet_name": r["pet_name"],
                    "days": max(1, days),
                    "appointment_id": str(r["appointment_id"]),
                    "original_date": r["start_time"].isoformat(),
                },
            )
        )
    return out


# ---------------------------------------------------------------------------
# Registro de reglas
# ---------------------------------------------------------------------------


def _hosp_medication_overdue(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    rows = (
        db.execute(
            text(
                "SELECT h.id AS hosp_id, p.name AS pet_name, count(*) AS overdue "
                "FROM hospitalization_medication_administrations a "
                "JOIN hospitalization_medication_orders o ON o.id = a.order_id "
                "  AND o.clinic_id = :cid "
                "JOIN hospitalizations h ON h.id = o.hospitalization_id "
                "  AND h.clinic_id = :cid "
                "  AND h.status IN ('admitted','active','discharge_pending') "
                "JOIN pets p ON p.id = h.pet_id "
                "WHERE a.status = 'pending' AND a.scheduled_at < now() "
                "GROUP BY h.id, p.name"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )
    out: list[EvaluatedAlert] = []
    for r in rows:
        out.append(
            EvaluatedAlert(
                rule_key="hosp_medication_overdue",
                entity_type=ENTITY_HOSPITALIZATION,
                entity_id=str(r["hosp_id"]),
                message=(
                    f"{r['pet_name']} tiene {r['overdue']} medicamento(s) "
                    "pendiente(s) de administrar."
                ),
                link=f"/hospitalizacion/{r['hosp_id']}",
                metadata={"pet_name": r["pet_name"], "count": r["overdue"]},
            )
        )
    return out


def _hosp_vitals_overdue(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    rows = (
        db.execute(
            text(
                "SELECT h.id AS hosp_id, p.name AS pet_name, count(*) AS overdue "
                "FROM hospitalization_tasks t "
                "JOIN hospitalizations h ON h.id = t.hospitalization_id "
                "  AND h.clinic_id = :cid "
                "  AND h.status IN ('admitted','active','discharge_pending') "
                "JOIN pets p ON p.id = h.pet_id "
                "WHERE t.type = 'vitals' AND t.status = 'pending' AND t.scheduled_at < now() "
                "GROUP BY h.id, p.name"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )
    out: list[EvaluatedAlert] = []
    for r in rows:
        out.append(
            EvaluatedAlert(
                rule_key="hosp_vitals_overdue",
                entity_type=ENTITY_HOSPITALIZATION,
                entity_id=str(r["hosp_id"]),
                message=(
                    f"{r['pet_name']} tiene {r['overdue']} toma(s) de signos vitales atrasadas."
                ),
                link=f"/hospitalizacion/{r['hosp_id']}",
                metadata={"pet_name": r["pet_name"], "count": r["overdue"]},
            )
        )
    return out


def _hosp_expected_discharge(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    rows = (
        db.execute(
            text(
                "SELECT h.id AS hosp_id, p.name AS pet_name, h.expected_discharge_at AS expected "
                "FROM hospitalizations h JOIN pets p ON p.id = h.pet_id "
                "WHERE h.clinic_id = :cid "
                "  AND (h.status = 'discharge_pending' "
                "       OR (h.status IN ('admitted','active') "
                "           AND h.expected_discharge_at IS NOT NULL "
                "           AND h.expected_discharge_at <= now() + interval '24 hours'))"
            ),
            {"cid": clinic_id},
        )
        .mappings()
        .all()
    )
    out: list[EvaluatedAlert] = []
    for r in rows:
        out.append(
            EvaluatedAlert(
                rule_key="hosp_expected_discharge",
                entity_type=ENTITY_HOSPITALIZATION,
                entity_id=str(r["hosp_id"]),
                message=f"{r['pet_name']} está próximo a su alta.",
                link=f"/hospitalizacion/{r['hosp_id']}",
                metadata={"pet_name": r["pet_name"]},
            )
        )
    return out


def _hosp_stay_long(db: Session, clinic_id, params: dict) -> list[EvaluatedAlert]:
    days = int(params.get("days_without_expected_discharge", 7))
    rows = (
        db.execute(
            text(
                "SELECT h.id AS hosp_id, p.name AS pet_name, "
                "  extract(epoch from (now() - h.admitted_at)) / 86400.0 AS days "
                "FROM hospitalizations h JOIN pets p ON p.id = h.pet_id "
                "WHERE h.clinic_id = :cid AND h.status IN ('admitted','active') "
                "  AND h.expected_discharge_at IS NULL "
                "  AND h.admitted_at < now() - :days * interval '1 day'"
            ),
            {"cid": clinic_id, "days": days},
        )
        .mappings()
        .all()
    )
    out: list[EvaluatedAlert] = []
    for r in rows:
        out.append(
            EvaluatedAlert(
                rule_key="hosp_stay_long",
                entity_type=ENTITY_HOSPITALIZATION,
                entity_id=str(r["hosp_id"]),
                message=(
                    f"{r['pet_name']} lleva {int(r['days'])} días hospitalizado sin alta estimada."
                ),
                link=f"/hospitalizacion/{r['hosp_id']}",
                metadata={"pet_name": r["pet_name"], "days": int(r["days"])},
            )
        )
    return out


RULES: dict[str, RuleDef] = {
    "vacuna_proxima": RuleDef(
        key="vacuna_proxima",
        name="Vacuna próxima",
        category="vacunación",
        severity=SEVERITY_INFO,
        message_template="{mascota} tiene una vacuna próxima en {dias} días.",
        default_params={"upcoming_days": 30},
        evaluate=_evaluate_vacuna_proxima,
    ),
    "vacuna_vencida": RuleDef(
        key="vacuna_vencida",
        name="Vacuna vencida",
        category="vacunación",
        severity=SEVERITY_CRITICAL,
        message_template="{mascota} tiene una vacuna vencida desde hace {dias} días.",
        default_params={},
        evaluate=_evaluate_vacuna_vencida,
    ),
    "revision_preventiva": RuleDef(
        key="revision_preventiva",
        name="Revisión preventiva pendiente",
        category="prevención",
        severity=SEVERITY_WARNING,
        message_template="{mascota} lleva {meses} meses sin una consulta preventiva.",
        default_params={"days_since_consultation": 365},
        evaluate=_evaluate_revision,
    ),
    "seguimiento_pendiente": RuleDef(
        key="seguimiento_pendiente",
        name="Seguimiento pendiente",
        category="seguimiento",
        severity=SEVERITY_WARNING,
        message_template="{mascota} tiene un seguimiento pendiente.",
        default_params={},
        evaluate=_evaluate_seguimiento,
    ),
    "cambio_peso": RuleDef(
        key="cambio_peso",
        name="Cambio significativo de peso",
        category="salud",
        severity=SEVERITY_INFO,
        message_template="{mascota} cambió de peso significativamente.",
        default_params={"weight_pct": 10},
        evaluate=_evaluate_peso,
    ),
    "cita_cancelada": RuleDef(
        key="cita_cancelada",
        name="Cita cancelada sin reprogramar",
        category="agenda",
        severity=SEVERITY_WARNING,
        message_template="La cita de {mascota} fue cancelada y no se ha reprogramado.",
        default_params={"days_without_reschedule": 3},
        evaluate=_evaluate_cita_cancelada,
    ),
    "hosp_medication_overdue": RuleDef(
        key="hosp_medication_overdue",
        name="Medicamento atrasado",
        category="hospitalización",
        severity=SEVERITY_WARNING,
        message_template="{mascota} tiene medicamento(s) pendiente(s) de administrar.",
        default_params={},
        evaluate=_hosp_medication_overdue,
    ),
    "hosp_vitals_overdue": RuleDef(
        key="hosp_vitals_overdue",
        name="Signos vitales pendientes",
        category="hospitalización",
        severity=SEVERITY_WARNING,
        message_template="{mascota} tiene signos vitales atrasados.",
        default_params={},
        evaluate=_hosp_vitals_overdue,
    ),
    "hosp_expected_discharge": RuleDef(
        key="hosp_expected_discharge",
        name="Alta pendiente / próxima",
        category="hospitalización",
        severity=SEVERITY_INFO,
        message_template="{mascota} está próximo a su alta.",
        default_params={},
        evaluate=_hosp_expected_discharge,
    ),
    "hosp_stay_long": RuleDef(
        key="hosp_stay_long",
        name="Estancia sin alta estimada",
        category="hospitalización",
        severity=SEVERITY_WARNING,
        message_template="{mascota} lleva demasiado tiempo hospitalizado sin alta estimada.",
        default_params={"days_without_expected_discharge": 7},
        evaluate=_hosp_stay_long,
    ),
}


# ---------------------------------------------------------------------------
# Persistencia: reglas y avisos
# ---------------------------------------------------------------------------


def ensure_smart_alert_rules(db: Session) -> None:
    """Siembra las reglas globales (clinic_id NULL) la primera vez."""
    existing = set(
        db.scalars(select(SmartAlertRule.rule_key).where(SmartAlertRule.clinic_id.is_(None))).all()
    )
    missing = [r for r in RULES.values() if r.key not in existing]
    for r in missing:
        db.add(
            SmartAlertRule(
                clinic_id=None,
                rule_key=r.key,
                name=r.name,
                category=r.category,
                severity=r.severity,
                message_template=r.message_template,
                params=r.default_params,
            )
        )
    if missing:
        db.commit()


def load_effective_rules(db: Session, clinic_id) -> dict[str, SmartAlertRule]:
    """Reglas efectivas: override por clínica gana sobre la global."""
    ensure_smart_alert_rules(db)
    rows = db.scalars(
        select(SmartAlertRule).where(
            or_(
                SmartAlertRule.clinic_id == clinic_id,
                SmartAlertRule.clinic_id.is_(None),
            )
        )
    ).all()
    effective: dict[str, SmartAlertRule] = {r.rule_key: r for r in rows if r.clinic_id is None}
    for r in rows:
        if r.clinic_id == clinic_id:
            effective[r.rule_key] = r
    return {k: r for k, r in effective.items() if r.active}


def sync_alerts(
    db: Session,
    clinic_id,
    branch_id,
    evaluations: dict[str, list[EvaluatedAlert]],
) -> None:
    """Sincroniza los avisos con el resultado de la evaluación.

    - Crea el aviso si no existe un `active` equivalente.
    - Actualiza metadata/mensaje de los activos que siguen cumpliéndose.
    - Respeta los `dismissed` (no se re-crean mientras persista la condición).
    - Resuelve los `active` cuya condición ya no se cumple.
    """
    now = datetime.now(UTC)
    rule_keys = list(evaluations.keys())
    existing = db.scalars(
        select(SmartAlert).where(
            SmartAlert.clinic_id == clinic_id,
            SmartAlert.rule_key.in_(rule_keys),
            SmartAlert.status.in_((ALERT_ACTIVE, ALERT_DISMISSED)),
        )
    ).all()
    active: dict[str, dict] = {}
    dismissed: dict[str, set] = {}
    for alert in existing:
        key = (alert.entity_type, str(alert.entity_id))
        if alert.status == ALERT_ACTIVE:
            active.setdefault(alert.rule_key, {})[key] = alert
        else:
            dismissed.setdefault(alert.rule_key, set()).add(key)

    for rule_key, evals in evaluations.items():
        active_map = active.get(rule_key, {})
        dismissed_set = dismissed.get(rule_key, set())
        seen: set = set()
        for ev in evals:
            key = (ev.entity_type, ev.entity_id)
            seen.add(key)
            current = active_map.get(key)
            if current is not None:
                current.last_evaluated_at = now
                current.message = ev.message
                current.link = ev.link
                current.metadata_json = ev.metadata
            elif key in dismissed_set:
                continue
            else:
                db.add(
                    SmartAlert(
                        clinic_id=clinic_id,
                        branch_id=branch_id,
                        rule_key=rule_key,
                        entity_type=ev.entity_type,
                        entity_id=ev.entity_id,
                        status=ALERT_ACTIVE,
                        triggered_at=now,
                        last_evaluated_at=now,
                        metadata_json=ev.metadata,
                        message=ev.message,
                        link=ev.link,
                    )
                )
        for key, alert in active_map.items():
            if key not in seen:
                alert.status = ALERT_RESOLVED
                alert.resolved_at = now


def evaluate_rules_for_clinic(db: Session, clinic_id, branch_id=None) -> None:
    """Evalúa las reglas activas de una clínica y sincroniza los avisos."""
    ensure_smart_alert_rules(db)
    rules = load_effective_rules(db, clinic_id)
    evaluations: dict[str, list[EvaluatedAlert]] = {}
    for key, row in rules.items():
        rule = RULES.get(key)
        if rule is None:
            continue
        params = {**rule.default_params, **(row.params or {})}
        try:
            # Savepoint: si una regla falla, no aborta la transacción completa.
            with db.begin_nested():
                evaluations[key] = rule.evaluate(db, clinic_id, params)
        except Exception:  # noqa: BLE001 - una regla rota no detiene el resto
            logger.exception("Fallo al evaluar la regla %s en la clínica %s", key, clinic_id)
            evaluations[key] = []
    sync_alerts(db, clinic_id, branch_id, evaluations)
    db.commit()


def sweep_all_clinics() -> None:
    """Barre todas las clínicas activas/trial (para el barrido periódico)."""
    session = SessionLocal()
    try:
        clinic_ids = (
            session.execute(
                text("SELECT id FROM clinics WHERE subscription_status IN ('active','trial')")
            )
            .scalars()
            .all()
        )
    finally:
        session.close()
    for cid in clinic_ids:
        eval_session = SessionLocal()
        try:
            evaluate_rules_for_clinic(eval_session, cid)
        except Exception:  # noqa: BLE001
            logger.exception("Barrido de alertas falló para la clínica %s", cid)
        finally:
            eval_session.close()


def get_alerts_summary(db: Session, clinic_id, branch_id=None, limit: int = 12) -> dict:
    """Evalúa (perezoso) y devuelve el resumen + lista de avisos activos."""
    evaluate_rules_for_clinic(db, clinic_id, branch_id)

    rules = load_effective_rules(db, clinic_id)

    base = [SmartAlert.clinic_id == clinic_id, SmartAlert.status == ALERT_ACTIVE]
    if branch_id:
        base.append(or_(SmartAlert.branch_id.is_(None), SmartAlert.branch_id == branch_id))

    sev_counts = {"critical": 0, "warning": 0, "info": 0, "success": 0}
    rows = db.execute(
        select(SmartAlert.rule_key, func.count()).where(*base).group_by(SmartAlert.rule_key)
    ).all()
    for rule_key, count in rows:
        rule = rules.get(rule_key)
        sev = rule.severity if rule else SEVERITY_INFO
        sev_counts[sev] = sev_counts.get(sev, 0) + count
    total = sum(sev_counts.values())

    alerts = db.scalars(
        select(SmartAlert).where(*base).order_by(SmartAlert.triggered_at.desc()).limit(limit)
    ).all()

    items = []
    for a in alerts:
        rule = rules.get(a.rule_key)
        items.append(
            {
                "id": str(a.id),
                "rule_key": a.rule_key,
                "severity": rule.severity if rule else SEVERITY_INFO,
                "title": rule.name if rule else a.rule_key,
                "description": a.message or "",
                "pet_name": (a.metadata_json or {}).get("pet_name"),
                "pet_id": str(a.entity_id),
                "triggered_at": a.triggered_at.isoformat(),
                "link": a.link or f"/pets/{a.entity_id}",
                "metadata": a.metadata_json or {},
            }
        )

    return {"summary": {**sev_counts, "total": total}, "items": items}
