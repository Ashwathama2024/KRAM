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


if __name__ == "__main__":
    unittest.main()
