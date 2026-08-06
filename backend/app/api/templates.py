"""Plantillas de consulta — por-tenant, admin/veterinario.

Adelantadas desde la Fase 2 (decisión del usuario en la Subfase 1.9).
Definen campos reutilizables (fields_json) que guían la captura de una
consulta; la consulta puede referenciar la plantilla usada (template_id).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.db.session import get_db
from app.models import ConsultationTemplate
from app.schemas.template import TemplateCreate, TemplateRead, TemplateUpdate

router = APIRouter(
    prefix="/templates",
    tags=["templates"],
    dependencies=[Depends(require_component("templates"))],
)

TEMPLATE_MUTATORS = ("admin", "veterinario")


@router.get("", response_model=list[TemplateRead])
def list_templates(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    species: str | None = Query(default=None, max_length=50),
) -> list[ConsultationTemplate]:
    stmt = select(ConsultationTemplate).where(ConsultationTemplate.clinic_id == ctx.clinic["id"])
    if species:
        stmt = stmt.where(ConsultationTemplate.species == species)
    stmt = stmt.order_by(ConsultationTemplate.name)
    return list(db.scalars(stmt))


def _get_template_or_404(db: Session, clinic_id: str, template_id: str) -> ConsultationTemplate:
    template = db.scalar(
        select(ConsultationTemplate).where(
            ConsultationTemplate.id == template_id,
            ConsultationTemplate.clinic_id == clinic_id,
        )
    )
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plantilla no encontrada")
    return template


@router.get("/{template_id}", response_model=TemplateRead)
def get_template(
    template_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ConsultationTemplate:
    return _get_template_or_404(db, ctx.clinic["id"], template_id)


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*TEMPLATE_MUTATORS)),
    db: Session = Depends(get_db),
) -> ConsultationTemplate:
    template = ConsultationTemplate(
        clinic_id=ctx.clinic["id"],
        name=body.name,
        species=body.species,
        fields_json=[f.model_dump() for f in body.fields],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/{template_id}", response_model=TemplateRead)
def update_template(
    template_id: str,
    body: TemplateUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*TEMPLATE_MUTATORS)),
    db: Session = Depends(get_db),
) -> ConsultationTemplate:
    template = _get_template_or_404(db, ctx.clinic["id"], template_id)
    if body.name is not None:
        template.name = body.name
    if body.species is not None:
        template.species = body.species
    if body.fields is not None:
        template.fields_json = [f.model_dump() for f in body.fields]
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*TEMPLATE_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    template = _get_template_or_404(db, ctx.clinic["id"], template_id)
    db.delete(template)
    db.commit()
