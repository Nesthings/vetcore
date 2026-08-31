"""Procesamiento de imagen de la Cartilla digital.

Sección 8 del documento: límite de tamaño + compresión automática, formato
único (JPEG), aspect ratio fijo (cuadrado) y limpieza de metadatos EXIF
(incluida la ubicación GPS).
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_DIMENSION = 1024
JPEG_QUALITY = 85


def process_cartilla_photo(content: bytes) -> bytes:
    """Convierte a JPEG cuadrado, comprimido y sin EXIF.

    Levanta ValueError si el contenido no es una imagen válida.
    """
    try:
        img = Image.open(io.BytesIO(content))
    except UnidentifiedImageError as exc:
        raise ValueError("El archivo no es una imagen válida") from exc

    # Orientación correcta según EXIF antes de descartarlo
    img = ImageOps.exif_transpose(img)

    # Crop cuadrado centrado (aspect ratio fijo)
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))

    # Redimensionar al máximo permitido
    if side > MAX_DIMENSION:
        img = img.resize((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

    # Conversión a RGB (JPEG) y compresión; sin EXIF (se limpian metadatos/GPS)
    if img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, exif=b"")
    return out.getvalue()


def process_product_photo(content: bytes) -> bytes:
    """Convierte a JPEG comprimido y sin EXIF conservando el aspecto original.

    A diferencia de la foto de la Cartilla (cuadrada), la foto de producto
    respeta su proporción (ej. una bolsa de croquetas) y solo se limita la
    dimensión máxima y el peso.
    """
    try:
        img = Image.open(io.BytesIO(content))
    except UnidentifiedImageError as exc:
        raise ValueError("El archivo no es una imagen válida") from exc

    img = ImageOps.exif_transpose(img)

    # Redimensionar proporcionalmente al máximo permitido
    w, h = img.size
    if max(w, h) > MAX_DIMENSION:
        ratio = MAX_DIMENSION / max(w, h)
        img = img.resize((round(w * ratio), round(h * ratio)), Image.Resampling.LANCZOS)

    if img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, exif=b"")
    return out.getvalue()
