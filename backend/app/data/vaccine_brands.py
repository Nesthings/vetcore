"""Marcas de vacunas disponibles en el mercado mexicano.

Lista de biológicos comercializados en México para el registro de aplicaciones
en el carnet. Se agrupan por especie más un conjunto general (biológicos de
rabia y otros que aplican a ambas especies). Es un catálogo de referencia para
el combobox del carnet; la clínica puede elegir cualquier marca registrada.
"""

GENERAL_BRANDS: list[str] = [
    "Rabisin",
    "Rabigen Mono",
    "Nobivac Rabia",
    "Versiguard Rabia",
    "Vanguard Rabies",
    "Recombitek Rabia",
]

PERRO_BRANDS: list[str] = [
    "Canigen MHA",
    "Canigen PPi/L",
    "Canigen DHPPi/L",
    "Canigen DHP",
    "Bronchine CAe",
    "Nobivac DHPPi",
    "Nobivac Canine 1-DAPPv",
    "Nobivac Lepto 2",
    "Nobivac Parvo-C",
    "Vanguard Plus 5",
    "Vanguard Plus 5/CV-L",
    "Vanguard Cv",
    "Recombitek C4",
    "Recombitek C6",
    "Versiguard DHP",
    "Hipradog 5",
]

GATO_BRANDS: list[str] = [
    "Feligen CRP",
    "Leucogen",
    "Nobivac Tricat Trio",
    "Nobivac Felv",
    "Purevax RCP",
    "Purevax FeLV",
    "Felocell 3",
    "Felocell 4",
    "Felocell CVR",
    "Leucocell 2",
    "Versifel CVR",
    "Hipracat",
]


def brands_for_species(species: str | None) -> list[str]:
    if species == "perro":
        return GENERAL_BRANDS + PERRO_BRANDS
    if species == "gato":
        return GENERAL_BRANDS + GATO_BRANDS
    return GENERAL_BRANDS
