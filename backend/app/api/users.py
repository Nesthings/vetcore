"""CRUD de personal de la clínica — por-tenant, solo admin para mutar.

Incluye los endpoints de perfil propio (`/users/me`), accesibles para todo
el staff de la clínica.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentClinic,
    CurrentUser,
    get_current_clinic,
    require_clinic_roles,
    require_staff,
)
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models import ClinicBranch, User
from app.schemas.staff import ProfileUpdate, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _with_branch_names(db: Session, users: list[User]) -> list[dict]:
    if not users:
        return []
    branch_ids = {u.branch_id for u in users if u.branch_id}
    branches = (
        dict(
            db.execute(
                select(ClinicBranch.id, ClinicBranch.name).where(ClinicBranch.id.in_(branch_ids))
            ).all()
        )
        if branch_ids
        else {}
    )
    out = []
    for u in users:
        data = UserRead.model_validate(u).model_dump()
        data["branch_name"] = branches.get(u.branch_id)
        out.append(data)
    return out


@router.get("", response_model=list[UserRead])
def list_users(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    stmt = (
        select(User)
        .where(User.clinic_id == ctx.clinic["id"])
        .order_by(User.created_at)
        .limit(limit)
        .offset(offset)
    )
    return _with_branch_names(db, list(db.scalars(stmt)))


@router.get("/me", response_model=UserRead, summary="Perfil propio del staff")
def my_profile(
    me: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(User, me.sub)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return _with_branch_names(db, [user])[0]


@router.patch("/me", response_model=UserRead, summary="Actualiza tu perfil / contraseña")
def update_my_profile(
    body: ProfileUpdate,
    me: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(User, me.sub)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if body.new_password is not None:
        if not body.current_password or not verify_password(
            body.current_password, user.password_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contraseña actual no es correcta",
            )
        user.password_hash = hash_password(body.new_password)

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.phone is not None:
        user.phone = body.phone

    db.commit()
    db.refresh(user)
    return _with_branch_names(db, [user])[0]


def _get_user_or_404(db: Session, clinic_id: str, user_id: str) -> User:
    user = db.scalar(select(User).where(User.id == user_id, User.clinic_id == clinic_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict:
    return _with_branch_names(db, [_get_user_or_404(db, ctx.clinic["id"], user_id)])[0]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> User:
    exists = db.scalar(
        select(User).where(User.clinic_id == ctx.clinic["id"], User.email == body.email)
    )
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese email en la clínica",
        )
    data = body.model_dump(exclude={"password"})
    data["password_hash"] = hash_password(body.password)
    user = User(clinic_id=ctx.clinic["id"], **data)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email duplicado") from exc
    db.refresh(user)
    return _with_branch_names(db, [user])[0]


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    body: UserUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    user = _get_user_or_404(db, ctx.clinic["id"], user_id)
    data = body.model_dump(exclude_unset=True, exclude={"password"})
    for field, value in data.items():
        setattr(user, field, value)
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email duplicado") from exc
    db.refresh(user)
    return _with_branch_names(db, [user])[0]


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin")),
    db: Session = Depends(get_db),
) -> None:
    """Desactiva el usuario (soft-delete via is_active)."""
    user = _get_user_or_404(db, ctx.clinic["id"], user_id)
    user.is_active = False
    db.commit()
