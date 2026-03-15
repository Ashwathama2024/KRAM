from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.models import Availability, Staff
from ..schemas.schemas import AvailabilityCreate, AvailabilityOut, AvailabilityUpdate
from ..services.roster_engine import regenerate_from_month, _log_remark

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get("/", response_model=List[AvailabilityOut])
def list_availability(db: Session = Depends(get_db)):
    return db.query(Availability).order_by(Availability.start_date).all()


@router.post("/", response_model=AvailabilityOut, status_code=201)
def create_availability(payload: AvailabilityCreate, db: Session = Depends(get_db)):
    staff = db.query(Staff).get(payload.staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found.")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date.")
    avail = Availability(**payload.model_dump())
    db.add(avail)
    db.commit()
    db.refresh(avail)
    _log_remark(
        db,
        f"{staff.name} marked as {payload.availability_type.value.replace('_', ' ')} from {payload.start_date} to {payload.end_date}."
        + (f" Reason: {payload.reason}." if payload.reason else ""),
        "info",
        payload.start_date,
    )
    regenerate_from_month(db, payload.start_date.year, payload.start_date.month)
    db.refresh(avail)
    return avail


@router.delete("/{avail_id}", status_code=204)
def delete_availability(avail_id: int, db: Session = Depends(get_db)):
    avail = db.query(Availability).get(avail_id)
    if not avail:
        raise HTTPException(status_code=404, detail="Availability record not found.")
    start_year = avail.start_date.year
    start_month = avail.start_date.month
    staff_name = avail.staff.name if avail.staff else f"Staff #{avail.staff_id}"
    _log_remark(
        db,
        f"Unavailability removed for {staff_name} from {avail.start_date} to {avail.end_date}.",
        "info",
        avail.start_date,
    )
    db.delete(avail)
    db.commit()
    regenerate_from_month(db, start_year, start_month)


@router.put("/{avail_id}", response_model=AvailabilityOut)
def update_availability(avail_id: int, payload: AvailabilityUpdate, db: Session = Depends(get_db)):
    avail = db.query(Availability).get(avail_id)
    if not avail:
        raise HTTPException(status_code=404, detail="Availability record not found.")

    staff = db.query(Staff).get(payload.staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found.")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date.")

    old_start = avail.start_date
    for field, value in payload.model_dump().items():
        setattr(avail, field, value)
    db.commit()
    db.refresh(avail)
    _log_remark(
        db,
        f"{staff.name}'s unavailability updated to {payload.availability_type.value.replace('_', ' ')} from {payload.start_date} to {payload.end_date}."
        + (f" Reason: {payload.reason}." if payload.reason else ""),
        "info",
        payload.start_date,
    )

    regen_start = min(old_start, payload.start_date)
    regenerate_from_month(db, regen_start.year, regen_start.month)
    db.refresh(avail)
    return avail
