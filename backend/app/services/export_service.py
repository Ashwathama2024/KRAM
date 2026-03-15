"""Export service for PDF, CSV, PNG roster output."""
import io
import csv
from datetime import date
from typing import List
from sqlalchemy.orm import Session
from ..models.models import Calendar, DayTypeEnum


def export_csv(entries: List[Calendar]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Day", "Day Type", "Duty Staff", "Standby Staff", "Status"])
    for e in entries:
        writer.writerow([
            e.date.strftime("%Y-%m-%d"),
            e.date.strftime("%A"),
            e.day_type.value.capitalize() if e.day_type else "",
            e.duty_staff.name if e.duty_staff else "—",
            e.standby_staff.name if e.standby_staff else "—",
            e.status.value.capitalize() if e.status else "",
        ])
    return output.getvalue().encode("utf-8")


def export_pdf(entries: List[Calendar], month: int, year: int) -> bytes:
    from fpdf import FPDF
    import calendar as cal_module

    month_name = cal_module.month_name[month]

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, f"KRAM - {month_name} {year} Duty Roster", ln=True, align="C")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 10)
    col_widths = [28, 26, 28, 50, 50, 26]
    headers = ["Date", "Day", "Type", "Duty Staff", "Standby Staff", "Status"]
    fills = [True, True, True, True, True, True]

    pdf.set_fill_color(30, 64, 175)
    pdf.set_text_color(255, 255, 255)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 8, h, border=1, align="C", fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(0, 0, 0)

    for idx, e in enumerate(entries):
        fill = False
        if e.day_type == DayTypeEnum.WORKING:
            pdf.set_fill_color(220, 252, 231)
            fill = True
        else:
            pdf.set_fill_color(254, 226, 226)
            fill = True

        pdf.cell(col_widths[0], 7, e.date.strftime("%Y-%m-%d"), border=1, fill=fill)
        pdf.cell(col_widths[1], 7, e.date.strftime("%A"), border=1, fill=fill)
        pdf.cell(col_widths[2], 7, e.day_type.value.capitalize() if e.day_type else "", border=1, fill=fill)
        pdf.cell(col_widths[3], 7, e.duty_staff.name if e.duty_staff else "—", border=1, fill=fill)
        pdf.cell(col_widths[4], 7, e.standby_staff.name if e.standby_staff else "—", border=1, fill=fill)
        pdf.cell(col_widths[5], 7, e.status.value.capitalize() if e.status else "", border=1, fill=fill)
        pdf.ln()

    return bytes(pdf.output())




