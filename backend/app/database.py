from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema():
    if "sqlite" not in settings.DATABASE_URL:
        return

    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = inspector.get_table_names()
        if "availability" not in tables:
            return

        columns = {col["name"] for col in inspector.get_columns("availability")}
        if "availability_type" not in columns:
            conn.execute(
                text("ALTER TABLE availability ADD COLUMN availability_type VARCHAR(32) NOT NULL DEFAULT 'leave'")
            )

        staff_columns = {col["name"] for col in inspector.get_columns("staff")} if "staff" in tables else set()
        if "working_debt" not in staff_columns:
            conn.execute(
                text("ALTER TABLE staff ADD COLUMN working_debt INTEGER NOT NULL DEFAULT 0")
            )
        if "holiday_debt" not in staff_columns:
            conn.execute(
                text("ALTER TABLE staff ADD COLUMN holiday_debt INTEGER NOT NULL DEFAULT 0")
            )
        if "join_date" not in staff_columns:
            conn.execute(
                text("ALTER TABLE staff ADD COLUMN join_date DATE")
            )
        if "relieve_date" not in staff_columns:
            conn.execute(
                text("ALTER TABLE staff ADD COLUMN relieve_date DATE")
            )
        if "abbreviation" not in staff_columns:
            conn.execute(
                text("ALTER TABLE staff ADD COLUMN abbreviation VARCHAR(12) NOT NULL DEFAULT ''")
            )

        roster_columns = {col["name"] for col in inspector.get_columns("roster_settings")} if "roster_settings" in tables else set()
        if "leave_rejoin_buffer_days" not in roster_columns:
            conn.execute(
                text("ALTER TABLE roster_settings ADD COLUMN leave_rejoin_buffer_days INTEGER NOT NULL DEFAULT 2")
            )
        if "official_duty_min_buffer_days" not in roster_columns:
            conn.execute(
                text("ALTER TABLE roster_settings ADD COLUMN official_duty_min_buffer_days INTEGER NOT NULL DEFAULT 2")
            )
        if "official_duty_comfort_buffer_days" not in roster_columns:
            conn.execute(
                text("ALTER TABLE roster_settings ADD COLUMN official_duty_comfort_buffer_days INTEGER NOT NULL DEFAULT 4")
            )
        if "comfort_unavailability_threshold" not in roster_columns:
            conn.execute(
                text("ALTER TABLE roster_settings ADD COLUMN comfort_unavailability_threshold INTEGER NOT NULL DEFAULT 12")
            )

        if "swap_log" in tables:
            swap_columns = {col["name"] for col in inspector.get_columns("swap_log")}
            if "reason" not in swap_columns:
                conn.execute(
                    text("ALTER TABLE swap_log ADD COLUMN reason TEXT")
                )


def get_db():
    db = SessionLocal()
    try:
        try:
            from .services.staff_naming import sync_staff_abbreviations
            sync_staff_abbreviations(db)
        except Exception:
            db.rollback()
        yield db
    finally:
        db.close()
