"""Endpoints de autenticación: staff, owner y super-admin.

Incluye: login de los 3 tipos de identidad, activación de cuenta del owner
por token de invitación, y recuperación de contraseña del staff.
"""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import CurrentClinic, CurrentUser, get_current_clinic, get_current_user
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.schemas.auth import (
    ActivateRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ResetPasswordRequest,
)

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
    db.execute(
        text("UPDATE users SET last_login_at = now() WHERE id = :uid"), {"uid": row["id"]}
    )
    db.commit()
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
    db.execute(
        text("UPDATE super_admins SET last_login_at = now() WHERE id = :uid"), {"uid": row["id"]}
    )
    db.commit()
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
def me(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    full_name = None
    photo_url = None
    setup_completed = None
    if user.role == "super-admin":
        row = db.execute(
            text("SELECT full_name, photo_url FROM super_admins WHERE id = :uid"),
            {"uid": user.sub},
        ).mappings().first()
        if row:
            full_name, photo_url = row["full_name"], row["photo_url"]
    elif user.role in ("admin", "veterinario", "recepcion"):
        row = db.execute(
            text("SELECT full_name, photo_url FROM users WHERE id = :uid"),
            {"uid": user.sub},
        ).mappings().first()
        if row:
            full_name, photo_url = row["full_name"], row["photo_url"]
        if user.clinic_id:
            setup_completed = db.execute(
                text("SELECT setup_completed FROM clinics WHERE id = :cid"),
                {"cid": user.clinic_id},
            ).scalar()
    return MeResponse(
        sub=user.sub,
        role=user.role,
        clinic_id=user.clinic_id,
        branch_id=user.branch_id,
        full_name=full_name,
        photo_url=photo_url,
        setup_completed=setup_completed,
    )


@router.get(
    "/clinic-check",
    summary="Demo de middleware multi-tenant: valida suscripción de la clínica",
)
def clinic_check(ctx: CurrentClinic = Depends(get_current_clinic)) -> dict:
    return {"clinic_id": ctx.clinic["id"], "status": ctx.clinic["subscription_status"]}


@router.post(
    "/activate-token",
    summary="Activa la cuenta del owner con el token de invitación",
)
def activate_owner_token(
    body: ActivateRequest,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Activa un token de invitación del owner (sección 5 del documento).

    Regla de identidad global: si ya existe un `owner` con ese teléfono/correo,
    se reutiliza (solo se agrega el link). Nunca se duplica la cuenta.
    """
    invitation = (
        db.execute(
            text(
                "SELECT id, pet_id, clinic_id, contact_phone, contact_email, status, "
                "expires_at FROM owner_invitations WHERE token = :token"
            ),
            {"token": body.token},
        )
        .mappings()
        .first()
    )

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token de invitación no encontrado",
        )
    if invitation["status"] == "used":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este token ya fue utilizado",
        )
    if invitation["status"] in ("expired", "revoked") or invitation["expires_at"] < datetime.now(
        UTC
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este token de invitación expiró",
        )

    phone = invitation["contact_phone"]
    email = invitation["contact_email"]

    if not phone and not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La invitación no tiene contacto asociado",
        )

    if email:
        owner = db.execute(
            text("SELECT id FROM owners WHERE email = :email"), {"email": email}
        ).scalar()
    elif phone:
        owner = db.execute(
            text("SELECT id FROM owners WHERE phone = :phone"), {"phone": phone}
        ).scalar()

    if owner is None:
        owner = db.execute(
            text(
                "INSERT INTO owners (phone, email, password_hash) "
                "VALUES (:phone, :email, :hash) RETURNING id"
            ),
            {
                "phone": phone,
                "email": email,
                "hash": hash_password(body.password),
            },
        ).scalar()
    else:
        db.execute(
            text("UPDATE owners SET password_hash = :hash WHERE id = :oid"),
            {"hash": hash_password(body.password), "oid": owner},
        )

    db.execute(
        text(
            "INSERT INTO owner_pet_links (owner_id, pet_id, clinic_id, is_active) "
            "VALUES (:owner_id, :pet_id, :clinic_id, true) "
            "ON CONFLICT (owner_id, pet_id) "
            "DO UPDATE SET is_active = true, revoked_at = NULL"
        ),
        {
            "owner_id": owner,
            "pet_id": invitation["pet_id"],
            "clinic_id": invitation["clinic_id"],
        },
    )

    db.execute(
        text("UPDATE owner_invitations SET status = 'used', used_at = now() WHERE id = :iid"),
        {"iid": invitation["id"]},
    )
    db.commit()

    token = create_access_token(subject=str(owner), role="owner")
    return LoginResponse(access_token=token, role="owner", sub=str(owner))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    """Solicita recuperación de contraseña para un staff de clínica.

    En dev, el token de reset se devuelve en la respuesta (no hay servicio de
    email aún). La respuesta es genérica para no revelar emails existentes.
    """
    user = (
        db.execute(
            text("SELECT id FROM users WHERE email = :email AND is_active = true"),
            {"email": body.email},
        )
        .mappings()
        .first()
    )

    reset_token = None
    if user is not None:
        reset_token = secrets.token_urlsafe(32)
        db.execute(
            text(
                "INSERT INTO password_reset_tokens (user_id, token, expires_at) "
                "VALUES (:uid, :token, :expires)"
            ),
            {
                "uid": user["id"],
                "token": reset_token,
                "expires": datetime.now(UTC) + timedelta(minutes=30),
            },
        )
        db.commit()

    if settings.env == "development" and reset_token is not None:
        return ForgotPasswordResponse(
            message="Si el correo existe, recibirás un enlace para restablecer tu contraseña.",
            reset_token=reset_token,
        )
    return ForgotPasswordResponse(
        message="Si el correo existe, recibirás un enlace para restablecer tu contraseña."
    )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> None:
    reset = (
        db.execute(
            text(
                "SELECT id, user_id, expires_at FROM password_reset_tokens "
                "WHERE token = :token AND used_at IS NULL"
            ),
            {"token": body.token},
        )
        .mappings()
        .first()
    )

    if reset is None or reset["expires_at"] < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de recuperación inválido o expirado",
        )

    db.execute(
        text("UPDATE users SET password_hash = :hash WHERE id = :uid"),
        {"hash": hash_password(body.password), "uid": reset["user_id"]},
    )
    db.execute(
        text("UPDATE password_reset_tokens SET used_at = now() WHERE id = :rid"),
        {"rid": reset["id"]},
    )
    db.commit()
