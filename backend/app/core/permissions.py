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
    "purchase_orders": "Órdenes de compra",
    "invoices": "Facturación",
    "services": "Servicios",
    "templates": "Plantillas",
    "automation": "Automatización",
    "reports": "Reportes",
    "financial": "Financiero",
    "audit": "Bitácora",
    "settings": "Configuración",
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
        "templates",
        "reports",
        "audit",
    },
    "recepcion": {
        "dashboard",
        "agenda",
        "waitlist",
        "pets",
        "inventory",
        "reports",
        "audit",
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
    return [{"slug": slug, "label": label} for slug, label in COMPONENTS.items()]
