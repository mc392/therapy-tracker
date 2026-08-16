# Therapy Tracker — Claude Code Reference

## Project overview
Single-file offline PWA for Charlotte Bloor Therapy (UK sole-trader therapist). Tracks clients, sessions, rooms, supervision, and payments. Installable on iOS/Android/desktop via PWA.

## Canonical files
```
TherapyTracker-web/
  index.html          ← THE canonical app (all HTML, CSS, JS in one file)
  sw.js               ← Service worker (cache name must be bumped on every edit)
  manifest.webmanifest
  icon-180.png
  icon-192.png
  icon-512.png
```

**Do not edit** `CBT/Therapy Tracker.html` — that is an old diverged copy. Always edit `TherapyTracker-web/index.html`.

## Deployment
Hosted on GitHub Pages. Push to `main` → GitHub Actions deploys `TherapyTracker-web/` automatically.
Live URL: `https://<username>.github.io/<repo>/`

## Service worker cache strategy
`sw.js` uses **network-first for HTML** (`req.mode === "navigate"`) — every page load fetches a fresh `index.html` from the network, so updates land on next open without needing a cache bump.

Static assets (icons, manifest) use cache-first. You only need to bump the cache name constant (`C = "tt-v3"`) if you rename or remove a static asset file, to force old caches to clear.

Two rules the fetch handler depends on — don't regress them:
- **`SHELL` (`./` + `index.html`) is precached at install.** The SW does not intercept the navigation that registers it, so without this a first-time visitor who goes offline before their second visit gets nothing at all.
- **Only `resp.ok && status === 200` is ever cached** (`cacheable()`). A 404/502 served during a deploy window would otherwise become the permanent offline copy. A non-ok navigation response also falls back to the cached shell rather than showing the error page.

## State / data model
Global `S` object — persisted to IndexedDB (`TherapyTrackerDB`) with a localStorage mirror.

```js
S = {
  clients: [],          // each has _id
  rooms: [],            // {location, rate, due, billing:"session"|"monthly", pay:{freq,day}}
  sessions: [],         // therapy sessions
  supervision: [],      // clinical supervision (counts toward the 1:6 ratio)
  peerSupervision: [],  // peer supervision (total hours only, never the ratio — added Aug 2026)
  rateHistory: [],      // therapist fee history
  roomRateHistory: [],  // per-room per-session rate history
  roomRentHistory: [],  // per-room monthly rent history (added Aug 2026)
  expenses: [],         // {desc, amount, date, recurrence (see FREQS), endDate, category}
  otherIncome: [],      // as expenses + scope:"practice"|"personal"
  paidCharges: {},      // "kind:ref|dueDate" -> date settled. Reminders only, never the tax figures
  clientCategories: [], // {status, category} mapping
  game: {               // gamification (added June 2026)
    activeWeeks: [],    // ISO week strings for streak tracking
    records: { longestStreak, mostClearedAtOnce, biggestCatchup },
    seenStreak: 0
  },
  settings: {           // practice branding + feature switches (added Aug 2026)
    practiceName, practiceTagline,
    palette,            // key into PALETTES: sage|ocean|plum|clay|indigo|slate
    features: {},       // key → false to disable; absent/true = on
    retention: {},      // {notesYears:6, financeYears:6, endedStatuses:[]} — review flags only
    cpdTarget,          // annual CPD hours target (default 30)
    onboarded, onboardedAt, setupRuns
  }
}
```

Key functions:
- `commit(summary)` — save to IndexedDB + audit log + snapshot (up to 120 snapshots). Also calls `gameTouch()`. **Returns `true`/`false`** — false means the write failed and the red `#saveBanner` is now showing.
- `undo()` — reverts to previous snapshot (reads the last two via `snapRecent(2)`).
- `normalize(st)` — seeds missing fields / defaults; called on load. Also runs ordered migrations and stamps `meta.schemaVersion`.
- `loadState()` — initialises DB, loads or seeds state into `S`.
- `mirror(S)` — writes S to localStorage as a safety net. **Returns false** if the write failed (quota / private mode).

### Durability rules (added Aug 2026 — do not regress)
- **Never load every snapshot.** Use `snapCount()`, `snapRecent(n)` and `snapOldestIds(n)` (all cursor-based). The old `snapAll()` getAll in `commit()`'s prune step cost **1,088 ms** per save at the 120-snapshot cap on a 1,145-session dataset; `snapPrune()` does it in ~11 ms.
- **Never swallow a save error.** `commit()` calls `noteSaveFailure()` on failure, which raises `#saveBanner` and corrects the caller's "Saved" toast on the next tick. `clearSaveFailure()` runs on the next successful save.
- **`requestPersistence()`** runs at init (`navigator.storage.persist()`). Without a grant, iOS Safari evicts this app's storage after ~7 days of no visits. Status is shown in Settings › Storage on this device; `denied` is normal until the app is added to the Home Screen.
- **`exportJSON()` must work with `_db === null`** — the crash screen is the only way out of a broken render and it offers Export.

### Schema versioning
`SCHEMA_VERSION` (currently `5`) is stamped on `S.meta.schemaVersion` and on every backup envelope. Unstamped data is treated as v1.
- **v5 (Aug 2026)** stamped a cancellation charge percentage on every missed session and added `settings.cancelRules` + `settings.reveal`. A v5 backup can hold a session charged at 50%; a v4 build has no such field and would bill it in full.
- **v4 (Aug 2026)** gave every cost and income row a category *key* mapping to an SA103 box, migrated from the old free-text label (which is kept). Added `settings.taxBasis`, `useOfHome`, `taxRegion`, `studentLoan`, `class2Voluntary`.
- **v3 (Aug 2026)** added expenses, other income, peer supervision and monthly room rent. No in-place migration: every new field's absence means exactly what it meant in v2. The bump exists for the other direction — a v3 backup carries money a v2 build cannot see, so restoring it there would drop those rows and save the loss back.
- Bump it when a change would be **misread** by an older build, and add the matching step to the ordered migration block in `normalize()`.
- `validateImport()` **refuses** a backup whose version is newer than the running app — importing would silently drop unknown fields and then save that loss back over good data.
- `normalize()` never downgrades newer data in place.

### Business finances (added Aug 2026 — one choke point)
`ledgerBetween(from, to, {toDate})` is the **only** place expenses, other income and monthly room rent are totalled. `tyNet()` adds its `total`; the tax-year table's Net column now prints `tx.netAll` (i.e. `tyNet`) rather than recomputing `billed - room - sup` inline, so the Net and Tax columns cannot drift apart. Anything new that reports money goes through it too.
- Recurring rows are **expanded at read time** (`moneyOccurrences`) — never generated into the data. Correcting an amount corrects every period it applies to. A monthly row repeats on its own day of the month, clamped in short months (31 Jan → 28 Feb → 31 Mar, no drift).
- `scope:"personal"` income (a second job, tutoring — a different trade) is totalled separately as `personalIncome` and deliberately **excluded** from `total`, so it never inflates the practice's Self Assessment figure.
- Monthly rooms: switching a room to monthly pushes a `roomRateHistory` step of `0` **and** a `roomRentHistory` step, both dated. `derive()` and `effRoomRate()` are untouched — past sessions keep their historical per-session charge and new ones stop charging per session by themselves. `room.billing` only drives the UI.

### Payment schedules & what's been paid (added Aug 2026)
`FREQS` is the one vocabulary for repeats (once / weekly / fortnightly / monthly / quarterly / annually), and `freqStep(anchor,freq,n)` is the only place the maths lives — used by both `moneyOccurrences()` and `schedNext()`.
- **A schedule never moves an accrual date.** `roomRentOccurrences()` anchors each charge to the rent history's own day and attaches the payment date separately as `due`. Letting `room.pay` drive the accrual date silently shifted historical rent between tax years — don't reintroduce it.
- `roomSchedule(rm)` reads the legacy `due` field (`EOM` → monthly/last, `EOW` → weekly/Sunday) when `pay` is absent, so old rooms keep working. `roomForm` writes both.
- `S.paidCharges` is a tick-list, **not accounting**: `ledgerBetween()` ignores it entirely, because a cost belongs to the year it fell due whether or not it's been settled.
- Paid rows stay in the list for a fortnight **after being ticked** (not after falling due), or settling an old overdue charge would make the row vanish mid-tap with no undo.

### Room billing and the session form
A room on monthly rent has no per-session room fee to settle, so `derive()` returns `roomPaidNA` and the session form hides the room-paid controls entirely (`paintRoomPaid`). `missingReasons()` and `derive().complete` both honour it, so those sessions never show up as incomplete for a question that doesn't apply to them.

### CPD vs accreditation (added Aug 2026)
`mountCPD()` is the card everyone sees: supervision + peer hours over a rolling 12 months against `settings.cpdTarget`. `mountAccreditation()` (Form 3A, the 1:6 ratio) is gated behind the `accreditation` feature, which `normalize()` defaults **off for new installs and on for anyone who already has data** — pulling it from someone mid-accreditation would lose them the screen they keep records for. `stepCPD()` asks in setup.

### Scrolling rules
- `go(tab,{keepScroll:true})` re-renders without throwing the reader to the top. Use it for anything redrawing the screen the user is already on (segment toggles, saving from a sheet); plain `go(tab)` is for real navigation.
- `scrollChart(wrap,keep)` positions a horizontally-scrolling chart. Charts are built **before their view is attached**, so it has no width at draw time — hence the rAF *and* the `setTimeout(...,0)`. Redraws pass the old `scrollLeft`, so tapping a bar no longer flings the chart back to the oldest period.

### Settings layout
Five collapsible `<details class="sgrp">` groups (practice / data / records / help / about). Every card lives inside a group — don't add loose cards to the settings view.
- **Everything starts collapsed on each fresh entry.** `_setGrpOpen` holds open state in memory only and `go()` clears it whenever Settings is entered without `keepScroll`. It must survive a `keepScroll` redraw — saving a setting re-renders the view, and without this the section being worked in folds shut underneath the user. Not persisted to localStorage: a section left open last week is not one you want reopened today.

## Tabs (restructured Aug 2026)
**Home · Sessions · Practice · Money · Tax.** `TAB_ALIAS` maps the old names (`clients`, `supervision`, `income`, `raw`) onto the new tab **and a segment**, so old deep links land somewhere meaningful; `go(tab,{seg})` sets it. A plain tab tap stays on whatever segment the reader last used.
- **Practice** — Clients / Trends / Rooms / Supervision. `supervisionPanel()` and `rawPanel()` are panels, not views: they are mounted whole so their inner sub-tabs keep working.
- **Money** — Overview / Costs & income / Table.
- **Tax** — Estimate / Allowances / MTD.
- The old `income` feature flag became `money` + `tax`; `normalize()` carries `income:false` across to both rather than switching a hidden tab back on.

## UK tax engine (Aug 2026)
- **Basis.** `settings.taxBasis` defaults to **cash** — HMRC's default for sole traders since 2024/25. `tyNet()` counts a session in the year its `paidDate` falls; `ledgerBetween()` counts a cost when `paidCharges` says it was settled. **Where no payment date is recorded, cash falls back to the due date** — strict cash would let an untidied tick-list wipe every cost off the return, which is a far worse failure than being slightly early.
- **Categories.** `EXP_CATS`/`INC_CATS` are keyed objects carrying an `SA103` box. A `risk` field marks deductions HMRC commonly challenges (personal therapy, CPD that trains new skills); those render an amber warning rather than being hidden or silently claimed.
- **Use of home.** `uohMonthly()` — simplified bands (£10/£18/£26 by monthly hours) or actual apportionment. Generated at read time into `ledgerBetween`, never written into the ledger.
- **Payments on account.** `taxSchedule(ty)` — once the liability passes £1,000, January is the balancing payment *plus* 50%, with another 50% in July. `poaBase()` excludes Class 2 and student loan, which never form part of a payment on account.
- **Class 2** is no longer mandatory (2024/25+) but can be paid voluntarily below the Small Profits Threshold; the app offers it rather than omitting it.
- **Region, student loan, pension.** Scottish bands via `settings.taxRegion`; `SL_PLANS` for plans 1/2/4/5/PG; pension contributions extend the basic-rate band (`penGross`) rather than being deducted after tax.
- **MTD.** `mtdQuarters()`/`mtdPeriod()`/`mtdExport()`. **The quarters must reconcile to `tyNet` on both bases** — a regression here means a cost was added to the ledger but not to an SA103 box (per-session room fees were exactly that bug). Submission is deliberately out of scope: it needs an OAuth secret, fraud-prevention headers and HMRC recognition, none of which fit an offline PWA.

### Tax engine tests
`tests/tax-tests.js` — 84 tests. Serve the app, open it, paste the file into the console. It lives **outside** `TherapyTracker-web/` so it never deploys, never calls `commit()`, and restores the live state when it finishes.

**Expected values are derived from the HMRC rule, never copied from the app.** That is not pedantry: the payment-date bug below initially *passed* a test written by pasting in what the code returned, and only surfaced when a second test approached the same figure from the rule. If a test needs updating after a change, re-derive the number.

Two real bugs it has already caught:
- `SCOT_BANDS` mixed band *widths above the personal allowance* with *absolute* thresholds while the loop treated all of them as absolute — overstating Scottish tax by up to ~£3,300/yr (£2,025 at £40k).
- `taxSchedule()` dated every payment a year early. Self Assessment is due 31 January **following the end** of the tax year, so 2026-27 is 31 Jan 2028, not 2027.

The reconciliation block is the highest-value part: across six practice profiles, `profitBreakdown` = the four MTD quarters summed = `tyNet`. A mismatch means a cost reached one path but not another — exactly how the missing per-session room fee in the SA103 boxes was found.

### Editing this file with scripts
It is 438KB of single-file app, so bulk edits are scripted. **Always build the whole string, assert every anchor matched, write to `index.html.tmp`, then `os.replace()`.** Opening the real file for writing first truncated it to 0 bytes once when the script raised mid-run.

### Error boundary
`go(tab)` wraps the view render; a throw shows `crashScreen(err, tab)` — which always offers **Export a backup**, Home and Reload — instead of leaving `<main>` empty. `window.onerror` / `unhandledrejection` route to `reportGlobalError()` (console always, one toast per session).

## Spreadsheet import (Settings › Import from a spreadsheet)
Onboarding path for a therapist arriving with history in Excel. `impOpen()` drives three sheet stages: **source** (`impStageSource` — paste TSV / pick .csv / download template) → **mapping** (`impStageMap`) → **dry-run preview** (`impStagePreview`) → `impCommit(plan)`.

Rules that must not regress:
- **Merge, never replace.** `importJSON()` is a whole-state replace and is for *backups only*. `impCommit()` appends to `S.sessions` and auto-creates the clients/rooms the rows reference. Nothing is written until the final button.
- **`impPlan()` is pure** — builds the whole plan without touching `S`, so the preview is exactly what will happen.
- **Fees become dated history, not a flat field.** Sessions have no `rate`; `derive()` reads `effRate(client,date)`. `impCommit()` walks rows oldest-first and pushes `rateHistory` / `roomRateHistory` entries only where the fee differs from what's already effective at that date. The first entry for a brand-new client/room is stamped `2000-01-01` so earlier sessions still resolve. **A £60 session imported before a rise to £65 must still derive £60** — that's the tax figures.
- **Dedupe key is `client|date|time`** (`impKey`). `onDupe:"skip"` leaves the app's version; `"update"` overwrites in place by `_id` — so re-importing a corrected file never duplicates.
- **Date ambiguity is resolved per column, not per row.** `impDateScan()` takes the whole column: any row with a first number >12 settles day-first vs month-first; nothing conclusive defaults to UK DMY and *says so*. Conflicts (both readings forced) are flagged red. The user can override, and the banner shows a worked example (`"03/04/2026" → 03 Apr 2026`) that updates live. Excel serials, named months and 2-digit years are handled in `impDateParts()`.
- **Late cancellation** is set at import from either the mapped column *or* `/late cancellation/i` in notes — `normalize()`'s backfill is one-time and gated by `meta.lateCancelBackfill`, so it will never see imported rows.
- **One Undo reverses the whole import.** `commit()` already snapshots, so the snapshot on top of the stack *is* the pre-import state; `impCommit()` only lays down its own `"Before spreadsheet import"` snapshot when `snapCount()===0`. Adding one unconditionally makes Undo take two taps — don't.
- **`impTemplate()` generates the template from `IMP_FIELDS`**, so template headers can never drift from the parser. There's a test for this: the template's own column list must guess back to itself exactly.
- `impGuess()` matches header synonyms exact-first then substring, one field per column. Field order in `IMP_FIELDS` breaks ties (`location` claims a bare "Room" before the `room` field does).
- Offered as a setup-wizard step (`stepImport`) on first run only — a re-run promises not to touch client data. Inside the overlay it runs with `{quiet:true}` so it doesn't `go()` or `celebrate()` behind it.

## Data removal (Settings › Privacy & removal)
Collapsed `<details class="dz">` → `dzMenu()`. Four routes, all gated by `dzConfirm()`: a summary of what changes, an export-first button, an acknowledgement checkbox, a typed phrase, and a 3-second arming delay on the final button.
- `anonymiseClients(codes)` — code → `Client 001`, notes/invoice/receipt cleared. **Preserves the financial and clinical shape**: dates, fees, payments, attendance and late-cancel flags all survive, so tax figures are unchanged. Captures `s.lateCancel = isLateCancel(s)` *before* clearing notes, because the historical convention stored it in the notes text. Session notes become `"Y"`, not `""`, so `derive().complete` still reads as done.
- `eraseClients(codes)` — removes clients, their sessions and their `rateHistory`; strips their names from `supervision[].clients` but **keeps the supervision entries** (therapist's own CPD/tax record).
- `eraseEverything()` — clears the three object stores **first** (always succeeds), then deletes the DB (another open tab can defer this), then removes `tt_*` localStorage keys. **Leaves the SW caches alone** — they hold no client data, and clearing them would strand the user offline with no app.
- `dzPickClients()` / `sheetPromise()` — sheet-based promises that resolve `null` when dismissed by any route (a MutationObserver on `#sheet`'s class), so no promise hangs.

## Records retention (Settings › Records retention — added Aug 2026)
`retentionRows()` flags clients whose status is in `settings.retention.endedStatuses` and whose **last logged session** is more than `notesYears` / `financeYears` ago. Two clocks, because notes and money are kept for different reasons.
- **Flag only — it never deletes.** The row's Anonymise / Erase buttons hand off to `dzRunAnonymise([code])` / `dzRunErase([code])`, so every removal still goes through the full `dzConfirm()` gauntlet. Don't add a shortcut that skips it.
- `defaultEndedStatuses(st)` reads the therapist's own status→category mapping and takes the statuses under category `Finished`. **Paused / Active enquiry are Pipeline, not ended** — those clients may return, and flagging them would be wrong.
- A client with no logged sessions has no clock to count from and is skipped.

## Peer supervision (added Aug 2026)
`S.peerSupervision` is a separate log from `S.supervision`, reached from a third sub-tab on Supervision. Its hours are added to the **total accreditation hours** in `mountAccreditation()` and are deliberately absent from `sup`, the only figure the 1:6 ratio sees. Keeping the two arrays apart is what makes that rule visible — don't merge them with a `type` field. A peer entry's optional `cost` feeds `tyNet()` like clinical supervision does.

## Cancellations & DNAs (added Aug 2026)
Two kinds of missed session, and the charge is **stamped on the session**, never derived live from the policy.
- `settings.cancelRules = {window:[{hoursBefore,chargePct}], dnaChargePct}`. `cancelPolicy()` sorts windows **longest notice first** and `cancelPolicyPct(kind,hrs)` returns the first one the notice clears. Notice that clears no rule — and notice that was never recorded (`hrs==null`) — charges the **full fee**. That direction is deliberate: a draft that is too high gets corrected on the spot, one that is too low is a fee quietly written off. A therapist wanting a lower floor adds a rule at 0 hours.
- The policy is only ever a **starting point**. `cancelPctFor(s)` reads `s.cancelCharge` and nothing else, so editing the policy cannot reach back and rewrite what a client was already billed. Absent = 100, which is what every session was before v5.
- `derive()` returns `fullRate` (the fee in force), `cancelPct` and `rate` (`fullRate × pct`). Everything downstream — revenue, net, SA103, MTD — reads `rate`, so a reduced charge flows through from that one place. **The MTD quarters must still reconcile to `tyNet` on both bases.**
- **`isCancelled(s)` is the exclusion predicate**, not `isLateCancel`. A DNA has to be excluded from clinical hours, attendance, session counts and milestones for exactly the same reasons a late cancellation is. `isLateCancel` still reads the historical `"Y (late cancellation)"` notes convention and is what sets the `lateCancel` flag itself — don't merge them.
- The session form's charge box carries `data-auto` while it holds a policy-derived figure, so adding the cancellation date afterwards re-derives it; typing in the box clears the mark and the number is then left alone.
- A missed session that **was** charged now appears on receipts (`receiptRows`), labelled in the Mode column, or the statement total would not match what the client was asked to pay.

## Gradual reveal (settings.reveal, added Aug 2026)
No new gating layer — this only decides which existing `feat()` flags start off for a brand-new install.
- `settings.reveal = {mode:"simple"|"all", shown:[]}`. `normalize()` defaults `mode` to **"all"**; only `stepDepth` ever sets `"simple"`, and it is only offered when `!rerun && no sessions && no clients`. Hiding tabs from someone already using them is the one outcome this must never produce.
- `REVEAL_CORE` is what stays on. `REVEAL_STEPS` is the ordered list of what gets offered back and what earns it. A step's `keys` may hold **more than one flag**: `tax` and `finances` are revealed together at 10 sessions, because an estimate that ignores what the practice costs you is one nobody should set money aside against. `shown` is keyed on `keys[0]`.
- Schedule: **10** sessions → Tax + Costs & other income · **20** → Trends · **25** → Quick-add · **40** → Table view.
- `trends` is a feature flag (a segment inside Practice, not a tab). Absent = on, so existing installs and "show everything" keep it; only the simple preset switches it off.
- **`accreditation` and `peer` are excluded from the simple preset** — `stepCPD` asks about both directly, and an answered question beats a default. Peer is never offered by a milestone: whether someone attends peer supervision is a fact about their practice, not something a session count can infer. `startSetup` unticks `peer` for a fresh install only (normalize leaves it absent = on, so existing installs keep it).
- `revealCheck()` runs from `commit()` **after** the write, never before — an accepted nudge commits again and must not interleave with the save that triggered it. One offer per save; the key goes into `shown` whether accepted or declined, so nothing is ever asked twice.

## Gamification (S.game)
- **Streak**: any `commit()` call marks the current ISO week as active via `gameTouch()`.
- **Home view**: streak flame animation, goal progress rings, records badges.
- **Sounds**: `Sfx` (Web Audio, synthesised). Default ON; toggled via 🔊 header button, persisted to `localStorage('tt_sound')`.
- **Confetti**: canvas-based `Confetti` object.
- **Celebrate overlay**: `celebrate(emoji, title, sub, ribbon)`.

## Setup wizard & guided tour (S.settings)
- **First run**: `startSetup()` fires from init when `S.settings.onboarded` is false. `normalize()` sets `onboarded = true` for any state that already has clients or sessions, so existing installs never see it.
- **Flow engine**: `flowStart/flowGo/flowNext/flowClose` drive a full-screen `.ov` overlay (z-index 45 — above the tab bar, below `#sheet`) from an array of step objects `{emoji,h,sub,html,mount,validate,onLeave}`. Shared by setup and the tour.
- **Tour**: `startTour()` — feature-aware, read-only. Replayable from Settings › Setup & help.
- **Re-run**: `confirmRerunSetup()` — warning sheet requiring the user to type `RESET SETUP`. Skips the rooms step once sessions exist.
- **Feature flags**: `feat(key)` gates tabs (`TABS[].ft`), gamification (`celebrate`, `Confetti.burst`), quick-add, attention feed, receipts, accreditation, `peer` (peer supervision, dep: supervision) and `finances` (costs & other income, dep: income). Off = hidden, never deleted.
- **Retention step**: `stepRetention()` sits between money and backup, and its `validate()` refuses blanks or anything outside 1–50 years — a retention period nobody chose is a compliance decision made by a default.
- **Palettes**: `PALETTES` + `html[data-palette]` CSS blocks. `applyPalette()` mirrors to `localStorage('tt_palette')` so the head script applies it before first paint. `paintThemeColor()` keeps `#tcMeta` in sync.
- **Branding**: `practiceName()` / `practiceTagline()` feed the header pill, `--appname` (desktop sidebar title), `document.title` and printed receipts. `applySettings()` re-applies everything after load, import or rollback.

## UI structure
- Single-page app with tab navigation (`nav.tabs`).
- Views rendered into `<main id="main">` — each tab calls its own `render*()` function.
- Bottom-sheet modal: `#sheet` / `#sheetBody` / `openSheet(title, html)`.
- FAB (`#fab`) = quick "Log session".
- Toast notifications: `toast(msg)`.
- Dark/light theme via `data-theme` on `<html>`. `localStorage('tt_theme')` holds `light`/`dark`; **absent = auto** (follow the device, via a `matchMedia` listener). Use `themePref()` to read it, `setTheme('light'|'dark'|'auto')` to set it.
- Colour scheme via `data-palette` on `<html>`, persisted to `localStorage('tt_palette')`.

## Key views / render functions
| Function | Tab |
|---|---|
| `renderHome()` | Dashboard / KPIs |
| `renderClients()` | Clients list |
| `renderSessions()` | Sessions (includes Incomplete sub-tab) |
| `renderIncomplete()` | Bulk room-paid + notes editor |
| `renderUnpaid()` | Bulk unpaid session payment screen |
| `renderCalendar()` | Calendar view |
| `renderRooms()` | Room management (per-session or monthly billing) |
| `financeCards()` / `financeForm()` | Business costs & other income (inside Revenue) |
| `retentionCardHTML()` | Records retention review (inside Settings) |
| `renderReports()` | Raw data / reports |
| `renderSettings()` | Settings / data management |

## Locale / formatting
- Currency: `gbp(n)` → `£` with locale formatting (en-GB).
- Dates: `fmtD`, `fmtDshort`, `fmtDM`, `isoD`, `parseD`.
- Tax year: April 6–April 5 (`taxYear(d)`).

## Known limitations — not yet fixed

### Multi-tab / multi-device writes overwrite each other (audit finding #8, Aug 2026)
**Not addressed. Deliberately deferred — do not assume it is safe.**

`commit()` writes the **entire** `S` object under one key (`state/current`), and nothing coordinates copies of the app:
- No `BroadcastChannel` or `storage`-event listener, so two open tabs never learn about each other's writes. Both hold a stale in-memory `S`; whichever saves last wins, and the other tab's edits are gone with no warning.
- No `_db.onversionchange` handler, so a `DBV` bump in one tab leaves the others writing to a connection that is about to be force-closed.
- No `onblocked` handler on `indexedDB.open`, so a future version bump can hang silently while another tab holds the old connection.
- `eraseEverything()` inherits this: `deleteDatabase` is deferred while another tab holds the DB. Store-clearing runs first specifically so the data is gone regardless.
- Restore is a destructive whole-state replace with **no merge**, so phone + laptop cannot both be live. It is one device at a time, with backups moved by hand.

Realistic failure: a forgotten tab on the laptop reloads and stamps week-old state over recent phone entries.

Fix sketch when picked up: add a monotonic `S.meta.rev`, refuse a write whose base `rev` is stale, and broadcast changes over `BroadcastChannel` so other tabs reload or warn. True cross-device merge is a much larger piece of work.

## Known gotchas
- **Frozen bash mount**: the bash workspace mount of the CBT folder can serve stale content. Use the Read/Edit/Grep file tools (not bash `cat`/`grep`) to read index.html reliably.
- **SEED object**: `window.SEED` at the top of the `<script>` block is the initial data seed. It contains real room names/rates — update carefully.
- **No build step**: pure vanilla JS/CSS/HTML. No npm, no bundler, no TypeScript.
- **IndexedDB version**: `DBV=1` — only bump if adding new object stores (triggers `onupgradeneeded`).
