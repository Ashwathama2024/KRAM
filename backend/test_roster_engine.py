import os
import sys
from datetime import date

# Add the project root to sys.path to import the app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.database import SessionLocal
from app.services.roster_engine import generate_roster
from app.models.models import Staff

def main():
    db = SessionLocal()
    try:
        print("Generating Roster for April 2026...")
        # Assume there's already staff in the DB since user ran it. 
        # But if there are no staff, let's create dummies.
        active_staff = db.query(Staff).all()
        if not active_staff:
            print("No staff found, creating Staff A, B, C, D...")
            db.add_all([
                Staff(name="Staff A", active=True),
                Staff(name="Staff B", active=True),
                Staff(name="Staff C", active=True),
                Staff(name="Staff D", active=True),
            ])
            db.commit()
            
        calendar_entries = generate_roster(db, 2026, 4, force=True)
        staff_map = {s.id: s.name for s in db.query(Staff).all()}
        
        print("\nROSTER FOR APRIL 2026:")
        print(f"{'Date':<15} | {'Type':<10} | {'Duty (Main)':<15} | {'Standby':<15} | {'Remarks'}")
        print("-" * 80)
        
        for e in calendar_entries:
            d = staff_map.get(e.assigned_duty_id, 'None')
            s = staff_map.get(e.assigned_standby_id, 'None')
            rem = e.remarks[:30] if e.remarks else ""
            print(f"{e.date} | {e.day_type.value:<10} | {d:<15} | {s:<15} | {rem}")
            
    finally:
        db.close()

if __name__ == "__main__":
    main()
