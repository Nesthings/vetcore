"""Generador del PDF de resumen de consulta.

DOCUMENTO INFORMATIVO — NO es una receta médica (regla 6 del documento).
Contenido: qué se hizo, qué se aplicó e indicaciones. No incluye elementos
que simulen validez legal de prescripción.
"""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BRAND = colors.HexColor("#0f766e")

_CENTER = ParagraphStyle(
    name="Center",
    parent=getSampleStyleSheet()["Normal"],
    alignment=1,
    fontSize=10,
    textColor=colors.HexColor("#5c6b66"),
)


def build_consultation_summary_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=0.75 * inch, leftMargin=0.75 * inch)

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(name="VetTitle", parent=styles["Title"], fontSize=18, textColor=BRAND)
    )
    styles.add(
        ParagraphStyle(
            name="VetH2",
            parent=styles["Heading2"],
            fontSize=11,
            textColor=colors.HexColor("#14201d"),
        )
    )
    styles.add(ParagraphStyle(name="VetBody", parent=styles["Normal"], fontSize=10.5, leading=15))

    story: list = []

    story.append(Paragraph("VetCore", styles["VetTitle"]))
    story.append(
        Paragraph(f"<b>{data.get('clinic_name', '')}</b> — Resumen de consulta", styles["VetBody"])
    )
    story.append(Paragraph(data.get("date_str", ""), _CENTER))
    story.append(Spacer(1, 0.15 * inch))

    pet_species = data.get("species", "")
    pet_breed = data.get("breed")
    pet_display = data.get("pet_name", "")
    if pet_breed:
        pet_display = f"{pet_display} ({pet_species} · {pet_breed})"
    elif pet_species:
        pet_display = f"{pet_display} ({pet_species})"

    info = [
        ["Paciente", pet_display],
        ["Veterinario", data.get("vet_name", "")],
        ["Motivo", data.get("reason", "—")],
    ]
    info_table = Table(info, colWidths=[1.4 * inch, 5.6 * inch])
    info_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Diagnóstico", styles["VetH2"]))
    story.append(Paragraph(data.get("diagnosis") or "—", styles["VetBody"]))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Qué se aplicó", styles["VetH2"]))
    items = data.get("items") or []
    if items:
        item_rows = [["#", "Descripción", "Cant."]]
        for i, item in enumerate(items, start=1):
            item_rows.append([str(i), item.get("description", ""), str(item.get("quantity", 1))])
        items_table = Table(item_rows, colWidths=[0.4 * inch, 4.6 * inch, 1.0 * inch])
        items_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f5f1")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dfe7e4")),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(items_table)
    else:
        story.append(Paragraph("—", styles["VetBody"]))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Tratamiento", styles["VetH2"]))
    story.append(Paragraph(data.get("treatment") or "—", styles["VetBody"]))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Indicaciones", styles["VetH2"]))
    story.append(Paragraph(data.get("care_instructions") or "—", styles["VetBody"]))
    story.append(Spacer(1, 0.12 * inch))

    if data.get("next_appointment_suggestion"):
        story.append(
            Paragraph(
                f"<b>Próxima cita sugerida:</b> {data.get('next_appointment_suggestion')}",
                styles["VetBody"],
            )
        )
        story.append(Spacer(1, 0.2 * inch))

    story.append(Spacer(1, 0.3 * inch))
    story.append(
        Paragraph(
            "Documento informativo generado por VetCore. No constituye una receta médica.",
            _CENTER,
        )
    )

    doc.build(story)
    return buf.getvalue()


def build_invoice_receipt_pdf(data: dict) -> bytes:
    """Recibo de factura. Informativo; no es comprobante fiscal (CFDI)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=0.75 * inch, leftMargin=0.75 * inch)

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(name="VetTitle", parent=styles["Title"], fontSize=18, textColor=BRAND)
    )
    styles.add(
        ParagraphStyle(
            name="VetH2",
            parent=styles["Heading2"],
            fontSize=11,
            textColor=colors.HexColor("#14201d"),
        )
    )
    styles.add(ParagraphStyle(name="VetBody", parent=styles["Normal"], fontSize=10.5, leading=15))

    story: list = []

    story.append(Paragraph("VetCore", styles["VetTitle"]))
    story.append(Paragraph(f"<b>{data.get('clinic_name', '')}</b> — Recibo", styles["VetBody"]))
    story.append(Paragraph(data.get("date_str", ""), _CENTER))
    story.append(Spacer(1, 0.15 * inch))

    info = [
        ["Folio", data.get("invoice_id", "")],
        ["Paciente", data.get("pet_name", "—")],
        ["Estado", data.get("status", "")],
    ]
    info_table = Table(info, colWidths=[1.4 * inch, 5.6 * inch])
    info_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Conceptos", styles["VetH2"]))
    header = ["Descripción", "Cant.", "P. unit.", "Dto %", "Subtotal"]
    rows = [header]
    for item in data.get("items", []):
        rows.append(
            [
                item.get("description", ""),
                str(item.get("quantity", 1)),
                f"${float(item.get('unit_price', 0)):,.2f}",
                f"{float(item.get('discount_percent', 0)):g}%",
                f"${float(item.get('line_total', 0)):,.2f}",
            ]
        )
    rows.append(["", "", "", "TOTAL", f"${float(data.get('total', 0)):,.2f}"])
    items_table = Table(
        rows, colWidths=[3.2 * inch, 0.7 * inch, 1.0 * inch, 0.7 * inch, 1.4 * inch]
    )
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f5f1")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dfe7e4")),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("FONTNAME", (0, len(rows) - 1), (-1, len(rows) - 1), "Helvetica-Bold"),
                ("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#f0f4f3")),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 0.3 * inch))
    story.append(
        Paragraph(
            "Recibo informativo generado por VetCore. No constituye comprobante fiscal.",
            _CENTER,
        )
    )

    doc.build(story)
    return buf.getvalue()


def build_consent_pdf(data: dict) -> bytes:
    """PDF del consentimiento informado firmado (subfase 3.2).

    Incluye el texto del consentimiento y la imagen de la firma del dueño.
    """
    from reportlab.lib.utils import ImageReader

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=0.75 * inch, leftMargin=0.75 * inch)

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(name="VetTitle", parent=styles["Title"], fontSize=18, textColor=BRAND)
    )
    styles.add(
        ParagraphStyle(
            name="VetH2",
            parent=styles["Heading2"],
            fontSize=11,
            textColor=colors.HexColor("#14201d"),
        )
    )
    styles.add(ParagraphStyle(name="VetBody", parent=styles["Normal"], fontSize=10.5, leading=15))

    story: list = []

    story.append(Paragraph("VetCore", styles["VetTitle"]))
    story.append(
        Paragraph(
            f"<b>{data.get('clinic_name', '')}</b> — Consentimiento informado",
            styles["VetBody"],
        )
    )
    story.append(Paragraph(data.get("date_str", ""), _CENTER))
    story.append(Spacer(1, 0.15 * inch))

    info = [
        ["Paciente", data.get("pet_name", "—")],
        ["Dueño", data.get("owner_display", "—")],
        ["Título", data.get("title", "")],
    ]
    info_table = Table(info, colWidths=[1.4 * inch, 5.6 * inch])
    info_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Texto del consentimiento", styles["VetH2"]))
    story.append(Paragraph(data.get("body", "—"), styles["VetBody"]))
    story.append(Spacer(1, 0.3 * inch))

    story.append(Paragraph("Firma del dueño", styles["VetH2"]))
    signature_bytes = data.get("signature_bytes")
    if signature_bytes:
        try:
            signature_img = ImageReader(io.BytesIO(signature_bytes))
            story.append(
                Image(signature_img, width=3.2 * inch, height=1.6 * inch)
            )
        except Exception:
            story.append(Paragraph("(firma no disponible)", styles["VetBody"]))
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        Paragraph(
            f"Firmado por <b>{data.get('owner_display', '')}</b> el {data.get('date_str', '')}.",
            styles["VetBody"],
        )
    )
    story.append(Spacer(1, 0.3 * inch))
    story.append(
        Paragraph(
            "Documento generado por VetCore para la clínica. "
            "Conserva una copia para tu expediente.",
            _CENTER,
        )
    )

    doc.build(story)
    return buf.getvalue()
