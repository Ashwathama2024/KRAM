# DutySync Master

A logic-driven duty roster generator for a single administrator ("Roster Master").
Implements fair rotation using two independent queues — one for working days, one for non-working days.

---

## Quick Start

```bash
cd dutysync
docker compose up --build
```

- **Frontend**: http://localhost:80
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

---

## Architecture

```
dutysync/
├── backend/          # Python FastAPI + SQLite
│   └── app/
│       ├── main.py
│       ├── models/       # SQLAlchemy ORM models
│       ├── routers/      # API endpoints
│       ├── schemas/      # Pydantic schemas
│       └── services/     # Roster engine, export
├── frontend/         # React + Vite + TailwindCSS + PWA
│   └── src/
│       ├── pages/        # CalendarPage, RosterPage, StaffPage, AuditPage, SettingsPage
│       ├── components/   # DateModal, etc.
│       └── services/     # API client
├── database/         # schema.sql, seed.sql
├── docker/           # PostgreSQL override compose
└── docker-compose.yml
```

---

## System Logic

### Two Independent Queues

| Queue | Days |
|-------|------|
| Working | Monday → Friday |
| Non-Working | Saturday, Sunday, Closed Holidays |

A working day assignment does **not** affect the non-working queue.

### Standby Rule
- Duty = Staff N
- Standby = Staff N+1 (wraps to first if at end)

### Auto-Heal
When staff unavailability is added:
1. Future assignments are cleared
2. Roster is recalculated skipping unavailable staff
3. Duty debt is incremented for skipped staff

### 24-Hour Gap Rule
Staff cannot be assigned duty on consecutive days.

### Duty Debt
If staff is skipped due to leave, their `duty_debt` counter increments.
On the next roster generation, high-debt staff are prioritised.

---

## API Reference

### Staff
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/staff/ | List all staff |
| POST | /api/staff/ | Create staff member |
| PUT | /api/staff/{id} | Update staff |
| DELETE | /api/staff/{id} | Delete staff |

### Availability (Leave)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/availability/ | List all leave records |
| POST | /api/availability/ | Add leave record |
| DELETE | /api/availability/{id} | Remove leave |

### Calendar
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/calendar/?year=&month= | Get month calendar |
| GET | /api/calendar/{date} | Get single date |
| PUT | /api/calendar/{date} | Update calendar entry |
| POST | /api/calendar/holiday | Mark/unmark holiday |

### Roster
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/roster/generate | Generate roster for month |
| POST | /api/roster/heal | Auto-heal future assignments |
| GET | /api/roster/audit?year=&month= | Fairness audit report |
| GET | /api/roster/remarks | Get remark log |
| DELETE | /api/roster/remarks | Clear remarks |
| GET | /api/roster/settings | Get settings |
| PUT | /api/roster/settings | Update settings |
| GET | /api/roster/export/csv?year=&month= | Export CSV |
| GET | /api/roster/export/pdf?year=&month= | Export PDF |

---

## PostgreSQL Mode

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.postgres.yml up --build
```

---

## PWA Installation

Open http://localhost on mobile → tap "Add to Home Screen"
Works offline with cached roster data.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | sqlite:////app/data/dutysync.db | Database connection |
| SECRET_KEY | (default) | App secret |

---

## Imbalance Warning

If the duty variance between most-assigned and least-assigned staff exceeds **2**, the audit page shows an imbalance warning.

---

## Export Formats

- **CSV**: Full roster table download
- **PDF**: Printable A4 landscape roster (colour-coded)
- **Print**: Browser print dialog (print-optimised CSS)
