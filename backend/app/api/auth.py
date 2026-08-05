"""Endpoints de autenticación: staff, owner y super-admin."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, CurrentUser, get_current_clinic, get_current_user
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.schemas.auth import LoginRequest, LoginResponse, MeResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _staff_login(db: Session, identifier: str, password: str) -> LoginResponse:
    row = (
        db.execute(
            text(
                "SELECT id, clinic_id, branch_id, role, password_hash, is_active "
                "FROM users WHERE email = :email"
            ),
            {"email": identifier},
        )
        .mappings()
        .first()
    )
    if row is None or not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    if not verify_password(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    token = create_access_token(
        subject=str(row["id"]),
        role=row["role"],
        clinic_id=str(row["clinic_id"]),
        branch_id=str(row["branch_id"]) if row["branch_id"] else None,
    )
    return LoginResponse(
        access_token=token,
        role=row["role"],
        sub=str(row["id"]),
        clinic_id=str(row["clinic_id"]),
        branch_id=str(row["branch_id"]) if row["branch_id"] else None,
    )


def _owner_login(db: Session, identifier: str, password: str) -> LoginResponse:
    row = (
        db.execute(
            text(
                "SELECT id, password_hash FROM owners "
                "WHERE email = :identifier OR phone = :identifier"
            ),
            {"identifier": identifier},
        )
        .mappings()
        .first()
    )
    if row is None or not row["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    if not verify_password(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    token = create_access_token(subject=str(row["id"]), role="owner")
    return LoginResponse(access_token=token, role="owner", sub=str(row["id"]))


def _super_admin_login(db: Session, identifier: str, password: str) -> LoginResponse:
    row = (
        db.execute(
            text("SELECT id, password_hash, is_active FROM super_admins WHERE email = :email"),
            {"email": identifier},
        )
        .mappings()
        .first()
    )
    if row is None or not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    if not verify_password(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    token = create_access_token(subject=str(row["id"]), role="super-admin")
    return LoginResponse(access_token=token, role="super-admin", sub=str(row["id"]))


@router.post("/login", response_model=LoginResponse, summary="Login de staff de clínica")
def login_staff(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    return _staff_login(db, body.identifier, body.password)


@router.post("/login/owner", response_model=LoginResponse, summary="Login de dueño (owner)")
def login_owner(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    return _owner_login(db, body.identifier, body.password)


@router.post(
    "/login/super-admin",
    response_model=LoginResponse,
    summary="Login de super-admin (dueño del producto)",
)
def login_super_admin(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    return _super_admin_login(db, body.identifier, body.password)


@router.get("/me", response_model=MeResponse, summary="Identidad del token actual")
def me(user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        sub=user.sub,
        role=user.role,
        clinic_id=user.clinic_id,
        branch_id=user.branch_id,
    )


@router.get(
    "/clinic-check",
    summary="Demo de middleware multi-tenant: valida suscripción de la clínica",
)
def clinic_check(ctx: CurrentClinic = Depends(get_current_clinic)) -> dict:
    return {"clinic_id": ctx.clinic["id"], "status": ctx.clinic["subscription_status"]}
