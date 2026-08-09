"""CRUD de clínicas — exclusivo del super-admin (sin aislamiento por tenant).

El Panel Super-Admin (Subfase 1.8) opera sobre esta colección. El alta de una
clínica nueva crea el tenant; el cambio de suscripción registra eventos en la
bitácora `clinic_subscription_events`.

Incluye también `/clinics/me` (la propia clínica del staff), que permite leer
y editar el perfil de la clínica (logo, datos fiscales, moneda, timezone)
desde la Configuración.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentClinic,
    CurrentUser,
    get_current_clinic,
    require_component,
    require_roles,
)
from app.core.events import record_audit
from app.core.images import process_cartilla_photo
from app.core.security import create_access_token, hash_password
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import (
    Appointment,
    Clinic,
    ClinicBranch,
    ClinicSubscriptionEvent,
    Invoice,
    Pet,
    User,
)
from app.schemas.auth import LoginResponse
from app.schemas.clinic import (
    ClinicCreate,
    ClinicRead,
    ClinicSubscriptionChange,
    ClinicSubscriptionEventRead,
    ClinicSummaryRead,
    ClinicUpdate,
)

router = APIRouter(prefix="/clinics", tags=["clinics"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("", response_model=list[ClinicRead])
def list_clinics(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> list[Clinic]:
    return list(
        db.scalars(select(Clinic).order_by(Clinic.created_at.desc()).limit(limit).offset(offset))
    )


@router.get("/me", response_model=ClinicRead, summary="Perfil de mi propia clínica (staff)")
def my_clinic(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> Clinic:
    return _get_clinic_or_404(db, ctx.clinic["id"])


@router.patch("/me", response_model=ClinicRead, summary="Actualiza el perfil de mi clínica (admin)")
def update_my_clinic(
    body: ClinicUpdate,
    ctx: CurrentClinic = Depends(require_component("settings")),
    db: Session = Depends(get_db),
) -> Clinic:
    clinic = _get_clinic_or_404(db, ctx.clinic["id"])
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(clinic, field, value)
    db.commit()
    db.refresh(clinic)
    return clinic


@router.post(
    "/me/logo",
    response_model=ClinicRead,
    summary="Sube el logo de la clínica (compresión, sin EXIF)",
)
def upload_clinic_logo(
    file: UploadFile = File(...),
    ctx: CurrentClinic = Depends(require_component("settings")),
    db: Session = Depends(get_db),
) -> Clinic:
    clinic = _get_clinic_or_404(db, ctx.clinic["id"])
    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )
    try:
        processed = process_cartilla_photo(content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rel = save_media(f"clinics/{clinic.id}", "logo.jpg", processed)
    clinic.logo_url = public_url(rel)
    record_audit(
        db,
        clinic_id=clinic.id,
        actor_type="user",
        actor_id=ctx.user.sub,
        action="clinic_logo_updated",
        entity_type="clinic",
        entity_id=clinic.id,
    )
    db.commit()
    db.refresh(clinic)
    return clinic


def _get_clinic_or_404(db: Session, clinic_id: str) -> Clinic:
    clinic = db.get(Clinic, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clínica no encontrada")
    return clinic


def _create_clinic_with_admin(
    db: Session, data: dict, admin_data: dict
) -> LoginResponse:
    """Crea el tenant + su primer admin y devuelve un token de sesión."""
    admin_data = {**admin_data, "email": admin_data["email"].strip().lower()}
    clinic = Clinic(**data, setup_completed=False)
    db.add(clinic)
    db.flush()

    admin = User(
        clinic_id=clinic.id,
        role="admin",
        full_name=admin_data["full_name"],
        email=admin_data["email"],
        password_hash=hash_password(admin_data["password"]),
        professional_title=admin_data.get("professional_title"),
        cedula=admin_data.get("cedula"),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    token = create_access_token(
        subject=str(admin.id),
        role="admin",
        clinic_id=str(clinic.id),
        branch_id=None,
    )
    return LoginResponse(
        access_token=token,
        role="admin",
        sub=str(admin.id),
        clinic_id=str(clinic.id),
        branch_id=None,
    )


@router.post(
    "/register",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Alta de clínica (solo super-admin)",
)
def register_clinic(
    body: ClinicCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> LoginResponse:
    """Crea el tenant + su primer super-usuario (admin) y devuelve un token
    de sesión. Antes era autogestionado; ahora solo lo usa el super-admin
    (el alta pública es vía link único en `/create-clinic`)."""
    if body.first_admin is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El registro requiere el primer super-usuario (first_admin)",
        )
    return _create_clinic_with_admin(
        db,
        body.model_dump(exclude={"first_admin"}),
        body.first_admin.model_dump(),
    )


@router.get("/{clinic_id}", response_model=ClinicRead)
def get_clinic(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> Clinic:
    return _get_clinic_or_404(db, clinic_id)


@router.post("", response_model=ClinicRead, status_code=status.HTTP_201_CREATED)
def create_clinic(
    body: ClinicCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> Clinic:
    """Alta de tenant.

    Toda clínica nueva arranca con `setup_completed=false`: la primera vez que
    entra su admin (primer super-usuario) se muestra el wizard de
    configuración. Si llega `first_admin`, se crea también la cuenta admin
    inicial (rol admin) en la misma transacción.
    """
    data = body.model_dump(exclude={"first_admin"})
    clinic = Clinic(**data, setup_completed=False)
    db.add(clinic)
    db.flush()

    if body.first_admin is not None:
        admin_data = body.first_admin.model_dump()
        admin_data["email"] = admin_data["email"].strip().lower()
        exists = db.scalar(
            select(User).where(User.clinic_id == clinic.id, User.email == admin_data["email"])
        )
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un usuario con ese email en la clínica",
            )
        db.add(
            User(
                clinic_id=clinic.id,
                role="admin",
                full_name=admin_data["full_name"],
                email=admin_data["email"],
                password_hash=hash_password(admin_data["password"]),
                professional_title=admin_data.get("professional_title"),
                cedula=admin_data.get("cedula"),
            )
        )
    db.commit()
    db.refresh(clinic)
    return clinic


@router.patch("/{clinic_id}", response_model=ClinicRead)
def update_clinic(
    clinic_id: str,
    body: ClinicUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> Clinic:
    clinic = _get_clinic_or_404(db, clinic_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(clinic, field, value)
    db.commit()
    db.refresh(clinic)
    return clinic


@router.delete("/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_clinic(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> None:
    """Desactiva la clínica (soft-delete) pasando su suscripción a 'cancelled'."""
    clinic = _get_clinic_or_404(db, clinic_id)
    clinic.subscription_status = "cancelled"
    db.commit()


@router.post(
    "/{clinic_id}/subscription",
    response_model=ClinicRead,
    summary="Cambia el estado de suscripción y registra el evento",
)
def change_subscription(
    clinic_id: str,
    body: ClinicSubscriptionChange,
    admin: CurrentUser = Depends(require_roles("super-admin")),
    db: Session = Depends(get_db),
) -> Clinic:
    clinic = _get_clinic_or_404(db, clinic_id)
    event_type = {
        "active": "activated",
        "suspended": "suspended",
        "cancelled": "cancelled",
    }.get(body.status, "activated")

    clinic.subscription_status = body.status
    db.add(
        ClinicSubscriptionEvent(
            clinic_id=clinic.id,
            event_type=event_type,
            notes=body.notes,
            created_by=admin.sub,
        )
    )
    db.commit()
    db.refresh(clinic)
    return clinic


@router.get(
    "/{clinic_id}/events",
    response_model=list[ClinicSubscriptionEventRead],
    summary="Historial de eventos de suscripción de la clínica",
)
def clinic_events(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> list[ClinicSubscriptionEvent]:
    _get_clinic_or_404(db, clinic_id)
    return list(
        db.scalars(
            select(ClinicSubscriptionEvent)
            .where(ClinicSubscriptionEvent.clinic_id == clinic_id)
            .order_by(ClinicSubscriptionEvent.created_at.desc())
        )
    )


@router.get(
    "/{clinic_id}/summary",
    response_model=ClinicSummaryRead,
    summary="Resumen de la clínica (conteos)",
)
def clinic_summary(
    clinic_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles("super-admin")),
) -> ClinicSummaryRead:
    clinic = _get_clinic_or_404(db, clinic_id)
    counts = {
        "branches": db.scalar(
            select(func.count())
            .select_from(ClinicBranch)
            .where(ClinicBranch.clinic_id == clinic_id)
        )
        or 0,
        "staff": db.scalar(
            select(func.count()).select_from(User).where(User.clinic_id == clinic_id)
        )
        or 0,
        "pets": db.scalar(select(func.count()).select_from(Pet).where(Pet.clinic_id == clinic_id))
        or 0,
        "appointments": db.scalar(
            select(func.count()).select_from(Appointment).where(Appointment.clinic_id == clinic_id)
        )
        or 0,
        "invoices": db.scalar(
            select(func.count()).select_from(Invoice).where(Invoice.clinic_id == clinic_id)
        )
        or 0,
    }
    return ClinicSummaryRead(
        id=clinic.id,
        name=clinic.name,
        subscription_status=clinic.subscription_status,
        **counts,
    )
