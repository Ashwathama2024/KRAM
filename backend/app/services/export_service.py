"""Export service for PDF, CSV, PNG roster output."""
import io
import csv
from datetime import date
from typing import List
from sqlalchemy.orm import Session
from ..models.models import Calendar, DayTypeEnum


def _s(text: str, maxlen: int = 30) -> str:
    """Sanitize text for fpdf built-in fonts (Latin-1 only).
    Replaces any character outside ISO-8859-1 with '?' so fpdf never
    throws FPDFUnicodeEncodingException regardless of DB content."""
    if not text:
        return ""
    return text.encode("latin-1", errors="replace").decode("latin-1")[:maxlen]


def export_csv(entries: List[Calendar]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Day", "Day Type", "Duty Staff", "Standby Staff", "Status"])
    for e in entries:
        writer.writerow([
            e.date.strftime("%Y-%m-%d"),
            e.date.strftime("%A"),
            e.day_type.value.capitalize() if e.day_type else "",
            e.duty_staff.name if e.duty_staff else "-",
            e.standby_staff.name if e.standby_staff else "-",
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
        pdf.cell(col_widths[2], 7, _s(e.day_type.value.capitalize() if e.day_type else ""), border=1, fill=fill)
        duty_label   = _s((e.duty_staff.abbreviation   or e.duty_staff.name)   if e.duty_staff   else "-", 30)
        standby_label = _s((e.standby_staff.abbreviation or e.standby_staff.name) if e.standby_staff else "-", 30)
        pdf.cell(col_widths[3], 7, duty_label,   border=1, fill=fill)
        pdf.cell(col_widths[4], 7, standby_label, border=1, fill=fill)
        pdf.cell(col_widths[5], 7, _s(e.status.value.capitalize() if e.status else ""), border=1, fill=fill)
        pdf.ln()

    return bytes(pdf.output())


def export_calendar_pdf(entries: List[Calendar], month: int, year: int, org_name: str = "") -> bytes:
    """Generate a grid-style monthly calendar PDF (A4 landscape)."""
    from fpdf import FPDF
    import calendar as cal_module

    month_name = cal_module.month_name[month]
    first_weekday, total_days = cal_module.monthrange(year, month)
    # calendar.monthrange returns 0=Mon … 6=Sun, convert to 0=Sun … 6=Sat
    start_col = (first_weekday + 1) % 7

    # Build lookup: day-of-month -> entry
    entry_map = {e.date.day: e for e in entries}

    DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    COLS = 7
    CELL_W = 38.0   # mm  (7 × 38 = 266, fits A4-L 277mm usable)
    CELL_H = 28.0   # mm

    # Colours
    C_HEADER  = (30,  64, 175)   # brand blue
    C_WORKING = (220, 252, 231)  # emerald-100
    C_WEEKEND = (254, 243, 199)  # amber-100
    C_HOLIDAY = (254, 226, 226)  # rose-100
    C_EMPTY   = (248, 250, 252)  # slate-50
    C_TEXT    = (15,  23,  42)   # slate-900
    C_SUB     = (71,  85, 105)   # slate-500
    C_WHITE   = (255, 255, 255)

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_margins(5, 5, 5)
    pdf.add_page()

    # ── Title ──────────────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(*C_HEADER)
    title = f"{_s(org_name, 60)} - {month_name} {year} Duty Calendar" if org_name else f"{month_name} {year} Duty Calendar"
    pdf.cell(0, 9, title, align="C")
    pdf.ln(11)

    # ── Day-name header row ────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*C_WHITE)
    for d in DAY_NAMES:
        pdf.set_fill_color(*C_HEADER)
        pdf.cell(CELL_W, 7, d, border=1, align="C", fill=True)
    pdf.ln(7)

    # ── Calendar cells ─────────────────────────────────────────────────────────
    col = 0

    # Empty cells before month starts
    for _ in range(start_col):
        pdf.set_fill_color(*C_EMPTY)
        pdf.cell(CELL_W, CELL_H, "", border=1, fill=True)
        col += 1

    for day in range(1, total_days + 1):
        entry = entry_map.get(day)

        # Pick cell background
        if entry:
            if entry.is_holiday:
                pdf.set_fill_color(*C_HOLIDAY)
            elif entry.day_type == DayTypeEnum.WORKING:
                pdf.set_fill_color(*C_WORKING)
            else:
                pdf.set_fill_color(*C_WEEKEND)
        else:
            pdf.set_fill_color(*C_EMPTY)

        x = pdf.get_x()
        y = pdf.get_y()

        # Draw cell background
        pdf.rect(x, y, CELL_W, CELL_H, style="F")
        pdf.rect(x, y, CELL_W, CELL_H, style="D")  # border

        # Day number
        pdf.set_xy(x + 1.5, y + 1.5)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*C_TEXT)
        pdf.cell(CELL_W - 3, 5, str(day), align="L")

        if entry:
            # Holiday name
            if entry.is_holiday and entry.holiday_name:
                pdf.set_xy(x + 1, y + 7)
                pdf.set_font("Helvetica", "I", 6.5)
                pdf.set_text_color(185, 28, 28)  # rose-700
                pdf.cell(CELL_W - 2, 4, _s(entry.holiday_name, 22), align="L")

            # Duty staff
            if entry.duty_staff:
                pdf.set_xy(x + 1, y + 13)
                pdf.set_font("Helvetica", "B", 7)
                pdf.set_text_color(*C_SUB)
                duty_abbr = _s(entry.duty_staff.abbreviation or entry.duty_staff.name, 18)
                pdf.cell(CELL_W - 2, 4, f"D: {duty_abbr}", align="L")

            # Standby staff
            if entry.standby_staff:
                pdf.set_xy(x + 1, y + 18)
                pdf.set_font("Helvetica", "", 7)
                pdf.set_text_color(*C_SUB)
                standby_abbr = _s(entry.standby_staff.abbreviation or entry.standby_staff.name, 18)
                pdf.cell(CELL_W - 2, 4, f"S: {standby_abbr}", align="L")

        pdf.set_xy(x + CELL_W, y)
        col += 1

        if col == COLS:
            col = 0
            pdf.ln(CELL_H)

    # Fill remaining cells in last row
    if col > 0:
        for _ in range(COLS - col):
            pdf.set_fill_color(*C_EMPTY)
            pdf.cell(CELL_W, CELL_H, "", border=1, fill=True)

    # ── Legend ─────────────────────────────────────────────────────────────────
    pdf.ln(CELL_H + 3)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*C_TEXT)
    for colour, label in [
        (C_WORKING, "Working Day"),
        (C_WEEKEND, "Weekend / Sunday Routine"),
        (C_HOLIDAY, "Public Holiday"),
    ]:
        pdf.set_fill_color(*colour)
        pdf.rect(pdf.get_x(), pdf.get_y() + 1, 5, 4, style="F")
        pdf.cell(7, 6, "")
        pdf.cell(40, 6, label)

    # ── Staff Reference Page ────────────────────────────────────────────────────
    # Collect unique staff who appear in this month's entries
    seen: dict[int, object] = {}
    for e in entries:
        if e.duty_staff and e.duty_staff.id not in seen:
            seen[e.duty_staff.id] = e.duty_staff
        if e.standby_staff and e.standby_staff.id not in seen:
            seen[e.standby_staff.id] = e.standby_staff

    if seen:
        ref_staff = sorted(seen.values(), key=lambda s: (s.abbreviation or s.name).upper())

        pdf.add_page()

        # Page title
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(*C_HEADER)
        ref_title = f"Staff Reference - {month_name} {year}"
        pdf.cell(0, 10, ref_title, align="C")
        pdf.ln(13)

        # Table header
        col_abbr = 55
        col_name = 180
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*C_WHITE)
        pdf.set_fill_color(*C_HEADER)
        pdf.cell(col_abbr, 8, "Abbreviation", border=1, align="C", fill=True)
        pdf.cell(col_name, 8, "Full Name", border=1, align="C", fill=True)
        pdf.ln(8)

        pdf.set_font("Helvetica", "", 9)
        for i, s in enumerate(ref_staff):
            if i % 2 == 0:
                pdf.set_fill_color(248, 250, 252)   # slate-50 stripe
            else:
                pdf.set_fill_color(255, 255, 255)
            pdf.set_text_color(*C_TEXT)
            abbr = _s(s.abbreviation or s.name, 20)
            full = _s(s.name, 80)
            pdf.cell(col_abbr, 7, abbr, border=1, align="C", fill=True)
            pdf.cell(col_name, 7, full, border=1, align="L", fill=True)
            pdf.ln(7)

    return bytes(pdf.output())
