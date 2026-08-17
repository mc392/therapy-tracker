# GroundWork — Improvements To-Do

**Status: all six items below are built and deployed (Aug 2026).** They are kept as a record of
what was asked for and what was actually delivered, because several ended up differing from the
original request in ways worth knowing. New work goes under *Follow-ups still open* at the bottom.

---

## Done

### 1. Enhanced DNA & cancellation logic ✅ `5ddcee8`
Configurable per-practice rules in **Settings › Cancellations & DNAs**, schema **v5**.

- `settings.cancelRules = {window:[{hoursBefore,chargePct}], dnaChargePct}`.
- **The charge is stamped on the session, not derived live.** `cancelPctFor(s)` reads
  `s.cancelCharge` and nothing else, so editing the policy later cannot rewrite what a client was
  already billed. Chosen deliberately over a dated rule-history — see CLAUDE.md.
- `derive()` returns `fullRate`, `cancelPct` and `rate`; everything downstream reads `rate`, so a
  reduced charge reaches revenue, net, SA103 and MTD from one place.
- `isCancelled()` replaced `isLateCancel` at all six exclusion sites (clinical hours, session
  counts, milestones, attendance, longevity, day-of-week spread).
- Revenue impact is on **Practice › Trends › Missed sessions**: fees not charged, charged anyway,
  and a projected annual cost from the last 90 days.
- The v5 backfill stamps 100% on existing late cancellations, so every historical figure is
  unchanged across the upgrade.

### 2. Remove default rates from setup ✅ `7f71535`
`defaultRate()` and `pensionPcm()` return **null** when unset, which is deliberately not zero.
Nothing is pre-filled; a new client's fee must be typed, because £0 is a real answer (pro bono, a
training placement) that has to be distinguishable from a blank.

### 3. Tax disclaimer & explicit acceptance ✅ `7f71535`
`TAX_DISCLAIMER` is one array feeding the setup step, the first-open gate and the Settings card, so
the three cannot drift apart. New installs acknowledge in setup; existing installs meet the gate on
first opening the Tax tab, since setup never fires for them again. Declining returns you Home. A
standing banner keeps the caveat beside the figures. `terms.html` gained section 4.

### 4. Clarify note-taking limitations ✅ `7f71535`
Stated in setup, the tour, under both notes fields, on printed statements, and in the backup
envelope itself — a backup outlives the app that wrote it.

### 5. Gradual feature revealing ✅ `5ddcee8`, `d54b31d`
`settings.reveal = {mode, shown}`. No new gating layer — it presets the existing `feat()` flags for
a fresh install and offers them back one at a time.

| At | Revealed |
|---|---|
| 10 sessions | Tax **+** Costs & other income (together — an estimate ignoring costs is one nobody should set money aside against) |
| 20 sessions | Trends |
| 25 sessions | Quick-add |
| 40 sessions | Table view |

`normalize()` defaults `mode` to `"all"`; only the setup step sets `"simple"`, and only on a
genuinely fresh install, so nobody with data can have a tab taken away. Peer supervision and
accreditation sit outside the schedule — both are asked directly in setup.

### 6. Better tax-year picker for use-of-home costs ✅ `cde64bb`
The `<select>` became a sticky year strip: chips badged **set / carried / not set / filed**,
prev-next arrows, the year repeated in every heading over the fields it governs, a
"copy last year's figures" action, and a per-year *filed* marker that warns before you edit a
submitted year. Verified all four tax years' monthly, annual and net figures unchanged.

---

## Also delivered this cycle (not on the original list)

- **Long lists fold** (`f41043e`, `b96d352`) — Practice › Clients, all three Trends lists and
  Sessions › All list what's current and fold the rest into an expandable aggregate. This also
  removed a hard `slice(0,400)` on the sessions list that made session 401 unreachable.
  `AGED_MIN` (8) means small practices see no change at all.
- **Sheet header seam** (`70fd0bd`) — pop-up form headers no longer read as a separate white panel.
- **Settings sections** collapse on entry (`982e6f5`).
- **GroundWork rename + launch screen** (`ef94912`, `e8f11f7`, `eaf1345`) — see CLAUDE.md
  § Naming and § Launch screen for what deliberately kept the old name, and why.
- **Default palette corrected to the brand greens** (`e8f11f7`) — `:root` had drifted teal, so the
  Sage swatch in Settings had been advertising a green the app never rendered.
- **Year heatmap starts on this week** (`76508e4`).

---

## Follow-ups still open

1. **The tax test suite has no coverage for cancellation charging.** `tests/tax-tests.js` runs
   84/84 green, but every case predates v5 and builds sessions with no `cancelCharge`, so the
   `fullRate × cancelPct` path in `derive()` is never exercised there. It was verified by hand —
   MTD quarters reconcile to `tyNet` on both bases with 50/25/0/100% charges spread across all four
   quarters — and that check belongs in the suite. **Highest-value next test work.**
2. **Peer supervision has no milestone reveal.** Hidden by "start simple" and only reachable from
   Settings › Features. Deliberate — whether someone attends peer supervision is a fact about their
   practice, not something a session count can infer — but worth revisiting if it goes unfound.
3. **Sessions › Unpaid is still unbounded.** It is a worklist to clear rather than history to
   browse, so it was left whole; a genuinely deep backlog would want the same folding treatment.
4. **`TherapyTracker-web/icon-ideas/` is ~6MB inside the deployed folder** and publishes to GitHub
   Pages. Nothing links to it and the service worker does not precache it, so it costs users
   nothing — but it does not belong in the deploy.
5. **Multi-tab / multi-device writes still overwrite each other** — pre-existing, documented in
   CLAUDE.md § Known limitations, deliberately deferred. Do not "fix" it opportunistically.
6. **App Store work** — see `docs/groundwork-app-store-roadmap.md`. Steps 1–2 (rebrand, brand
   assets) are done; Capacitor, the native features needed to clear Guideline 4.2, and the Apple
   Developer enrolment are not started.

## Notes
- These were prompted by user feedback and security/compliance considerations.
- Each item kept backwards compatibility. The only schema bump was v4 → v5, and it moves no
  existing figure.
