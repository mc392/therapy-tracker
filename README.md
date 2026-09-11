# GroundWork

A single-file, offline-first web app (and an iOS wrapper around the same file) for a UK
sole-trader therapist: clients, sessions, rooms, supervision, CPD, payments, business costs,
and a Self Assessment estimate. Installable as a PWA; no server, no account, nothing uploaded.

## Where things are

| Path | What it is |
|---|---|
| `TherapyTracker-web/index.html` | **The app.** All HTML, CSS and JavaScript in one file. A table of contents sits at the top of the main `<script>`. |
| `TherapyTracker-web/sw.js` | Service worker (offline shell; bump the cache name when an icon or the manifest changes). |
| `CLAUDE.md` | The engineering reference: data model, invariants, the reasoning behind every non-obvious decision. **Read this before editing.** |
| `IMPROVEMENTS.md` | What each round of work asked for and what was delivered. |
| `docs/` | Design and product documents — iOS wrapper, monetisation, tax positioning, releasing, the Sep 2026 review. |
| `docs/tasks/` | Self-contained task briefs for larger pieces of work. |
| `scripts/` | Checks and tests (below), the iOS build glue, test-data generation. |
| `tests/` | The tax-engine suite and eight synthetic practices as importable backups. |
| `ios/` | The Capacitor shell and the watch app. |

The folder is still called `TherapyTracker-web` and the database `TherapyTrackerDB` on purpose —
see CLAUDE.md § Naming.

## Running it

There is no build step. Serve the folder and open it:

```bash
npx serve TherapyTracker-web      # or any static server; file:// works for most of it
```

Pushing to `main` deploys `TherapyTracker-web/` to GitHub Pages. The iPhone app bundles a copy
and is cut separately — see `docs/releasing.md`.

## Checks and tests

```bash
npm run check                # syntax parse, the native-seam drift check, schedule parity — run before every push
npm i --no-save playwright   # once, for the browser suites (deliberately not a dependency)
npm run test:tax             # 134 tax-engine tests, derived from the HMRC rules
npm run test:behaviour       # opens the forms, clicks Save, asserts what landed in the data
npm run test:guidance        # every info icon opens a sheet; the app map, Getting started, search and help
npm run test:import          # the spreadsheet importer against the shapes real sheets take
npm run test:rent | test:tiers | test:pins | test:projection | test:review
```

Every suite's expectations are derived from the documented rule, never pasted from what the code
returned — CLAUDE.md § Tax engine tests explains why that matters.

## Editing the app

- One file, ~15,000 lines. Search for the `===== Section name =====` banners, or start from the
  table of contents at the top of the script.
- Copy rule: a card says one sentence on screen; the reasoning goes behind an info dot
  (`infoDot`) or a *Find out more* link (`infoLink`), registered with `infoDef`. Any screen that
  draws one must call `wireInfo(host)`; `npm run test:guidance` catches the ones that don't.
- Never edit `CBT/Therapy Tracker.html` — an old diverged copy.
