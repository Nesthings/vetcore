"""Dependencias de autenticación y control de acceso multi-tenant."""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import get_token_payload
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

VALID_ROLES = {"super-admin", "admin", "veterinario", "recepcion", "owner"}

STAFF_ROLES = {"admin", "veterinario", "recepcion"}


class CurrentUser:
    def __init__(self, sub: str, role: str, clinic_id: str | None, branch_id: str | None):
        self.sub = sub
        self.role = role
        self.clinic_id = clinic_id
        self.branch_id = branch_id


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar la credencial",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = get_token_payload(token)
    except Exception:
        raise credentials_exception from None

    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or not role or role not in VALID_ROLES:
        raise credentials_exception

    return CurrentUser(
        sub=sub,
        role=role,
        clinic_id=payload.get("clinic_id"),
        branch_id=payload.get("branch_id"),
    )


def require_roles(*roles: str):
    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta acción",
            )
        return user

    return dependency


def require_staff(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role not in STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo personal de la clínica",
        )
    if not user.clinic_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token sin clínica asociada",
        )
    return user


def require_clinic_roles(*roles: str):
    """Restringe una ruta tenant a roles específicos del staff.

    Combina la validación de suscripción (get_current_clinic) con el chequeo
    de rol, devolviendo el contexto de clínica ya validado.
    """

    def dependency(ctx: CurrentClinic = Depends(get_current_clinic)) -> CurrentClinic:
        if ctx.user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta acción",
            )
        return ctx

    return dependency


@dataclass
class CurrentClinic:
    user: CurrentUser
    clinic: dict


def get_current_clinic(
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
) -> CurrentClinic:
    """Valida que la clínica del usuario tenga una suscripción activa.

    Regla de la sección 3, punto 1 y del stack tecnológico: cada request
    de la clínica valida `subscription_status`. Las clínicas suspendidas o
    canceladas quedan bloqueadas para el staff (el modo solo-lectura del
    dueño se maneja aparte, en la Subfase 1.7).
    """
    row = (
        db.execute(
            text("SELECT id, name, subscription_status FROM clinics WHERE id = :cid"),
            {"cid": user.clinic_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clínica no encontrada",
        )
    if row["subscription_status"] not in ("active", "trial"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Suscripción de la clínica no activa",
        )
    return CurrentClinic(user=user, clinic=dict(row))
