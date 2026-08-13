# Feature request prompt — retention flagging, business finances, peer supervision

Source: therapist feedback from a practice-owner user and a second accredited therapist
(BACP), Aug 2026 feedback thread. Distilled and scoped before implementation.

Implement the following four features in `TherapyTracker-web/index.html` (the single-file
canonical app — see CLAUDE.md for architecture, `commit()`/`normalize()`/schema versioning
conventions). Each feature below is scoped; **do not implement data import (was item 5) —
that's being built separately.**

## 1. Client data retention review flag

- Add a configurable retention period (in years) to `S.settings`. Default **6 years**
  (matches insurer/civil-claim guidance from BACP training — no strict legal minimum exists;
  BACP complaint window is ~3yr, insurers often want 6yr).
- Trigger: **N years after a client's last logged session**, for clients whose status is an
  "ended" one (Finished / equivalent — status is a free-text field mapped via
  `S.clientCategories`, so the setup/settings UI needs to let the therapist indicate which
  status value(s) count as "ended", or infer from the existing "Finished" default).
- **Two separate periods**, not one: a period for clinical notes and a period for
  financial/session records (dates, fees, payment status), since they have different
  compliance rationale and the app's existing `anonymiseClients()` already separates "clear
  notes" from "preserve financial shape" — this feature should let each have its own timer.
- Surface the flag: a review list (e.g. in Settings › Privacy & removal, alongside the
  existing `dzMenu()` anonymise/erase routes) showing which ended clients have crossed their
  notes-retention and/or financial-retention threshold, with quick links into the existing
  `anonymiseClients()` / `eraseClients()` flows. Do not auto-delete anything — flag only.
- Setup wizard: add a step (in `startSetup()`'s flow) to set both retention periods, defaulted
  to 6 years, editable — the therapist can change the value but the step should not be
  skippable/blank.
- Settings: both values visible and editable at any time after setup, not just during
  onboarding.
- Respect schema versioning conventions — this is new state, likely needs a `SCHEMA_VERSION`
  bump and migration step in `normalize()`.

## 2. Business expenses: monthly/fixed room billing + general expenses

- Rooms currently assume a per-session rate (`S.rooms[].rate`, `roomRateHistory`). Add a
  second billing mode per room: **monthly fixed rent**, so a room can be either per-session
  or a flat recurring monthly cost, reflecting that one therapist pays 2 fixed monthly rents
  (not per session) and another also pays fixed monthly room rent rather than hourly.
- Add a general **"other expenses"** log for recurring/one-off business costs not tied to a
  specific room booking — electricity, wifi, and anything else — with at least: description,
  amount, date/recurrence (one-off vs monthly), and category.
- These new costs must **feed into the existing net income / tax-year reports** (Reports tab,
  `taxYear()`-based figures) alongside the existing per-session room-rate deductions — not
  just be logged for reference.

## 3. Other income

- Add an **"other income"** log, structurally parallel to other expenses: description, amount,
  date/recurrence, category. Motivating examples: subletting a room (£200/month recurring),
  a second job/tutoring income.
- This **feeds into net income / tax-year reports** the same way other expenses do.
- Open question to resolve during implementation: whether non-therapy income (e.g. tutoring,
  which isn't practice-related) belongs in this practice-finance tracker at all, or whether
  the feature should be scoped to income that's clearly part of the therapy business (room
  subletting) vs. flagged separately/optionally. Use judgement, but don't silently conflate
  personal income streams with the practice's tax-year P&L without a way to distinguish them.

## 4. Peer supervision hours

- Current behaviour: `S.supervision` sessions each count as 1hr toward the accreditation
  1:6 clinical:supervision ratio (Form 3A card), and the UI explicitly states "Peer
  supervision doesn't count" toward that ratio.
- Add a **separate peer supervision log** (distinct from the existing clinical supervision
  log) so peer supervision hours can be recorded and counted toward **total accreditation
  hours**, while remaining **excluded from the 1:6 ratio calculation** — this matches the
  existing rule rather than contradicting it.
- Surface peer supervision hours wherever total accreditation hours are shown (Form 3A card,
  training/placement hours area) as an additional line item, separate from the ratio-affecting
  clinical supervision total.

## General constraints (apply to all four)

- No build step, vanilla JS — see CLAUDE.md conventions (`commit()`, `normalize()`,
  `SCHEMA_VERSION`, migrations, `mirror()`).
- New state must survive `exportJSON()`/backup+restore and the existing
  `validateImport()` version-refusal logic.
- Don't regress the known multi-tab write limitation (already documented, deliberately
  deferred) — no new cross-tab coordination expected here.
- Follow existing UI patterns (bottom sheet forms, `renderSettings()`/`renderRooms()`/
  `renderReports()` structure) rather than introducing new UI conventions.
