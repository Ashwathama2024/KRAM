-- DutySync Master — Database Schema
-- Compatible with SQLite and PostgreSQL

-- Staff members
CREATE TABLE IF NOT EXISTS staff (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  VARCHAR(100) NOT NULL UNIQUE,
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    weekday_pointer       INTEGER NOT NULL DEFAULT 0,
    holiday_pointer       INTEGER NOT NULL DEFAULT 0,
    total_working_duties  INTEGER NOT NULL DEFAULT 0,
    total_holiday_duties  INTEGER NOT NULL DEFAULT 0,
    duty_debt             INTEGER NOT NULL DEFAULT 0,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Monthly calendar entries
CREATE TABLE IF NOT EXISTS calendar (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    date                  DATE NOT NULL UNIQUE,
    day_type              VARCHAR(10) NOT NULL CHECK (day_type IN ('working','weekend','holiday')),
    is_holiday            BOOLEAN NOT NULL DEFAULT FALSE,
    holiday_name          VARCHAR(200),
    assigned_duty_id      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    assigned_standby_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    status                VARCHAR(10) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('assigned','pending','modified','vacant')),
    remarks               TEXT,
    updated_at            DATETIME
);

-- Staff unavailability / leave
CREATE TABLE IF NOT EXISTS availability (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    reason      VARCHAR(500),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date >= start_date)
);

-- Roster generation settings
CREATE TABLE IF NOT EXISTS roster_settings (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    auto_assign_standby   BOOLEAN NOT NULL DEFAULT TRUE,
    separate_weekend_pool BOOLEAN NOT NULL DEFAULT TRUE,
    gap_hours             INTEGER NOT NULL DEFAULT 24,
    updated_at            DATETIME
);

-- Remark / warning log
CREATE TABLE IF NOT EXISTS remark_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message     TEXT NOT NULL,
    level       VARCHAR(20) NOT NULL DEFAULT 'info',
    date_ref    DATE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar(date);
CREATE INDEX IF NOT EXISTS idx_availability_staff ON availability(staff_id);
CREATE INDEX IF NOT EXISTS idx_availability_dates ON availability(start_date, end_date);

-- Default settings row
INSERT OR IGNORE INTO roster_settings (id, auto_assign_standby, separate_weekend_pool, gap_hours)
VALUES (1, TRUE, TRUE, 24);
