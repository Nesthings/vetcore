"""Cálculo de dosis — fuente única de verdad del sistema.

Fórmula: volumen_ml = peso_kg × dosis_mg_kg / concentración_mg_ml
El resultado es la ÚNICA fuente de verdad; la UI lo muestra y pide
confirmación manual del veterinario antes de guardar (regla sección 8).
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/dose", tags=["dose"])


class DoseCalcRequest(BaseModel):
    weight_kg: float = Field(gt=0, le=500, description="Peso del paciente (kg)")
    dose_mg_kg: float = Field(gt=0, description="Dosis prescrita (mg/kg)")
    concentration_mg_ml: float = Field(gt=0, description="Concentración del fármaco (mg/ml)")


class DoseCalcResponse(BaseModel):
    dose_mg: float
    volume_ml: float
    formula: str


@router.post("/calc", response_model=DoseCalcResponse)
def calculate_dose(body: DoseCalcRequest) -> DoseCalcResponse:
    dose_mg = round(body.weight_kg * body.dose_mg_kg, 2)
    volume_ml = round(dose_mg / body.concentration_mg_ml, 2)
    return DoseCalcResponse(
        dose_mg=dose_mg,
        volume_ml=volume_ml,
        formula=f"{body.weight_kg} kg × {body.dose_mg_kg} mg/kg ÷ {body.concentration_mg_ml} mg/ml",
    )
