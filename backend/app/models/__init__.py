from app.models._references import owners, super_admins  # noqa: F401
from app.models.appointment import Appointment, AppointmentWaitlist, ScheduleBlock
from app.models.audit import AuditLog
from app.models.billing import Invoice, InvoiceItem, ServiceCatalog
from app.models.clinic import Clinic, ClinicBranch, ClinicInvite, ClinicSubscriptionEvent
from app.models.consent import DigitalConsent
from app.models.consultation import (
    Consultation,
    ConsultationAttachment,
    ConsultationItem,
    ConsultationSummaryPdf,
)
from app.models.expense import FinancialExpense
from app.models.hospitalization import (
    Hospitalization,
    HospitalizationAccommodation,
    HospitalizationConfig,
    HospitalizationDischarge,
    HospitalizationElimination,
    HospitalizationFeed,
    HospitalizationFluid,
    HospitalizationIncident,
    HospitalizationMedicationAdministration,
    HospitalizationMedicationOrder,
    HospitalizationNote,
    HospitalizationPainScore,
    HospitalizationPhoto,
    HospitalizationShift,
    HospitalizationTask,
    HospitalizationVital,
)
from app.models.inventory import (
    InventoryLot,
    InventoryMovement,
    InventoryProduct,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.notification import InternalNotification, OutboundNotification
from app.models.pet import ClinicalAlert, CustomBreed, Pet, PetPhoto, PetWeightRecord
from app.models.product import SaleProduct
from app.models.smart_alert import SmartAlert, SmartAlertRule
from app.models.staff import User, UserComponentPermission
from app.models.vaccination import (
    PetCarnetRecord,
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
    "ClinicInvite",
    "ClinicSubscriptionEvent",
    "ClinicalAlert",
    "Consultation",
    "ConsultationAttachment",
    "ConsultationItem",
    "ConsultationSummaryPdf",
    "DigitalConsent",
    "CustomBreed",
    "FinancialExpense",
    "Hospitalization",
    "HospitalizationAccommodation",
    "HospitalizationConfig",
    "HospitalizationDischarge",
    "HospitalizationElimination",
    "HospitalizationFeed",
    "HospitalizationFluid",
    "HospitalizationIncident",
    "HospitalizationMedicationAdministration",
    "HospitalizationMedicationOrder",
    "HospitalizationNote",
    "HospitalizationPainScore",
    "HospitalizationPhoto",
    "HospitalizationShift",
    "HospitalizationTask",
    "HospitalizationVital",
    "InventoryLot",
    "InventoryMovement",
    "InventoryProduct",
    "Invoice",
    "InvoiceItem",
    "InternalNotification",
    "OutboundNotification",
    "Pet",
    "PetCarnetRecord",
    "PetPhoto",
    "PetVaccinationDose",
    "PetVaccinationPlan",
    "PetWeightRecord",
    "PurchaseOrder",
    "PurchaseOrderItem",
    "SaleProduct",
    "ScheduleBlock",
    "ServiceCatalog",
    "SmartAlert",
    "SmartAlertRule",
    "User",
    "UserComponentPermission",
    "VaccinationPlan",
    "VaccinationPlanStep",
]
