"""
DutySync Master - Roster Generation Engine (Chain-based)

Core logic
----------
Two independent rotating chains:
  • Working chain   — weekdays (Mon–Fri)
  • Holiday chain   — weekends + public holidays

Each chain advances by one position every day it is used:
  today's standby → tomorrow's duty

If the scheduled duty person is unavailable the chain skips them
(duty_debt is incremented) and the next available person becomes duty.
The person after that becomes standby.  This is the "standby closes
up on duty" rule: whoever would have been standby naturally steps up.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple
import calendar as cal_module
import logging

from sqlalchemy.orm import Session

from ..models.models import (
    Availability,
    AvailabilityTypeEnum,
    Calendar,
    DayTypeEnum,
    RemarkLog,
    RosterSettings,
    Staff,
    StatusEnum,
    SwapLog,
)

logger = logging.getLogger(__name__)


# ── tiny helpers ──────────────────────────────────────────────────────────────

def _log_remark(
    db: Session,
    message: str,
    level: str = "info",
    date_ref: Optional[date] = None,
):
    exists = db.query(RemarkLog).filter(
        RemarkLog.message == message,
        RemarkLog.level == level,
        RemarkLog.date_ref == date_ref,
    ).first()
    if not exists:
        db.add(RemarkLog(message=message, level=level, date_ref=date_ref))


def _month_bounds(year: int, month: int) -> Tuple[date, date]:
    _, days = cal_module.monthrange(year, month)
    return date(year, month, 1), date(year, month, days)


def _iter_months(sy: int, sm: int, ey: int, em: int):
    y, m = sy, sm
    while (y, m) <= (ey, em):
        yield y, m
        m += 1
        if m > 12:
            m, y = 1, y + 1


def _is_weekend(d: date) -> bool:
    return d.weekday() >= 5


def _is_non_working(day_type: DayTypeEnum) -> bool:
    return day_type in (DayTypeEnum.WEEKEND, DayTypeEnum.HOLIDAY)


def _normalize_day_type(entry: Calendar):
    if entry.is_holiday:
        entry.day_type = DayTypeEnum.HOLIDAY
    elif entry.day_type == DayTypeEnum.HOLIDAY:
        entry.day_type = DayTypeEnum.WEEKEND if _is_weekend(entry.date) else DayTypeEnum.WORKING


def _get_settings(db: Session) -> RosterSettings:
    s = db.query(RosterSettings).first()
    if not s:
        s = RosterSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _get_active_staff(db: Session) -> List[Staff]:
    return db.query(Staff).filter(Staff.active == True).order_by(Staff.id).all()


def _is_staff_available(staff: Staff, d: date, db: Session) -> bool:
    """Return True if the staff member can work on date d."""
    if getattr(staff, "join_date", None) and d < staff.join_date:
        return False
    if getattr(staff, "relieve_date", None) and d > staff.relieve_date:
        return False

    # Direct leave / official-duty overlap
    if db.query(Availability).filter(
        Availability.staff_id == staff.id,
        Availability.start_date <= d,
        Availability.end_date >= d,
    ).first():
        return False

    # Rejoin buffer after leave / official duty
    settings = _get_settings(db)
    for rec in db.query(Availability).filter(
        Availability.staff_id == staff.id,
        Availability.end_date < d,
    ).all():
        atype = (
            getattr(rec, "availability_type", None)
            or AvailabilityTypeEnum.LEAVE
        )
        buffer = (
            settings.leave_rejoin_buffer_days
            if atype == AvailabilityTypeEnum.LEAVE
            else settings.official_duty_min_buffer_days
        )
        if buffer > 0 and d < rec.end_date + timedelta(days=buffer + 1):
            return False

    return True


def _find_staff_index(
    staff_list: List[Staff], staff_id: Optional[int]
) -> Optional[int]:
    if staff_id is None:
        return None
    for i, s in enumerate(staff_list):
        if s.id == staff_id:
            return i
    return None


def _get_chain_start(
    historical: List[Calendar],
    staff_pool: List[Staff],
    non_working: bool,
) -> int:
    """
    Return the pool index where the next duty should start.
    Chain rule: standby of the last assigned day becomes the next duty.
    """
    if not staff_pool:
        return 0
    relevant = [
        e for e in historical
        if e.assigned_duty_id and _is_non_working(e.day_type) == non_working
    ]
    if not relevant:
        return 0
    last = relevant[-1]
    # Standby of last day → first candidate for next day
    idx = _find_staff_index(staff_pool, last.assigned_standby_id)
    if idx is not None:
        return idx
    # Fallback: position after last duty
    duty_idx = _find_staff_index(staff_pool, last.assigned_duty_id)
    if duty_idx is None:
        return 0
    return (duty_idx + 1) % len(staff_pool)


# ── chain picker ──────────────────────────────────────────────────────────────

def _pick_from_chain(
    staff_pool: List[Staff],
    start_idx: int,
    d: date,
    db: Session,
    exclude_id: Optional[int] = None,
) -> Tuple[Optional[Staff], int, List[Staff]]:
    """
    Walk the chain from start_idx and return the first available person.

    Parameters
    ----------
    exclude_id : skip this staff id (used to prevent standby == duty).

    Returns
    -------
    (person, their_index_in_pool, list_of_skipped_unavailable_staff)
    """
    n = len(staff_pool)
    if not n:
        return None, 0, []
    skipped: List[Staff] = []
    for offset in range(n):
        idx = (start_idx + offset) % n
        candidate = staff_pool[idx]
        if not candidate.active:
            continue
        if exclude_id is not None and candidate.id == exclude_id:
            continue
        if not _is_staff_available(candidate, d, db):
            skipped.append(candidate)
            continue
        return candidate, idx, skipped
    return None, start_idx, skipped


# ── month helpers ─────────────────────────────────────────────────────────────

def initialize_month(db: Session, year: int, month: int):
    start, end = _month_bounds(year, month)
    existing = {
        row.date
        for row in db.query(Calendar.date).filter(
            Calendar.date >= start, Calendar.date <= end
        ).all()
    }
    for day in range(1, end.day + 1):
        d = date(year, month, day)
        if d not in existing:
            db.add(Calendar(
                date=d,
                day_type=DayTypeEnum.WEEKEND if _is_weekend(d) else DayTypeEnum.WORKING,
                is_holiday=False,
                status=StatusEnum.PENDING,
            ))
    db.commit()


def _recompute_staff_counters(db: Session):
    all_staff = db.query(Staff).all()
    for s in all_staff:
        s.total_working_duties = 0
        s.total_holiday_duties = 0
        s.duty_debt = getattr(s, "working_debt", 0) + getattr(s, "holiday_debt", 0)
    staff_map = {s.id: s for s in all_staff}
    for e in db.query(Calendar).filter(Calendar.assigned_duty_id.isnot(None)).all():
        s = staff_map.get(e.assigned_duty_id)
        if not s:
            continue
        if _is_non_working(e.day_type):
            s.total_holiday_duties += 1
        else:
            s.total_working_duties += 1


# ── core generation ───────────────────────────────────────────────────────────

def _generate_month_main_duties(db: Session, year: int, month: int):
    """
    Generate duty + standby for every calendar day in the month using the
    two-chain rule:

      working chain   → advances on every weekday
      holiday chain   → advances on every weekend / public holiday

    Chain advance: after each assignment, the pointer moves to the standby's
    index so that standby-today == duty-tomorrow (within the same chain).
    """
    start_date, end_date = _month_bounds(year, month)
    all_staff = _get_active_staff(db)
    if not all_staff:
        _log_remark(db, "No active staff found. Cannot generate roster.", "error")
        db.commit()
        return

    initialize_month(db, year, month)

    # Clear this month's assignments
    db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).update({
        "assigned_duty_id": None,
        "assigned_standby_id": None,
        "status": StatusEnum.PENDING,
        "remarks": None,
    })
    db.commit()

    # Determine chain start positions from all prior months
    historical = db.query(Calendar).filter(
        Calendar.date < start_date,
        Calendar.assigned_duty_id.isnot(None),
    ).order_by(Calendar.date).all()

    working_idx = _get_chain_start(historical, all_staff, non_working=False)
    holiday_idx = _get_chain_start(historical, all_staff, non_working=True)

    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()

    n = len(all_staff)

    for entry in entries:
        _normalize_day_type(entry)
        is_nw = _is_non_working(entry.day_type)
        current_idx = holiday_idx if is_nw else working_idx
        debt_attr = "holiday_debt" if is_nw else "working_debt"

        # ── 1. Find DUTY ───────────────────────────────────────────────────
        duty, duty_idx, skipped = _pick_from_chain(
            all_staff, current_idx, entry.date, db
        )

        if duty is None:
            entry.status = StatusEnum.VACANT
            entry.remarks = "No eligible staff available"
            _log_remark(
                db, f"No eligible staff on {entry.date}.", "error", entry.date
            )
            db.flush()
            continue

        # Increment debt for staff skipped due to unavailability
        for s in skipped:
            setattr(s, debt_attr, getattr(s, debt_attr, 0) + 1)
            s.duty_debt = (
                getattr(s, "working_debt", 0) + getattr(s, "holiday_debt", 0)
            )
        if skipped:
            _log_remark(
                db,
                f"Duty chain adjusted on {entry.date} — "
                f"{len(skipped)} staff skipped.",
                "warning",
                entry.date,
            )

        # ── 2. Find STANDBY (next in chain after duty) ─────────────────────
        standby, standby_idx, _ = _pick_from_chain(
            all_staff,
            (duty_idx + 1) % n,
            entry.date,
            db,
            exclude_id=duty.id,
        )
        if standby is None and n > 1:
            _log_remark(
                db,
                f"No eligible standby on {entry.date}.",
                "warning",
                entry.date,
            )

        # ── 3. Assign ──────────────────────────────────────────────────────
        entry.assigned_duty_id = duty.id
        entry.assigned_standby_id = standby.id if standby else None
        entry.status = StatusEnum.ASSIGNED
        entry.remarks = None

        # Reduce duty debt for the assigned person
        if getattr(duty, debt_attr, 0) > 0:
            setattr(duty, debt_attr, getattr(duty, debt_attr) - 1)
            duty.duty_debt = (
                getattr(duty, "working_debt", 0) + getattr(duty, "holiday_debt", 0)
            )

        # ── 4. Advance chain pointer ───────────────────────────────────────
        # Chain rule: standby's index is the next duty start
        next_idx = standby_idx if standby else (duty_idx + 1) % n
        if is_nw:
            holiday_idx = next_idx
        else:
            working_idx = next_idx

        db.flush()


# ── public API ────────────────────────────────────────────────────────────────

def _latest_generated_month(db: Session) -> Optional[Tuple[int, int]]:
    latest = (
        db.query(Calendar)
        .filter(Calendar.assigned_duty_id.isnot(None))
        .order_by(Calendar.date.desc())
        .first()
    )
    if not latest:
        return None
    return latest.date.year, latest.date.month


def regenerate_from_month(db: Session, year: int, month: int):
    """Re-generate this month (and any later already-generated months)."""
    latest = _latest_generated_month(db)
    end_year, end_month = latest if latest else (year, month)
    if (end_year, end_month) < (year, month):
        end_year, end_month = year, month

    for y, m in _iter_months(year, month, end_year, end_month):
        _generate_month_main_duties(db, y, m)

    _recompute_staff_counters(db)
    db.commit()


def generate_roster(
    db: Session, year: int, month: int, force: bool = False
) -> List[Calendar]:
    regenerate_from_month(db, year, month)
    start, end = _month_bounds(year, month)
    return (
        db.query(Calendar)
        .filter(Calendar.date >= start, Calendar.date <= end)
        .order_by(Calendar.date)
        .all()
    )


def heal_roster(db: Session, year: int, month: int) -> List[Calendar]:
    """
    Auto-heal: if a duty person is now unavailable, the chain skips them
    and whoever would have been standby closes up on duty automatically.
    This is achieved by simply regenerating from this month forward.
    """
    today = date.today()
    start, end = _month_bounds(year, month)
    initialize_month(db, year, month)

    # Credit duty_debt for past entries where duty is now unavailable
    for entry in db.query(Calendar).filter(
        Calendar.date >= start,
        Calendar.date < today,
        Calendar.assigned_duty_id.isnot(None),
    ).all():
        staff = db.query(Staff).get(entry.assigned_duty_id)
        if staff and not _is_staff_available(staff, entry.date, db):
            attr = "holiday_debt" if _is_non_working(entry.day_type) else "working_debt"
            setattr(staff, attr, getattr(staff, attr, 0) + 1)
            staff.duty_debt = (
                getattr(staff, "working_debt", 0) + getattr(staff, "holiday_debt", 0)
            )
            _log_remark(
                db,
                f"{staff.name} missed duty on {entry.date} — debt credited.",
                "info",
                entry.date,
            )

    regenerate_from_month(db, year, month)
    return (
        db.query(Calendar)
        .filter(Calendar.date >= start, Calendar.date <= end)
        .order_by(Calendar.date)
        .all()
    )


def _validate_roster_window(db: Session, start_date: date, end_date: date):
    """Basic sanity checks: availability and duty ≠ standby."""
    for entry in db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all():
        if not entry.assigned_duty_id:
            continue
        duty = db.query(Staff).get(entry.assigned_duty_id)
        if duty and not _is_staff_available(duty, entry.date, db):
            raise ValueError(f"{duty.name} is not available on {entry.date}.")
        if entry.assigned_standby_id:
            if entry.assigned_standby_id == entry.assigned_duty_id:
                raise ValueError(
                    f"Duty and standby are the same person on {entry.date}."
                )
            standby = db.query(Staff).get(entry.assigned_standby_id)
            if standby and not _is_staff_available(standby, entry.date, db):
                raise ValueError(
                    f"{standby.name} is not available for standby on {entry.date}."
                )


def _reassign_standby(db: Session, entry: Calendar):
    """Pick a fresh standby for a single entry (after a manual swap)."""
    if not entry.assigned_duty_id:
        entry.assigned_standby_id = None
        return
    all_staff = _get_active_staff(db)
    duty_idx = _find_staff_index(all_staff, entry.assigned_duty_id)
    start = 0 if duty_idx is None else (duty_idx + 1) % len(all_staff)
    standby, _, _ = _pick_from_chain(
        all_staff, start, entry.date, db, exclude_id=entry.assigned_duty_id
    )
    entry.assigned_standby_id = standby.id if standby else None


def swap_roster_dates(
    db: Session,
    first_date: date,
    second_date: date,
    reason: Optional[str] = None,
):
    if (first_date.year, first_date.month) != (second_date.year, second_date.month):
        raise ValueError("Swaps must be within the same month.")

    first = db.query(Calendar).filter(Calendar.date == first_date).first()
    second = db.query(Calendar).filter(Calendar.date == second_date).first()
    if not first or not second:
        raise ValueError("Both roster dates must exist.")
    if not first.assigned_duty_id or not second.assigned_duty_id:
        raise ValueError("Both dates must have assigned duty staff.")

    first_staff_before = db.query(Staff).get(first.assigned_duty_id)
    second_staff_before = db.query(Staff).get(second.assigned_duty_id)
    if first_staff_before and not _is_staff_available(
        first_staff_before, second_date, db
    ):
        raise ValueError(
            f"{first_staff_before.name} is not available on {second_date}."
        )
    if second_staff_before and not _is_staff_available(
        second_staff_before, first_date, db
    ):
        raise ValueError(
            f"{second_staff_before.name} is not available on {first_date}."
        )

    first_id_before = first.assigned_duty_id
    second_id_before = second.assigned_duty_id

    first.assigned_duty_id, second.assigned_duty_id = (
        second.assigned_duty_id,
        first.assigned_duty_id,
    )
    first.assigned_standby_id = None
    second.assigned_standby_id = None
    first.status = StatusEnum.MODIFIED
    second.status = StatusEnum.MODIFIED
    if reason:
        first.remarks = reason
        second.remarks = reason

    _reassign_standby(db, first)
    _reassign_standby(db, second)
    db.flush()

    _validate_roster_window(
        db, min(first_date, second_date), max(first_date, second_date)
    )
    _recompute_staff_counters(db)

    fs = db.query(Staff).get(first.assigned_duty_id)
    ss = db.query(Staff).get(second.assigned_duty_id)
    fs_name = fs.name if fs else f"#{first.assigned_duty_id}"
    ss_name = ss.name if ss else f"#{second.assigned_duty_id}"
    db.add(SwapLog(
        first_date=first_date,
        second_date=second_date,
        first_staff_id_before=first_id_before,
        second_staff_id_before=second_id_before,
        first_staff_id_after=first.assigned_duty_id,
        second_staff_id_after=second.assigned_duty_id,
        reason=reason,
    ))
    _log_remark(
        db,
        f"{fs_name} and {ss_name} swapped between {first_date} and {second_date}."
        + (f" Reason: {reason}." if reason else ""),
        "info",
        min(first_date, second_date),
    )
    db.commit()


def get_audit_report(db: Session, year: int, month: int) -> dict:
    start, end = _month_bounds(year, month)
    all_staff = db.query(Staff).filter(Staff.active == True).all()
    stats = []
    for staff in all_staff:
        working = db.query(Calendar).filter(
            Calendar.date >= start,
            Calendar.date <= end,
            Calendar.assigned_duty_id == staff.id,
            Calendar.day_type == DayTypeEnum.WORKING,
        ).count()
        holiday = db.query(Calendar).filter(
            Calendar.date >= start,
            Calendar.date <= end,
            Calendar.assigned_duty_id == staff.id,
            Calendar.day_type.in_([DayTypeEnum.WEEKEND, DayTypeEnum.HOLIDAY]),
        ).count()
        stats.append({
            "staff": staff,
            "working_duties": working,
            "holiday_duties": holiday,
            "total_duties": working + holiday,
        })

    if not stats:
        return {
            "month": month, "year": year, "stats": [],
            "max_duties": 0, "min_duties": 0,
            "variance": 0, "imbalance_warning": False,
        }

    totals = [r["total_duties"] for r in stats]
    max_d, min_d = max(totals), min(totals)
    return {
        "month": month,
        "year": year,
        "stats": stats,
        "max_duties": max_d,
        "min_duties": min_d,
        "variance": max_d - min_d,
        "imbalance_warning": (max_d - min_d) > 2,
    }
