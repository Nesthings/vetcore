from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentUpdate,
    ScheduleBlockCreate,
    ScheduleBlockRead,
)
from app.schemas.billing import (
    InvoiceCreate,
    InvoiceItemCreate,
    InvoiceItemRead,
    InvoiceRead,
    InvoiceUpdate,
)
from app.schemas.clinic import (
    ClinicBranchCreate,
    ClinicBranchRead,
    ClinicBranchUpdate,
    ClinicCreate,
    ClinicRead,
    ClinicUpdate,
)
from app.schemas.consultation import (
    ConsultationCreate,
    ConsultationItemCreate,
    ConsultationItemRead,
    ConsultationRead,
    ConsultationUpdate,
)
from app.schemas.inventory import (
    InventoryLotCreate,
    InventoryLotRead,
    InventoryProductCreate,
    InventoryProductRead,
    InventoryProductUpdate,
    StockEntryCreate,
)
from app.schemas.pet import PetCreate, PetRead, PetUpdate, PetWeightCreate, PetWeightRead
from app.schemas.services import ServiceCreate, ServiceRead, ServiceUpdate
from app.schemas.staff import UserCreate, UserRead, UserUpdate

__all__ = [
    "AppointmentCreate",
    "AppointmentRead",
    "AppointmentUpdate",
    "ClinicBranchCreate",
    "ClinicBranchRead",
    "ClinicBranchUpdate",
    "ClinicCreate",
    "ClinicRead",
    "ClinicUpdate",
    "ConsultationCreate",
    "ConsultationItemCreate",
    "ConsultationItemRead",
    "ConsultationRead",
    "ConsultationUpdate",
    "InventoryProductCreate",
    "InventoryProductRead",
    "InventoryProductUpdate",
    "InventoryLotCreate",
    "InventoryLotRead",
    "InvoiceCreate",
    "InvoiceItemCreate",
    "InvoiceItemRead",
    "InvoiceRead",
    "InvoiceUpdate",
    "PetCreate",
    "PetRead",
    "PetUpdate",
    "PetWeightCreate",
    "PetWeightRead",
    "ScheduleBlockCreate",
    "ScheduleBlockRead",
    "ServiceCreate",
    "ServiceRead",
    "ServiceUpdate",
    "StockEntryCreate",
    "UserCreate",
    "UserRead",
    "UserUpdate",
]
