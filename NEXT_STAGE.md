# KRAM — Next Stage: Multi-Roster Support
# Stage 2 Planning Document
# Created: 2026-03-22

---

## Current State (Stage 1)

- Single roster per organisation
- One staff pool
- One calendar, one duty rotation
- Works perfectly for one duty type

---

## Stage 2 Concept: Simple Isolated Rosters

### The Rule (Simple)
- **One staff member belongs to exactly one roster. No exceptions.**
- **Two rosters have zero knowledge of each other. Completely isolated.**
- Think of each roster as its own sealed container inside the same app.

```
Organisation
├── Roster: "Gate Duty"      ← Staff A, B, C   (sealed)
├── Roster: "Patrol Duty"    ← Staff D, E, F   (sealed)
└── Roster: "Armoury Duty"   ← Staff G, H      (sealed)
```

Staff A can never appear in Patrol Duty. Gate Duty never sees Patrol Duty's calendar.
They just happen to live in the same app for the same organisation.

---

## What Changes

### Database

**New column on `staff` table:**
```
roster_id   INTEGER FK -> rosters.id   DEFAULT 1
```
One staff → one roster. Done.

**New table: `rosters`**
```
id            INTEGER PRIMARY KEY
name          VARCHAR(150)     -- "Gate Duty"
description   VARCHAR(300)     -- optional
leave_buffer  INTEGER DEFAULT 2
auto_standby  BOOLEAN DEFAULT TRUE
created_at    DATETIME
sort_order    INTEGER
```

**`calendar` table — add:**
```
roster_id   INTEGER FK -> rosters.id
```
Each calendar entry belongs to exactly one roster.

**Migration:** existing staff and calendar entries all get `roster_id = 1` (auto-created as "Default Duty").

---

## Backend Changes

### New Router: `/api/rosters/`
```
GET    /api/rosters/             List all rosters
POST   /api/rosters/             Create new roster
PUT    /api/rosters/{id}         Rename / update settings
DELETE /api/rosters/{id}         Delete roster + its staff + its calendar
```

### All Existing Endpoints
Add `roster_id` as a query param or path segment. Each endpoint filters by it.

```
GET  /api/staff?roster_id=2          Only staff in roster 2
POST /api/roster/generate?roster_id=2   Generate only roster 2
GET  /api/calendar?roster_id=2&year=2026&month=3
```

Roster engine, debt tracking, calendar — all already scoped to the staff list.
Since staff are already isolated, passing `roster_id` to filter staff is the only real change.

---

## Frontend Changes

### Roster Switcher (Top Nav)
```
[ Gate Duty ▼ ]   ← click to switch active roster
```
- One global state: `activeRosterId`
- Every page reads from and writes to that roster only
- Switching is instant — just changes the filter

### New Page: Manage Rosters (`/rosters`)
- List rosters with staff count
- Create new roster (name + settings)
- Rename / delete
- When creating a staff member → assign them to a roster at creation time

### Staff Page Change
- Staff creation form gets a "Roster" dropdown
- Staff list shows which roster each person belongs to
- Can reassign a staff member to a different roster (moves them, not copies)

---

## UX Flow

**Setup second roster:**
1. Go to Manage Rosters → "+ New Roster" → name it "Patrol Duty"
2. Go to Staff → Add Staff → select "Patrol Duty" for each new person
3. Switch active roster to "Patrol Duty" in top nav
4. Generate → works exactly like Stage 1, just for Patrol Duty's staff

**Day to day:**
1. Open KRAM
2. Pick roster from dropdown
3. Everything works exactly as before — same pages, same flow

---

## Migration: Stage 1 → Stage 2

- Auto-create roster id=1 named "Default Duty" on first upgrade launch
- All existing staff get `roster_id = 1`
- All existing calendar entries get `roster_id = 1`
- Operator can rename "Default Duty" to their actual duty name
- Zero data loss. Zero re-onboarding.

---

## Implementation Order

### Phase A — Backend
1. Add `rosters` table + `roster_id` to `staff` and `calendar`
2. Migration in `ensure_schema()`
3. CRUD endpoints for rosters
4. Add `roster_id` filter to all existing endpoints

### Phase B — Frontend
1. `activeRosterId` global context
2. Roster switcher in nav
3. Roster management page
4. Staff creation: assign to roster
5. All API calls pass `roster_id`

---

## Estimated Scope

| Component          | Effort  |
|--------------------|---------|
| DB schema + migration | 0.5 day |
| Backend filter updates | 1 day |
| Frontend context + switcher | 0.5 day |
| Roster management page | 1 day |
| Staff page update | 0.5 day |
| Testing + rebuild | 1 day |
| **Total**          | **~4.5 days** |

---

## What Does NOT Change

- Roster generation logic — untouched
- Debt tracking — already per-staff, works naturally
- Calendar logic — untouched
- PDF/CSV export — just filtered by roster
- Availability/leave — per staff, already isolated

The entire Stage 1 codebase stays. Stage 2 is purely additive.
