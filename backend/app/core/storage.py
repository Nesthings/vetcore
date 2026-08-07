"""Servicio de almacenamiento de media.

MVP: guarda archivos en disco local (`MEDIA_ROOT`) y los expone por la URL
pública `/media/...`. La interfaz está diseñada para migrar a Cloudflare R2
sin tocar los endpoints: basta con cambiar la implementación de
`save_media`/`public_url`.
"""

import uuid
from pathlib import Path

from app.core.config import settings

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_PDF_EXTENSIONS = {".pdf"}


def media_root_path() -> Path:
    root = Path(settings.media_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_media(relative_dir: str, filename: str, content: bytes) -> str:
    """Guarda un archivo y devuelve su ruta relativa (ej. `summaries/xxx.pdf`).

    `relative_dir` es un segmento como `pets`, `summaries` o `consultations`.
    Evita colisiones renombrando con un sufijo UUID.
    """
    suffix = Path(filename).suffix.lower()
    safe_name = f"{uuid.uuid4().hex[:12]}_{Path(filename).stem[:40]}{suffix}"
    target_dir = media_root_path() / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / safe_name
    target.write_bytes(content)
    return f"{relative_dir}/{safe_name}"


def public_url(relative_path: str) -> str:
    return f"/media/{relative_path}"


def media_path_from_url(url: str | None) -> Path | None:
    """Resuelve una URL pública `/media/...` al Path local, si existe."""
    if not url or not url.startswith("/media/"):
        return None
    p = media_root_path() / url[len("/media/") :]
    return p if p.is_file() else None


def read_media_bytes(url: str | None) -> bytes | None:
    p = media_path_from_url(url)
    if p is None:
        return None
    try:
        return p.read_bytes()
    except OSError:
        return None


def validate_extension(filename: str, allowed: set[str]) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in allowed:
        raise ValueError(
            f"Extensión no permitida: {suffix or '(sin extensión)'}. "
            f"Permitidas: {', '.join(sorted(allowed))}"
        )
