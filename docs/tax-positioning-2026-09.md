# Selling the tax package — and getting out of MTD's way

> **Naming, Sep 2026:** the tax bundle this document is about now belongs to **GroundWork Pro**,
> the top of two tiers. Every "Plus" below means Pro; the new GroundWork Plus is the rung beneath
> it and contains no tax content at all, which is the point of it. See `docs/monetisation.md` §3.

*Sept 2026. How GroundWork Plus is pitched, in the app and outside it. This is the positioning
decision record; `docs/monetisation.md` remains the record for **what** is in the tier and how
the gate is built. Where the two touch, that document owns the mechanics and this one owns the
words.*

---

## 1. The problem this document exists to solve

Two objections, and they come from opposite directions.

**"MTD isn't me."** Most therapists in this app are nowhere near the £50,000 threshold and will
not be for years. If Plus is sold on Making Tax Digital, the majority hear a feature about a
rule that does not apply to them and stop listening.

**"I'm already paying for MTD software."** The therapist who *is* over the threshold has,
by definition, already solved the filing problem — or is about to, with a monthly subscription
to a bookkeeping package. Asking them for a second subscription on top invites exactly the
question we lose: *why am I paying twice to do my tax?*

Both objections are reasonable. Neither is answered by listing features harder. They are
answered by being specific about **which of three people we are talking to**, and by being
honest about the boundary of what this app does — because that boundary, said out loud, is
what makes the rest of the pitch believable.

---

## 2. The reframe: instead of, not as well as

The pitch is one sentence, and everything below is an elaboration of it:

> **You are already typing every session into GroundWork. That is the digital record MTD asks
> for. Plus turns it into the four quarterly figures and hands them over as a file — so the
> only thing left to buy is something that presses Submit, and HMRC lists free ones.**

The load-bearing word is **instead**. GroundWork Plus is not a companion purchase alongside
bookkeeping software; for a single-handed therapist with no stock, no payroll, no VAT and one
kind of income, it is a cheaper substitute for one — with session-level detail a general
bookkeeping package cannot see, because it does not know what a room costs by the hour or what
a late cancellation was charged at.

### Why this is honest and not a stretch

MTD for Income Tax needs three things: digital records, quarterly updates, and a final
declaration through software HMRC has recognised.

- **Digital records — GroundWork already is one.** Every session, every cost, dated,
  categorised, and mapped to an SA103 box. It is not a shoebox being retro-fitted; the
  therapist entered it as the work happened.
- **The quarterly figures — that is `mtdQuarters()`.** Four periods, on the basis in force,
  reconciled to `tyNet` (there is a test).
- **The submission — this app cannot do it, and says so.** Sending an update needs an OAuth
  client secret, HMRC's fraud-prevention headers, and HMRC recognition of the software itself.
  All three need a server. An offline single-file PWA cannot have them, and pretending
  otherwise would be the worst thing this app could claim.

So the third leg is bought elsewhere. The point is that **the third leg alone is cheap**, and
often free, while a full bookkeeping package priced to do all three is not. HMRC publishes the
list of recognised software, including free options and bridging tools that submit from a
spreadsheet for a few tens of pounds a year.

### The digital-link argument — why an exported file matters

This is the technical detail that turns the export from a convenience into the thing that makes
the route work, and it is worth understanding before writing any copy about it.

MTD requires **digital links** between the records and the submission. Data has to move
electronically. A human reading a figure off one screen and typing it into another **breaks the
link** — copy-and-paste and re-keying are exactly what the rule prohibits. Bridging software
exists to be the digital end of that chain: it takes a spreadsheet and submits from it.

Which means: **a file is not the same as a number on screen.** The `.csv` export is what a
bridging tool or a spreadsheet actually reads. That is why the CSV was added (Sept 2026)
alongside the JSON, and why the export button is not a nice-to-have sitting under the table —
it is the join between what this app is good at and what it deliberately refuses to do.

### What we will not claim — the guard-rails

These are absolute. The app's credibility on tax is its single most valuable asset and it is
built entirely on never having overstated anything.

| Never say | Say instead |
|---|---|
| "MTD compliant" / "HMRC approved" / "HMRC recognised" | "Keeps the records and produces the figures. The submission is done by software HMRC has recognised." |
| "File your MTD return from GroundWork" | "Hand the figures to your accountant, or to software that files." |
| "Replaces your accountant" | "Gives your accountant the year already added up." |
| "Free MTD filing" | "HMRC lists the recognised software, and some of it is free." — link, never a promise. |
| Naming or recommending a bridging vendor in the app | Link to HMRC's own list. It stays current; we would not. |
| "This satisfies the digital-link rule" | "Moving a file rather than re-typing figures is what keeps the chain digital." State the rule, not a verdict on their setup. |
| "Imports straight into your bridging software" / naming the `hmrcField` column as a filing instruction | "Each row names its SA103 box and the matching field in HMRC's own developer documentation." The column exists to save the filer guessing which figure is which — it is a label, not a submission format, and **no GroundWork export has ever been tested against a real bridging tool**. Expect the consumer to map these columns onto their own. |

The last row matters most. Whether a *particular* chain of tools satisfies the rules for a
*particular* person is a question about their circumstances, and the app has said from the
first screen that it does not know those. Describe the mechanism; never issue the verdict.

---

## 3. Three audiences, three pitches

Do not average these into one. The averaged pitch is the one that fails on both objections at
once.

### A. Under the threshold — most therapists, most of the time

**MTD is not the pitch and should barely appear.** Sell Self Assessment:

- What to set aside, as a running figure, from money actually received.
- The January that is one and a half times what people expect, because a payment on account
  is sitting on top of the balancing payment. This is the single most reliable source of
  genuine alarm in UK sole-trader tax, and the app forecasts it months out.
- A pot with a target that separates *tax already earned* from *bills already fixed*, so the
  surplus is honestly spendable.

MTD's role here is one line of future-proofing: *when the threshold reaches you, the records
are already in the shape it wants.* That is a reassurance, not a feature.

### B. Over or approaching the threshold, nothing bought yet

This is where the "instead of" pitch lands hardest, and where the arithmetic is worth showing:

- Full bookkeeping software priced for a business that has invoices, banking and VAT.
- Versus: GroundWork Plus, plus a recognised submission tool from HMRC's list — free at the
  simple end, and low tens of pounds a year for spreadsheet bridging.

Do not put vendor names or prices in the app. They go stale, and naming one is an endorsement
we are not qualified to give. Show the *shape* of the comparison and link to HMRC's list.

### C. Already paying for MTD software

Split this, because the honest answer differs and getting it wrong costs trust:

- **Their package does real bookkeeping** — invoices, bank feeds, a second business. GroundWork
  is not replacing it and we should not suggest it does. The pitch here is different work
  entirely: per-session room fees, cancellations charged at a policy percentage, supervision
  hours against the 1:6 ratio, attendance against the frequency that was agreed. A bookkeeping
  package has no idea any of that exists. If they are not persuaded, they are right not to be.
- **Their package exists only to satisfy MTD.** This is the switch. They are paying a
  subscription to re-key figures they already typed into GroundWork. Plus plus a free or cheap
  submission tool does the same job from records they are keeping anyway.

**Ask which one they are before pitching.** In the app this is not a question we can ask, so
the copy describes the route and lets the reader place themselves — which is why the MTD screen
says what GroundWork does, what it does not, and what they still need, rather than making a
claim about their situation.

---

## 4. What changed in the app

| Where | Change |
|---|---|
| Tax › Making Tax Digital | Rebuilt around the route. "What this does / what you still need", the digital-link point, and a link to HMRC's own software list. The old copy ended on *"this app cannot file for you"* — a true sentence and a dead end. |
| MTD export | `.csv` alongside `.json`, both rendered from one `mtdRows()` shape so they cannot disagree. CSV leads: it is the format bridging software and accountants read. Every quarter emits the same fixed set of rows (zeros included) and each row names its SA103 box and the matching HMRC API property, so a mapping set up once keeps working. |
| Info topics | `mtd-what`, `mtd-route`, `mtd-exports` — the mechanism, the boundary and which file is for what, behind dots rather than on screen. |
| Paywall (`PLUS_SELL`, `openPlusSheet`) | Reordered around what the tier is actually for, and led with the free/paid boundary rather than a feature list. The stale "extra colour schemes" line went with it. |
| Settings card | Same copy, same order, no colour schemes. |
| Tax lock card | Says what the tab does for you before it asks for money. |
| Reveal step (10 sessions) | Unchanged in trigger; the sub now names the January problem, which is the reason to care. |
| `TIPS` | A `tax-mtd` entry, because the MTD screen is the one screen whose *boundary* has to be understood before its figures are useful. |

---

## 5. Open questions this does not settle

- **Price** is still open (`docs/monetisation.md` §7). The anchor argument in §3B —
  bookkeeping software versus a submission tool — is the right frame for setting it, and it is
  a lower anchor than "what a therapist pays an accountant". Both are defensible; they are not
  the same number.
- **Whether to publish the comparison outside the app**, on a marketing page where naming
  vendors and prices is more defensible than it is inside a tax screen.
- **The threshold walk-down** (£30,000 from April 2027, £20,000 from April 2028) pulls audience
  A into audience B on a known schedule. Revisit this document each April; that is also when
  the rates change and the tier's annual promise falls due.
