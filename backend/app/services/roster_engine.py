"""
DutySync Master - Roster Generation Engine
Implements fair sequential rotation with independent working and non-working queues.
"""
from collections import defaultdict
from datetime import date, timedelta
from math import ceil
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


def _log_remark(db: Session, message: str, level: str = "info", date_ref: Optional[date] = None):
    existing = db.query(RemarkLog).filter(
        RemarkLog.message == message,
        RemarkLog.level == level,
        RemarkLog.date_ref == date_ref,
    ).first()
    if existing:
        return
    db.add(RemarkLog(message=message, level=level, date_ref=date_ref))


def _month_bounds(year: int, month: int) -> Tuple[date, date]:
    _, days_in_month = cal_module.monthrange(year, month)
    return date(year, month, 1), date(year, month, days_in_month)


def _iter_months(start_year: int, start_month: int, end_year: int, end_month: int):
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        yield year, month
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1


def _is_weekend(d: date) -> bool:
    return d.weekday() >= 5


def _is_non_working(day_type: DayTypeEnum) -> bool:
    return day_type in (DayTypeEnum.WEEKEND, DayTypeEnum.HOLIDAY)


def _gap_days(db: Session) -> int:
    settings = _get_settings(db)
    return max(1, ceil(max(settings.gap_hours, 1) / 24))


def _normalize_day_type(entry: Calendar):
    if entry.is_holiday:
        entry.day_type = DayTypeEnum.HOLIDAY
    elif entry.day_type == DayTypeEnum.HOLIDAY:
        entry.day_type = DayTypeEnum.WEEKEND if _is_weekend(entry.date) else DayTypeEnum.WORKING


def _get_settings(db: Session) -> RosterSettings:
    settings = db.query(RosterSettings).first()
    if not settings:
        settings = RosterSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _get_active_staff(db: Session) -> List[Staff]:
    return db.query(Staff).filter(Staff.active == True).order_by(Staff.id).all()


def _get_month_unavailability_load(target_date: date, db: Session) -> float:
    start_date, end_date = _month_bounds(target_date.year, target_date.month)
    active_staff_count = db.query(Staff).filter(Staff.active == True).count()
    if active_staff_count == 0:
        return 0.0

    records = db.query(Availability).filter(
        Availability.start_date <= end_date,
        Availability.end_date >= start_date,
    ).all()

    unavailable_days = 0
    for record in records:
        overlap_start = max(record.start_date, start_date)
        overlap_end = min(record.end_date, end_date)
        unavailable_days += (overlap_end - overlap_start).days + 1

    _, days_in_month = cal_module.monthrange(target_date.year, target_date.month)
    capacity = days_in_month * active_staff_count
    return unavailable_days / capacity if capacity else 0.0


def _is_comfortable_month(target_date: date, db: Session) -> bool:
    settings = _get_settings(db)
    return _get_month_unavailability_load(target_date, db) <= (settings.comfort_unavailability_threshold / 100)


def _get_rejoin_buffer_days(record: Availability, target_date: date, db: Session) -> int:
    settings = _get_settings(db)
    availability_type = getattr(record, "availability_type", AvailabilityTypeEnum.LEAVE) or AvailabilityTypeEnum.LEAVE
    if availability_type == AvailabilityTypeEnum.LEAVE:
        return settings.leave_rejoin_buffer_days

    threshold = settings.comfort_unavailability_threshold / 100
    if _get_month_unavailability_load(target_date, db) <= threshold:
        return settings.official_duty_comfort_buffer_days
    return settings.official_duty_min_buffer_days


def _is_staff_available(staff: Staff, d: date, db: Session) -> bool:
    if getattr(staff, "join_date", None) and d < staff.join_date:
        return False
    if getattr(staff, "relieve_date", None) and d > staff.relieve_date:
        return False

    overlapping = db.query(Availability).filter(
        Availability.staff_id == staff.id,
        Availability.start_date <= d,
        Availability.end_date >= d,
    ).first()
    if overlapping is not None:
        return False

    recent_records = db.query(Availability).filter(
        Availability.staff_id == staff.id,
        Availability.end_date < d,
    ).all()
    for record in recent_records:
        cooldown_days = _get_rejoin_buffer_days(record, d, db)
        if cooldown_days <= 0:
            continue
        eligible_from = record.end_date + timedelta(days=cooldown_days + 1)
        if d < eligible_from:
            return False
    return True


def _had_sunday_last_month(staff: Staff, d: date, db: Session) -> bool:
    if d.weekday() != 6:
        return False

    prev_year = d.year if d.month > 1 else d.year - 1
    prev_month = d.month - 1 if d.month > 1 else 12
    prev_start, prev_end = _month_bounds(prev_year, prev_month)

    return db.query(Calendar).filter(
        Calendar.date >= prev_start,
        Calendar.date <= prev_end,
        Calendar.assigned_duty_id == staff.id,
        Calendar.date.in_([
            prev_start + timedelta(days=offset)
            for offset in range((prev_end - prev_start).days + 1)
            if (prev_start + timedelta(days=offset)).weekday() == 6
        ]),
    ).first() is not None


def _had_duty_previous_day(staff: Staff, d: date, db: Session) -> bool:
    return _has_gap_conflict(db, staff.id, d, ignore_dates={d}, include_standby=False)


def _has_gap_conflict(
    db: Session,
    staff_id: int,
    target_date: date,
    ignore_dates: Optional[set[date]] = None,
    include_standby: bool = True,
) -> bool:
    ignore_dates = ignore_dates or set()
    gap_days = _gap_days(db)
    window_start = target_date - timedelta(days=gap_days)
    window_end = target_date + timedelta(days=gap_days)
    entries = db.query(Calendar).filter(
        Calendar.date >= window_start,
        Calendar.date <= window_end,
    ).all()
    for entry in entries:
        if entry.date == target_date or entry.date in ignore_dates:
            continue
        if entry.assigned_duty_id == staff_id:
            return True
        if include_standby and entry.assigned_standby_id == staff_id:
            return True
    return False


def _find_staff_index(staff_list: List[Staff], staff_id: Optional[int]) -> Optional[int]:
    if staff_id is None:
        return None
    for idx, staff in enumerate(staff_list):
        if staff.id == staff_id:
            return idx
    return None


def _get_start_index_for_pool(
    historical_entries: List[Calendar],
    staff_pool: List[Staff],
    non_working: bool,
) -> int:
    if not staff_pool:
        return 0

    relevant_entries = [
        entry for entry in historical_entries
        if entry.assigned_duty_id and _is_non_working(entry.day_type) == non_working
    ]
    if not relevant_entries:
        return 0

    last_entry = relevant_entries[-1]
    
    # Priority 1: Next Duty should be the last Standby (if Standby was assigned and exists)
    standby_idx = _find_staff_index(staff_pool, last_entry.assigned_standby_id)
    if standby_idx is not None:
        return standby_idx

    # Priority 2: If no Standby was assigned, just pick the next index after the last Duty
    duty_idx = _find_staff_index(staff_pool, last_entry.assigned_duty_id)
    if duty_idx is None:
        return 0
    return (duty_idx + 1) % len(staff_pool)


def initialize_month(db: Session, year: int, month: int):
    start_date, end_date = _month_bounds(year, month)
    existing = {
        row.date for row in db.query(Calendar.date).filter(
            Calendar.date >= start_date,
            Calendar.date <= end_date,
        ).all()
    }

    for day in range(1, end_date.day + 1):
        d = date(year, month, day)
        if d in existing:
            continue
        day_type = DayTypeEnum.WEEKEND if _is_weekend(d) else DayTypeEnum.WORKING
        db.add(Calendar(date=d, day_type=day_type, is_holiday=False, status=StatusEnum.PENDING))
    db.commit()


def _recompute_staff_counters(db: Session):
    all_staff = db.query(Staff).all()
    for staff in all_staff:
        staff.total_working_duties = 0
        staff.total_holiday_duties = 0
        staff.duty_debt = getattr(staff, "working_debt", 0) + getattr(staff, "holiday_debt", 0)

    assigned_entries = db.query(Calendar).filter(Calendar.assigned_duty_id.isnot(None)).all()
    staff_map = {staff.id: staff for staff in all_staff}
    for entry in assigned_entries:
        staff = staff_map.get(entry.assigned_duty_id)
        if not staff:
            continue
        if _is_non_working(entry.day_type):
            staff.total_holiday_duties += 1
        else:
            staff.total_working_duties += 1


def _pick_duty_and_standby(
    staff_pool: List[Staff],
    start_index: int,
    d: date,
    db: Session,
    debt_attr: str,
    month_counts: dict[int, int],
) -> Tuple[Optional[Staff], Optional[Staff], int, int]:
    """Returns (Duty_Candidate, Standby_Candidate, Next_Queue_Idx, Skipped_Staff_Count)"""
    if not staff_pool:
        return None, None, start_index, 0

    n = len(staff_pool)
    skipped = 0
    skipped_unavailable = []
    
    # 1. FIND DUTY
    duty_candidate = None
    duty_idx = -1
    
    for offset in range(n):
        idx = (start_index + offset) % n
        candidate = staff_pool[idx]
        
        if not candidate.active:
            skipped += 1
            continue
            
        if not _is_staff_available(candidate, d, db):
            skipped += 1
            skipped_unavailable.append(candidate)
            continue
            
        if _had_duty_previous_day(candidate, d, db):
            # 24-hour gap rule prevents Duty->Duty (Standby doesn't trigger this here because it uses ignore_standby=False optionally, 
            # but _had_duty_previous_day checks if they specifically did Duty. Note that the original logic included both).
            # We strictly enforce 24hr gap.
            skipped += 1
            continue
            
        # We found our Duty!
        duty_candidate = candidate
        duty_idx = idx
        break

    if not duty_candidate:
        # Resolve debts for skipped people
        for staff in skipped_unavailable:
            setattr(staff, debt_attr, getattr(staff, debt_attr, 0) + 1)
            staff.duty_debt = getattr(staff, "working_debt", 0) + getattr(staff, "holiday_debt", 0)
        return None, None, start_index, skipped

    # 2. FIND STANDBY
    # Start looking strictly after the duty_idx
    standby_candidate = None
    standby_idx = -1
    standby_start = (duty_idx + 1) % n
    
    for offset in range(n):
        idx = (standby_start + offset) % n
        candidate = staff_pool[idx]
        
        # Don't pick the same person as Duty
        if candidate.id == duty_candidate.id:
            continue
            
        if not candidate.active:
            continue
            
        if not _is_staff_available(candidate, d, db):
            continue
            
        # Gap Rule Check for Standby (Standby must also not violate the gap rule)
        if _has_gap_conflict(db, candidate.id, d, ignore_dates={d}, include_standby=True):
            continue
            
        standby_candidate = candidate
        standby_idx = idx
        break

    # If we couldn't find a standby that passes the gap rule, it will stay None.
    # The next day's start idx should optimally be the Standby. If Standby is None, it's duty + 1
    next_start_idx = standby_idx if standby_candidate else (duty_idx + 1) % n

    # Record debts for those skipped to get Duty
    for staff in skipped_unavailable:
        setattr(staff, debt_attr, getattr(staff, debt_attr, 0) + 1)
        staff.duty_debt = getattr(staff, "working_debt", 0) + getattr(staff, "holiday_debt", 0)

    return duty_candidate, standby_candidate, next_start_idx, skipped


def _build_month_staff_counts(entries: List[Calendar]) -> Dict[int, dict]:
    counts: Dict[int, dict] = defaultdict(lambda: {
        "working": 0,
        "holiday": 0,
        "routine": 0,
        "total": 0,
    })
    for entry in entries:
        if not entry.assigned_duty_id:
            continue
        row = counts[entry.assigned_duty_id]
        if _is_non_working(entry.day_type):
            row["holiday"] += 1
            if entry.date.weekday() in (5, 6):
                row["routine"] += 1
        else:
            row["working"] += 1
        row["total"] += 1
    return counts


def _burden_key(counts: dict) -> Tuple[int, int, int, int]:
    return (
        counts["routine"],
        counts["holiday"],
        counts["total"],
        counts["working"],
    )


def _empty_counts() -> dict:
    return {"working": 0, "holiday": 0, "routine": 0, "total": 0}


def _metric_range(counts: Dict[int, dict], staff_ids: List[int], key: str) -> int:
    values = [counts.get(staff_id, _empty_counts())[key] for staff_id in staff_ids]
    return max(values) - min(values) if values else 0


def _apply_entry_transfer(counts: Dict[int, dict], donor_id: int, receiver_id: int, entry: Calendar) -> Dict[int, dict]:
    updated = {
        staff_id: row.copy()
        for staff_id, row in counts.items()
    }
    updated.setdefault(donor_id, _empty_counts())
    updated.setdefault(receiver_id, _empty_counts())

    updated[donor_id]["total"] -= 1
    updated[receiver_id]["total"] += 1

    if _is_non_working(entry.day_type):
        updated[donor_id]["holiday"] -= 1
        updated[receiver_id]["holiday"] += 1
        if entry.date.weekday() in (5, 6):
            updated[donor_id]["routine"] -= 1
            updated[receiver_id]["routine"] += 1
    else:
        updated[donor_id]["working"] -= 1
        updated[receiver_id]["working"] += 1

    return updated


def _can_take_working_day(db: Session, staff: Staff, entry: Calendar) -> bool:
    if not staff.active or not _is_staff_available(staff, entry.date, db):
        return False
    return not _has_gap_conflict(db, staff.id, entry.date, ignore_dates={entry.date}, include_standby=False)


def _can_take_non_working_day(db: Session, staff: Staff, entry: Calendar) -> bool:
    if not staff.active or not _is_staff_available(staff, entry.date, db):
        return False
    return not _has_gap_conflict(db, staff.id, entry.date, ignore_dates={entry.date}, include_standby=False)


def _pick_standby_for_entry(db: Session, entry: Calendar, staff_pool: List[Staff]) -> Optional[int]:
    if not entry.assigned_duty_id or not staff_pool:
        return None

    duty_idx = _find_staff_index(staff_pool, entry.assigned_duty_id)
    start_idx = 0 if duty_idx is None else (duty_idx + 1) % len(staff_pool)

    for offset in range(len(staff_pool)):
        idx = (start_idx + offset) % len(staff_pool)
        candidate = staff_pool[idx]
        if not candidate.active or candidate.id == entry.assigned_duty_id:
            continue
        if not _is_staff_available(candidate, entry.date, db):
            continue
        if _has_gap_conflict(db, candidate.id, entry.date, ignore_dates={entry.date}, include_standby=True):
            continue
        return candidate.id

    return None


def _rebalance_working_month(db: Session, year: int, month: int):
    if not _is_comfortable_month(date(year, month, 1), db):
        return

    # SessionLocal disables autoflush, so push freshly generated assignments
    # before querying the month for balancing decisions.
    db.flush()

    start_date, end_date = _month_bounds(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
        Calendar.assigned_duty_id.isnot(None),
    ).order_by(Calendar.date).all()
    staff_by_id = {staff.id: staff for staff in _get_active_staff(db)}
    if len(staff_by_id) < 2:
        return

    changed = True
    while changed:
        changed = False
        counts = _build_month_staff_counts(entries)
        for entry in entries:
            if entry.day_type != DayTypeEnum.WORKING or not entry.assigned_duty_id:
                continue

            donor = staff_by_id.get(entry.assigned_duty_id)
            if donor is None:
                continue
            donor_counts = counts.get(donor.id, _empty_counts())

            candidates: List[Tuple[Tuple[int, int, int, int], Staff]] = []
            for staff in staff_by_id.values():
                if staff.id == donor.id:
                    continue
                receiver_counts = counts.get(staff.id, _empty_counts())
                if donor_counts["working"] - receiver_counts["working"] < 1:
                    continue
                if _burden_key(donor_counts) <= _burden_key(receiver_counts):
                    continue
                if not _can_take_working_day(db, staff, entry):
                    continue
                candidates.append((_burden_key(receiver_counts), staff))

            if not candidates:
                continue

            candidates.sort(key=lambda item: item[0])
            receiver = candidates[0][1]
            receiver_counts = counts.get(receiver.id, _empty_counts())
            if donor_counts["holiday"] <= receiver_counts["holiday"] and donor_counts["total"] - receiver_counts["total"] < 2:
                continue

            entry.assigned_duty_id = receiver.id
            entry.assigned_standby_id = None
            entry.status = StatusEnum.MODIFIED
            entry.remarks = (
                f"Balanced working-day reassignment from {donor.name} to {receiver.name}."
            )
            _log_remark(
                db,
                f"Working-day duty on {entry.date} shifted from {donor.name} to {receiver.name} to balance monthly burden.",
                "info",
                entry.date,
            )
            changed = True
            break


def _rebalance_non_working_month(db: Session, year: int, month: int):
    if not _is_comfortable_month(date(year, month, 1), db):
        return

    db.flush()

    start_date, end_date = _month_bounds(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
        Calendar.assigned_duty_id.isnot(None),
    ).order_by(Calendar.date).all()
    staff_by_id = {staff.id: staff for staff in _get_active_staff(db)}
    if len(staff_by_id) < 2:
        return

    changed = True
    while changed:
        changed = False
        counts = _build_month_staff_counts(entries)
        for entry in entries:
            if not _is_non_working(entry.day_type) or not entry.assigned_duty_id:
                continue

            donor = staff_by_id.get(entry.assigned_duty_id)
            if donor is None:
                continue

            donor_counts = counts.get(donor.id, _empty_counts())
            donor_routine = 1 if entry.date.weekday() in (5, 6) else 0

            candidates: List[Tuple[Tuple[int, int, int, int], Staff]] = []
            for staff in staff_by_id.values():
                if staff.id == donor.id:
                    continue

                receiver_counts = counts.get(staff.id, _empty_counts())
                holiday_gap = donor_counts["holiday"] - receiver_counts["holiday"]
                routine_gap = donor_counts["routine"] - receiver_counts["routine"]

                if holiday_gap < 1:
                    continue
                if donor_routine and routine_gap < 1:
                    continue
                if _burden_key(donor_counts) <= _burden_key(receiver_counts):
                    continue
                if not _can_take_non_working_day(db, staff, entry):
                    continue

                candidates.append((_burden_key(receiver_counts), staff))

            if not candidates:
                continue

            candidates.sort(key=lambda item: item[0])
            receiver = candidates[0][1]
            receiver_counts = counts.get(receiver.id, _empty_counts())

            if donor_counts["holiday"] - receiver_counts["holiday"] < 2:
                continue
            if donor_routine and donor_counts["routine"] - receiver_counts["routine"] < 1:
                continue

            entry.assigned_duty_id = receiver.id
            entry.assigned_standby_id = None
            entry.status = StatusEnum.MODIFIED
            entry.remarks = (
                f"Balanced non-working reassignment from {donor.name} to {receiver.name}."
            )
            _log_remark(
                db,
                f"Non-working duty on {entry.date} shifted from {donor.name} to {receiver.name} to balance monthly burden.",
                "info",
                entry.date,
            )
            changed = True
            break


def _rebalance_month_totals(db: Session, year: int, month: int):
    db.flush()

    start_date, end_date = _month_bounds(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
        Calendar.assigned_duty_id.isnot(None),
    ).order_by(Calendar.date).all()
    staff_by_id = {staff.id: staff for staff in _get_active_staff(db)}
    staff_ids = list(staff_by_id.keys())
    if len(staff_ids) < 2:
        return

    changed = True
    while changed:
        changed = False
        counts = _build_month_staff_counts(entries)
        total_range = _metric_range(counts, staff_ids, "total")
        holiday_range = _metric_range(counts, staff_ids, "holiday")
        routine_range = _metric_range(counts, staff_ids, "routine")
        working_range = _metric_range(counts, staff_ids, "working")
        if total_range <= 1:
            return

        ordered_entries = sorted(
            entries,
            key=lambda entry: (_is_non_working(entry.day_type), entry.date),
        )

        for entry in ordered_entries:
            donor_id = entry.assigned_duty_id
            donor = staff_by_id.get(donor_id)
            if donor is None:
                continue

            donor_counts = counts.get(donor.id, _empty_counts())
            receivers = sorted(
                (staff for staff in staff_by_id.values() if staff.id != donor.id),
                key=lambda staff: _burden_key(counts.get(staff.id, _empty_counts())),
            )

            for receiver in receivers:
                receiver_counts = counts.get(receiver.id, _empty_counts())
                if donor_counts["total"] - receiver_counts["total"] < 2:
                    continue

                if _is_non_working(entry.day_type):
                    if not _can_take_non_working_day(db, receiver, entry):
                        continue
                else:
                    if not _can_take_working_day(db, receiver, entry):
                        continue

                updated = _apply_entry_transfer(counts, donor.id, receiver.id, entry)
                new_total_range = _metric_range(updated, staff_ids, "total")
                new_holiday_range = _metric_range(updated, staff_ids, "holiday")
                new_routine_range = _metric_range(updated, staff_ids, "routine")
                new_working_range = _metric_range(updated, staff_ids, "working")

                if new_total_range >= total_range:
                    continue
                if new_holiday_range > holiday_range:
                    continue
                if new_routine_range > routine_range:
                    continue
                if new_working_range > working_range:
                    continue

                entry.assigned_duty_id = receiver.id
                entry.assigned_standby_id = None
                entry.status = StatusEnum.MODIFIED
                entry.remarks = (
                    f"Balanced total-duty reassignment from {donor.name} to {receiver.name}."
                )
                _log_remark(
                    db,
                    f"Duty on {entry.date} shifted from {donor.name} to {receiver.name} to reduce monthly total variance.",
                    "info",
                    entry.date,
                )
                changed = True
                break

            if changed:
                break


def _generate_month_main_duties(db: Session, year: int, month: int):
    start_date, end_date = _month_bounds(year, month)
    settings = _get_settings(db)
    all_staff = _get_active_staff(db)
    if not all_staff:
        _log_remark(db, "No active staff found. Cannot generate roster.", "error")
        db.commit()
        return

    initialize_month(db, year, month)

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

    working_staff = list(all_staff)
    holiday_staff = list(all_staff)
    historical_entries = db.query(Calendar).filter(
        Calendar.date < start_date,
        Calendar.assigned_duty_id.isnot(None),
    ).order_by(Calendar.date).all()

    working_idx = _get_start_index_for_pool(historical_entries, working_staff, non_working=False)
    holiday_idx = _get_start_index_for_pool(historical_entries, holiday_staff, non_working=True)

    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()
    month_total_counts: dict[int, int] = {}

    for entry in entries:
        _normalize_day_type(entry)
        is_non_work = _is_non_working(entry.day_type)
        staff_pool = holiday_staff if is_non_work else working_staff
        current_idx = holiday_idx if is_non_work else working_idx
        debt_attr = "holiday_debt" if is_non_work else "working_debt"

        available_count = sum(
            1 for staff in staff_pool
            if staff.active and _is_staff_available(staff, entry.date, db) and not _had_duty_previous_day(staff, entry.date, db)
        )
        if available_count < 2:
            _log_remark(
                db,
                f"Only {available_count} staff available on {entry.date.strftime('%b %d')} - standby may be missing.",
                "warning",
                entry.date,
            )

        duty_staff, standby_staff, next_idx, skipped = _pick_duty_and_standby(
            staff_pool,
            current_idx,
            entry.date,
            db,
            debt_attr,
            month_total_counts,
        )
        if duty_staff is None:
            entry.assigned_duty_id = None
            entry.assigned_standby_id = None
            entry.status = StatusEnum.VACANT
            entry.remarks = "No eligible staff available"
            _log_remark(db, f"No eligible staff available on {entry.date}.", "error", entry.date)
            continue

        if skipped > 0:
            _log_remark(
                db,
                f"Duty sequence adjusted on {entry.date.strftime('%b %d')} - {skipped} staff skipped.",
                "warning",
                entry.date,
            )

        entry.assigned_duty_id = duty_staff.id
        entry.assigned_standby_id = standby_staff.id if standby_staff else None
        entry.status = StatusEnum.ASSIGNED
        entry.remarks = None

        if getattr(duty_staff, debt_attr, 0) > 0:
            setattr(duty_staff, debt_attr, getattr(duty_staff, debt_attr) - 1)
        duty_staff.duty_debt = getattr(duty_staff, "working_debt", 0) + getattr(duty_staff, "holiday_debt", 0)
        month_total_counts[duty_staff.id] = month_total_counts.get(duty_staff.id, 0) + 1

        if is_non_work:
            holiday_idx = next_idx
        else:
            working_idx = next_idx

    if not settings.auto_assign_standby:
        db.query(Calendar).filter(
            Calendar.date >= start_date,
            Calendar.date <= end_date,
        ).update({"assigned_standby_id": None})


def _assign_standby_for_range(db: Session, start_date: date, end_date: date):
    # This logic is no longer strictly used as a post-generation pass because 
    # Standby is decided atomically with Duty to enforce the "Tomorrow's Duty = Today's Standby" chain.
    # However, if swap adjustments happen and we clear standbys, we can heal them here.
    # Missing standbys can be manually re-healed by fetching the next available person.
    db.flush()
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()
    all_staff = _get_active_staff(db)
    working_staff = list(all_staff)
    holiday_staff = list(all_staff)

    for entry in entries:
        if not entry.assigned_duty_id:
            entry.assigned_standby_id = None
            continue
        
        if not entry.assigned_standby_id:
            staff_pool = holiday_staff if _is_non_working(entry.day_type) else working_staff
            standby_id = _pick_standby_for_entry(db, entry, staff_pool)
            entry.assigned_standby_id = standby_id
            db.flush()
            if standby_id is None:
                _log_remark(
                    db,
                    f"No eligible standby available on {entry.date}.",
                    "error",
                    entry.date,
                )


def _latest_generated_month(db: Session) -> Optional[Tuple[int, int]]:
    latest = db.query(Calendar).filter(Calendar.assigned_duty_id.isnot(None)).order_by(Calendar.date.desc()).first()
    if not latest:
        return None
    return latest.date.year, latest.date.month


def regenerate_from_month(db: Session, year: int, month: int):
    latest = _latest_generated_month(db)
    end_year, end_month = latest if latest else (year, month)
    if (end_year, end_month) < (year, month):
        end_year, end_month = year, month

    for current_year, current_month in _iter_months(year, month, end_year, end_month):
        _generate_month_main_duties(db, current_year, current_month)
        for _ in range(3):
            _rebalance_working_month(db, current_year, current_month)
            _rebalance_non_working_month(db, current_year, current_month)
            _rebalance_month_totals(db, current_year, current_month)

    start_date, _ = _month_bounds(year, month)
    _, end_date = _month_bounds(end_year, end_month)
    _assign_standby_for_range(db, start_date, end_date)
    _recompute_staff_counters(db)
    db.commit()


def _validate_roster_window(db: Session, start_date: date, end_date: date):
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()
    for entry in entries:
        if not entry.assigned_duty_id:
            continue
        duty_staff = db.query(Staff).get(entry.assigned_duty_id)
        if duty_staff and not _is_staff_available(duty_staff, entry.date, db):
            raise ValueError(f"{duty_staff.name} is not available on {entry.date}.")
        if _has_gap_conflict(db, entry.assigned_duty_id, entry.date, ignore_dates={entry.date}, include_standby=False):
            raise ValueError(f"Duty assignment on {entry.date} breaks the configured gap rule.")
        if entry.assigned_standby_id:
            if entry.assigned_standby_id == entry.assigned_duty_id:
                raise ValueError(f"Duty and standby cannot be the same person on {entry.date}.")
            standby_staff = db.query(Staff).get(entry.assigned_standby_id)
            if standby_staff and not _is_staff_available(standby_staff, entry.date, db):
                raise ValueError(f"{standby_staff.name} is not available for standby on {entry.date}.")
            if _has_gap_conflict(db, entry.assigned_standby_id, entry.date, ignore_dates={entry.date}, include_standby=True):
                raise ValueError(f"Standby assignment on {entry.date} breaks the configured gap rule.")


def swap_roster_dates(db: Session, first_date: date, second_date: date, reason: Optional[str] = None):
    if (first_date.year, first_date.month) != (second_date.year, second_date.month):
        raise ValueError("Swaps must be within the same month.")
    first = db.query(Calendar).filter(Calendar.date == first_date).first()
    second = db.query(Calendar).filter(Calendar.date == second_date).first()
    if not first or not second:
        raise ValueError("Both roster dates must exist.")
    if not first.assigned_duty_id or not second.assigned_duty_id:
        raise ValueError("Both dates must have assigned duty staff.")

    first_staff_id_before = first.assigned_duty_id
    second_staff_id_before = second.assigned_duty_id
    first_staff_before = db.query(Staff).get(first_staff_id_before)
    second_staff_before = db.query(Staff).get(second_staff_id_before)
    if first_staff_before and not _is_staff_available(first_staff_before, second_date, db):
        raise ValueError(f"{first_staff_before.name} is not available on {second_date}.")
    if second_staff_before and not _is_staff_available(second_staff_before, first_date, db):
        raise ValueError(f"{second_staff_before.name} is not available on {first_date}.")

    first.assigned_duty_id, second.assigned_duty_id = second.assigned_duty_id, first.assigned_duty_id
    first.status = StatusEnum.MODIFIED
    second.status = StatusEnum.MODIFIED
    if reason:
        first.remarks = reason
        second.remarks = reason

    start_date, end_date = _month_bounds(first_date.year, first_date.month)
    _assign_standby_for_range(db, start_date, end_date)
    _validate_roster_window(db, start_date, end_date)
    _recompute_staff_counters(db)

    first_staff = db.query(Staff).get(first.assigned_duty_id)
    second_staff = db.query(Staff).get(second.assigned_duty_id)
    first_name = first_staff.name if first_staff else f"Staff #{first.assigned_duty_id}"
    second_name = second_staff.name if second_staff else f"Staff #{second.assigned_duty_id}"
    reason_text = f" Reason: {reason}." if reason else ""
    db.add(SwapLog(
        first_date=first_date,
        second_date=second_date,
        first_staff_id_before=first_staff_id_before,
        second_staff_id_before=second_staff_id_before,
        first_staff_id_after=first.assigned_duty_id,
        second_staff_id_after=second.assigned_duty_id,
        reason=reason,
    ))
    _log_remark(
        db,
        f"{first_name} and {second_name} were mutually swapped between {first_date} and {second_date}.{reason_text}",
        "info",
        min(first_date, second_date),
    )
    db.commit()


def generate_roster(db: Session, year: int, month: int, force: bool = False) -> List[Calendar]:
    regenerate_from_month(db, year, month)
    start_date, end_date = _month_bounds(year, month)
    return db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()


def heal_roster(db: Session, year: int, month: int) -> List[Calendar]:
    today = date.today()
    start_date, end_date = _month_bounds(year, month)

    initialize_month(db, year, month)
    past_entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date < today,
    ).all()
    for entry in past_entries:
        if not entry.assigned_duty_id:
            continue
        staff = db.query(Staff).get(entry.assigned_duty_id)
        if not staff or _is_staff_available(staff, entry.date, db):
            continue
        if _is_non_working(entry.day_type):
            staff.holiday_debt = getattr(staff, "holiday_debt", 0) + 1
        else:
            staff.working_debt = getattr(staff, "working_debt", 0) + 1
        staff.duty_debt = getattr(staff, "working_debt", 0) + getattr(staff, "holiday_debt", 0)
        _log_remark(db, f"{staff.name} missed duty on {entry.date} - debt increased.", "info", entry.date)

    regenerate_from_month(db, year, month)
    return db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()


def get_audit_report(db: Session, year: int, month: int) -> dict:
    start_date, end_date = _month_bounds(year, month)
    all_staff = db.query(Staff).filter(Staff.active == True).all()
    stats = []

    for staff in all_staff:
        working = db.query(Calendar).filter(
            Calendar.date >= start_date,
            Calendar.date <= end_date,
            Calendar.assigned_duty_id == staff.id,
            Calendar.day_type == DayTypeEnum.WORKING,
        ).count()
        holiday = db.query(Calendar).filter(
            Calendar.date >= start_date,
            Calendar.date <= end_date,
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
        return {"month": month, "year": year, "stats": [], "variance": 0, "imbalance_warning": False}

    totals = [row["total_duties"] for row in stats]
    max_d = max(totals) if totals else 0
    min_d = min(totals) if totals else 0
    return {
        "month": month,
        "year": year,
        "stats": stats,
        "max_duties": max_d,
        "min_duties": min_d,
        "variance": max_d - min_d,
        "imbalance_warning": (max_d - min_d) > 2,
    }
