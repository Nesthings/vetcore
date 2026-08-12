"""Permisos por componente del panel clínico.

Idea 2 de IDEAS.txt: el admin de la clínica activa/desactiva el acceso a
componentes (módulos) por usuario. El acceso por defecto viene del rol
(`ROLE_DEFAULT_COMPONENTS`) y se sobreescribe por usuario con la tabla
`user_component_permissions` (una fila = excepción; sin fila = default).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.staff import UserComponentPermission

# Catálogo de componentes del panel clínico (slug -> etiqueta)
COMPONENTS: dict[str, str] = {
    "dashboard": "Dashboard",
    "agenda": "Agenda",
    "waitlist": "Lista de espera",
    "pets": "Pacientes",
    "inventory": "Insumos",
    "products": "Productos",
    "purchase_orders": "Órdenes de compra",
    "invoices": "Facturación",
    "services": "Servicios",
    "vaccination_plans": "Planes de vacunación",
    "automation": "Recordatorios",
    "financial": "Finanzas",
    "audit": "Bitácora",
    "settings": "Configuración",
    "hospitalization": "Hospitalización",
}

# Breve descripción de cada módulo (para el wizard y la configuración).
COMPONENT_DESCRIPTIONS: dict[str, str] = {
    "dashboard": "Resumen del día: citas de hoy, alertas de stock y próximas citas.",
    "agenda": "Citas y calendario de la clínica.",
    "waitlist": "Lista de espera: pacientes esperando un hueco en la agenda.",
    "pets": "Expedientes de pacientes: historial clínico, carnet y fotos.",
    "inventory": "Insumos y control de stock: entradas, salidas y lotes.",
    "products": "Catálogo de productos de venta (croquetas, premios, camas, etc.).",
    "purchase_orders": "Órdenes de compra a proveedores.",
    "invoices": "Facturación y cobros de la clínica.",
    "services": "Catálogo de servicios (consultas, procedimientos).",
    "vaccination_plans": "Planes y esquemas de vacunación de las mascotas.",
    "automation": "Recordatorios automáticos de citas a los dueños.",
    "financial": "Dashboard financiero: ingresos, gastos y reportes.",
    "audit": "Bitácora de auditoría de las acciones del sistema.",
    "settings": "Configuración de la clínica, usuarios y sucursales.",
    "hospitalization": "Pacientes hospitalizados: estancias, espacios, tareas y monitoreo.",
}

# Acceso por defecto según el rol (espejo del comportamiento actual del panel)
ROLE_DEFAULT_COMPONENTS: dict[str, set[str]] = {
    "admin": set(COMPONENTS),
    "veterinario": {
        "dashboard",
        "agenda",
        "waitlist",
        "pets",
        "inventory",
        "vaccination_plans",
        "audit",
        "hospitalization",
    },
    "recepcion": {
        "dashboard",
        "agenda",
        "waitlist",
        "pets",
        "inventory",
        "audit",
        "hospitalization",
    },
}


def default_components(role: str) -> set[str]:
    return set(ROLE_DEFAULT_COMPONENTS.get(role, set()))


def get_overrides(db: Session, user_id: str) -> dict[str, bool]:
    """Devuelve {component: allowed} con los overrides del usuario."""
    rows = db.execute(
        select(UserComponentPermission.component, UserComponentPermission.allowed).where(
            UserComponentPermission.user_id == user_id
        )
    ).all()
    return {component: allowed for component, allowed in rows}


def effective_components(db: Session, user_id: str, role: str) -> set[str]:
    """Componentes efectivos = default del rol + overrides del usuario."""
    allowed = default_components(role)
    for component, value in get_overrides(db, user_id).items():
        if value:
            allowed.add(component)
        else:
            allowed.discard(component)
    return allowed


def has_component(db: Session, user_id: str, role: str, component: str) -> bool:
    return component in effective_components(db, user_id, role)


def component_catalog() -> list[dict]:
    return [
        {
            "slug": slug,
            "label": label,
            "description": COMPONENT_DESCRIPTIONS.get(slug, ""),
        }
        for slug, label in COMPONENTS.items()
    ]
