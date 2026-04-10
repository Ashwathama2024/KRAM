from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.models import Staff, RosterSettings
from ..schemas.schemas import SetupStatusOut, SetupInitializeRequest
from ..services.staff_naming import generate_unique_abbreviation

router = APIRouter(prefix="/setup", tags=["Setup"])


def _get_status(db: Session) -> SetupStatusOut:
    settings = db.query(RosterSettings).first()
    staff_count = db.query(Staff).count()
    return SetupStatusOut(
        is_configured=bool(settings and settings.org_name),
        has_staff=staff_count > 0,
        org_name=settings.org_name if settings else None,
        unit=settings.unit if settings else None,
    )


@router.get("/status", response_model=SetupStatusOut)
def setup_status(db: Session = Depends(get_db)):
    return _get_status(db)


@router.post("/initialize", response_model=SetupStatusOut)
def setup_initialize(payload: SetupInitializeRequest, db: Session = Depends(get_db)):
    # Idempotency guard — prevent re-init if org already configured
    existing_settings = db.query(RosterSettings).first()
    if existing_settings and existing_settings.org_name:
        raise HTTPException(
            status_code=400,
            detail="Already initialized. Use Settings to update organization details.",
        )

    try:
        # Create or update RosterSettings
        settings = db.query(RosterSettings).first()
        if not settings:
            settings = RosterSettings()
            db.add(settings)

        settings.org_name = payload.org_name.strip()
        settings.unit = payload.unit.strip() if payload.unit else None
        settings.leave_rejoin_buffer_days = payload.leave_rejoin_buffer_days
        settings.auto_assign_standby = payload.auto_assign_standby

        # Bulk-create staff with auto-generated abbreviations
        used_abbreviations: list[str] = []
        for entry in payload.staff:
            name = entry.name.strip()
            abbrev = generate_unique_abbreviation(name, used_abbreviations)
            used_abbreviations.append(abbrev)
            staff = Staff(
                name=name,
                abbreviation=abbrev,
                active=entry.active,
                join_date=entry.join_date,
                relieve_date=entry.relieve_date,
            )
            db.add(staff)

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Setup failed: {exc}")

    return _get_status(db)
