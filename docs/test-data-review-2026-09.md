# Trends and Tax, reviewed against eight synthetic practices

**September 2026.** Eight complete practices were generated as importable backups
(`tests/test-data/`), then the Trends engine and the whole tax engine were run over each of them in
a real browser and checked against the rules they are documented to follow.

Reproduce the whole thing with:

```bash
npm i --no-save playwright
npm run testdata        # regenerate the eight practices (deterministic)
npm run test:review     # run Trends + Tax over all eight and assert the invariants
npm run test:tax        # tests/tax-tests.js, headless — 130/130
```

## What was tested, and against what

`tests/tax-tests.js` checks the tax engine against the HMRC rule on small, purpose-built states.
This is the other half: **whole practices**, big enough for the invariants that only appear at
size — the four MTD quarters adding up to the year, `profitBreakdown` agreeing with `tyNet`, a
list matching its own definition. Nothing here compares the app to a number the app produced
earlier; every expectation is derived from the stated rule.

| Practice | Size | Basis | Chosen because |
|---|---|---|---|
| day-one | 1 session | cash | the floor — a crash or a nonsense figure here is the worst first impression there is |
| newcomer | 42 sessions, 4 clients, 3 months | cash | the readiness gates, and the tax disclaimer not yet acknowledged |
| online-only | 257 sessions, 17 months | cash | simple reveal mode, Money and Tax switched off |
| part-time | 272 sessions, ~£4.6k profit | accruals | under the personal allowance; Class 2 paid voluntarily; use of home |
| chaotic-payments | 419 sessions, a third never paid | accruals | cancellations at 0/50/75/100%, a tick-list nobody keeps up |
| established | 1,183 sessions, 4 years, room by the session | cash | the volume case: a fee rise mid-history, holidays, a client discharged last week |
| winding-down | 1,425 sessions, 7 tax years, 28 of 30 clients finished | cash | a practice mostly in the past |
| scotland-high | 1,515 sessions, ~£54k profit | cash | Scottish bands, a student loan that ends, a pension, two filed years with HMRC's own figures, instalments HMRC set, and a claim to reduce |

## Verdict

The tax engine came out of this in good shape. Every reconciliation held on **both** bases for
every practice and every year: the four MTD quarters sum to `tyNet`, `profitBreakdown` agrees with
`tyNet`, payments on account never include Class 2 or student loan, every January date is 31
January following the end of its tax year, and HMRC's entered figures beat the estimate everywhere
they exist. All nineteen screens render for all eight practices with no crash screen and no console
error. The arithmetic I spot-checked by hand against the HMRC rules came out right, including the
Scottish bands, the Plan 2 threshold, the personal allowance, Class 4 at 6%, voluntary Class 2 at
£3.50/week, and the pension extending the basic-rate band.

**Trends did not.** Three defects, one of them serious enough that the card it affects was
misleading on every practice that hires a room by the session. All four fixes below are in this
change; the five remaining items are written up as findings rather than fixed, and say why.

---

## Fixed

### 1. The "drifting away" list was mostly discharged clients

**What it looked like.** Practice › Trends › Clients lists clients who have gone quiet so you can
decide whether to reach out. On the four-year practice it listed **15 clients, 14 of them
discharged years ago** — the top three had last been seen 1,040, 459 and 405 days earlier. On the
winding-down practice it listed **28**, i.e. every client who had ever finished. The card is a list
to act on, so a list you cannot act on is worse than no card.

| practice | drifting rows before | after |
|---|---|---|
| established | 15 | 1 |
| winding-down | 28 | 0 |
| scotland-high | 20 | 0 |
| chaotic-payments | 10 | 6 |
| part-time | 2 | 0 |
| online-only | 5 | 0 |
| newcomer | 1 | 0 |

**Why.** `anaDrifting()` opened with `if(catOf(c.status)==="Finished")return;` — but `catOf` is
`catOf(kind,key)`, the **SA103 expense-category lookup** further down the file, which returns its
"other business costs" fallback object for anything it does not recognise. `catOf(c.status)` was
therefore an object, never the string `"Finished"`, so the test never fired once. The function that
maps a client status to its category is `clientCategory()`.

**Fixed** at all three call sites (`anaDrifting`, and twice in `anaEpisodes`).

### 2. Episode length ignored anyone discharged recently

Same root cause, different symptom. `anaEpisodes()` counts only finished pieces of work, defined as
"the status says finished **or** they have been gone for three of their own intervals". With the
first half of that test dead, a client discharged last week was not counted until three intervals
had passed — so the median episode length, and the "still ongoing" count beside it, were both drawn
from a stale picture of the practice. On the established practice the count goes from 15 to 16 once
a client discharged six days ago is included.

### 3. The cost-ratio card was out by a factor of five, and double-counted use of home

**What it looked like.** Practice › Trends › Money, "What the practice costs to run", is three
figures: the ratio, the change on last year, and what is left before tax. Against the same
practice's own tax figures:

| practice | card said | its own SA103 breakdown for 2025-26 | card after the fix |
|---|---|---|---|
| established | **8%** of turnover | £11,528 of costs on £28,400 → 41% | **41%** |
| winding-down | **2%** | £7,068 on £19,055 → 37% | **37%** |
| chaotic-payments | **3%** | £7,692 on £13,456 → 57% | **59%** |
| scotland-high | 20% | £11,442 on £65,320 → 18% | 19% |

The "left before tax" figure moved with it — on the established practice from £26,122 to £16,640, a
£9,482 overstatement of what the therapist has to live on.

**Why.** Two separate mistakes:

- The card totalled its costs as `led.expenses + led.roomRent + led.useOfHome`, but
  `ledgerBetween()` **already folds use of home into `expenses`** before returning, so the claim
  was counted twice. This is also why the itemised "where it goes" bars never added up to the
  headline figure.
- More importantly, `ledgerBetween()` is only the finance ledger. **A room hired by the session
  hangs off the session** (`derive().roomRate`) and **supervision hangs off its own logs** — `tyNet`
  subtracts both separately, and neither was here. On the established practice that is £8,822 of
  room fees and £780 of supervision missing from a £2,046 total. Note what that does to the
  Scottish practice, which rents its room **monthly**: monthly rent *does* go through
  `ledgerBetween`, so its card was roughly right. The billing arrangement was deciding whether the
  practice looked cheap or expensive to run.

**Fixed**: costs are now the same components `tyNet` takes off, use of home is counted once, and
per-session room fees and supervision appear in the category breakdown. A side effect worth having:
a therapist whose only business cost is supervision (very common in the first year) used to be told
"add at least one business cost"; the newcomer practice now shows a real 15%.

### 4. Tax › Now could say "that is yours to spend" about the next bill

On the Scottish practice, Tax › Now showed:

> On track to owe for 2026-27 — **£7,434**
> Keep in your pot — **£6,483** … You have £14,500 put by — £8,017 more than you need.
> **That is yours to spend.**

while a payment of **£7,227 falls due on 31 January 2027**. Pot & payments — the detail screen this
one summarises — already says that, in a line built from `pot.byNext`. The summary dropped it, so
the two screens told different stories, which is exactly what the comment above the code forbids.
The verdict now carries the same "by *date* you need *amount*" sentence, reads "more than you need
**today**", and turns amber-and-explicit when the balance covers the tax earned so far but not the
next bill. **No figure changed** — this is the summary saying what the detail screen already knew.

---

## Found, not fixed — these are decisions, not slips

### 5. The pot asks for a sixth of the year's tax five months into the year

On the Scottish practice on 5 September, 42% of the tax year elapsed:

| | |
|---|---|
| projected tax for 2026-27 | £7,434 |
| the app's own pro-rata figure (`taxForYear().proRata`) | ≈ £3,116 |
| what the pot asks you to have put by (`earned`) | **£1,176** |

`taxPot().earned` is `ukTax(tyNet(ty,true))` — tax on profit **to date**, but with the **whole
annual personal allowance** and the full band structure applied to it. Five months in, the
allowance has swallowed most of the profit, so the floor is far below the share of the year's bill
actually attributable to the elapsed part of it — and on four of the eight practices it is exactly
£0 while a real liability is projected.

This is deliberate and test-locked: *"Pot: 'earned' is tax on income actually taken, not a share of
the forecast"* asserts the current behaviour, and the comment explains the intent. It is worth
revisiting anyway, because **the sibling bug was already fixed for the set-aside rate**: the comment
there says the rate used to read 0% early in a year "while the personal allowance has swallowed
everything earned so far", and the fix was to work it out from the projection. The floor has the
identical shape and did not get the identical treatment.

Two candidate changes, in increasing order of how much they move:

- Make the floor `max(earned, proRata)` — never asks for less than today's honest floor, never
  leaves someone with £0 in September and a January bill.
- Or keep `earned` but apportion the personal allowance across the elapsed year, which stays
  strictly "tax on money already earned" and simply stops handing March's allowance to July.

Either changes a headline number and the test that pins it, so it is the owner's call. Finding 4
above is the part that was unambiguously wrong and is already fixed.

### 6. The Net column mixes income to date with costs to year end

For the tax year **in progress**, `tyNet(y,false)` counts every session logged (which can only run
to today, plus anything in the diary) but expands every recurring cost to **5 April** — rent,
insurance, memberships, the lot. So the Net column on Tax › Estimate reads *lower* than the profit
actually made so far:

| practice | Net column (`netAll`) | profit to date (`netTD`) | difference |
|---|---|---|---|
| scotland-high | £13,982 | £17,273 | **−£3,291** |
| established | £6,564 | £6,918 | −£354 |
| online-only | £2,959 | £3,237 | −£278 |
| winding-down | £2,973 | £3,138 | −£165 |

Nothing downstream is wrong — the tax figures use `netTD` and the projection, not this — but the
one number on the row is asymmetric, and on a practice with a £480/month room it is out by a fifth.
Options: print `netTD` for a year still running (and label it "so far"), or clamp
`ledgerBetween`'s occurrences to today when `toDate` is not set. Worth a decision rather than a
quiet fix, because the Net column is also the link into the breakdown sheet.

The same asymmetry shows on Tax › Quarterly (MTD): quarters that have not started yet carry their
standing costs and no income, so Q3 and Q4 of a live year read as losses. They are chipped
"ahead", so this is presentation rather than error, but it is the same cause.

### 7. A pension contribution never survives a restore

`pensionPcm()` reads `localStorage.tt_pension`. It is not in `S`, so it is **not in a backup** —
and it is a tax input, not a device preference: on the Scottish practice, £400/month extends the
basic-rate band and takes 2025-26's estimate from £15,263 to £13,883. Restore that backup onto a
new phone and every year's tax estimate silently rises by up to £1,400 with nothing on screen to
say why.

The documented device-only settings (`tt_lock`, `tt_lock_grace`, `tt_notify`, `tt_plus`) are all
things that *should* stay on one device. This is not one of them. Moving it to
`settings.pensionPcm` needs a schema bump and a migration that keeps the localStorage key in step
for older builds — the pattern `setYearValue()` already uses for legacy scalars — so it is a
change to plan, not to slip into a review. `tt_default_rate` has the same shape but costs nothing
if lost.

### 8. "Self Assessment season" appears for a year with no records

On 15 January the `file-<ty>` prompt fires for **every** practice, including `day-one` (one session,
logged in September 2026) and `newcomer` (first session June 2026) — both told their **2025-26**
return is due, for a year in which the app holds nothing at all. The window only tests that the
year has ended and that no figure has been entered. Gating it on the practice having any record in
that year would cost one condition. Low severity — it is a nudge, and someone registered as
self-employed does have to file — but it is the app being confidently wrong about a year it knows
nothing about.

### 9. Everything else the sweep found was right

`taxMoments()` was exercised at five dates by moving the browser clock, since on any one real day
it returns nothing:

| date | what fired |
|---|---|
| 15 Jan 2027 | `file-2025-26` everywhere; `jan-pay-2027` only for the three practices that actually owe something in January |
| 20 Apr 2026 | `new-year-2026-27` everywhere; `mtd-q4-2025-26` for the Scottish practice alone |
| 10 Jul 2026 | `mtd-q1-2026-27` for the Scottish practice alone |
| 20 Oct 2026, 20 Feb 2027 | nothing |

That is the documented behaviour exactly: the MTD prompts are gated on projected income over
£50,000 and only the Scottish practice clears it, and a payment prompt only appears when the next
money out really is that date.

---

## What held, in detail

Worth recording, because these are the invariants a future change could quietly break:

- **MTD reconciliation.** For all 8 practices × 31 tax years × both bases, the four quarters sum to
  `tyNet` and `profitBreakdown` agrees with it. This is the check that once caught per-session room
  fees missing from the SA103 boxes.
- **Cash vs accruals.** Switching each practice to the other basis and re-running keeps both
  reconciliations. The chaotic practice — 419 sessions, a third of them never paid — is the one that
  makes this mean something.
- **Cancellation charging.** A late cancellation stamped at 0% correctly earns nothing and still
  incurs its room fee (`chaotic-payments`, 2023-24: income £0, costs £127). Charges at 50%, 75% and
  100% all flow through revenue, net, SA103 and MTD from the single `derive().rate`.
- **Dated rates.** The established practice raised its fee 14 months ago; sessions before that date
  still derive the old fee, which is what keeps the earlier years' tax figures stable. Fee erosion
  correctly reports the resulting 14% gap between the headline fee (£61.82) and what is actually
  averaged (£53.18).
- **Per-year settings.** The Scottish practice's Plan 2 loan ends in 2026-27: 2025-26 deducts
  £2,287, 2026-27 deducts nothing, and the earlier years are untouched. Region carries forward from
  2022-23 without being restated.
- **HMRC's figures beating the estimate.** Two filed years use the entered assessment everywhere;
  instalments HMRC actually set (£2,400) beat the calculated ones; a claim to reduce beats both and
  defers rather than reduces.
- **The readiness gates.** On `day-one`, fourteen of the seventeen analytics decline with a sentence
  naming what is missing ("Four months of sessions. You have 0.") rather than drawing a chart from
  nothing. On `newcomer`, five do. No analytic ever threw.
- **Room fees that do not exist.** No session anywhere was left incomplete waiting for a room-fee
  answer that does not apply, and none was treated as fee-free while a dated per-session fee
  applied.

## Caveats

- The corpus is anchored to **2026-09-05** and the engines read the real clock. Re-run
  `npm run testdata` when the date has moved a season on, or the trends windows will be reporting
  on data that has aged out. `tests/tax-tests.js` carries the same caveat.
- The seasonal sweep moves the clock forward past the last logged session, so anything that depends
  on projecting the current year (the MTD income floor especially) is unreliable at the later sweep
  dates. The prompts about years that have *ended* are not affected.
- Thresholds are frozen at 2026-27 rates for later years, as the engine documents.
