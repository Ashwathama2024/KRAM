"""
DutySync Master - Roster Generation Engine

Design
------
Two independent rotating chains:
  • Working chain   — weekdays (Mon–Fri)
  • Holiday chain   — weekends + public holidays

Chain rule: today's standby → tomorrow's duty (within the same queue).
Global safety override: nobody may take duty on consecutive calendar dates,
even when the dates belong to different queues.

Look-ahead standby rule
~~~~~~~~~~~~~~~~~~~~~~~
Before a candidate is accepted as standby for Day D we verify they are
also available for Day D+1 in the *same queue* — the day they would
be expected to step up as duty.  This ensures the chain never breaks
due to predictable leave:

  Monday standby  → must be available Tuesday (next working day)
  Friday standby  → must be available Monday (next working day)
  Saturday standby → must be available Sunday (next non-working day)

If every candidate would fail the look-ahead check we fall back to
assigning the best available standby without look-ahead (chain will
break at that point, logged as a remark). The same queue chain may also
be legally interrupted by the global no-consecutive-duty rule or by debt
correction.

No-vacant guarantee
~~~~~~~~~~~~~~~~~~~
Duty selection walks the chain respecting full availability + buffer
rules.  If everyone fails, a second pass ignores the rejoin buffer.
As an absolute last resort the active person with the fewest duties
is force-assigned so the day is never left vacant.

Fairness
~~~~~~~~
The chain distributes duties with natural variance ≤ 1 when all staff
are available.  Duty debt is accumulated for staff skipped due to
unavailability and tracked on the Staff model for audit purposes.
"""
from datetime import date, timedelta
from typing import List, Optional, Tuple
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
    if not db.query(RemarkLog).filter(
        RemarkLog.message == message,
        RemarkLog.level == level,
        RemarkLog.date_ref == date_ref,
    ).first():
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


# ── availability (leave + buffer logic) ──────────────────────────────────────

def _is_staff_available(
    staff: Staff,
    d: date,
    db: Session,
    ignore_rejoin_buffer: bool = False,
) -> bool:
    """
    Return True if the staff member can be assigned on date d.

    Checks (in order):
    1. join_date / relieve_date window
    2. Direct leave / official-duty overlap
    3. Rejoin buffer after leave or official duty (skipped when
       ignore_rejoin_buffer=True — used only as a last-resort fallback
       to prevent vacant days)
    """
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

    if ignore_rejoin_buffer:
        return True

    # Rejoin buffer after each past leave / official-duty record
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


def _is_privilege_blocked(staff: Staff, d: date) -> bool:
    """
    Silently suppress privileged staff from duty on blocked days.
      Friday   (weekday 4) — working-queue duty + standby skipped
      Saturday (weekday 5) — non-working-queue duty skipped only
                             (Saturday standby is allowed)
    No debt accrued, no remarks logged — completely invisible.
    """
    if not getattr(staff, "privilege_mode", False):
        return False
    return d.weekday() in (4, 5)  # 4=Friday, 5=Saturday


# ── chain helpers ─────────────────────────────────────────────────────────────

def _find_staff_index(staff_list: List[Staff], staff_id: Optional[int]) -> Optional[int]:
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
    idx = _find_staff_index(staff_pool, last.assigned_standby_id)
    if idx is not None:
        return idx
    duty_idx = _find_staff_index(staff_pool, last.assigned_duty_id)
    if duty_idx is None:
        return 0
    return (duty_idx + 1) % len(staff_pool)


def _find_next_queue_date(d: date, is_non_working: bool, db: Session) -> Optional[date]:
    """
    Return the next calendar date in the same queue (working or non-working)
    after d.  Looks up to 14 days ahead.

    A day is non-working if it is a weekend OR has is_holiday=True.
    """
    check = d + timedelta(days=1)
    for _ in range(14):
        entry = db.query(Calendar).filter(Calendar.date == check).first()
        # Determine queue type: is_holiday flag takes priority
        day_is_nw = (entry.is_holiday if entry else False) or _is_weekend(check)
        if day_is_nw == is_non_working:
            return check
        check += timedelta(days=1)
    return None


def _has_adjacent_duty_conflict(
    db: Session,
    staff_id: int,
    d: date,
    previous_entry: Optional[Calendar] = None,
    next_entry: Optional[Calendar] = None,
) -> bool:
    """Return True when the same person already has duty on an adjacent date."""
    prev_entry = previous_entry or db.query(Calendar).filter(
        Calendar.date == d - timedelta(days=1)
    ).first()
    if prev_entry and prev_entry.assigned_duty_id == staff_id:
        return True

    future_entry = next_entry or db.query(Calendar).filter(
        Calendar.date == d + timedelta(days=1)
    ).first()
    if future_entry and future_entry.assigned_duty_id == staff_id:
        return True

    return False


# ── chain picker ──────────────────────────────────────────────────────────────

def _pick_from_chain(
    staff_pool: List[Staff],
    start_idx: int,
    d: date,
    db: Session,
    exclude_id: Optional[int] = None,
    ignore_rejoin_buffer: bool = False,
    debt_attr: str = "duty_debt",
) -> Tuple[Optional[Staff], int, List[Staff], List[Staff]]:
    """
    Walk the chain from start_idx and return the best available person.

    Normal case: returns the first available person in chain order (preserving
    the rotating-chain rule).

    Debt-correction case: if an available candidate has a queue-specific debt
    that is ≥ 2 more than the chain-natural pick, they are selected instead.
    This corrects multi-duty imbalances caused by leave-induced chain jumps
    without disturbing normal rotation.

    Returns (
        person,
        their_pool_index,
        list_of_skipped_unavailable_staff,
        list_of_skipped_adjacent_conflict_staff,
    ).
    """
    n = len(staff_pool)
    if not n:
        return None, 0, [], []

    skipped: List[Staff] = []
    adjacent_blocked: List[Staff] = []
    chain_natural: Optional[Tuple[int, Staff]] = None   # first available in order
    best_debt: Optional[Tuple[int, Staff]] = None       # highest-debt available

    for offset in range(n):
        idx = (start_idx + offset) % n
        candidate = staff_pool[idx]
        if not candidate.active:
            continue
        if exclude_id is not None and candidate.id == exclude_id:
            continue
        # Privilege soft-skip: silently pass — no debt charged, no log.
        if _is_privilege_blocked(candidate, d):
            continue
        if not _is_staff_available(candidate, d, db, ignore_rejoin_buffer):
            skipped.append(candidate)
            continue
        if _has_adjacent_duty_conflict(db, candidate.id, d):
            adjacent_blocked.append(candidate)
            continue

        # First available in chain order
        if chain_natural is None:
            chain_natural = (idx, candidate)

        # Track the available candidate with the highest queue-specific debt
        cand_debt = getattr(candidate, debt_attr, 0)
        if cand_debt > 0 and (
            best_debt is None
            or cand_debt > getattr(best_debt[1], debt_attr, 0)
        ):
            best_debt = (idx, candidate)

    if chain_natural is None:
        return None, start_idx, skipped, adjacent_blocked

    # Prefer the high-debt candidate only when the imbalance is meaningful
    # (≥ 2 more duties owed than the chain-natural pick).  This corrects
    # accumulated skips while leaving normal single-duty variance untouched.
    if best_debt is not None:
        natural_debt = getattr(chain_natural[1], debt_attr, 0)
        top_debt = getattr(best_debt[1], debt_attr, 0)
        if top_debt >= natural_debt + 2:
            idx, staff = best_debt
            return staff, idx, skipped, adjacent_blocked

    idx, staff = chain_natural
    return staff, idx, skipped, adjacent_blocked


def _pick_standby_with_lookahead(
    staff_pool: List[Staff],
    start_idx: int,
    duty_idx: int,
    d: date,
    next_queue_date: Optional[date],
    db: Session,
) -> Tuple[Optional[Staff], int, bool, Optional[str]]:
    """
    Pick the next standby candidate who:
      1. Is available on Day D  (the assignment day)
      2. Is available on Day D+1 in the same queue (look-ahead)

    Returns (standby, their_index, look_ahead_was_satisfied, note).

    If every candidate fails the look-ahead check, a second pass is made
    ignoring it so the day is never left without a standby.
    """
    n = len(staff_pool)
    natural_idx = start_idx % n if n else 0
    natural_candidate: Optional[Staff] = None
    natural_note: Optional[str] = None

    for offset in range(n):
        idx = (start_idx + offset) % n
        if idx == duty_idx:
            continue
        natural_idx = idx
        natural_candidate = staff_pool[idx]
        break

    def _try(with_lookahead: bool):
        for offset in range(n):
            idx = (start_idx + offset) % n
            if idx == duty_idx:
                continue
            candidate = staff_pool[idx]
            if not candidate.active:
                continue
            # Privilege: no standby role on Fridays
            if getattr(candidate, "privilege_mode", False) and d.weekday() == 4:
                continue
            if not _is_staff_available(candidate, d, db):
                continue
            if with_lookahead and next_queue_date:
                if not _is_staff_available(candidate, next_queue_date, db):
                    continue
            return candidate, idx
        return None, start_idx

    if natural_candidate is not None:
        if not natural_candidate.active:
            natural_note = (
                f"Nearest queue standby {natural_candidate.name} skipped on {d}: inactive."
            )
        elif not _is_staff_available(natural_candidate, d, db):
            natural_note = (
                f"Nearest queue standby {natural_candidate.name} skipped on {d}: unavailable on standby date."
            )
        elif next_queue_date and not _is_staff_available(natural_candidate, next_queue_date, db):
            natural_note = (
                f"Nearest queue standby {natural_candidate.name} skipped on {d}: unavailable on next queue date {next_queue_date}."
            )

    # Primary: with look-ahead
    standby, standby_idx = _try(with_lookahead=True)
    if standby is not None:
        note = natural_note if natural_note and standby_idx != natural_idx else None
        return standby, standby_idx, True, note

    # Fallback: without look-ahead (chain may break but no vacant standby)
    standby, standby_idx = _try(with_lookahead=False)
    note = natural_note if natural_note and standby_idx != natural_idx else None
    return standby, standby_idx, False, note


def _can_assign_duty_to_entry(db: Session, staff: Staff, entry: Calendar) -> bool:
    if not _is_staff_available(staff, entry.date, db):
        return False
    if _has_adjacent_duty_conflict(db, staff.id, entry.date):
        return False
    return True


def _rebuild_month_standby_assignments(db: Session, year: int, month: int):
    start_date, end_date = _month_bounds(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
    ).order_by(Calendar.date).all()
    all_staff = _get_active_staff(db)
    n = len(all_staff)
    if n <= 1:
        for entry in entries:
            entry.assigned_standby_id = None
        db.flush()
        return

    for entry in entries:
        if not entry.assigned_duty_id:
            entry.assigned_standby_id = None
            continue
        duty_idx = _find_staff_index(all_staff, entry.assigned_duty_id)
        if duty_idx is None:
            entry.assigned_standby_id = None
            continue
        standby_start = (duty_idx + 1) % n
        standby, _, lookahead_ok, standby_note = _pick_standby_with_lookahead(
            all_staff,
            standby_start,
            duty_idx,
            entry.date,
            _find_next_queue_date(entry.date, _is_non_working(entry.day_type), db),
            db,
        )
        entry.assigned_standby_id = standby.id if standby else None
        if standby_note:
            _log_remark(db, standby_note, "info", entry.date)
        if standby is not None and not lookahead_ok:
            _log_remark(
                db,
                f"Look-ahead skipped on {entry.date}: {standby.name} assigned as "
                f"standby but may be unavailable on {_find_next_queue_date(entry.date, _is_non_working(entry.day_type), db)} "
                f"(chain continuity not guaranteed).",
                "warning",
                entry.date,
            )
    db.flush()


def _rebalance_month_main_duties(db: Session, year: int, month: int):
    start_date, end_date = _month_bounds(year, month)
    entries = db.query(Calendar).filter(
        Calendar.date >= start_date,
        Calendar.date <= end_date,
        Calendar.assigned_duty_id.isnot(None),
    ).order_by(Calendar.date).all()
    if not entries:
        return

    staff_list = _get_active_staff(db)
    if len(staff_list) < 2:
        return

    buckets = [
        ("working", [e for e in entries if not _is_non_working(e.day_type)]),
        ("non-working", [e for e in entries if _is_non_working(e.day_type)]),
    ]

    for bucket_name, bucket_entries in buckets:
        if len(bucket_entries) < 2:
            continue

        while True:
            counts = {s.id: 0 for s in staff_list}
            for entry in bucket_entries:
                if entry.assigned_duty_id:
                    counts[entry.assigned_duty_id] += 1

            max_count = max(counts.values())
            min_count = min(counts.values())
            if max_count - min_count <= 1:
                break

            donor_ids = {
                staff_id for staff_id, count in counts.items()
                if count == max_count
            }
            receiver_ids = [
                staff_id for staff_id, count in counts.items()
                if count == min_count
            ]
            applied = False

            for entry in bucket_entries:
                if entry.assigned_duty_id not in donor_ids:
                    continue
                current_staff = db.get(Staff, entry.assigned_duty_id)
                for receiver_id in receiver_ids:
                    if receiver_id == entry.assigned_duty_id:
                        continue
                    receiver = db.get(Staff, receiver_id)
                    if receiver is None or not _can_assign_duty_to_entry(db, receiver, entry):
                        continue
                    # Never rebalance a privileged duty onto a blocked day
                    if _is_privilege_blocked(receiver, entry.date):
                        continue

                    previous_duty_id = entry.assigned_duty_id
                    previous_standby_id = entry.assigned_standby_id
                    entry.assigned_duty_id = receiver.id
                    entry.status = StatusEnum.MODIFIED
                    if previous_standby_id == receiver.id:
                        entry.assigned_standby_id = None

                    _log_remark(
                        db,
                        f"Variance rebalance on {entry.date}: main duty moved from "
                        f"{current_staff.name} to {receiver.name} in {bucket_name} queue.",
                        "info",
                        entry.date,
                    )
                    applied = True
                    break
                if applied:
                    break

            if not applied:
                _log_remark(
                    db,
                    f"Variance rebalance limited in {bucket_name} queue for {year}-{month:02d}: "
                    f"hard rules left no legal reassignment.",
                    "warning",
                    start_date,
                )
                break


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
    Generate duty + standby for every calendar day in the month.

    Duty selection (in order of preference)
    ----------------------------------------
    1. Normal chain walk — full availability + buffer checks.
    2. Fallback chain walk — ignores rejoin buffer (prevents vacancy
       when everyone is in their post-leave cooldown period).
    3. Force-assign — picks the active person with the fewest total
       duties.  Logged as a forced assignment.  Guarantees no vacant day.

    Standby selection (look-ahead)
    --------------------------------
    Standby candidates are first filtered by availability on BOTH
    Day D *and* Day D+1 in the same queue (look-ahead).  If no
    candidate passes the look-ahead check, any available person is
    used and the near-miss is logged so operators can see it.
    """
    start_date, end_date = _month_bounds(year, month)
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

    # Chain start positions from all prior months
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
        duty, duty_idx, skipped, adjacent_blocked = _pick_from_chain(
            all_staff, current_idx, entry.date, db,
            debt_attr=debt_attr,
        )

        if duty is None:
            # Fallback: ignore rejoin buffer
            duty, duty_idx, skipped, adjacent_blocked = _pick_from_chain(
                all_staff, current_idx, entry.date, db,
                ignore_rejoin_buffer=True,
                debt_attr=debt_attr,
            )
            if duty is not None:
                _log_remark(
                    db,
                    f"Duty on {entry.date}: rejoin buffer relaxed to prevent vacancy.",
                    "warning",
                    entry.date,
                )

        if duty is None:
            # Last resort: force-assign least-burdened active person
            candidates = sorted(
                [s for s in all_staff if s.active],
                key=lambda s: (
                    getattr(s, "total_working_duties", 0)
                    + getattr(s, "total_holiday_duties", 0)
                ),
            )
            if candidates:
                duty = candidates[0]
                duty_idx = _find_staff_index(all_staff, duty.id) or 0
                skipped = []
                adjacent_blocked = []
                _log_remark(
                    db,
                    f"Duty on {entry.date} force-assigned to {duty.name} "
                    f"(no eligible staff — forced to prevent vacancy).",
                    "warning",
                    entry.date,
                )

        if duty is None:
            # Truly no active staff — should never happen in practice
            entry.status = StatusEnum.VACANT
            entry.remarks = "No active staff available"
            _log_remark(
                db, f"No active staff on {entry.date}.", "error", entry.date
            )
            db.flush()
            continue

        # Track debt for staff skipped due to unavailability
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
        if adjacent_blocked:
            _log_remark(
                db,
                f"Duty on {entry.date}: {len(adjacent_blocked)} staff blocked by consecutive-duty rule.",
                "info",
                entry.date,
            )

        # ── 2. Find STANDBY (with look-ahead) ──────────────────────────────
        next_queue_date = _find_next_queue_date(entry.date, is_nw, db)
        standby_start = (duty_idx + 1) % n

        standby, standby_idx, lookahead_ok, standby_note = _pick_standby_with_lookahead(
            all_staff, standby_start, duty_idx, entry.date, next_queue_date, db
        )

        if standby is None and n > 1:
            _log_remark(
                db,
                f"No eligible standby on {entry.date}.",
                "warning",
                entry.date,
            )
        elif not lookahead_ok and standby is not None:
            _log_remark(
                db,
                f"Look-ahead skipped on {entry.date}: {standby.name} assigned as "
                f"standby but may be unavailable on {next_queue_date} "
                f"(chain continuity not guaranteed).",
                "warning",
                entry.date,
            )
        if standby_note:
            _log_remark(db, standby_note, "info", entry.date)

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
        # Chain: standby's index is the next duty start.
        # If look-ahead was satisfied this equals the person who will
        # be duty tomorrow.  If not, chain is noted as broken.
        next_idx = standby_idx if standby else (duty_idx + 1) % n
        if is_nw:
            holiday_idx = next_idx
        else:
            working_idx = next_idx

        db.flush()

    _rebalance_month_main_duties(db, year, month)
    _rebuild_month_standby_assignments(db, year, month)


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
    """Re-generate this month and any later already-generated months."""
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
    Auto-heal: regenerate so that:
    • If a duty person is now unavailable, the chain skips them and the
      next person (original standby) closes up on duty.
    • Look-ahead ensures the new standby chain is also healthy.
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
        if duty and _has_adjacent_duty_conflict(db, duty.id, entry.date, previous_entry=None, next_entry=None):
            raise ValueError(
                f"{duty.name} has consecutive duty conflict on {entry.date}."
            )
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
    standby, _, _, standby_note = _pick_standby_with_lookahead(
        all_staff, start, duty_idx or 0,
        entry.date,
        _find_next_queue_date(
            entry.date,
            _is_non_working(entry.day_type),
            db,
        ),
        db,
    )
    entry.assigned_standby_id = standby.id if standby else None
    if standby_note:
        _log_remark(db, standby_note, "info", entry.date)


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


def apply_manual_override(
    db: Session,
    override_date: date,
    new_duty_id: int,
    new_standby_id: Optional[int],
    reason: Optional[str],
    override_type: str,
    heal_after: bool,
) -> List[Calendar]:
    """
    Force-assign a staff member to a specific date regardless of chain order.

    heal_after=False → only that one day is changed; the rest of the roster
                       is untouched.
    heal_after=True  → the month is regenerated from scratch after the
                       override, then the overridden day is re-pinned so it
                       survives the regeneration.

    Every call is logged to ManualOverrideLog for audit purposes.
    """
    from ..models.models import ManualOverrideLog

    entry = db.query(Calendar).filter(Calendar.date == override_date).first()
    if not entry:
        raise ValueError(f"No calendar entry for {override_date}.")

    new_duty = db.query(Staff).get(new_duty_id)
    if not new_duty:
        raise ValueError("New duty staff not found.")
    if new_standby_id and new_standby_id == new_duty_id:
        raise ValueError("Duty and standby cannot be the same person.")

    # Audit log — record the before state
    log = ManualOverrideLog(
        date=override_date,
        override_type=override_type,
        reason=reason,
        heal_applied=heal_after,
        prev_duty_id=entry.assigned_duty_id,
        prev_standby_id=entry.assigned_standby_id,
        new_duty_id=new_duty_id,
        new_standby_id=new_standby_id,
    )
    db.add(log)

    def _pin_override():
        """Write (or re-write) the manual assignment on the target day."""
        e = db.query(Calendar).filter(Calendar.date == override_date).first()
        e.assigned_duty_id = new_duty_id
        e.assigned_standby_id = new_standby_id
        e.status = StatusEnum.MODIFIED
        e.remarks = f"Manual override ({override_type})" + (f": {reason}" if reason else "")

    _pin_override()
    db.flush()

    if heal_after:
        # Regenerate the month — this resets the day, so re-pin it afterwards.
        regenerate_from_month(db, override_date.year, override_date.month)
        _pin_override()
        _recompute_staff_counters(db)

    else:
        _recompute_staff_counters(db)

    _validate_roster_window(
        db,
        override_date - timedelta(days=1),
        override_date + timedelta(days=1),
    )

    db.commit()

    _log_remark(
        db,
        f"Manual override on {override_date}: {new_duty.name} assigned as duty"
        + (f" (standby: {db.query(Staff).get(new_standby_id).name})" if new_standby_id else "")
        + f". Type: {override_type}. Heal: {heal_after}.",
        "warning",
        override_date,
    )
    db.commit()

    start, end = _month_bounds(override_date.year, override_date.month)
    return (
        db.query(Calendar)
        .filter(Calendar.date >= start, Calendar.date <= end)
        .order_by(Calendar.date)
        .all()
    )


def get_override_history(db: Session, limit: int = 50):
    from ..models.models import ManualOverrideLog
    return (
        db.query(ManualOverrideLog)
        .order_by(ManualOverrideLog.created_at.desc())
        .limit(limit)
        .all()
    )
