from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    appointments,
    auth,
    branches,
    clinics,
    consultations,
    health,
    inventory,
    invoices,
    pets,
    users,
)
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API de VetCore — Sistema de Gestión Veterinaria (SaaS multi-tenant).",
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(clinics.router, prefix="/api/v1")
app.include_router(branches.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(pets.router, prefix="/api/v1")
app.include_router(consultations.router, prefix="/api/v1")
app.include_router(appointments.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(invoices.router, prefix="/api/v1")
