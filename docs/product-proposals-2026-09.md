# Product proposals — September 2026

Four open questions raised in the September feedback round. Two are answered here as
recommendations to decide on; one records what shipped alongside this document; one is a
commercial proposal that would need a decision before any code.

Nothing in this file is implemented except where it says **shipped**.

Companion to `docs/monetisation.md`, which remains the decision record for the paywall itself.
Where the two disagree, monetisation.md wins until this one is promoted.

---

## 1. More trends and business analytics — and a tier that isn't UK-specific

### The problem with the current shape

`PLUS_FEATURES` is `tax · finances · mtd · trends · accreditation · notesSync · palettes`.
Four of those seven are UK tax machinery. That makes GroundWork Plus, in practice, **a UK tax
product with some analytics attached** — which is fine for Charlotte and useless for a therapist
in Dublin, Toronto or Auckland running exactly the same practice with exactly the same problems.

Trends today is four cards: a retention funnel, attendance against agreed frequency, missed
sessions, and how long clients stay. All good, none of them the reason anyone pays.

### The proposal: split the tier in two

| Tier | Contents | Market |
|---|---|---|
| **Free** | Logging, clients, rooms, supervision, receipts, spreadsheet import, every backup and export, the retention funnel | Everyone, everywhere |
| **Insights** | Everything in §1.1–§1.5 below | **Worldwide** — no tax content, no jurisdiction |
| **Plus** | Insights **+** Tax, Costs & income, MTD | UK only |

That gives the "layer below tax" the feedback asked for, and it is the layer that can be sold in
any English-speaking country without a single line of new rules code. The recurring-cost
argument in monetisation.md §1 (HMRC changes every April) justifies **Plus**; Insights has to
justify itself on depth instead, which is what the list below is for.

**Everything proposed below is computed from data the app already holds**, with two marked
exceptions that need one new field each. No new sync, no server, no new permissions.

### 1.1 Will the money keep coming? — income stability

These are the questions a self-employed person actually lies awake about, and not one of them
is answered anywhere in the app today.

1. **Income concentration.** What share of the last 12 months' revenue came from your top
   one, three and five clients. A practice taking 40% of its income from one person is one
   ending away from a crisis and usually has not noticed. One number, one sentence, high impact.
2. **Seasonality index.** Once there are two years of history: each calendar month expressed
   against your own average. *"August runs 34% below your typical month; January runs 18%
   above."* This is the single most useful thing for planning a holiday or a fee rise, and it
   cannot be got from a spreadsheet without effort.
3. **Committed vs speculative.** For the next eight weeks: what is actually booked, versus what
   your recent run-rate implies you'd normally earn. `incomeForecast()` already does one month
   of this — extending it and showing the gap is the useful part.
4. **Your floor.** Worst month in the last twelve, best month, and the median. Three numbers
   that say how volatile the practice really is.

### 1.2 What is an hour actually worth? — capacity and pricing

5. **Effective hourly rate.** Revenue ÷ (clinical hours **+** supervision **+** a declared
   admin overhead per session). Most therapists have never calculated this and are startled by
   it. It is also the number that makes a fee rise feel justified rather than greedy.
   *Needs one new setting: minutes of admin per session (default 15).*
6. **Capacity used.** Sessions per week against a "full week" the therapist declares once.
   Answers "am I full?" and "can I afford to be choosier?" without guessing.
7. **Slot reliability.** Which day-and-time slots reliably fill and which repeatedly sit empty
   or get cancelled. Directly actionable — it tells you to stop offering Friday at five.
8. **Weeks actually worked.** Working weeks in the year vs weeks off. Sole traders
   systematically overestimate this and price as though they work 48 weeks.

### 1.3 Is the work getting stickier? — client lifecycle

9. **Cohort retention curve.** Of the clients who started in each quarter, what proportion were
   still coming at 4, 8, 12 and 24 weeks. The retention funnel says *where clients are now*;
   this says *whether your intake is improving*, which is a different and better question.
10. **Median episode length, trended.** *"Your work now averages 14 sessions, up from 9 two
    years ago."*
11. **Drifting away — a list, not a chart.** Clients whose gap since the last session exceeds
    1.5× their own usual interval **and** who have nothing booked. `clientSchedule()` and
    `freqDays()` already compute everything this needs. This is the most immediately useful item
    in the whole list, because it is a list of people to text this afternoon.
12. **Where clients come from.** Which referral source produces clients who stay longest and pay
    most reliably. *Needs one new optional field on a client: `source`.* It is the only analytic
    here that changes what a therapist **does** about marketing, and it is cheap.

### 1.4 Am I being paid? — money hygiene, no tax involved

13. **Days to payment, trended.** Average days between session and payment, over time.
    *"You are being paid 31 days after the session; two years ago it was 12."* Nothing in the
    app currently shows this drifting.
14. **Who pays late.** Per client: average days to pay, and how often a payment passed 30 days.
15. **Cost ratio.** Costs as a percentage of turnover, trended, by category. This is business
    reporting, not tax reporting, and works in any country.
16. **Fee erosion.** Your *effective* average fee per session — after reduced cancellation
    charges, legacy rates and mix shift — plotted against your headline rate. Practices very
    often raise the headline and see the effective figure fall. Nobody notices without the chart.

### 1.5 Am I all right? — the differentiator

Nobody else in this market reports on the practitioner, and it fits the brand better than any
amount of revenue analysis.

17. **Supervision cadence over time.** Hours per six clinical hours, plotted, plus the longest
    gap in the last year. Partly present in `mountAccreditation()`; the trend is not.
18. **Load.** Days with five or more sessions; runs of three or more back-to-back without a
    break. Both fall straight out of the calendar and both are recognised burnout signals.
19. **CPD trajectory.** On track or behind for the annual target, with a projected year-end
    figure rather than a bare running total.

### If only three get built

**11 (drifting away)**, **1 (income concentration)** and **5 (effective hourly rate)**. Each is
a single number or a short list, each is computed from data already held, and each tells a
therapist something they did not know and would act on. That is the demo.

---

## 2. Colour schemes: one-off unlock per colour?

**Recommendation: no — and go further. Make every palette free, and take `palettes` out of
`PLUS_FEATURES` entirely.**

The reasoning:

- **The revenue is rounding error.** A few pounds, once, per user who bothers. It will never
  pay for the work described below.
- **It introduces a second billing model.** Per-colour unlocks mean non-consumable StoreKit
  products: a product ID per colour, each through App Review, each localised, plus a
  restore-purchases flow and a second entitlement store beside `tt_plus`. That lands in exactly
  the place the code is deliberately simple — `plusActive()` is synchronous, called from render
  paths, and fails open on every error path. A per-item entitlement matrix is the wrong shape
  for that function and would have to be threaded through `paletteLocked()`, `applyPalette()`
  and the head script that paints before first paint.
- **It makes the subscription read worse, not better.** Someone who has *paid* and still hits
  every other gate feels gated, not invested. Micro-purchases and a subscription in the same app
  teach the user that paying does not settle anything.
- **A locked colour is the most visible and least defensible thing in the tier.** It is on
  screen every day and it costs nothing to serve. It buys resentment at a discount.

Dropping palettes leaves the tier reading as *the analytics and the tax engine* — a cleaner and
much more defensible story than *analytics, tax, and also some colours*.

**If colour must be monetised at all**, the honest version is one non-consumable "Supporter"
purchase that unlocks *all* palettes — a single product, a single flag, no matrix, and framed as
a tip rather than a gate. Only worth building if there is evidence people ask for it.

*Cost to implement the recommendation: delete `"palettes"` from `PLUS_FEATURES` and drop the
`free` flag test in `paletteLocked()`. Roughly ten minutes.*

---

## 3. A sneak peek at Trends — **shipped**

Trends previously replaced its whole view with `plusLockHTML()`: a paragraph describing four
charts nobody had seen. That is a poor advert and a slightly insulting one, because the data
being described is the therapist's own.

What now happens under the gate:

- **The retention funnel renders in full, on real numbers.** It is the headline card and the
  cheapest of the four to compute, and it is a far better argument for the tier than any
  sentence about it.
- **The other three are named honestly underneath, each with one real figure** drawn from this
  practice: how many clients would be rated for attendance, what missed sessions have actually
  cost, and the average episode length so far. A practice with nothing missed sees "£0" and a
  sentence saying so, rather than an invented number.
- One CTA at the bottom.

The principle, for reuse elsewhere: **show the cheapest real section, and quantify the rest
using the reader's own data.** Never describe a locked feature in the abstract.

Not extended to Tax deliberately — a partial tax figure is a wrong tax figure, and the
disclaimer machinery (`taxAcked()`) exists precisely to stop people acting on numbers they have
not been walked through.

---

## 4. Selling seats to training courses and therapy organisations

The most commercially interesting idea in the round, and the one that needs the most care.

### What the buyer is actually buying

Not branding. **Evidence.**

A counselling course, placement provider or charity has to know that its trainees are
accumulating client hours, meeting the supervision ratio and logging CPD. Today that is
collected on spreadsheets, paper logs and email chasing. GroundWork already computes every one
of those figures — `mountAccreditation()` implements BACP Form 3A, the 1:6 ratio and the hour
totals — for a completely different reason.

So the pitch to an organisation is: *your trainees get a proper practice tool for their
placement year, and you get a consistent, checkable hours report instead of forty different
spreadsheets.*

### How it would work

**Seats.** The org buys N seats and receives N redemption codes. Mechanically this is the
**existing** signed-licence path (`scripts/issue-licence.mjs`, ECDSA P-256) issuing a batch
carrying an `org` claim and an expiry set to the course year. On iOS the same job is done by
Apple's offer codes, which the app already redeems. **No new billing infrastructure at all.**

**Branding, deliberately faint.** The licence carries `orgName` and optionally one accent
colour. The app shows *"Provided by <org>"* in Settings › About and in the footer of a printed
statement. It must stay small. Anything more starts to look like the organisation is present in
the room, which is both untrue and the wrong impression to give a trainee about where their
client data lives.

**The report is the product.** A **Placement Report** the trainee generates and sends
themselves: client hours, supervision hours, the ratio, CPD hours, a date range, the practice
name, and a checksum so a tutor can tell it has not been edited by hand. Aggregate hours only —
no client codes, no fees, nothing session-level.

### The invariant this must not break

**The organisation never receives anything automatically, and the licence grants it no read
access whatsoever.** There is no server, no sync, no org-side dashboard. The trainee exports;
the trainee sends. This has to be stated in as many words on the redemption screen, because a
trainee handed a code by their course will otherwise reasonably assume their tutor can see
their clients — and if they assume that, they will not log honestly, which destroys the value
of the whole thing.

A later, optional addition that keeps the invariant: a static verifier page where a tutor pastes
a report and it re-checks the checksum. Still nothing stored anywhere.

### Why it is worth doing

Revenue is the smaller half. The larger half is **distribution**: it puts the app in front of
every trainee on a course during the year they form their habits, at the moment they have no
existing system to switch away from. Trainees qualify, go into private practice, and keep what
they already know. There is no cheaper way to reach that audience.

Indicative pricing, to be tested rather than trusted: per-seat annual at a real discount to the
£29.99 retail price — say £15/seat at 20+ seats — invoiced directly.

### Open questions before any code

- **Apple's rules.** A licence sold to an organisation outside the App Store and redeemed inside
  the iOS app needs checking against current App Store Review Guidelines (§3.1.3 and the
  multiplatform provisions). This is the one that could sink the model and should be settled
  first, before anything is built.
- **Support.** An organisation expects a human to answer email within a day or two. That is a
  real ongoing cost and has to be in the price.
- **Which frameworks.** BACP Form 3A is implemented. UKCP, NCPS, BABCP and the Irish and
  Australian equivalents each count hours slightly differently. Supporting one badly is worse
  than supporting one well, so pick deliberately.
- **What happens at the end of the course.** The trainee's records are theirs and must remain
  fully exportable when the seat lapses — the data-plane invariant in monetisation.md §2.1
  applies here exactly as it does to a lapsed personal subscription. A trainee must never lose
  access to their own client history because a course did not renew.
