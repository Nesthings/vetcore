"""Panel de plataforma — solo super-admin (dueño del producto).

Genera y administra los links únicos para crear clínicas (`clinic_invites`)
y permite restablecer la contraseña de cualquier admin de clínica.
"""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, require_roles
from app.core.security import hash_password
from app.db.session import get_db
from app.models import ClinicInvite, User
from app.schemas.clinic import ClinicInviteCreate, ClinicInviteRead, StaffResetPassword

router = APIRouter(prefix="/platform", tags=["platform"])


def _super_admin(user: CurrentUser = Depends(require_roles("super-admin"))) -> CurrentUser:
    return user


@router.get("/users", summary="Busca staff de cualquier clínica (super-admin)")
def list_staff(
    search: str | None = Query(default=None, max_length=100),
    clinic_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(_super_admin),
) -> list[dict]:
    where = "1=1"
    params: dict = {}
    if search:
        where = "(u.email ILIKE :s OR u.full_name ILIKE :s)"
        params["s"] = f"%{search}%"
    if clinic_id:
        where += " AND u.clinic_id = :cid"
        params["cid"] = clinic_id
    rows = db.execute(
        text(
            "SELECT u.id, u.full_name, u.email, u.role, c.name AS clinic_name "
            "FROM users u JOIN clinics c ON c.id = u.clinic_id "
            f"WHERE {where} ORDER BY c.name, u.full_name LIMIT 100"
        ),
        params,
    ).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "full_name": r["full_name"],
            "email": r["email"],
            "role": r["role"],
            "clinic_name": r["clinic_name"],
        }
        for r in rows
    ]


@router.get("/clinic-invites", response_model=list[ClinicInviteRead])
def list_invites(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(_super_admin),
) -> list[ClinicInvite]:
    return list(
        db.scalars(
            select(ClinicInvite).order_by(ClinicInvite.created_at.desc()).limit(200)
        )
    )


@router.post(
    "/clinic-invites",
    response_model=ClinicInviteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invite(
    body: ClinicInviteCreate,
    me: CurrentUser = Depends(_super_admin),
    db: Session = Depends(get_db),
) -> ClinicInvite:
    invite = ClinicInvite(
        token=secrets.token_urlsafe(32),
        clinic_name=body.clinic_name,
        contact_email=body.contact_email,
        created_by=me.sub,
        expires_at=datetime.now(UTC) + timedelta(days=body.expires_in_days),
        status="pending",
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.post("/clinic-invites/{invite_id}/revoke", response_model=ClinicInviteRead)
def revoke_invite(
    invite_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(_super_admin),
) -> ClinicInvite:
    invite = db.get(ClinicInvite, invite_id)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitación no encontrada"
        )
    invite.status = "revoked"
    db.commit()
    db.refresh(invite)
    return invite


@router.post("/staff/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_staff_password(
    user_id: str,
    body: StaffResetPassword,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(_super_admin),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    user.password_hash = hash_password(body.new_password)
    db.commit()
