from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from ..database import get_db
from ..models.models import Calendar, DayTypeEnum
from ..schemas.schemas import CalendarOut, CalendarUpdate, HolidayMark
from ..services.roster_engine import regenerate_from_month

router = APIRouter(prefix="/calendar", tags=["Calendar"])


@router.get("/", response_model=List[CalendarOut])
def list_calendar(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Calendar)
    if year and month:
        from datetime import date
        import calendar as cal_module
        _, days = cal_module.monthrange(year, month)
        q = q.filter(
            Calendar.date >= date(year, month, 1),
            Calendar.date <= date(year, month, days),
        )
    return q.order_by(Calendar.date).all()


@router.get("/{entry_date}", response_model=CalendarOut)
def get_calendar_entry(entry_date: date, db: Session = Depends(get_db)):
    entry = db.query(Calendar).filter(Calendar.date == entry_date).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found.")
    return entry


@router.put("/{entry_date}", response_model=CalendarOut)
def update_calendar_entry(entry_date: date, payload: CalendarUpdate, db: Session = Depends(get_db)):
    entry = db.query(Calendar).filter(Calendar.date == entry_date).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found.")

    updates = payload.model_dump(exclude_unset=True)
    day_type = updates.get("day_type")

    if day_type is not None:
        if day_type == DayTypeEnum.HOLIDAY:
            updates["is_holiday"] = True
            updates["holiday_name"] = updates.get("holiday_name") or entry.holiday_name or "Closed Holiday"
        else:
            updates["is_holiday"] = False
            updates["holiday_name"] = None

    elif "is_holiday" in updates:
        if updates["is_holiday"]:
            updates["day_type"] = DayTypeEnum.HOLIDAY
            updates["holiday_name"] = updates.get("holiday_name") or entry.holiday_name or "Closed Holiday"
        else:
            updates["day_type"] = DayTypeEnum.WEEKEND if entry_date.weekday() >= 5 else DayTypeEnum.WORKING
            updates["holiday_name"] = None

    for field, val in updates.items():
        setattr(entry, field, val)
    db.commit()
    db.refresh(entry)
    regenerate_from_month(db, entry_date.year, entry_date.month)
    entry = db.query(Calendar).filter(Calendar.date == entry_date).first()
    return entry


@router.post("/holiday", response_model=CalendarOut)
def mark_holiday(payload: HolidayMark, db: Session = Depends(get_db)):
    entry = db.query(Calendar).filter(Calendar.date == payload.date).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found. Generate roster first.")
    entry.is_holiday = payload.is_holiday
    entry.holiday_name = payload.holiday_name if payload.is_holiday else None
    if payload.is_holiday:
        entry.day_type = DayTypeEnum.HOLIDAY
    else:
        from datetime import date as dt
        d = payload.date
        entry.day_type = DayTypeEnum.WEEKEND if d.weekday() >= 5 else DayTypeEnum.WORKING
    db.commit()
    db.refresh(entry)
    regenerate_from_month(db, payload.date.year, payload.date.month)
    entry = db.query(Calendar).filter(Calendar.date == payload.date).first()
    return entry
