from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentUpdate,
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
    InventoryProductCreate,
    InventoryProductRead,
    InventoryProductUpdate,
)
from app.schemas.pet import PetCreate, PetRead, PetUpdate, PetWeightCreate, PetWeightRead
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
    "UserCreate",
    "UserRead",
    "UserUpdate",
]
