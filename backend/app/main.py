import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    appointments,
    audit,
    auth,
    automation,
    birthdays,
    branches,
    clinics,
    consents,
    consultations,
    create_clinic,
    dashboard,
    dashboards,
    dose,
    health,
    hospitalization,
    inventory,
    invoices,
    notifications,
    owner,
    owners,
    pets,
    platform,
    products,
    purchase_orders,
    reports,
    sales,
    schedule_blocks,
    services,
    share,
    smart_alerts,
    users,
    vaccination_plans,
    waitlist,
    whatsapp,
)
from app.core.config import settings
from app.services import smart_alerts as smart_alerts_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    sweep_seconds = getattr(settings, "smart_alerts_sweep_seconds", 900)
    task = None
    if sweep_seconds and sweep_seconds > 0:
        async def _sweep() -> None:
            while True:
                await asyncio.sleep(sweep_seconds)
                try:
                    # El contenedor corre UNA instancia (desired_count=1): el
                    # barrido no se duplica. Best-effort: si falla una clínica,
                    # se registra y continúa en el siguiente ciclo.
                    smart_alerts_service.sweep_all_clinics()
                except Exception:  # noqa: BLE001
                    logger.exception("Barrido periódico de alertas falló")

        task = asyncio.create_task(_sweep())
        logger.info("Barrido periódico de alertas activado cada %ss", sweep_seconds)
    try:
        yield
    finally:
        if task is not None:
            task.cancel()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API de VetCore — Sistema de Gestión Veterinaria (SaaS multi-tenant).",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(hospitalization.router, prefix="/api/v1")
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
app.include_router(birthdays.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(invoices.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(sales.router, prefix="/api/v1")
app.include_router(purchase_orders.router, prefix="/api/v1")
app.include_router(services.router, prefix="/api/v1")
app.include_router(dose.router, prefix="/api/v1")
app.include_router(owner.router, prefix="/api/v1")
app.include_router(owners.router, prefix="/api/v1")
app.include_router(consents.router, prefix="/api/v1")
app.include_router(waitlist.router, prefix="/api/v1")
app.include_router(automation.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(vaccination_plans.router, prefix="/api/v1")
app.include_router(share.router, prefix="/api/v1")
app.include_router(smart_alerts.router, prefix="/api/v1")
app.include_router(platform.router, prefix="/api/v1")
app.include_router(create_clinic.router, prefix="/api/v1")
app.include_router(whatsapp.router, prefix="/api/v1")

# Media (MVP local). La URL pública /media/... es la que devuelven los endpoints.
media_dir = Path(settings.media_root)
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")
