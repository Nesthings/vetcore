"""CRUD de consultas — por-tenant, vet/admin para mutar.

Incluye la generación del PDF de resumen (informativo, no receta) y la
subida de adjuntos (foto/nota). El checkout (`POST /consultations/checkout`)
completa la consulta como una caja: consulta + factura + recibo PDF.
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentClinic, get_current_clinic, require_clinic_roles, require_component
from app.core.events import record_audit
from app.core.storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    public_url,
    save_media,
    validate_extension,
)
from app.db.session import get_db
from app.models import (
    Clinic,
    ClinicBranch,
    Consultation,
    ConsultationAttachment,
    ConsultationItem,
    ConsultationSummaryPdf,
    Invoice,
    InvoiceItem,
    Pet,
    PetWeightRecord,
    SaleProduct,
    ServiceCatalog,
    User,
)
from app.schemas.consultation import (
    CheckoutResult,
    ConsultationCheckoutRequest,
    ConsultationCreate,
    ConsultationRead,
    ConsultationUpdate,
)
from app.schemas.crm import SurveyRead
from app.services.pdf import build_consultation_summary_pdf, build_invoice_receipt_pdf

router = APIRouter(
    prefix="/consultations",
    tags=["consultations"],
    dependencies=[Depends(require_component("pets"))],
)

CONSULTATION_MUTATORS = ("admin", "veterinario")

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("", response_model=list[ConsultationRead])
def list_consultations(
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
    pet_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Consultation]:
    stmt = (
        select(Consultation)
        .options(selectinload(Consultation.items))
        .where(Consultation.clinic_id == ctx.clinic["id"])
        .order_by(Consultation.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if pet_id:
        stmt = stmt.where(Consultation.pet_id == pet_id)
    return list(db.scalars(stmt))


def _get_consultation_or_404(db: Session, clinic_id: str, consultation_id: str) -> Consultation:
    consultation = db.scalar(
        select(Consultation)
        .options(selectinload(Consultation.items))
        .where(
            Consultation.id == consultation_id,
            Consultation.clinic_id == clinic_id,
        )
    )
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consulta no encontrada")
    return consultation


def _validate_pet_belongs(db: Session, clinic_id: str, pet_id: str) -> None:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente no encontrado en esta clínica",
        )


@router.get("/{consultation_id}", response_model=ConsultationRead)
def get_consultation(
    consultation_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> Consultation:
    return _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)


@router.post("", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
def create_consultation(
    body: ConsultationCreate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> Consultation:
    _validate_pet_belongs(db, ctx.clinic["id"], str(body.pet_id))
    consultation = Consultation(
        clinic_id=ctx.clinic["id"],
        branch_id=body.branch_id,
        pet_id=body.pet_id,
        vet_user_id=body.vet_user_id,
        template_id=body.template_id,
        reason=body.reason,
        diagnosis=body.diagnosis,
        treatment=body.treatment,
        care_instructions=body.care_instructions,
        next_appointment_suggestion=body.next_appointment_suggestion,
    )
    for item in body.items:
        consultation.items.append(ConsultationItem(**item.model_dump()))
    db.add(consultation)
    db.commit()
    return _get_consultation_or_404(db, ctx.clinic["id"], str(consultation.id))


@router.post(
    "/checkout",
    response_model=CheckoutResult,
    status_code=status.HTTP_201_CREATED,
    summary="Checkout de consulta: genera consulta + factura + recibos (PDF)",
)
def checkout_consultation(
    body: ConsultationCheckoutRequest,
    ctx: CurrentClinic = Depends(require_clinic_roles("admin", "veterinario", "recepcion")),
    db: Session = Depends(get_db),
) -> CheckoutResult:
    """Completa la consulta como una caja: registra la consulta (con el vet
    que atendió, motivo, peso y la fecha/hora capturada), genera la factura
    pagada con los servicios y productos seleccionados (descontando stock del
    catálogo de Productos) y produce el PDF de resumen y el recibo para imprimir.
    """
    clinic_id = ctx.clinic["id"]

    pet = db.scalar(select(Pet).where(Pet.id == body.pet_id, Pet.clinic_id == clinic_id))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    branch = db.get(ClinicBranch, body.branch_id)
    if branch is None or branch.clinic_id != ctx.clinic["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sucursal no encontrada")
    vet = db.scalar(
        select(User).where(
            User.id == body.vet_user_id,
            User.clinic_id == clinic_id,
            User.role.in_(("admin", "veterinario")),
        )
    )
    if vet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Veterinario no encontrado en esta clínica",
        )
    if not body.services and not body.products:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selecciona al menos un servicio o producto",
        )

    total = Decimal("0")
    invoice_items: list[InvoiceItem] = []
    consultation_items: list[ConsultationItem] = []

    for s in body.services:
        service = db.get(ServiceCatalog, s.service_id)
        if service is None or service.clinic_id != clinic_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado"
            )
        discount = float(service.discount_percent or 0)
        qty = Decimal(str(s.quantity))
        line_total = qty * Decimal(str(service.price)) * (
            Decimal("1") - Decimal(str(discount)) / Decimal("100")
        )
        total += line_total
        invoice_items.append(
            InvoiceItem(
                service_id=service.id,
                description=service.name,
                quantity=float(qty),
                unit_price=float(service.price),
                discount_percent=discount,
            )
        )
        consultation_items.append(
            ConsultationItem(description=service.name, quantity=float(qty))
        )

    for p in body.products:
        product = db.get(SaleProduct, p.product_id)
        if product is None or product.clinic_id != clinic_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado"
            )
        if not product.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El producto «{product.name}» está inactivo",
            )
        if product.price is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El producto «{product.name}» no tiene precio",
            )
        qty = Decimal(str(p.quantity))
        if qty > product.stock_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock insuficiente para «{product.name}» "
                f"(disponible: {int(product.stock_quantity)})",
            )
        product.stock_quantity -= int(qty)
        line_total = qty * Decimal(str(product.price))
        total += line_total
        invoice_items.append(
            InvoiceItem(
                description=product.name,
                quantity=float(qty),
                unit_price=float(product.price),
                discount_percent=0,
            )
        )
        consultation_items.append(
            ConsultationItem(description=product.name, quantity=float(qty))
        )

    owner_id = db.execute(
        text(
            "SELECT owner_id FROM owner_pet_links "
            "WHERE pet_id = :pid AND clinic_id = :cid AND is_active = true "
            "ORDER BY linked_at DESC LIMIT 1"
        ),
        {"pid": body.pet_id, "cid": clinic_id},
    ).scalar()

    performed_at = body.performed_at or datetime.now(UTC)
    consultation = Consultation(
        clinic_id=clinic_id,
        branch_id=body.branch_id,
        pet_id=body.pet_id,
        vet_user_id=body.vet_user_id,
        reason=body.reason,
        performed_at=performed_at,
    )
    for ci in consultation_items:
        consultation.items.append(ci)
    db.add(consultation)
    db.flush()

    if body.weight_kg is not None:
        db.add(
            PetWeightRecord(
                pet_id=body.pet_id,
                clinic_id=clinic_id,
                weight_kg=body.weight_kg,
                consultation_id=consultation.id,
            )
        )

    invoice = Invoice(
        clinic_id=clinic_id,
        branch_id=body.branch_id,
        owner_id=owner_id,
        pet_id=body.pet_id,
        consultation_id=consultation.id,
        status="paid",
        total=total.quantize(Decimal("0.01")),
        send_receipt_whatsapp=body.send_receipt_whatsapp,
    )
    for ii in invoice_items:
        invoice.items.append(ii)
    db.add(invoice)
    db.flush()

    record_audit(
        db,
        clinic_id=clinic_id,
        actor_type="user",
        actor_id=ctx.user.sub,
        action="consultation_created",
        entity_type="consultation",
        entity_id=consultation.id,
        metadata={"checkout": True, "pet_id": str(body.pet_id)},
    )
    record_audit(
        db,
        clinic_id=clinic_id,
        actor_type="user",
        actor_id=ctx.user.sub,
        action="invoice_created",
        entity_type="invoice",
        entity_id=invoice.id,
        metadata={"total": float(invoice.total)},
    )
    db.commit()

    clinic = db.get(Clinic, clinic_id)
    date_str = performed_at.astimezone().strftime("%d/%m/%Y %H:%M")

    summary_data = {
        "clinic_name": f"{clinic.name}" + (f" — {branch.name}" if branch else ""),
        "pet_name": pet.name,
        "species": pet.species,
        "breed": pet.breed,
        "vet_name": vet.full_name,
        "date_str": date_str,
        "reason": consultation.reason,
        "diagnosis": None,
        "treatment": None,
        "care_instructions": None,
        "items": [
            {"description": i.description, "quantity": i.quantity} for i in consultation.items
        ],
        "next_appointment_suggestion": None,
    }
    summary_bytes = build_consultation_summary_pdf(summary_data)
    summary_rel = save_media("summaries", f"consulta_{consultation.id}.pdf", summary_bytes)
    summary_url = public_url(summary_rel)
    db.add(ConsultationSummaryPdf(consultation_id=consultation.id, pdf_url=summary_url))

    receipt_items = []
    for item in invoice.items:
        line_total = (
            Decimal(str(item.quantity))
            * Decimal(str(item.unit_price))
            * (Decimal("1") - Decimal(str(item.discount_percent)) / Decimal("100"))
        )
        receipt_items.append(
            {
                "description": item.description,
                "quantity": float(item.quantity),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "line_total": float(line_total),
            }
        )
    receipt_data = {
        "clinic_name": clinic.name,
        "invoice_id": str(invoice.id)[:8].upper(),
        "pet_name": pet.name,
        "status": invoice.status,
        "date_str": date_str,
        "items": receipt_items,
        "total": float(invoice.total),
    }
    receipt_bytes = build_invoice_receipt_pdf(receipt_data)
    receipt_rel = save_media("receipts", f"recibo_{invoice.id}.pdf", receipt_bytes)
    receipt_url = public_url(receipt_rel)
    db.commit()

    return CheckoutResult(
        consultation_id=consultation.id,
        invoice_id=invoice.id,
        summary_pdf_url=summary_url,
        receipt_pdf_url=receipt_url,
        total=float(invoice.total),
    )


@router.patch("/{consultation_id}", response_model=ConsultationRead)
def update_consultation(
    consultation_id: str,
    body: ConsultationUpdate,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> Consultation:
    consultation = _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(consultation, field, value)
    db.commit()
    return _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)


@router.delete("/{consultation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_consultation(
    consultation_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> None:
    consultation = _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)
    record_audit(
        db,
        clinic_id=ctx.clinic["id"],
        actor_type="user",
        actor_id=ctx.user.sub,
        action="consultation_deleted",
        entity_type="consultation",
        entity_id=consultation.id,
        metadata={"pet_id": str(consultation.pet_id)},
    )
    db.delete(consultation)
    db.commit()


@router.post(
    "/{consultation_id}/summary-pdf",
    summary="Genera el PDF de resumen de la consulta (informativo)",
)
def generate_summary_pdf(
    consultation_id: str,
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    """Genera (o regenera) el PDF de resumen. Es un documento INFORMATIVO:
    qué se hizo, qué se aplicó e indicaciones. No es una receta médica."""
    consultation = _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)

    clinic = db.get(Clinic, ctx.clinic["id"])
    pet = db.get(Pet, consultation.pet_id)
    vet = db.get(User, consultation.vet_user_id)
    branch = db.get(ClinicBranch, consultation.branch_id) if consultation.branch_id else None

    data = {
        "clinic_name": f"{clinic.name}" + (f" — {branch.name}" if branch else ""),
        "pet_name": pet.name,
        "species": pet.species,
        "breed": pet.breed,
        "vet_name": vet.full_name,
        "date_str": consultation.created_at.astimezone().strftime("%d/%m/%Y %H:%M"),
        "reason": consultation.reason,
        "diagnosis": consultation.diagnosis,
        "treatment": consultation.treatment,
        "care_instructions": consultation.care_instructions,
        "items": [
            {"description": i.description, "quantity": i.quantity} for i in consultation.items
        ],
        "next_appointment_suggestion": (
            consultation.next_appointment_suggestion.isoformat()
            if consultation.next_appointment_suggestion
            else None
        ),
    }

    pdf_bytes = build_consultation_summary_pdf(data)
    rel = save_media("summaries", f"consulta_{consultation_id}.pdf", pdf_bytes)
    pdf_url = public_url(rel)

    existing = db.scalar(
        select(ConsultationSummaryPdf).where(
            ConsultationSummaryPdf.consultation_id == consultation_id
        )
    )
    if existing:
        existing.pdf_url = pdf_url
    else:
        db.add(ConsultationSummaryPdf(consultation_id=consultation_id, pdf_url=pdf_url))
    db.commit()

    return {"consultation_id": consultation_id, "pdf_url": pdf_url}


@router.post(
    "/{consultation_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Adjunta una foto/nota a la consulta",
)
def upload_attachment(
    consultation_id: str,
    file: UploadFile = File(...),
    ctx: CurrentClinic = Depends(require_clinic_roles(*CONSULTATION_MUTATORS)),
    db: Session = Depends(get_db),
) -> dict:
    _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)

    validate_extension(file.filename or "", ALLOWED_IMAGE_EXTENSIONS)
    content = file.file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB",
        )

    rel = save_media(f"consultations/{consultation_id}", file.filename or "attach.jpg", content)
    attachment = ConsultationAttachment(
        consultation_id=consultation_id,
        type="photo",
        url=public_url(rel),
    )
    db.add(attachment)
    db.commit()
    return {"id": str(attachment.id), "url": attachment.url, "type": "photo"}


@router.get(
    "/{consultation_id}/survey",
    response_model=SurveyRead | None,
    summary="Encuesta de la consulta (lectura para staff)",
)
def consultation_survey(
    consultation_id: str,
    ctx: CurrentClinic = Depends(get_current_clinic),
    db: Session = Depends(get_db),
) -> dict | None:
    _get_consultation_or_404(db, ctx.clinic["id"], consultation_id)
    row = (
        db.execute(
            text(
                "SELECT id, consultation_id, rating, comments, created_at "
                "FROM consultation_surveys WHERE consultation_id = :c"
            ),
            {"c": consultation_id},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None
