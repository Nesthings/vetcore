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
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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
    styles.add(
        ParagraphStyle(name="VetBody", parent=styles["Normal"], fontSize=10.5, leading=15)
    )

    story: list = []

    story.append(Paragraph("VetCore", styles["VetTitle"]))
    story.append(
        Paragraph(
            f"<b>{data.get('clinic_name', '')}</b> — Resumen de consulta", styles["VetBody"]
        )
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
