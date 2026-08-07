"""Esquema estándar de vacunación por especie (Carnet).

Basado en la Cartilla Nacional de Vacunación para Perros y Gatos (México,
Secretaría de Salud) y las guías generales de la Asociación Mundial de
Veterinarios de Pequeños Animales (WSAVA). Cada vacuna incluye el nombre, las
enfermedades que previene y el esquema recomendado de aplicación.

El carnet de cada paciente lista por defecto estas vacunas según su especie;
el staff registra la aplicación (fecha, lote y veterinario) en cada una.
"""

PERRO_CARNET: list[dict] = [
    {
        "name": "Cuádruple / séptuple canina (DHPP + Leptospira)",
        "prevents": "Moquillo, hepatitis infecciosa (adenovirus), parvovirus, "
        "parainfluenza y leptospirosis",
        "schedule": "1ª a las 6-8 semanas, refuerzos a las 10-12 y 14-16 semanas; "
        "refuerzo anual",
    },
    {
        "name": "Rabia",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
    },
    {
        "name": "Bordetella (tos de perrera)",
        "prevents": "Traqueobronquitis infecciosa canina",
        "schedule": "Desde las 8 semanas; refuerzo anual (opcional)",
    },
    {
        "name": "Giardia",
        "prevents": "Giardiasis",
        "schedule": "Esquema según presentación; refuerzo anual (opcional)",
    },
]

GATO_CARNET: list[dict] = [
    {
        "name": "Triple felina (panleucopenia, rinotraqueítis, calicivirus)",
        "prevents": "Panleucopenia felina, rinotraqueítis (herpesvirus) y calicivirus",
        "schedule": "1ª a las 8-9 semanas, refuerzo a las 12 semanas; refuerzo anual",
    },
    {
        "name": "Leucemia felina (FeLV)",
        "prevents": "Leucemia viral felina",
        "schedule": "1ª a las 9 semanas, refuerzo a las 13 semanas; refuerzo anual",
    },
    {
        "name": "Rabia",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
    },
    {
        "name": "Clamidiosis",
        "prevents": "Clamidiosis felina",
        "schedule": "Desde las 9 semanas; refuerzo anual (opcional)",
    },
]

SPECIES_CARNET: dict[str, list[dict]] = {
    "perro": PERRO_CARNET,
    "gato": GATO_CARNET,
}


def carnet_for_species(species: str | None) -> list[dict]:
    return SPECIES_CARNET.get(species or "", [])
