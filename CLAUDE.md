# KRAM — Claude Context Map

> **Kartavya Roster & App Management** · v1.0.0  
> Logic-driven duty roster generator with fair rotation algorithm.  
> Built by Kartavya Development. Not for commercial use.  
> Developer / Admin with exclusive rights: **Abhishek Singh** (see `privilege_mode` below)

---

## Quick Start

```bash
# Backend (port 8000, auto-reload)
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (port 5173, proxies /api → 8000)
cd frontend
npm run dev

# Tests
cd backend && pytest tests/ -v

# Full desktop build
python build_app.py
```

---

## Tech Stack

### Backend
| Package | Version | Role |
|---------|---------|------|
| fastapi | 0.111.0 | API framework |
| uvicorn[standard] | 0.30.1 | ASGI server |
| sqlalchemy | 2.0.30 | ORM |
| alembic | 1.13.1 | Migrations (not used — `ensure_schema()` handles it) |
| pydantic | 2.7.1 | Validation / serialization |
| pydantic-settings | 2.2.1 | Env-based config |
| python-dateutil | 2.9.0 | Date helpers |
| reportlab + fpdf2 | 4.2.0 / 2.7.9 | PDF export |
| Pillow | 10.3.0 | Icon generation |
| pystray | 0.19.5 | Desktop tray icon |
| pyinstaller | ≥6.10 | Desktop packaging |

### Frontend
| Package | Version | Role |
|---------|---------|------|
| react + react-dom | 18.2.0 | UI framework |
| react-router-dom | 6.22.0 | SPA routing |
| @tanstack/react-query | 5.28.0 | Server state / caching |
| axios | 1.6.8 | HTTP client |
| date-fns | 3.6.0 | Date formatting |
| recharts | 2.12.2 | Bar charts (AuditPage) |
| lucide-react | 0.356.0 | Icons |
| tailwindcss | 3.4.3 | Styling |
| clsx | 2.1.0 | Class merging |
| react-hot-toast | 2.4.1 | Notifications |
| vite-plugin-pwa | 0.19.8 | PWA / service worker |

---

## Directory Map

```
KRAM/
├── CLAUDE.md                         ← you are here
├── README.md
├── BUILD.md
├── NEXT_STAGE.md                     ← Stage 2 multi-roster design doc
├── docker-compose.yml                ← SQLite stack (backend:8000, frontend:80)
├── docker/docker-compose.postgres.yml
├── build_app.py                      ← npm build + PyInstaller → dist/KRAM/
├── build_installer.py                ← Inno Setup (.exe installer)
├── generate_icons.py
│
├── backend/
│   ├── kram.db                       ← SQLite DB (active)
│   ├── dutysync.db                   ← SQLite DB (legacy/old name — ignore)
│   ├── requirements.txt
│   ├── launcher.py                   ← Desktop tray icon + auto-launch browser
│   ├── KRAM.spec                     ← PyInstaller spec
│   ├── tests/
│   │   └── test_roster_logic.py      ← 20+ pytest cases
│   └── app/
│       ├── main.py                   ← FastAPI app, CORS, SPA static routing, startup
│       ├── config.py                 ← Settings (DATABASE_URL, SECRET_KEY, CORS_ORIGINS)
│       ├── database.py               ← Engine, SessionLocal, ensure_schema(), get_db()
│       ├── models/models.py          ← 7 ORM models
│       ├── schemas/schemas.py        ← All Pydantic DTOs
│       ├── routers/
│       │   ├── setup.py              ← First-time init
│       │   ├── staff.py              ← Staff CRUD
│       │   ├── availability.py       ← Leave / official duty CRUD
│       │   ├── calendar.py           ← Calendar entry CRUD + holiday marking
│       │   └── roster.py             ← Generate, heal, audit, swap, override, export
│       └── services/
│           ├── roster_engine.py      ← Core logic (~1100 lines)
│           ├── export_service.py     ← CSV / PDF generation
│           └── staff_naming.py       ← Abbreviation auto-gen + sync
│
└── frontend/
    ├── vite.config.ts                ← Proxy /api → 8000 dev (8765 desktop)
    ├── package.json
    ├── src/
    │   ├── App.tsx                   ← Setup gate, shell, nav, routes
    │   ├── main.tsx
    │   ├── index.css
    │   ├── pages/
    │   │   ├── OnboardingPage.tsx    ← 4-step wizard (org/unit/settings/launch)
    │   │   ├── CalendarPage.tsx      ← Month grid, day type edit, CSV/PDF download
    │   │   ├── RosterPage.tsx        ← Generate, heal, swap, manual-override, export
    │   │   ├── StaffPage.tsx         ← Staff CRUD + inline rank/name/number edit
    │   │   ├── AuditPage.tsx         ← Bar chart (abbrev labels), fairness table
    │   │   ├── SettingsPage.tsx      ← Buffer days, org name, auto-standby toggle
    │   │   └── OperationsHandbookPage.tsx
    │   ├── services/api.ts           ← Axios client, all TS types, all API calls
    │   └── utils/
    │       ├── date.ts               ← currentMonthDate()
    │       └── staff.ts              ← staffLabel(staff) → abbreviation || name
    └── public/
        ├── manifest.json             ← PWA manifest (name: DutySync Master)
        ├── favicon.ico
        ├── icon-192.png
        └── icon-512.png
```

---

## Database Models

### Staff
```python
id, name (UNIQUE), abbreviation, active
join_date, relieve_date
weekday_pointer     # position in working-day chain
holiday_pointer     # position in non-working-day chain (legacy — engine uses index lookup)
total_working_duties, total_holiday_duties  # recalculated each generation
duty_debt           # = working_debt + holiday_debt (cached aggregate)
working_debt        # skipped working-queue duties to repay
holiday_debt        # skipped non-working-queue duties to repay
privilege_mode      # Boolean DEFAULT False — Fri/Sat duty soft-block (see §Privilege Mode)
created_at
```

### Calendar
```python
id, date (UNIQUE INDEX), day_type (WORKING|WEEKEND|HOLIDAY)
is_holiday, holiday_name
assigned_duty_id → Staff, assigned_standby_id → Staff
status (ASSIGNED|PENDING|MODIFIED|VACANT)
remarks, updated_at
```

### Availability
```python
id, staff_id (INDEX) → Staff
start_date (INDEX), end_date (INDEX)
availability_type (LEAVE|OFFICIAL_DUTY), reason, created_at
```

### RosterSettings (single-row config)
```python
id, org_name, unit
auto_assign_standby, separate_weekend_pool (unused)
gap_hours (unused), leave_rejoin_buffer_days (DEFAULT 2)
official_duty_min_buffer_days (DEFAULT 2)
official_duty_comfort_buffer_days (DEFAULT 4, unused)
comfort_unavailability_threshold (DEFAULT 12, unused)
updated_at
```

### RemarkLog
```python
id, message (TEXT), level (info|warning|error), date_ref, created_at
```

### SwapLog
```python
id, first_date, second_date
first_staff_id_before, first_staff_id_after
second_staff_id_before, second_staff_id_after
reason, created_at
```

### ManualOverrideLog
```python
id, date, override_type (emergency|routine|other)
reason, heal_applied (Boolean)
prev_duty_id, prev_standby_id, new_duty_id, new_standby_id → Staff
created_at
```

### Schema Migrations (ensure_schema in database.py)
Manual `ALTER TABLE` migrations run on startup. No Alembic needed for SQLite.  
Always add new columns here AND in the ORM model AND in Pydantic schemas.

---

## API Endpoints

### Setup `/api/setup`
| | Method | Path | Body / Params | Returns |
|-|--------|------|---------------|---------|
| | GET | `/setup/status` | — | `SetupStatusOut` |
| | POST | `/setup/initialize` | `SetupInitializeRequest` | `SetupStatusOut` |

### Staff `/api/staff`
| | Method | Path | Body / Params | Returns |
|-|--------|------|---------------|---------|
| | GET | `/staff/` | — | `StaffOut[]` |
| | POST | `/staff/` | `StaffCreate` | `StaffOut` |
| | GET | `/staff/{id}` | — | `StaffOut` |
| | PUT | `/staff/{id}` | `StaffUpdate` | `StaffOut` |
| | DELETE | `/staff/{id}` | — | 204 |

`StaffUpdate` fields: `name?`, `active?`, `duty_debt?`, `join_date?`, `relieve_date?`, `privilege_mode?`

### Availability `/api/availability`
| | Method | Path | Body |
|-|--------|------|------|
| | GET | `/availability/` | — |
| | POST | `/availability/` | `AvailabilityCreate` |
| | PUT | `/availability/{id}` | `AvailabilityUpdate` |
| | DELETE | `/availability/{id}` | — |

### Calendar `/api/calendar`
| | Method | Path | Params | Returns |
|-|--------|------|--------|---------|
| | GET | `/calendar/` | `year`, `month` | `CalendarOut[]` |
| | GET | `/calendar/{date}` | `YYYY-MM-DD` | `CalendarOut` |
| | PUT | `/calendar/{date}` | `CalendarUpdate` | `CalendarOut` |
| | POST | `/calendar/holiday` | `HolidayMark` | `CalendarOut` |
| | GET | `/calendar/export/pdf` | `year`, `month` | PDF bytes |

### Roster `/api/roster`
| | Method | Path | Body / Params | Returns |
|-|--------|------|---------------|---------|
| | POST | `/roster/generate` | `GenerateRosterRequest` | `CalendarOut[]` |
| | POST | `/roster/heal` | `year`, `month` | `CalendarOut[]` |
| | GET | `/roster/audit` | `year`, `month` | `AuditReport` |
| | GET | `/roster/remarks` | `limit=50` | `RemarkOut[]` |
| | DELETE | `/roster/remarks` | — | 204 |
| | POST | `/roster/swap` | `SwapRequest` | `CalendarOut[]` |
| | GET | `/roster/swap/history` | `limit=50` | `SwapLogOut[]` |
| | GET | `/roster/settings` | — | `RosterSettingsOut` |
| | PUT | `/roster/settings` | `RosterSettingsBase` | `RosterSettingsOut` |
| | POST | `/roster/manual-override` | `ManualOverrideRequest` | `CalendarOut[]` |
| | GET | `/roster/manual-override/history` | `limit=50` | `ManualOverrideLogOut[]` |
| | GET | `/roster/export/csv` | `year`, `month` | CSV bytes |
| | GET | `/roster/export/pdf` | `year`, `month` | PDF bytes |

### Health
```
GET /api/health → {"status":"ok","app":"KRAM","version":"1.0.0"}
```

---

## Roster Engine — Business Logic

### Two Independent Queues
```
Working queue:     day_type == WORKING     (Mon–Fri, not holiday)
Non-working queue: day_type == WEEKEND     (Sat, Sun)
                   day_type == HOLIDAY     (public/closed holidays)

Each queue has:
  - Its own circular staff chain (independent rotation order)
  - Its own debt counter (working_debt / holiday_debt)
  - Its own pointer (last assigned standby → next duty)
```

### Chain Rule
```
Today's STANDBY on Day D → becomes DUTY on Day D+1 (same queue)
This ensures smooth handover and predictable rotation.
Chain breaks are logged to RemarkLog but don't halt generation.
```

### No-Consecutive-Duty Rule (Global)
```
Same person CANNOT be assigned duty on back-to-back calendar dates
(even across different queues — e.g., Friday working + Saturday holiday).
Checked by: _has_adjacent_duty_conflict(db, staff_id, date)
  → queries Calendar for date-1 and date+1, checks assigned_duty_id
```

### Look-Ahead Standby Rule
```
Before assigning S as standby on Day D:
  1. Is S available on Day D? (direct check)
  2. Is S available on Day D+1 in the same queue? (look-ahead)

If both pass → assign S as standby (chain will continue cleanly tomorrow).
If look-ahead fails for ALL candidates → fall back to best available,
  log "chain break" remark, continue.

Implemented in: _pick_standby_with_lookahead()
Returns: (Staff|None, index, lookahead_ok: bool, note: str|None)
```

### No-Vacant Guarantee (3-Tier Fallback)
```
When picking DUTY for any day:
  Tier 1: Full chain walk — respect all buffers + availability
  Tier 2: Chain walk — ignore rejoin buffer (post-leave cooldown waived)
  Tier 3: Force-assign — pick active staff with fewest total duties
           (guarantees no vacant day; logged to RemarkLog)
```

### Debt Correction (≥2 Threshold)
```
When a person is skipped due to unavailability → their queue-debt increments by 1.
When a person receives duty → their queue-debt decrements by 1 (if >0).

In _pick_from_chain(), if best_debt_candidate.debt >= chain_natural.debt + 2:
  → promote the high-debt person ahead of the chain-natural pick.

This corrects multi-duty imbalances caused by leave gaps
without disrupting normal single-duty variance.
```

### Post-Generation Rebalancing
```
After main duty assignment: _rebalance_month_main_duties()
  → Target: max-min variance ≤ 1 per queue
  → Swaps duties between "over-assigned" and "under-assigned" staff
  → Respects: _can_assign_duty_to_entry() + _is_privilege_blocked()
  → Logs each swap to RemarkLog ("Variance rebalance on DATE")

After rebalancing: _rebuild_month_standby_assignments()
  → Rebuilds all standby picks from scratch (chain order, look-ahead)
```

### Availability Check (in order)
```python
_is_staff_available(staff, date, db, ignore_rejoin_buffer=False):
  1. date < staff.join_date  → False  (not yet joined)
  2. date > staff.relieve_date → False  (already relieved)
  3. Availability record overlaps date → False  (on leave or official duty)
  4. Recent Availability.end_date + buffer > date → False  (rejoin cooldown)
     - LEAVE: leave_rejoin_buffer_days (default 2)
     - OFFICIAL_DUTY: official_duty_min_buffer_days (default 2)
     (skipped entirely if ignore_rejoin_buffer=True)
```

---

## Privilege Mode

```
Field: Staff.privilege_mode  (Boolean, DEFAULT False)
Activation: PUT /api/staff/{id}  { "privilege_mode": true }

Effect when True:
  - DUTY blocked on:     Friday (weekday 4) AND Saturday (weekday 5)
  - STANDBY blocked on:  Friday (weekday 4) ONLY
  - Saturday standby:    ALLOWED
  - Debt accrual:        NONE (completely silent — no debt, no remark)
  - Rebalancer:          Cannot push duty onto privilege-blocked days

Implementation (roster_engine.py):
  _is_privilege_blocked(staff, date):
      if not staff.privilege_mode: return False
      return date.weekday() in (4, 5)   # Fri, Sat

  Called in:
    _pick_from_chain()              → before skipped.append() (duty picker)
    _pick_standby_with_lookahead()  → inside _try(), Friday-only guard
    _rebalance_month_main_duties()  → after _can_assign_duty_to_entry() check

Currently active for: Commandant(JG) Abhishek Singh 5152-J (staff_id=11)
```

---

## Frontend — Pages & Routes

| Route | Page | Key Data | Mutations |
|-------|------|----------|-----------|
| `/` | CalendarPage | calendar[year,month], staff, availability | update day type, mark holiday |
| `/roster` | RosterPage | calendar, remarks | generate, heal, swap, manual-override |
| `/staff` | StaffPage | staff, availability | create/update/delete staff, add/delete availability |
| `/audit` | AuditPage | audit[year,month] | — |
| `/settings` | SettingsPage | roster settings | update settings |
| `/handbook` | OperationsHandbookPage | — | — |

### App.tsx — Setup Gate
```tsx
// Before showing the app, checks setup status:
if (isLoading)        → <KRAMSplash />       (spinner overlay)
if (!is_configured)   → <OnboardingPage />   (4-step wizard)
else                  → <MainAppShell />     (full app)
```

### api.ts — Key Patterns
```typescript
const BASE = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({ baseURL: BASE })

apiError(e, fallback)   // extracts e.response.data.detail || fallback
staffLabel(staff)       // staff.abbreviation || staff.name
currentMonthDate()      // stable Date object for current month (no re-render drift)
```

### AuditPage — Chart Fix
```typescript
// X-axis uses abbreviation, tooltip shows full name:
chartData = stats.map(s => ({
  name: s.staff.abbreviation || s.staff.name,  // short label on axis
  fullName: s.staff.name,                      // shown in custom tooltip on hover
  Working: s.working_duties,
  Holiday: s.holiday_duties,
}))
```

### StaffPage — Inline Edit
```typescript
// parseName("Commandant(JG) Abhishek Singh 5152-J")
// → { rank: "Commandant(JG)", name: "Abhishek Singh", number: "5152-J" }
// Heuristic: last digit-containing token = service number
//            first bracket/dot token = rank

// Edit flow:
openEdit(s)     → parses name, populates editRank/editName/editNumber
editComposed()  → [rank, name, number].filter(Boolean).join(' ')
Save            → staffApi.update(id, { name: editComposed() })
                → abbreviation auto-regenerates via sync_staff_abbreviations
```

---

## Services

### staff_naming.py
```python
generate_unique_abbreviation(name, existing_list):
    # Skips rank tokens: CMDT, CAPTAIN, COL, MR, DR, etc.
    # Takes last 2 alpha-word initials or first 3 letters
    # Appends digit suffix if duplicate: ASG, ASG2, ASG3…

sync_staff_abbreviations(db):
    # Called in every get_db() yield — checks & corrects all abbreviations
    # Only commits if something changed
    # ⚠️  Performance: runs on EVERY request — consider moving to startup event
```

### export_service.py
```python
export_csv(entries)              → bytes   # Date, Day, Type, Duty, Standby, Status
export_pdf(entries, month, year) → bytes   # Table-style landscape A4 PDF
export_calendar_pdf(entries, month, year, org_name='') → bytes  # Grid-style calendar PDF
```

---

## Environment & Config

```bash
# backend/.env (or environment variables)
DATABASE_URL=sqlite:///./kram.db          # default
SECRET_KEY=kram-secret-key-change-in-production
KRAM_PORT=8765                            # set by launcher.py (desktop mode)

# frontend/.env.local (optional override)
VITE_API_URL=                             # empty = use /api proxy
VITE_DEV_PROXY_TARGET=http://127.0.0.1:8000  # default dev (override to 8765 for desktop)
```

### CORS Origins (config.py)
```
http://localhost:5173    (Vite dev)
http://localhost:3000    (alt dev)
http://localhost:80      (Docker nginx)
http://127.0.0.1:5173
http://localhost:{KRAM_PORT}   (desktop dynamic port)
http://127.0.0.1:{KRAM_PORT}
```

### Vite Proxy (vite.config.ts)
```typescript
// Dev:     proxy /api → http://127.0.0.1:8000   (uvicorn)
// Desktop: proxy /api → http://127.0.0.1:8765   (PyInstaller uvicorn)
// Override: set VITE_DEV_PROXY_TARGET env var
const apiProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000'
```

---

## Known Issues / Gaps

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | `sync_staff_abbreviations` runs on every request | `database.py:get_db()` | Move to startup event or staff-write hooks |
| 2 | `triggerDownload` duplicated | `CalendarPage.tsx`, `RosterPage.tsx` | Extract to `src/utils/download.ts` |
| 3 | No index on `calendar.date` column | `models.py` | Add `index=True` to `Calendar.date` |
| 4 | `_has_adjacent_duty_conflict` queries DB per candidate | `roster_engine.py` | Cache prev/next entry before the picker loop |
| 5 | Onboarding doesn't guard against duplicate staff names on fast double-submit | `setup.py` | Add name dedup before bulk insert |
| 6 | `dutysync.db` legacy file sits alongside `kram.db` | `backend/` | Delete `dutysync.db` if unused |
| 7 | `pytest-cache-files-*` dirs pollute `git status` | `.gitignore` | Add `pytest-cache-files-*/` to `.gitignore` |
| 8 | No "Today" jump button on CalendarPage | `CalendarPage.tsx` | Replicate RosterPage's "Current Month" button |

---

## Build & Deploy

### Docker (SQLite, default)
```bash
docker compose up --build
# backend → http://localhost:8000
# frontend → http://localhost:80
```

### Docker (PostgreSQL)
```bash
docker compose -f docker/docker-compose.postgres.yml up --build
```

### Desktop App (PyInstaller)
```bash
python build_app.py
# → backend/dist/KRAM/KRAM.exe  (Windows)
# → backend/dist/KRAM/KRAM      (Linux/Mac)
# Embeds: Python runtime + all packages + frontend/dist/
```

### Windows Installer (Inno Setup)
```bash
python build_installer.py
# → installer/Output/DutySyncMaster-Setup.exe
```

---

## Git Conventions

- Commits follow imperative mood: "Add X", "Fix Y", "Refactor Z"
- Co-authored with: `Claude Sonnet 4.6 <noreply@anthropic.com>`
- Untracked files: `NEXT_STAGE.md`, `backend/KRAM.spec`, `installer/KRAM.iss`, `OnboardingPage.tsx`, `build_installer.py`
- **Never commit**: `.env`, `*.db`, `node_modules/`, `dist/`
