"""Alta de clínica a través del link único del super-admin (público).

El dueño del producto genera un `clinic_invites` (token de un solo uso y con
expiración). Quien recibe el link crea su clínica con su primer admin.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.clinics import _create_clinic_with_admin
from app.db.session import get_db
from app.models import ClinicInvite
from app.schemas.auth import LoginResponse
from app.schemas.clinic import CreateClinicInvited

router = APIRouter(prefix="/create-clinic", tags=["create-clinic"])


def _valid_invite(db: Session, token: str) -> ClinicInvite:
    invite = db.scalar(select(ClinicInvite).where(ClinicInvite.token == token))
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enlace no encontrado")
    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este enlace ya fue utilizado o revocado",
        )
    if invite.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Este enlace expiró"
        )
    return invite


@router.get("/info", summary="Valida el link y devuelve datos para prellenar")
def create_clinic_info(
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    invite = _valid_invite(db, token)
    return {
        "valid": True,
        "clinic_name": invite.clinic_name,
        "contact_email": invite.contact_email,
    }


@router.post("", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def create_clinic(
    body: CreateClinicInvited,
    db: Session = Depends(get_db),
) -> LoginResponse:
    invite = _valid_invite(db, body.token)
    if body.first_admin is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El registro requiere el primer super-usuario (first_admin)",
        )
    if invite.contact_email and body.first_admin.email.lower() != invite.contact_email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo no coincide con el invitado",
        )

    data = body.model_dump(exclude={"first_admin", "token"})
    if invite.clinic_name:
        data["name"] = invite.clinic_name

    response = _create_clinic_with_admin(db, data, body.first_admin.model_dump())

    invite.status = "used"
    invite.used_at = datetime.now(UTC)
    db.commit()
    return response
