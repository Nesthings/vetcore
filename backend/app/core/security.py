"""Utilidades de seguridad: hashing de contraseñas y tokens JWT."""

import hashlib
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


TWOFA_CHALLENGE_EXPIRE_MINUTES = 5


def create_twofa_challenge_token(subject: str, role: str = "super-admin") -> str:
    """Token de corta duración que acredita el paso 1 del login (password OK)
    y debe completarse con el código TOTP en el paso 2."""
    expire = datetime.now(UTC) + timedelta(minutes=TWOFA_CHALLENGE_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "purpose": "2fa",
        "role": role,
        "exp": expire,
        "iat": datetime.now(UTC),
    }
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


def share_token_version(qr_token: str | None) -> str:
    """Versión corta del token QR: cambia al regenerar el QR y permite revocar
    los enlaces de cartilla emitidos con anterioridad."""
    return hashlib.sha256((qr_token or "").encode()).hexdigest()[:16]


def create_share_token(
    pet_id: str, version: str | None = None
) -> tuple[str, datetime]:
    """Token de acceso a la cartilla para el dueño (sin login).

    Expira en `SHARE_TOKEN_EXPIRE_DAYS` y solo da acceso de solo lectura +
    acciones puntuales (foto, alertas, firmar consentimientos) de esa mascota.
    `version` vincula el token al QR actual: al regenerar el QR, los enlaces
    antiguos dejan de ser válidos.
    """
    expire = datetime.now(UTC) + timedelta(days=SHARE_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": pet_id,
        "scope": "cartilla",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    if version:
        payload["ver"] = version
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


def get_share_token_version(token: str) -> str | None:
    """Versión del QR embebida en el token de cartilla, o None si no la trae."""
    try:
        payload = get_token_payload(token)
        if payload.get("scope") != "cartilla":
            return None
        return payload.get("ver")
    except InvalidTokenError:
        return None
