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
| 5 sessions, one paid | Receipts & statements |
| 10 sessions | Tax **+** Costs & other income (together — an estimate ignoring costs is one nobody should set money aside against) |
| 15 sessions | Streaks & celebrations |
| 20 sessions | Business analytics |
| 40 sessions | Table view |

(Re-tiered by T5, Aug 2026. Quick-add was removed in Sep 2026 and no longer has a step.)

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

## Sep 2026 — feedback round

Five pieces of user feedback, all delivered.

### 1. Room fees no longer belong to the session form ✅
"Don't force a room-paid decision within session input/edit, assume no if blank. Hand off
management to a different section entirely."

A session with a per-session room rate now **raises** that fee automatically, tagged to the
session (`derive().roomOwed`); blank means "not settled yet", which is what `roomDue` always took
it to mean. `derive().complete` is the write-up tick and nothing else, so an unpaid room fee can no
longer make a session incomplete. The two form controls are gone, replaced by a read-only line —
and `sync()` no longer reads those fields at all, so a save cannot blank a settlement. Settling
happens on **Money › Costs & income**, beside Payments due and the rent, in a card that renders
outside both `feat("finances")` and the Plus gate: money already owed for sessions that happened is
neither a preference nor a purchase. Storage is unchanged (`roomPaid` / `roomPaidDate`), so the
SA103 boxes and the MTD quarters are untouched.

### 2. CPD tracks everything, shows its composition, and asks about supervision ✅
Schema **v8**. `S.cpd` logs workshops, courses, conferences, webinars, e-learning, reading,
podcasts, personal therapy and reflective practice; `cpdYearHours()` reports the breakdown rather
than one number; `settings.cpdCountSupervision` / `cpdCountPeer` let the therapist decide whether
supervision counts, defaulting true so no existing figure moves. When the target is met *only*
because supervision counts, the card says what the figure would be without it. CPD gets its own
sub-tab; Insights keeps Form 3A. **Hours only, no cost field** — a course's cost is a business cost
and `ledgerBetween` is the only place costs are totalled.

### 3. Days to payment was measuring the wrong thing ✅
"Still isn't showing anything useful — potentially getting skewed by most people paying in advance?"

Correct, and worse than skew. The gap was clamped at zero and every payment averaged together, so a
practice paid at the session had a median of 0 and a flat line along the bottom of the chart — while
fifty same-day payments averaged against three sixty-day waits reported "typically 0 days" about a
practice with a real collection problem. Now: **a percentage settled up front**, and every waiting
figure computed from the payments that came in *after* the session. Nothing is clamped. A month
where everyone paid on the day is absent from the chart rather than drawn as a nought.

The corpus had **no advance payments at all**, so it could not exercise this case; `payLagDays` now
accepts a negative lag and `online-only` is the up-front practice.

### 4. Who pays late is a trend, not a debt list ✅
It was sorted by what each client owed today — a worklist, which already exists on Sessions ›
Unpaid with a Chase button on it. Each client's payments are now split into their own earlier and
later half and sorted by how far the recent half moved, so the client who has gone from paying on
the day to paying three weeks late leads the list with nothing overdue. Debt stays on the row as
context; the card links to the worklist rather than duplicating it.

### 5. Fee erosion said what it was not measuring ✅
`rate` differs from `fullRate` in exactly one way — the cancellation charge stamped on the session —
so the gap between the card's two lines is **written-off fee on missed sessions and nothing else**.
The card claimed it was also made of older client rates and a shifted mix; both move the fee line
itself and cannot appear in the gap. Retitled **"What a session actually earns"**, with three
figures (per session booked, per session that went ahead, what the fees say), the gap named and the
missed sessions behind it counted. Headlines are now averages over the whole span: the old
last-month headline read −£8.64/14% on the established fixture where the true 18-month figure is
−£1.48/2%.

---

## Sep 2026 — code, copy and orientation review

A three-part pass, written up in `docs/orientation-review-2026-09.md`:

- **Code**: dead functions, a dead constant and the CSS for retired components removed;
  `derivedSessions()`, `goSessions()`, `goRoomCosts()` and `emptyNote()` replace the same snippet
  pasted at eight to eleven sites each; a table of contents at the top of the script. No
  behaviour changed, and every suite still passes.
- **Copy**: the dense paragraphs still on screen were trimmed to one sentence each with the
  reasoning behind an info icon or a *Find out more* link; two new topics, one dead one removed,
  stale `Clients › Rooms` labels corrected.
- **Orientation**: *Where everything is* — a map of the app with a what-to-do-and-how-often list,
  every row a link — from Settings › Setup & help and the empty Home screen; What's new rewritten
  for this cycle; `npm run test:guidance` guards all of it. The recommendations that were **not**
  built are ranked in the review document.

## Follow-ups still open

1. ~~**The tax test suite has no coverage for cancellation charging.**~~ **Done (Aug 2026,
   task T9)** — stamped charges, policy resolution, and MTD reconciliation with mixed
   50/25/0/100% charges on both bases are now in `tests/tax-tests.js`.
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
6. **App Store work** — see `docs/groundwork-app-store-roadmap.md`. Rebrand, brand assets,
   Capacitor and the native features are done, and the app has an App Store Connect record
   (Aug 2026). Remaining: TestFlight on real hardware, screenshots, submission.

7. **`S.cpd` has no spreadsheet import.** The importer covers sessions only. Someone arriving with
   a CPD log in Excel still types it in. It exports (supervision CSV) but does not import.
8. **Nothing reconciles a room fee against what the landlord actually invoiced.** The Room fees card
   totals what the sessions raised; if the room's own invoice disagrees, the therapist adjusts the
   room rate or writes the odd fee off as "not owed". A per-invoice reconciliation was considered
   and is probably over-engineering for a sole trader.

9. **A rent still has no per-invoice reconciliation either**, and for the same reason as 8 — the
   charges are generated from the arrangement the therapist described, not from what the landlord
   billed. The end date (v9) closes the worst of the gap: a rent that stopped now stops.
10. **The setup wizard's room step still only offers "per session" or "per month".** The rhythm
   (weekly, fortnightly, quarterly, yearly) and the start and end dates are set afterwards on the
   room itself. Deliberate — the wizard asks the shortest question that gets someone running — but
   a therapist who pays weekly has to visit Practice › Rooms once to say so.

## Notes
- These were prompted by user feedback and security/compliance considerations.
- Each item kept backwards compatibility. Schema bumps so far: v4 → v5 (cancellation charges),
  v5 → v6 (dated tax settings), v6 → v7 (notes vs admin comments), v7 → v8 (the CPD log and the
  two supervision switches) and v8 → v9 (a rent's own rhythm and end date). None of them moves an
  existing figure — v9's two fields are absent from every rent ever entered, and absent means what
  it has always meant: monthly, ongoing.
