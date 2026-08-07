from app.models._references import owners  # noqa: F401
from app.models.appointment import Appointment, AppointmentWaitlist, ScheduleBlock
from app.models.audit import AuditLog
from app.models.billing import Invoice, InvoiceItem, ServiceCatalog
from app.models.clinic import Clinic, ClinicBranch, ClinicSubscriptionEvent
from app.models.consent import DigitalConsent
from app.models.consultation import (
    Consultation,
    ConsultationAttachment,
    ConsultationItem,
    ConsultationSummaryPdf,
)
from app.models.expense import FinancialExpense
from app.models.inventory import (
    InventoryLot,
    InventoryMovement,
    InventoryProduct,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.notification import InternalNotification, OutboundNotification
from app.models.pet import ClinicalAlert, CustomBreed, Pet, PetWeightRecord
from app.models.product import SaleProduct
from app.models.staff import User, UserComponentPermission
from app.models.vaccination import (
    PetVaccinationDose,
    PetVaccinationPlan,
    VaccinationPlan,
    VaccinationPlanStep,
)

__all__ = [
    "Appointment",
    "AppointmentWaitlist",
    "AuditLog",
    "Clinic",
    "ClinicBranch",
    "ClinicSubscriptionEvent",
    "ClinicalAlert",
    "Consultation",
    "ConsultationAttachment",
    "ConsultationItem",
    "ConsultationSummaryPdf",
    "DigitalConsent",
    "CustomBreed",
    "FinancialExpense",
    "InventoryLot",
    "InventoryMovement",
    "InventoryProduct",
    "Invoice",
    "InvoiceItem",
    "InternalNotification",
    "OutboundNotification",
    "Pet",
    "PetVaccinationDose",
    "PetVaccinationPlan",
    "PetWeightRecord",
    "PurchaseOrder",
    "PurchaseOrderItem",
    "SaleProduct",
    "ScheduleBlock",
    "ServiceCatalog",
    "User",
    "UserComponentPermission",
    "VaccinationPlan",
    "VaccinationPlanStep",
]
