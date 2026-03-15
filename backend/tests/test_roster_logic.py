import os
import tempfile
import unittest
import calendar as cal_module
from datetime import date
from pathlib import Path


TEST_DB = Path(tempfile.gettempdir()) / "dutysync_roster_logic_tests.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"

from app.database import Base, SessionLocal, engine, ensure_schema
from app.models.models import Calendar, RemarkLog, Staff
from app.services.roster_engine import generate_roster


class RosterLogicTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        ensure_schema()
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def _add_staff(self, names):
        self.db.add_all([Staff(name=name) for name in names])
        self.db.commit()

    def _month_entries(self, year: int, month: int):
        _, days_in_month = cal_module.monthrange(year, month)
        return self.db.query(Calendar).filter(
            Calendar.date >= date(year, month, 1),
            Calendar.date <= date(year, month, days_in_month),
        ).order_by(Calendar.date).all()

    def _month_counts(self, year: int, month: int):
        counts = {}
        for staff in self.db.query(Staff).order_by(Staff.id).all():
            counts[staff.name] = {"working": 0, "holiday": 0, "total": 0}
        for entry in self._month_entries(year, month):
            if not entry.assigned_duty_id:
                continue
            staff = self.db.get(Staff, entry.assigned_duty_id)
            bucket = counts[staff.name]
            if entry.day_type.name == "WORKING":
                bucket["working"] += 1
            else:
                bucket["holiday"] += 1
            bucket["total"] += 1
        return counts

    def test_working_and_non_working_generation_both_produce_continuous_assignments(self):
        self._add_staff(["A", "B", "C", "D", "E"])

        generate_roster(self.db, 2026, 6)
        generate_roster(self.db, 2026, 7)

        july_entries = self._month_entries(2026, 7)
        working = [e for e in july_entries if e.day_type.name == "WORKING"]
        non_working = [e for e in july_entries if e.day_type.name != "WORKING"]

        self.assertTrue(all(e.assigned_duty_id for e in working))
        self.assertTrue(all(e.assigned_duty_id for e in non_working))
        self.assertGreater(len(working), 0)
        self.assertGreater(len(non_working), 0)

    def test_standby_is_distinct_non_null_and_has_no_adjacent_day_conflicts(self):
        self._add_staff(["A", "B", "C", "D", "E", "F"])

        generate_roster(self.db, 2026, 8)
        entries = self._month_entries(2026, 8)

        for entry in entries:
            if not entry.assigned_duty_id:
                continue

            self.assertIsNotNone(entry.assigned_standby_id, f"{entry.date} is missing standby despite sufficient staffing")
            self.assertNotEqual(entry.assigned_duty_id, entry.assigned_standby_id, f"{entry.date} has the same main and standby staff")

            for neighbor in entries:
                if abs((neighbor.date - entry.date).days) != 1:
                    continue
                roles = {neighbor.assigned_duty_id, neighbor.assigned_standby_id}
                self.assertNotIn(entry.assigned_duty_id, roles, f"{entry.date} duty repeats on adjacent day {neighbor.date}")
                self.assertNotIn(entry.assigned_standby_id, roles, f"{entry.date} standby repeats on adjacent day {neighbor.date}")

    def test_july_style_rebalance_keeps_core_rotation_but_removes_four_duty_outlier(self):
        self._add_staff([
            "A SINGH", "B GAWEL", "NP", "GH", "GHJ", "JKKU", "HHYFBGJK", "TY", "UI", "IO", "EW",
        ])

        generate_roster(self.db, 2026, 6)
        generate_roster(self.db, 2026, 7)

        july_counts = self._month_counts(2026, 7)
        totals = [row["total"] for row in july_counts.values()]

        self.assertEqual(max(totals), 3)
        self.assertEqual(july_counts["A SINGH"]["total"], 3)
        self.assertEqual(sum(1 for row in july_counts.values() if row["total"] == 3), 9)

        modified_entries = [e for e in self._month_entries(2026, 7) if e.status.name == "MODIFIED"]
        self.assertTrue(modified_entries)
        self.assertTrue(any("Balanced working-day reassignment" in (e.remarks or "") for e in modified_entries))

        balance_remark = self.db.query(RemarkLog).filter(
            RemarkLog.date_ref >= date(2026, 7, 1),
            RemarkLog.date_ref <= date(2026, 7, 31),
            RemarkLog.message.like("Working-day duty on % shifted from %"),
        ).first()
        self.assertIsNotNone(balance_remark)


    def test_non_working_rebalance_reduces_april_style_weekend_imbalance(self):
        self._add_staff(["AS", "YS", "NP", "SG", "AR", "NK", "BG", "KML", "PS", "CVN"])

        generate_roster(self.db, 2026, 3)
        generate_roster(self.db, 2026, 4)

        april_entries = self._month_entries(2026, 4)
        sunday_counts = {staff.name: 0 for staff in self.db.query(Staff).order_by(Staff.id).all()}
        non_working_counts = {staff.name: 0 for staff in self.db.query(Staff).order_by(Staff.id).all()}

        for entry in april_entries:
            if not entry.assigned_duty_id:
                continue
            staff = self.db.get(Staff, entry.assigned_duty_id)
            if entry.day_type.name != "WORKING":
                non_working_counts[staff.name] += 1
                if entry.date.weekday() == 6:
                    sunday_counts[staff.name] += 1

        self.assertLessEqual(max(non_working_counts.values()) - min(non_working_counts.values()), 1)
        self.assertLessEqual(max(sunday_counts.values()), 1)

        modified_entries = [e for e in april_entries if e.status.name == "MODIFIED"]
        self.assertTrue(any("Balanced non-working reassignment" in (e.remarks or "") for e in modified_entries))

        balance_remark = self.db.query(RemarkLog).filter(
            RemarkLog.date_ref >= date(2026, 4, 1),
            RemarkLog.date_ref <= date(2026, 4, 30),
            RemarkLog.message.like("Non-working duty on % shifted from %"),
        ).first()
        self.assertIsNotNone(balance_remark)


    def test_may_weekend_sunday_routine_is_balanced_without_breaking_core_rules(self):
        self._add_staff(["AS", "YS", "NP", "SG", "AR", "NK", "BG", "KML", "PS", "CVN"])

        generate_roster(self.db, 2026, 5)

        may_entries = self._month_entries(2026, 5)
        weekend_counts = {staff.name: 0 for staff in self.db.query(Staff).order_by(Staff.id).all()}

        for entry in may_entries:
            if not entry.assigned_duty_id:
                continue
            if entry.day_type.name != "WORKING":
                staff = self.db.get(Staff, entry.assigned_duty_id)
                weekend_counts[staff.name] += 1
            self.assertIsNotNone(entry.assigned_standby_id)
            self.assertNotEqual(entry.assigned_duty_id, entry.assigned_standby_id)

        self.assertEqual(max(weekend_counts.values()), 1)
        self.assertEqual(min(weekend_counts.values()), 1)

        for idx in range(len(may_entries) - 1):
            current = may_entries[idx]
            nxt = may_entries[idx + 1]
            current_roles = {current.assigned_duty_id, current.assigned_standby_id}
            next_roles = {nxt.assigned_duty_id, nxt.assigned_standby_id}
            self.assertTrue(current_roles.isdisjoint(next_roles), f"adjacent conflict between {current.date} and {nxt.date}")

    def test_multi_month_audit_meets_core_and_fairness_acceptance(self):
        self._add_staff(["AS", "YS", "NP", "SG", "AR", "NK", "BG", "KML", "PS", "CVN"])

        for month in range(3, 9):
            generate_roster(self.db, 2026, month)

        for month in range(3, 9):
            entries = self._month_entries(2026, month)
            totals = {staff.name: 0 for staff in self.db.query(Staff).order_by(Staff.id).all()}
            non_working = {staff.name: 0 for staff in self.db.query(Staff).order_by(Staff.id).all()}
            weekend_routine = {staff.name: 0 for staff in self.db.query(Staff).order_by(Staff.id).all()}

            for idx, entry in enumerate(entries):
                self.assertIsNotNone(entry.assigned_duty_id, f"{entry.date} is vacant")
                self.assertIsNotNone(entry.assigned_standby_id, f"{entry.date} is missing standby")
                self.assertNotEqual(entry.assigned_duty_id, entry.assigned_standby_id, f"{entry.date} has the same main and standby")

                staff = self.db.get(Staff, entry.assigned_duty_id)
                totals[staff.name] += 1
                if entry.day_type.name != "WORKING":
                    non_working[staff.name] += 1
                    if entry.date.weekday() in (5, 6):
                        weekend_routine[staff.name] += 1

                if idx < len(entries) - 1:
                    nxt = entries[idx + 1]
                    current_roles = {entry.assigned_duty_id, entry.assigned_standby_id}
                    next_roles = {nxt.assigned_duty_id, nxt.assigned_standby_id}
                    self.assertTrue(current_roles.isdisjoint(next_roles), f"adjacent conflict between {entry.date} and {nxt.date}")

            self.assertLessEqual(max(totals.values()) - min(totals.values()), 1, f"total variance too high in month {month}")
            self.assertLessEqual(max(non_working.values()) - min(non_working.values()), 1, f"non-working variance too high in month {month}")
            self.assertLessEqual(max(weekend_routine.values()) - min(weekend_routine.values()), 1, f"weekend routine variance too high in month {month}")


if __name__ == "__main__":
    unittest.main()

