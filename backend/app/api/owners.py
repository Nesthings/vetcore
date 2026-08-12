"""Búsqueda de dueños vinculados a la clínica (para el alta de mascotas).

Sirve para que al registrar una mascota se pueda encontrar a un dueño ya
existente (por nombre, teléfono o correo) y vincular la nueva mascota al mismo
dueño, evitando duplicados y permitiendo la vista de familia.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic
from app.db.session import get_db

router = APIRouter(prefix="/owners", tags=["owners"])


@router.get("", summary="Busca dueños vinculados a la clínica")
def search_owners(
    search: str = Query(default="", max_length=150),
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> list[dict]:
    term = search.strip()
    if not term:
        return []
    like = f"%{term}%"
    rows = db.execute(
        text(
            "SELECT DISTINCT o.id, o.full_name, o.phone, o.email "
            "FROM owners o "
            "JOIN owner_pet_links l ON l.owner_id = o.id AND l.clinic_id = :cid "
            "WHERE o.full_name ILIKE :q OR o.phone ILIKE :q OR o.email ILIKE :q "
            "ORDER BY o.full_name "
            "LIMIT 10"
        ),
        {"cid": ctx.clinic["id"], "q": like},
    ).mappings().all()
    return [dict(r) for r in rows]
