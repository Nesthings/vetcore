"""CRUD de sucursales — por-tenant (cada sucursal tiene agenda e inventario propios)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, get_current_clinic, require_component
from app.db.session import get_db
from app.models import ClinicBranch
from app.schemas.clinic import ClinicBranchCreate, ClinicBranchRead, ClinicBranchUpdate

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[ClinicBranchRead])
def list_branches(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[ClinicBranch]:
    stmt = (
        select(ClinicBranch)
        .where(ClinicBranch.clinic_id == ctx.clinic["id"])
        .order_by(ClinicBranch.created_at)
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


def _get_branch_or_404(db: Session, clinic_id: str, branch_id: str) -> ClinicBranch:
    branch = db.scalar(
        select(ClinicBranch).where(
            ClinicBranch.id == branch_id, ClinicBranch.clinic_id == clinic_id
        )
    )
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sucursal no encontrada")
    return branch


@router.get("/{branch_id}", response_model=ClinicBranchRead)
def get_branch(
    branch_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> ClinicBranch:
    return _get_branch_or_404(db, ctx.clinic["id"], branch_id)


@router.post("", response_model=ClinicBranchRead, status_code=status.HTTP_201_CREATED)
def create_branch(
    body: ClinicBranchCreate,
    ctx: CurrentClinic = Depends(require_component("settings")),
    db: Session = Depends(get_db),
) -> ClinicBranch:
    branch = ClinicBranch(clinic_id=ctx.clinic["id"], **body.model_dump())
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.patch("/{branch_id}", response_model=ClinicBranchRead)
def update_branch(
    branch_id: str,
    body: ClinicBranchUpdate,
    ctx: CurrentClinic = Depends(require_component("settings")),
    db: Session = Depends(get_db),
) -> ClinicBranch:
    branch = _get_branch_or_404(db, ctx.clinic["id"], branch_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(branch, field, value)
    db.commit()
    db.refresh(branch)
    return branch


@router.delete("/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(
    branch_id: str,
    ctx: CurrentClinic = Depends(require_component("settings")),
    db: Session = Depends(get_db),
) -> None:
    branch = _get_branch_or_404(db, ctx.clinic["id"], branch_id)
    try:
        db.delete(branch)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: la sucursal tiene citas, inventario u otros registros",
        ) from exc
