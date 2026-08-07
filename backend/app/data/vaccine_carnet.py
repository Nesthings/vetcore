"""Esquema estándar de vacunación por especie (Carnet).

Basado en la Cartilla Nacional de Vacunación para Perros y Gatos (México,
Secretaría de Salud), las guías de la WSAVA y las pautas estándar para
equinos y hurones.

Estos esquemas son la semilla que se siembra como Planes de vacunación
editables de cada clínica (app/core/seed_vaccination_plans.py). El carnet de
la cartilla se construye a partir de esos planes; si el veterinario edita,
elimina o añade planes, el carnet refleja sus cambios.

Cada vacuna incluye:
- name: nombre del biológico
- brand: marca sugerida por defecto
- prevents: enfermedades que previene
- schedule: texto del esquema recomendado
- steps: dosis con su lapso en días respecto a la dosis anterior (para el
  módulo de Planes y el agendado automático)
"""

PERRO_CARNET: list[dict] = [
    {
        "name": "Cuádruple / séptuple canina (DHPP + Leptospira)",
        "brand": "Canigen DHPPi/L",
        "prevents": "Moquillo, hepatitis infecciosa (adenovirus), parvovirus, "
        "parainfluenza y leptospirosis",
        "schedule": "1ª a las 6-8 semanas, refuerzos a las 10-12 y 14-16 semanas; "
        "refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo final", "offset_days": 28},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Rabia",
        "brand": "Rabigen Mono",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Bordetella (tos de perrera)",
        "brand": "Bronchine CAe",
        "prevents": "Traqueobronquitis infecciosa canina",
        "schedule": "Desde las 8 semanas; refuerzo anual (opcional)",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Giardia",
        "brand": None,
        "prevents": "Giardiasis",
        "schedule": "Esquema según presentación; refuerzo anual (opcional)",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
]

GATO_CARNET: list[dict] = [
    {
        "name": "Triple felina (panleucopenia, rinotraqueítis, calicivirus)",
        "brand": "Feligen CRP",
        "prevents": "Panleucopenia felina, rinotraqueítis (herpesvirus) y calicivirus",
        "schedule": "1ª a las 8-9 semanas, refuerzo a las 12 semanas; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Leucemia felina (FeLV)",
        "brand": "Leucogen",
        "prevents": "Leucemia viral felina",
        "schedule": "1ª a las 9 semanas, refuerzo a las 13 semanas; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Rabia",
        "brand": "Rabigen Mono",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Clamidiosis",
        "brand": None,
        "prevents": "Clamidiosis felina",
        "schedule": "Desde las 9 semanas; refuerzo anual (opcional)",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
]

EQUINO_CARNET: list[dict] = [
    {
        "name": "Tétanos (toxoide tetánico)",
        "brand": "Toxoide Tetánico",
        "prevents": "Tétanos",
        "schedule": "1ª dosis, refuerzo a los 30 días y a los 6 meses; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 30},
            {"label": "Refuerzo", "offset_days": 150},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Influenza equina",
        "brand": "Fluvac Innovator",
        "prevents": "Influenza equina tipo A",
        "schedule": "1ª dosis, refuerzos a las 3-4 semanas y a los 5-6 meses; "
        "refuerzos semestrales en competencia",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo", "offset_days": 150},
            {"label": "Refuerzo semestral", "offset_days": 182},
        ],
    },
    {
        "name": "Encefalomielitis (Este/Oeste/Venezolana)",
        "brand": "Encevac",
        "prevents": "Encefalomielitis equina",
        "schedule": "Primovacunación en 2-3 dosis espaciadas; refuerzo anual "
        "(semestral en zonas de riesgo)",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Rinoneumonitis (Herpesvirus EHV-1/EHV-4)",
        "brand": "Rhinoflu",
        "prevents": "Rinoneumonitis equina",
        "schedule": "Primovacunación de 3 dosis; refuerzo anual (cada 6 meses en "
        "caballos de alto rendimiento)",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Rabia",
        "brand": "Rabisin",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
]

HURON_CARNET: list[dict] = [
    {
        "name": "Moquillo canino (monovalente)",
        "brand": "Purevax Ferret",
        "prevents": "Distemper canino (moquillo)",
        "schedule": "1ª a las 6-8 semanas, refuerzos a las 10-12 y 14 semanas; "
        "refuerzo anual (vacuna monovalente modificada viva, NO multivalentes)",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo", "offset_days": 28},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
    {
        "name": "Rabia",
        "brand": "Rabigen Mono",
        "prevents": "Rabia",
        "schedule": "A partir de los 3 meses; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
    },
]

CONEJO_CARNET: list[dict] = [
    {
        "name": "Enfermedad Hemorrágica Viral (RHD)",
        "brand": "Pestorin",
        "prevents": "Enfermedad hemorrágica viral del conejo (RHDV)",
        "schedule": "Desde las 4-5 semanas en zonas de riesgo; refuerzo anual",
        "steps": [
            {"label": "1ª dosis", "offset_days": 0},
            {"label": "Refuerzo anual", "offset_days": 365},
        ],
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
