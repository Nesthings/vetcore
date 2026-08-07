"""Esquema estándar de vacunación por especie (Carnet).

Basado en la Cartilla Nacional de Vacunación para Perros y Gatos (México,
Secretaría de Salud), las guías de la WSAVA y las pautas estándar para
equinos y hurones. Cada vacuna incluye el nombre, las enfermedades que
previene y el esquema recomendado de aplicación.

El carnet de cada paciente lista por defecto estas vacunas según su especie;
el staff registra la aplicación (marca, fecha, lote y veterinario) en cada una.

Especies sin vacunación de rutina estándar (aves, reptiles, roedores, peces,
anfibios y otros) no tienen esquema: el carnet muestra el aviso correspondiente.
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

EQUINO_CARNET: list[dict] = [
    {
        "name": "Tétanos (toxoide tetánico)",
        "prevents": "Tétanos",
        "schedule": "1ª dosis, refuerzo a los 30 días y a los 6 meses; refuerzo anual",
    },
    {
        "name": "Influenza equina",
        "prevents": "Influenza equina tipo A",
        "schedule": "1ª dosis, refuerzos a las 3-4 semanas y a los 5-6 meses; "
        "refuerzos semestrales en competencia",
    },
    {
        "name": "Encefalomielitis (Este/Oeste/Venezolana)",
        "prevents": "Encefalomielitis equina",
        "schedule": "Primovacunación en 2-3 dosis espaciadas; refuerzo anual "
        "(semestral en zonas de riesgo)",
    },
    {
        "name": "Rinoneumonitis (Herpesvirus EHV-1/EHV-4)",
        "prevents": "Rinoneumonitis equina",
        "schedule": "Primovacunación de 3 dosis; refuerzo anual (cada 6 meses en "
        "caballos de alto rendimiento)",
    },
    {
        "name": "Rabia",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
    },
]

HURON_CARNET: list[dict] = [
    {
        "name": "Moquillo canino (monovalente)",
        "prevents": "Distemper canino (moquillo)",
        "schedule": "1ª a las 6-8 semanas, refuerzos a las 10-12 y 14 semanas; "
        "refuerzo anual (vacuna monovalente modificada viva, NO multivalentes)",
    },
    {
        "name": "Rabia",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
    },
]

CONEJO_CARNET: list[dict] = [
    {
        "name": "Enfermedad Hemorrágica Viral (RHD)",
        "prevents": "Enfermedad hemorrágica viral del conejo (RHDV)",
        "schedule": "Desde las 4-5 semanas en zonas de riesgo; refuerzo anual",
    },
]

SPECIES_CARNET: dict[str, list[dict]] = {
    "perro": PERRO_CARNET,
    "gato": GATO_CARNET,
    "equino": EQUINO_CARNET,
    "hurones": HURON_CARNET,
    "conejo": CONEJO_CARNET,
}


def carnet_for_species(species: str | None) -> list[dict]:
    return SPECIES_CARNET.get(species or "", [])
