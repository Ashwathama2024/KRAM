# KRAM Core Roster Logic

This document defines the roster rule order. Any future change must preserve this priority.

## Rule Order

1. Core safety rules
2. Fairness rules
3. Buffer and comfort rules
4. Cosmetic or reporting behavior

## 1. Core Safety Rules

These rules are mandatory and must never be broken by generation, healing, rebalancing, or manual swap logic.

- No date can remain vacant if a legal assignment exists.
- Main duty and standby cannot be the same person on the same date.
- No person can take main duty on adjacent calendar dates.
- This consecutive-duty ban applies globally across all queues:
  - working to working
  - working to non-working
  - non-working to working
  - non-working to non-working
- Availability must be respected.
- Join date and relieve date must be respected.
- Manual swap logic must also satisfy the same safety checks before commit.

If a fairness improvement breaks a core safety rule, the fairness improvement must be rejected.

## 2. Fairness Rules

These rules apply only after the core safety rules are satisfied.

- Working and non-working duty should be distributed as evenly as possible.
- Saturday and Sunday are both non-working days.
- For fairness review, Saturday and Sunday belong to the same non-working weekend bucket, referred to operationally as the `Sunday routine`.
- `Sunday routine` burden should be distributed as evenly as possible across Saturday and Sunday assignments together.
- Weekend and holiday burden should be distributed as evenly as possible.
- A person with higher monthly burden may donate a duty to a person with lower monthly burden only if the move is legal under the core safety rules.
- Rebalancing is an adjustment layer after normal queue generation. It must not replace the base queue model.

## 3. Buffer And Comfort Rules

These rules affect eligibility after core safety and fairness are considered.

- Leave rejoin buffer must be respected.
- Official duty buffer must be respected.
- Comfortable months may allow soft balancing choices.
- High-unavailability months may limit balancing if legal safe options become too narrow.

If a buffer rule conflicts with a core safety rule, core safety wins. If a fairness rule conflicts with a buffer rule, the implementation should prefer the legal choice that preserves both when possible.

## 4. Base Engine Model

The following engine behavior is part of the current roster design and should not be silently replaced.

- Working days and non-working days use separate queues.
- Previous generated months influence the next month through carry-forward queue state.
- Standby is assigned after main duty generation.
- Rebalancing may modify assignments after queue generation, but only when legal.
- Queue continuity is best-effort; the global no-consecutive-duty rule and debt correction may override the exact standby-to-next-duty handoff.
- Audit and counters must reflect actual stored assignments, including modified rows.

## Change Checklist

Before merging any roster-logic change, verify:

- No vacant main duties for the affected month when staffing is sufficient.
- No missing standby when staffing is sufficient.
- No same-person main and standby on the same date.
- No adjacent-day conflicts across main and standby roles.
- Working and non-working fairness is not made worse without a stated reason.
- Remarks and audit output still explain modified assignments.

## Current Reference Files

- `backend/app/services/roster_engine.py`
- `backend/tests/test_roster_logic.py`
- `frontend/src/pages/OperationsHandbookPage.tsx`
