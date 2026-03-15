from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.models import Staff
from ..schemas.schemas import StaffCreate, StaffOut, StaffUpdate
from ..services.roster_engine import regenerate_from_month
from ..services.staff_naming import generate_unique_abbreviation, sync_staff_abbreviations

router = APIRouter(prefix="/staff", tags=["Staff"])


@router.get("/", response_model=List[StaffOut])
def list_staff(db: Session = Depends(get_db)):
    sync_staff_abbreviations(db)
    return db.query(Staff).order_by(Staff.id).all()


@router.post("/", response_model=StaffOut, status_code=201)
def create_staff(payload: StaffCreate, db: Session = Depends(get_db)):
    existing = db.query(Staff).filter(Staff.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Staff member '{payload.name}' already exists.")
    existing_abbreviations = [row.abbreviation for row in db.query(Staff).order_by(Staff.id).all()]
    staff = Staff(
        **payload.model_dump(),
        abbreviation=generate_unique_abbreviation(payload.name, existing_abbreviations),
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    if staff.join_date:
        regenerate_from_month(db, staff.join_date.year, staff.join_date.month)
    return staff


@router.get("/{staff_id}", response_model=StaffOut)
def get_staff(staff_id: int, db: Session = Depends(get_db)):
    sync_staff_abbreviations(db)
    s = db.query(Staff).get(staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="Staff not found.")
    return s


@router.put("/{staff_id}", response_model=StaffOut)
def update_staff(staff_id: int, payload: StaffUpdate, db: Session = Depends(get_db)):
    sync_staff_abbreviations(db)
    s = db.query(Staff).get(staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="Staff not found.")
    old_join = s.join_date
    old_relieve = s.relieve_date
    incoming = payload.model_dump(exclude_unset=True)
    for field, val in incoming.items():
        setattr(s, field, val)
    if "name" in incoming:
        existing_abbreviations = [
            row.abbreviation
            for row in db.query(Staff).filter(Staff.id != staff_id).order_by(Staff.id).all()
        ]
        s.abbreviation = generate_unique_abbreviation(s.name, existing_abbreviations)
    db.commit()
    db.refresh(s)
    trigger_date = min([d for d in [old_join, old_relieve, s.join_date, s.relieve_date] if d], default=None)
    if trigger_date:
        regenerate_from_month(db, trigger_date.year, trigger_date.month)
        db.refresh(s)
    return s


@router.delete("/{staff_id}", status_code=204)
def delete_staff(staff_id: int, db: Session = Depends(get_db)):
    s = db.query(Staff).get(staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="Staff not found.")
    db.delete(s)
    db.commit()
