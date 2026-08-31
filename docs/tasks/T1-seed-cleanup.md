# T1 — Remove personal data from the fresh-install seed

**Model:** Sonnet · **Depends on:** nothing · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`

## Why
This app began as Charlotte's personal tool. Three pieces of her data currently ship to
every public install: her real rooms and rates in the seed, a false "seeded from
spreadsheet" history entry, and her practice name as a fallback. All must go before any
build reaches TestFlight or the store.

## Changes

1. **`window.SEED`** (index.html, ~line 874). Replace the rooms with one generic entry and
   drop the personal ones. New value keeps the exact same shape:
   - `rooms`: `[{"location":"At home","rate":0,"due":"n/a"}]`
   - `roomRateHistory`: `[{"location":"At home","effectiveFrom":"2000-01-01","rate":0}]`
   - Everything else (empty arrays, `clientCategories` defaults, `meta.shell`) unchanged.
   "At home" is kept because it is generic and `sessionForm`'s default location is
   `"At home"` — verify that default still resolves after the change.

2. **`loadState()`** (~line 1136). The `seeded` branch writes a snapshot labelled
   `"Imported from spreadsheet (initial)"` and an audit entry
   `"Seeded from 'Tracking Spreadsheet May26.xlsx' (N sessions)"`. Replace with neutral
   truth: snapshot label `"First run"`, audit summary `"App installed — starting fresh"`.

3. **`normalize()` practice-name fallback** (~line 980). Currently:
   `sg.practiceName=hasData?"Charlotte Bloor Therapy":"GroundWork"`. Change to always
   `"GroundWork"`. This is safe: any device that ever ran the old code already has the
   name persisted in its saved settings, so nothing changes for existing installs.

4. **`practiceInitials()`** (~line 1373): fallback `"TT"` → `"GW"`.

5. **Sweep**: grep the whole file for `Charlotte`, `Bloor`, `London Bridge`, `Clapham`,
   `May26`, `Tracking Spreadsheet`. Remove or neutralise every hit in code and comments
   (comments referencing the history may simply be reworded). Also update CLAUDE.md's
   "SEED object" gotcha (§ Known gotchas) — it currently says the seed contains real room
   names/rates; after this task it must say the seed is generic.

## Constraints
- Do not change the SEED object's key set or types — `loadState`, the tax tests and the
  localStorage fallback path all consume its shape.
- Do not touch `TherapyTrackerDB`, `tt_*` keys or the folder name (CLAUDE.md § Naming).
- The backward-compat checks that treat the literal string `"Therapy Tracker"` as a
  placeholder (in `applyBranding()` and `startSetup()`) must stay.

## Verify
- `npm run check` passes.
- Serve the app, open in a **fresh browser profile / private window**: setup wizard's
  rooms step shows only "At home £0"; after setup, Settings → Undo & history → Recent
  activity shows "App installed — starting fresh", not the spreadsheet line.
- Paste `tests/tax-tests.js` into the console on a served copy: all tests still pass.

## Out of scope
- The beta gate (T2). Restore flow (T3). Any copy rewording beyond the personal strings.
