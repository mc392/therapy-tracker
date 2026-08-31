# T7a — Tax, most of the year: the "At a glance" view + seasonal moments

**Model:** Opus · **Depends on:** nothing (T5 recommended first) · **Touches:**
`TherapyTracker-web/index.html`, `CLAUDE.md`

## Why (the product insight this implements)
Most of the tax tab's power is only needed at certain times of year — entering HMRC's
figures after filing (January), the new-year allowance review (April), quarterly MTD
exports. Between those moments, the only questions that matter are: **how much am I on
track to owe, how much should be sitting in the pot, and when does money next leave?**
Because the infrequent jobs are forgotten between uses, they must be *guided* when their
season arrives (T7b builds the guides), and *out of the way* the rest of the time (this
task). Today the Estimate segment opens with seven cards; the everyday answer is buried
in two of them.

## Design

**New default segment: "Now".** `VIEWS.tax` (~line 4027) gains a segment before the
existing four: `[["now","Now"],["estimate","Estimate"],["payments","Pot & payments"],
["allowances","Allowances"],["mtd","MTD"]]`, and `taxSeg` (~line 1832) defaults to
`"now"`. `setSeg`'s allow-list gains `"now"`. All existing deep links (`go("tax",{seg:…})`)
keep working; nothing is removed from the other segments.

**The "Now" segment renders, in order:**
1. The standing disclaimer bar (reuse `disclaimBar` — extract it so both "now" and
   "estimate" share one definition).
2. **Seasonal moment cards** from `taxMoments()` (below) — zero cards most of the year.
3. **Three numbers**, one KPI card each, full width, no surrounding essay:
   - "On track to owe for <TY>" — `taxLiability(curTaxYear())`: use `.total`; label the
     source in the sub-line ("projected from this year so far" / "HMRC's assessed
     figure" when `src==="actual"`). Tapping opens `taxDetailsSheet(curTaxYear())`.
   - "Keep in your pot" — `taxPot()`: `target` as the figure; sub-line
     "that's about <rate%> of everything you're paid" + the balance verdict line if
     `pot.balance!=null` (reuse the existing vmsg logic from the pot card at ~line 4082).
     Tapping goes to `go("tax",{seg:"payments"})`.
   - "Next payment" — `nextTaxPayment()`: amount, date, and `what` label; nothing due →
     "Nothing due yet". Tapping goes to the payments segment.
4. A quiet link row: "Full estimate ›" (estimate seg) · "Monthly take-home ›" (estimate
   seg — it lives there) · basis label as plain text ("Counted on the cash basis").

**`taxMoments()`** — a pure function returning the currently-live seasonal cards. Each
moment: `{id, from, to, title, body, cta:{label, action}}` where `id` includes the year
so next year's instance re-fires. Moments (all computed from `today()`, `curTaxYear()`,
`prevTY`, and existing state — no new stored config):
- **`file-<prevTY>`** · 1 Jan – 31 Jan: shown when the previous tax year has ended and
  `taxYearRec(prevTY)` has no `liability` and isn't marked `filed`. Title "Self
  Assessment season", body: filing deadline 31 Jan + "once you've filed, put HMRC's real
  figures in and every estimate switches to them." CTA → the T7b "After you file" flow
  (until T7b lands: `go("tax",{seg:"payments"})` — leave a `// T7b` marker).
- **`jan-pay-<year>`** · 1 Jan – 5 Feb: shown when `nextTaxPayment()` falls on 31 Jan of
  this year. Title "January's payment", body names the amount and its parts (reuse
  `taxRowLabel`). CTA → payments seg.
- **`jul-pay-<year>`** · 1 Jul – 5 Aug: same for the 31 Jul instalment.
- **`new-year-<TY>`** · 6 Apr – 31 May: title "New tax year — a two-minute review", body:
  "Your student loan plan, where you pay tax and your use-of-home claim carry forward
  automatically — confirm they're still right for <newTY>." CTA → the T7b review flow
  (until then: `go("tax",{seg:"allowances"})` + `// T7b` marker).
- **`mtd-q…`** · from each MTD quarter end (5 Jul/5 Oct/5 Jan/5 Apr) for 5 weeks: shown
  ONLY if MTD plausibly applies — gate on projected income ≥ £50,000
  (`taxPot().projInc>=50000`) so small practices never see it. CTA → mtd seg.

Each card gets a small "Dismiss" control: store `settings.taxMoments={ [id]: isoDate }`
(seed in `normalize()` as `sg.taxMoments=sg.taxMoments||{}`); a dismissed id never
re-shows (ids are year-scoped so next year's naturally returns). Travels with backups by
design, like `coach.seen`.

**Estimate segment slimming (small, surgical):** move the pot summary card
(`potCard`) OFF the estimate segment — "Now" replaces it (the payments seg remains the
detail home, as its comment already insists). Everything else on estimate stays.

**Tips:** update the existing `tax` entry in `TIPS` (~line 7823): first step now points
at the "Now" segment's three numbers; keep the "estimate, not a return" step. Add
`data-coach` attributes as needed.

## Constraints
- The disclaimer gate (`taxAcked()`) wraps the whole tab — unchanged, and "Now" renders
  only behind it.
- No new tax maths. Every figure comes from `taxLiability`, `taxPot`, `nextTaxPayment`,
  `taxTimeline` — if a number needs computing, it already exists; find it.
- `tyMemo` performance rules apply: "Now" must not add whole-year scans outside the
  memoised entry points.
- The Pot & payments segment keeps ALL its current content — "Now" summarises, never
  replaces detail (the "no figure appears twice with two different explanations" rule:
  the three numbers reuse the same sources as their detail screens, so they cannot
  drift).
- Old `taxSeg` values arriving via `TAB_ALIAS`/deep links must still land correctly.

## Verify
- `npm run check`.
- With a served copy and console access, monkey-patch `today()`'s return (or temporarily
  adjust the date) to walk the calendar: 15 Jan (file + jan-pay cards), 10 Jul (jul-pay),
  20 Apr (new-year), 1 Mar (no cards). Confirm dismiss persists and year-scoped ids
  return the following year.
- Existing-data profile: Tax opens on "Now" with sane figures; Estimate/Payments
  unchanged apart from the moved pot card; tax tests still pass (paste
  `tests/tax-tests.js` — it must, since no engine code changed).
- CLAUDE.md § Tabs updated: Tax = Now / Estimate / Pot & payments / Allowances / MTD.

## Out of scope
- The guided wizards themselves (T7b). Renaming segments (T6). Any engine change.
