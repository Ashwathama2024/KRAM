"""
Roster engine tests — chain-based design
=========================================

Core rules under test
---------------------
1. **Chain**:  today's standby == tomorrow's duty (within the same queue type).
2. **Two independent queues**: working days and non-working days each have
   their own chain pointer.
3. **Standby covers duty**: if the scheduled duty person is unavailable the
   chain skips them (debt++) and the *next* available person becomes duty —
   the same person who would naturally have been standby.
4. **Fair rotation**: with all staff available, variance ≤ 1 duty per staff
   per month within each queue type.
5. **Cross-month continuity**: the chain resumes from where it left off.
"""
import os
import tempfile
import unittest
import calendar as cal_module
from datetime import date, timedelta
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "dutysync_chain_tests.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"

from app.database import Base, SessionLocal, engine, ensure_schema
from app.models.models import Availability, AvailabilityTypeEnum, Calendar, Staff
from app.services.roster_engine import generate_roster, heal_roster


# ── helpers ───────────────────────────────────────────────────────────────────

def _month_entries(db, year: int, month: int):
    _, days = cal_module.monthrange(year, month)
    return (
        db.query(Calendar)
        .filter(
            Calendar.date >= date(year, month, 1),
            Calendar.date <= date(year, month, days),
        )
        .order_by(Calendar.date)
        .all()
    )


def _working(entries):
    return [e for e in entries if e.day_type.name == "WORKING"]


def _non_working(entries):
    return [e for e in entries if e.day_type.name != "WORKING"]


def _duty_counts(db, entries):
    staff_map = {s.id: s.name for s in db.query(Staff).all()}
    counts = {name: 0 for name in staff_map.values()}
    for e in entries:
        if e.assigned_duty_id:
            counts[staff_map[e.assigned_duty_id]] += 1
    return counts


# ── base class ────────────────────────────────────────────────────────────────

class ChainTestBase(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        ensure_schema()
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def _add_staff(self, names):
        self.db.add_all([Staff(name=n) for n in names])
        self.db.commit()


# ── test classes ──────────────────────────────────────────────────────────────

class TestChainRule(ChainTestBase):
    """Today's standby must equal tomorrow's duty within the same queue type."""

    def test_working_chain_standby_becomes_next_duty(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 6)

        working = _working(_month_entries(self.db, 2026, 6))
        self.assertGreater(len(working), 1)

        for i in range(len(working) - 1):
            today = working[i]
            tomorrow = working[i + 1]
            self.assertEqual(
                today.assigned_standby_id,
                tomorrow.assigned_duty_id,
                f"Chain broken between {today.date} and {tomorrow.date}: "
                f"standby={today.assigned_standby_id} "
                f"but next duty={tomorrow.assigned_duty_id}",
            )

    def test_holiday_chain_standby_becomes_next_duty(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 8)

        non_wk = _non_working(_month_entries(self.db, 2026, 8))
        self.assertGreater(len(non_wk), 1)

        for i in range(len(non_wk) - 1):
            today = non_wk[i]
            tomorrow = non_wk[i + 1]
            self.assertEqual(
                today.assigned_standby_id,
                tomorrow.assigned_duty_id,
                f"Holiday chain broken between {today.date} and {tomorrow.date}",
            )

    def test_two_queues_are_independent(self):
        """Working and holiday pointers advance separately."""
        self._add_staff(["A", "B", "C", "D", "E", "F"])
        generate_roster(self.db, 2026, 5)

        entries = _month_entries(self.db, 2026, 5)
        for label, sub in (("working", _working(entries)), ("holiday", _non_working(entries))):
            self.assertTrue(sub, f"No {label} entries found")
            for i in range(len(sub) - 1):
                self.assertEqual(
                    sub[i].assigned_standby_id,
                    sub[i + 1].assigned_duty_id,
                    f"{label} chain broken at {sub[i].date} → {sub[i+1].date}",
                )


class TestCoverage(ChainTestBase):
    """Every calendar day must have a valid assignment."""

    def test_all_working_days_assigned(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 7)
        for e in _working(_month_entries(self.db, 2026, 7)):
            self.assertIsNotNone(e.assigned_duty_id, f"{e.date} duty is None")
            self.assertIsNotNone(e.assigned_standby_id, f"{e.date} standby is None")

    def test_all_non_working_days_assigned(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 7)
        for e in _non_working(_month_entries(self.db, 2026, 7)):
            self.assertIsNotNone(e.assigned_duty_id, f"{e.date} duty is None")
            self.assertIsNotNone(e.assigned_standby_id, f"{e.date} standby is None")

    def test_standby_is_always_distinct_from_duty(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 9)
        for e in _month_entries(self.db, 2026, 9):
            if e.assigned_duty_id and e.assigned_standby_id:
                self.assertNotEqual(
                    e.assigned_duty_id,
                    e.assigned_standby_id,
                    f"{e.date} has same duty and standby",
                )


class TestFairDistribution(ChainTestBase):
    """With all staff available the chain distributes duties with variance ≤ 1."""

    def test_working_duties_variance_le_1(self):
        self._add_staff(["AS", "YS", "NP", "SG", "AR", "NK", "BG", "KML", "PS", "CVN"])
        generate_roster(self.db, 2026, 5)

        counts = _duty_counts(self.db, _working(_month_entries(self.db, 2026, 5)))
        vals = list(counts.values())
        self.assertLessEqual(
            max(vals) - min(vals), 1,
            f"Working duty variance > 1: {counts}",
        )

    def test_non_working_duties_perfectly_balanced_may(self):
        """May 2026 has exactly 10 non-working days → each of 10 staff gets 1."""
        self._add_staff(["AS", "YS", "NP", "SG", "AR", "NK", "BG", "KML", "PS", "CVN"])
        generate_roster(self.db, 2026, 5)

        counts = _duty_counts(self.db, _non_working(_month_entries(self.db, 2026, 5)))
        vals = list(counts.values())
        self.assertEqual(max(vals), 1, f"Some staff got > 1 non-working duty: {counts}")
        self.assertEqual(min(vals), 1, f"Some staff got 0 non-working duties: {counts}")

    def test_multi_month_distribution_stays_fair(self):
        self._add_staff(["AS", "YS", "NP", "SG", "AR", "NK", "BG", "KML", "PS", "CVN"])
        for m in range(3, 9):
            generate_roster(self.db, 2026, m)

        for m in range(3, 9):
            entries = _month_entries(self.db, 2026, m)
            for label, sub in (
                ("working", _working(entries)),
                ("non-working", _non_working(entries)),
            ):
                if not sub:
                    continue
                counts = _duty_counts(self.db, sub)
                vals = list(counts.values())
                self.assertLessEqual(
                    max(vals) - min(vals), 1,
                    f"Month {m} {label} variance > 1: {counts}",
                )


class TestCrossMonthChain(ChainTestBase):
    """The chain must continue seamlessly across month boundaries."""

    def test_working_chain_continues_across_month_boundary(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 6)
        generate_roster(self.db, 2026, 7)

        last_june = _working(_month_entries(self.db, 2026, 6))[-1]
        first_july = _working(_month_entries(self.db, 2026, 7))[0]

        self.assertEqual(
            last_june.assigned_standby_id,
            first_july.assigned_duty_id,
            f"Working chain breaks at June→July boundary: "
            f"last-June standby={last_june.assigned_standby_id}, "
            f"first-July duty={first_july.assigned_duty_id}",
        )

    def test_holiday_chain_continues_across_month_boundary(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 6)
        generate_roster(self.db, 2026, 7)

        last_june = _non_working(_month_entries(self.db, 2026, 6))[-1]
        first_july = _non_working(_month_entries(self.db, 2026, 7))[0]

        self.assertEqual(
            last_june.assigned_standby_id,
            first_july.assigned_duty_id,
            "Holiday chain breaks at June→July boundary",
        )


class TestStandbyCoversUnavailableDuty(ChainTestBase):
    """
    Standby closes up on duty:
    when the scheduled duty person is unavailable, heal regenerates so the
    chain skips them and the next available person takes duty.
    """

    def test_heal_skips_unavailable_duty_person(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 9)

        working = _working(_month_entries(self.db, 2026, 9))
        # Use a day safely in the middle
        target = working[3]
        original_duty_id = target.assigned_duty_id
        target_date = target.date
        staff_obj = self.db.get(Staff, original_duty_id)

        # Put that person on leave for the target day
        self.db.add(Availability(
            staff_id=original_duty_id,
            start_date=target_date,
            end_date=target_date,
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()

        heal_roster(self.db, 2026, 9)
        self.db.expire_all()

        healed = next(
            e for e in _working(_month_entries(self.db, 2026, 9))
            if e.date == target_date
        )
        self.assertNotEqual(
            healed.assigned_duty_id,
            original_duty_id,
            f"{staff_obj.name} is on leave but still assigned duty on {target_date}",
        )
        self.assertIsNotNone(
            healed.assigned_duty_id,
            f"No duty assigned on {target_date} after heal",
        )

    def test_chain_integrity_preserved_after_heal(self):
        """
        After a heal the chain holds for all consecutive working-day pairs
        EXCEPT the single transition where the unavailable person was skipped.
        From the skip point onwards the new chain must be self-consistent.
        """
        self._add_staff(["A", "B", "C", "D", "E"])
        generate_roster(self.db, 2026, 9)

        working = _working(_month_entries(self.db, 2026, 9))
        target_idx = 4
        target_date = working[target_idx].date
        original_duty_id = working[target_idx].assigned_duty_id

        self.db.add(Availability(
            staff_id=original_duty_id,
            start_date=target_date,
            end_date=target_date,
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()
        heal_roster(self.db, 2026, 9)
        self.db.expire_all()

        refreshed = _working(_month_entries(self.db, 2026, 9))

        # Find the index of the healed day
        healed_idx = next(
            i for i, e in enumerate(refreshed) if e.date == target_date
        )

        # Chain must hold for all pairs except the one crossing the skip point
        # (i.e. pairs that do NOT span [healed_idx-1 → healed_idx])
        for i in range(len(refreshed) - 1):
            if i == healed_idx - 1:
                # This transition crosses the skip — chain is intentionally
                # broken here because the previously-assigned standby was
                # the person who got skipped on the next day.
                continue
            today = refreshed[i]
            tomorrow = refreshed[i + 1]
            self.assertEqual(
                today.assigned_standby_id,
                tomorrow.assigned_duty_id,
                f"Chain broken after heal at {today.date} → {tomorrow.date}",
            )


class TestLookAheadStandby(ChainTestBase):
    """
    Look-ahead rule: a candidate is refused as standby for Day D if they are
    already known to be unavailable on Day D+1 in the same queue.
    This keeps the chain unbroken even across leave blocks.
    """

    def test_standby_skipped_when_unavailable_next_queue_day(self):
        """
        Setup:
          • 5 staff — A B C D E (ids 1-5)
          • Generate May 2026 (no prior data → working chain starts at A)
          • Working day sequence: May 1(Fri) May 4(Mon) May 5(Tue) …

        Chain without leave:
          May 1: A duty, B standby  → B becomes May 4 duty
          May 4: B duty, C standby  → C becomes May 5 duty

        Now add leave for C covering May 5 (next working day after May 4).
        With look-ahead, C must be refused as standby on May 4.
        So May 4 standby should NOT be C.
        """
        self._add_staff(["A", "B", "C", "D", "E"])

        # Find what the third working day of May 2026 is
        # May 4 is the second working day; May 5 is the third
        # Add leave for C on May 5 BEFORE generation so look-ahead fires
        staff_c = self.db.query(Staff).filter(Staff.name == "C").first()
        may5 = date(2026, 5, 5)
        self.db.add(Availability(
            staff_id=staff_c.id,
            start_date=may5,
            end_date=may5,
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()

        generate_roster(self.db, 2026, 5)

        entries = _working(_month_entries(self.db, 2026, 5))
        # May 4 is working[1] (0=May1 Fri, 1=May4 Mon, 2=May5 Tue …)
        may4_entry = next(e for e in entries if e.date == date(2026, 5, 4))
        # The standby on May 4 must NOT be C (who is on leave May 5)
        self.assertNotEqual(
            may4_entry.assigned_standby_id,
            staff_c.id,
            f"C is on leave May 5 but was assigned standby on May 4 "
            f"(violates look-ahead rule)",
        )

    def test_chain_unbroken_across_leave_block_with_lookahead(self):
        """
        When look-ahead is satisfied, the chain from Day D to Day D+1
        must remain intact even though the 'natural' next person has leave.
        """
        self._add_staff(["A", "B", "C", "D", "E"])

        # Put C on leave for May 5 before generating
        staff_c = self.db.query(Staff).filter(Staff.name == "C").first()
        self.db.add(Availability(
            staff_id=staff_c.id,
            start_date=date(2026, 5, 5),
            end_date=date(2026, 5, 5),
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()

        generate_roster(self.db, 2026, 5)

        working = _working(_month_entries(self.db, 2026, 5))
        # Chain must hold for ALL consecutive working-day pairs
        for i in range(len(working) - 1):
            today = working[i]
            tomorrow = working[i + 1]
            self.assertEqual(
                today.assigned_standby_id,
                tomorrow.assigned_duty_id,
                f"Chain broken at {today.date} → {tomorrow.date} "
                f"(look-ahead should have prevented it)",
            )

    def test_lookahead_fallback_when_all_candidates_have_leave_next_day(self):
        """
        If every candidate except one has leave on Day D+1, the remaining
        candidate is used as standby (even if look-ahead is not fully met
        for others).  The day must not be left without a standby.
        """
        self._add_staff(["A", "B", "C"])
        # Put B and C on leave on May 4 (the day after May 1 in working queue)
        for name in ["B", "C"]:
            s = self.db.query(Staff).filter(Staff.name == name).first()
            self.db.add(Availability(
                staff_id=s.id,
                start_date=date(2026, 5, 4),
                end_date=date(2026, 5, 4),
                availability_type=AvailabilityTypeEnum.LEAVE,
            ))
        self.db.commit()

        generate_roster(self.db, 2026, 5)
        working = _working(_month_entries(self.db, 2026, 5))
        may1 = next(e for e in working if e.date == date(2026, 5, 1))

        # Standby must still be assigned (no vacant standby)
        self.assertIsNotNone(
            may1.assigned_standby_id,
            "Standby is None on May 1 even though at least one staff is available",
        )


class TestNoVacantDays(ChainTestBase):
    """Every calendar day must have a duty assignment — no VACANT status."""

    def test_no_vacant_with_heavy_leave(self):
        """
        Even when most staff are on leave, the force-assign fallback must
        fill every day.
        """
        self._add_staff(["A", "B", "C", "D", "E"])
        staff_list = self.db.query(Staff).order_by(Staff.id).all()

        # Put 4 of 5 staff on leave for the entire month of July 2026
        for s in staff_list[:4]:
            self.db.add(Availability(
                staff_id=s.id,
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 31),
                availability_type=AvailabilityTypeEnum.LEAVE,
            ))
        self.db.commit()

        generate_roster(self.db, 2026, 7)

        for entry in _month_entries(self.db, 2026, 7):
            self.assertNotEqual(
                entry.status.name, "VACANT",
                f"{entry.date} is VACANT — no-vacant guarantee failed",
            )
            self.assertIsNotNone(
                entry.assigned_duty_id,
                f"{entry.date} has no duty assigned",
            )

    def test_no_vacant_with_all_on_leave_except_one(self):
        """Single available person covers all days (last-resort force assign)."""
        self._add_staff(["A", "B"])
        # Put A on leave for entire month
        staff_a = self.db.query(Staff).filter(Staff.name == "A").first()
        self.db.add(Availability(
            staff_id=staff_a.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 31),
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()

        generate_roster(self.db, 2026, 8)

        for entry in _month_entries(self.db, 2026, 8):
            self.assertIsNotNone(
                entry.assigned_duty_id,
                f"{entry.date} has no duty — no-vacant guarantee failed",
            )


class TestLeaveAndBufferLogic(ChainTestBase):
    """
    Leave records prevent assignment during the leave period and for the
    configured rejoin-buffer days afterwards.
    """

    def test_staff_not_assigned_during_leave(self):
        self._add_staff(["A", "B", "C", "D", "E"])
        staff_a = self.db.query(Staff).filter(Staff.name == "A").first()
        leave_start = date(2026, 6, 8)
        leave_end = date(2026, 6, 12)
        self.db.add(Availability(
            staff_id=staff_a.id,
            start_date=leave_start,
            end_date=leave_end,
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()

        generate_roster(self.db, 2026, 6)

        for entry in _month_entries(self.db, 2026, 6):
            if leave_start <= entry.date <= leave_end:
                self.assertNotEqual(
                    entry.assigned_duty_id,
                    staff_a.id,
                    f"A is on leave but assigned duty on {entry.date}",
                )
                self.assertNotEqual(
                    entry.assigned_standby_id,
                    staff_a.id,
                    f"A is on leave but assigned standby on {entry.date}",
                )

    def test_rejoin_buffer_respected(self):
        """
        Staff should not be assigned within leave_rejoin_buffer_days after
        their leave ends (default = 2 days).
        """
        self._add_staff(["A", "B", "C", "D", "E"])
        staff_a = self.db.query(Staff).filter(Staff.name == "A").first()
        leave_end = date(2026, 6, 10)
        self.db.add(Availability(
            staff_id=staff_a.id,
            start_date=date(2026, 6, 8),
            end_date=leave_end,
            availability_type=AvailabilityTypeEnum.LEAVE,
        ))
        self.db.commit()

        # Default buffer = 2 days → A should not appear on Jun 11 or Jun 12
        generate_roster(self.db, 2026, 6)
        buffer_dates = [leave_end + timedelta(days=i) for i in range(1, 3)]

        for entry in _month_entries(self.db, 2026, 6):
            if entry.date in buffer_dates:
                self.assertNotEqual(
                    entry.assigned_duty_id,
                    staff_a.id,
                    f"A is in rejoin buffer but assigned duty on {entry.date}",
                )


if __name__ == "__main__":
    unittest.main()
