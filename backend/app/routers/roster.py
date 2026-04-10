from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
import calendar as cal_module
from ..database import get_db
from ..models.models import Calendar, RosterSettings, RemarkLog, SwapLog, ManualOverrideLog
from ..schemas.schemas import (
    CalendarOut, GenerateRosterRequest, RosterSettingsBase,
    RosterSettingsOut, AuditReport, RemarkOut, SwapRequest, SwapLogOut,
    ManualOverrideRequest, ManualOverrideLogOut, StaffStats, StaffOut,
)
from ..services.roster_engine import (
    generate_roster, heal_roster, get_audit_report,
    swap_roster_dates, apply_manual_override, get_override_history,
)
from ..services.export_service import export_csv, export_pdf

router = APIRouter(prefix="/roster", tags=["Roster"])


@router.post("/generate", response_model=List[CalendarOut])
def generate(payload: GenerateRosterRequest, db: Session = Depends(get_db)):
    try:
        entries = generate_roster(db, payload.year, payload.month, payload.force_regenerate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Roster generation failed: {exc}")
    return entries


@router.post("/heal", response_model=List[CalendarOut])
def heal(year: int, month: int, db: Session = Depends(get_db)):
    try:
        entries = heal_roster(db, year, month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Heal failed: {exc}")
    return entries


@router.get("/audit", response_model=AuditReport)
def audit(year: int, month: int, db: Session = Depends(get_db)):
    report = get_audit_report(db, year, month)

    stats_out = []
    for s in report["stats"]:
        stats_out.append(StaffStats(
            staff=StaffOut.model_validate(s["staff"]),
            working_duties=s["working_duties"],
            holiday_duties=s["holiday_duties"],
            total_duties=s["total_duties"],
        ))

    return AuditReport(
        month=report["month"],
        year=report["year"],
        stats=stats_out,
        max_duties=report["max_duties"],
        min_duties=report["min_duties"],
        variance=report["variance"],
        imbalance_warning=report["imbalance_warning"],
    )


@router.get("/remarks", response_model=List[RemarkOut])
def get_remarks(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(RemarkLog).order_by(RemarkLog.created_at.desc()).limit(limit).all()


@router.delete("/remarks", status_code=204)
def clear_remarks(db: Session = Depends(get_db)):
    db.query(RemarkLog).delete()
    db.commit()


@router.post("/swap", response_model=List[CalendarOut])
def swap(payload: SwapRequest, db: Session = Depends(get_db)):
    try:
        swap_roster_dates(db, payload.first_date, payload.second_date, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    year = payload.first_date.year
    month = payload.first_date.month
    _, days = cal_module.monthrange(year, month)
    return db.query(Calendar).filter(
        Calendar.date >= date(year, month, 1),
        Calendar.date <= date(year, month, days),
    ).order_by(Calendar.date).all()


@router.get("/swap/history", response_model=List[SwapLogOut])
def get_swap_history(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(SwapLog).order_by(SwapLog.created_at.desc()).limit(limit).all()


@router.get("/settings", response_model=RosterSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    s = db.query(RosterSettings).first()
    if not s:
        s = RosterSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.put("/settings", response_model=RosterSettingsOut)
def update_settings(payload: RosterSettingsBase, db: Session = Depends(get_db)):
    s = db.query(RosterSettings).first()
    if not s:
        s = RosterSettings()
        db.add(s)
    for field, val in payload.model_dump().items():
        setattr(s, field, val)
    db.commit()
    db.refresh(s)
    return s


@router.post("/manual-override", response_model=List[CalendarOut])
def manual_override(payload: ManualOverrideRequest, db: Session = Depends(get_db)):
    try:
        entries = apply_manual_override(
            db,
            payload.date,
            payload.new_duty_id,
            payload.new_standby_id,
            payload.reason,
            payload.override_type,
            payload.heal_after,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return entries


@router.get("/manual-override/history", response_model=List[ManualOverrideLogOut])
def override_history(limit: int = 50, db: Session = Depends(get_db)):
    return get_override_history(db, limit)


@router.get("/export/csv")
def export_csv_route(year: int, month: int, db: Session = Depends(get_db)):
    _, days = cal_module.monthrange(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= date(year, month, 1),
        Calendar.date <= date(year, month, days),
    ).order_by(Calendar.date).all()

    content = export_csv(entries)
    month_name = cal_module.month_name[month]
    filename = f"dutysync_{month_name}_{year}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/pdf")
def export_pdf_route(year: int, month: int, db: Session = Depends(get_db)):
    _, days = cal_module.monthrange(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= date(year, month, 1),
        Calendar.date <= date(year, month, days),
    ).order_by(Calendar.date).all()

    content = export_pdf(entries, month, year)
    month_name = cal_module.month_name[month]
    filename = f"dutysync_{month_name}_{year}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
