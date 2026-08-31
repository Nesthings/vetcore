"""Utilidades de seguridad: hashing de contraseñas y tokens JWT."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(
    subject: str,
    role: str,
    clinic_id: str | None = None,
    branch_id: str | None = None,
) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    if clinic_id is not None:
        payload["clinic_id"] = clinic_id
    if branch_id is not None:
        payload["branch_id"] = branch_id
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


class InvalidTokenError(ValueError):
    pass


def get_token_payload(token: str) -> dict:
    try:
        return decode_token(token)
    except JWTError as exc:
        raise InvalidTokenError("Token inválido o expirado") from exc


SHARE_TOKEN_EXPIRE_DAYS = 30


def create_share_token(pet_id: str) -> tuple[str, datetime]:
    """Token de acceso a la cartilla para el dueño (sin login).

    Expira en `SHARE_TOKEN_EXPIRE_DAYS` y solo da acceso de solo lectura +
    acciones puntuales (foto, alertas, firmar consentimientos) de esa mascota.
    """
    expire = datetime.now(UTC) + timedelta(days=SHARE_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": pet_id,
        "scope": "cartilla",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expire


def decode_share_token(token: str) -> str:
    """Decodifica un token de cartilla y devuelve el pet_id. Lanza InvalidTokenError."""
    payload = get_token_payload(token)
    if payload.get("scope") != "cartilla":
        raise InvalidTokenError("Token no válido para la cartilla")
    pet_id = payload.get("sub")
    if not pet_id:
        raise InvalidTokenError("Token inválido")
    return str(pet_id)
