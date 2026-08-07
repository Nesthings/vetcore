from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    appointments,
    audit,
    auth,
    automation,
    branches,
    clinics,
    consents,
    consultations,
    dashboard,
    dashboards,
    dose,
    health,
    inventory,
    invoices,
    notifications,
    owner,
    pets,
    products,
    purchase_orders,
    reports,
    sales,
    schedule_blocks,
    services,
    share,
    users,
    vaccination_plans,
    waitlist,
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
app.include_router(schedule_blocks.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(invoices.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(sales.router, prefix="/api/v1")
app.include_router(purchase_orders.router, prefix="/api/v1")
app.include_router(services.router, prefix="/api/v1")
app.include_router(dose.router, prefix="/api/v1")
app.include_router(owner.router, prefix="/api/v1")
app.include_router(consents.router, prefix="/api/v1")
app.include_router(waitlist.router, prefix="/api/v1")
app.include_router(automation.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(vaccination_plans.router, prefix="/api/v1")
app.include_router(share.router, prefix="/api/v1")

# Media (MVP local). La URL pública /media/... es la que devuelven los endpoints.
media_dir = Path(settings.media_root)
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")
