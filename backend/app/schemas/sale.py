import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SaleProductItem(BaseModel):
    product_id: uuid.UUID
    quantity: float = Field(default=1, gt=0)


class SaleCreate(BaseModel):
    branch_id: uuid.UUID
    pet_id: uuid.UUID | None = None
    products: list[SaleProductItem] = Field(min_length=1)
    performed_at: datetime | None = None
    send_receipt_whatsapp: bool = False
    send_receipt_email: bool = False


class SaleResult(BaseModel):
    invoice_id: uuid.UUID
    receipt_pdf_url: str
    total: float
