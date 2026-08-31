"""Catálogo de servicios y precios — solo admin (montos de dinero, regla 3.9)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_component
from app.db.session import get_db
from app.models import ServiceCatalog
from app.schemas.services import ServiceCreate, ServiceRead, ServiceUpdate

router = APIRouter(
    prefix="/services",
    tags=["services"],
    dependencies=[Depends(require_component("services"))],
)


@router.get("", response_model=list[ServiceRead])
def list_services(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ServiceCatalog]:
    stmt = (
        select(ServiceCatalog)
        .where(ServiceCatalog.clinic_id == ctx.clinic["id"])
        .order_by(ServiceCatalog.name)
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


def _get_service_or_404(db: Session, clinic_id: str, service_id: str) -> ServiceCatalog:
    service = db.scalar(
        select(ServiceCatalog).where(
            ServiceCatalog.id == service_id, ServiceCatalog.clinic_id == clinic_id
        )
    )
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado")
    return service


@router.get("/{service_id}", response_model=ServiceRead)
def get_service(
    service_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ServiceCatalog:
    return _get_service_or_404(db, ctx.clinic["id"], service_id)


@router.post("", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(
    body: ServiceCreate,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ServiceCatalog:
    service = ServiceCatalog(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/{service_id}", response_model=ServiceRead)
def update_service(
    service_id: str,
    body: ServiceUpdate,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ServiceCatalog:
    service = _get_service_or_404(db, ctx.clinic["id"], service_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> None:
    service = _get_service_or_404(db, ctx.clinic["id"], service_id)
    db.delete(service)
    db.commit()
