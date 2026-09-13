# GroundWork monetisation plan

*How GroundWork Pro and the UK tax year packages are defined, gated, sold and reviewed. Written
Sept 2026. This revision replaces the two-subscription model that preceded it.*

> **Sep 2026, second revision - one subscription, and tax is bought by the year.**
>
> The model this document described until now was **two annual subscriptions**: GroundWork Plus
> (chrome, everything except tax) and GroundWork Pro (gold, everything). That is withdrawn. There
> is now:
>
> - **GroundWork Pro** - one **monthly** subscription, **gold**. The chrome accent is retired.
> - **UK tax year packages** - a **one-off purchase per tax year**, which includes **every earlier
>   tax year**. This is what calculates tax.
>
> Anything written before this revision that says "Plus" means Pro. Anything that says "the tax
> bundle is part of Pro" is out of date: Pro no longer calculates tax.

This document is the decision record. Where it says "decided", the choice has been made and the
reasoning is here so a later reader does not reopen it by accident. Where it says **OPEN**, it has
not. §12 is the implementation checklist; nothing in the app has been changed yet.

---

## 1. The decisions

| | Decision | Why |
|---|---|---|
| **Model** | **One monthly subscription (GroundWork Pro) + a one-off purchase per UK tax year** | The old two-tier ladder asked a reader to rank two subscriptions against each other before they had used either. It also made the tax engine a *subscription* feature, which is a poor fit: tax is a job with a deadline, done once a year, and a recurring charge for it feels wrong in every month that is not January. A purchase attached to a named tax year is exactly the shape of the work being paid for - the April rates pass for that year - and it is honest enough to say out loud. |
| **Tax gating** | **The Tax tab opens for everybody. Computed tax figures are masked until that year is bought.** | A lock card describing four screens nobody has seen is a poor advert, and the reader's own records are behind it (their student-loan plan, their use-of-home claim, what HMRC assessed). They can walk the whole screen, enter everything, and see exactly where the figure will appear. This is the same lesson Trends already learned with the sneak peek. |
| **Tax purchase is standalone** | **A tax year package does not require a Pro subscription.** | Decided (see §3.1 and the note in §11 - this reverses the first sketch). Somebody who wants what they owe in January and nothing else can buy that and only that. |
| **Cumulative downward** | **Buying a tax year includes every earlier tax year.** | One purchase, one watermark, one comparison. It also means somebody arriving with four years of history in a spreadsheet buys once and sees all of it, which is the case the spreadsheet import exists to create. |
| **Accent** | **Gold (`--tier3-*`) everywhere. Chrome (`--tier2-*`) is retired.** | With one subscription there is nothing to distinguish. Business analytics, the Pro lock cards, the subscription tab accent and the splash mark all become gold. |
| **Sequencing** | **iOS first. Web stays free.** | Unchanged. StoreKit needs no accounts, no server, no VAT registration. The PWA on Pages carries on as the free shopfront. |
| **Existing users** | **Charlotte only** is comped. No general grandfathering. | Unchanged, and still close to free: as of Sept 2026 the user base is Charlotte, Matt and one tester. |

---

## 2. Three invariants

Everything below depends on these. Break any of them and the design stops working.

### 2.1 The paywall never touches the data plane

Gate **derived** features. Never gate the records themselves.

**Always free, forever:**

- Logging and editing clients, sessions, rooms, supervision, peer supervision.
- `commit()`, `undo()`, snapshots, the audit log.
- **`exportJSON()`, `exportCSV()`, `importJSON()`, `impOpen()`** - every backup and every restore
  path, plus encrypted backups and the native automatic backups.

Three separate reasons, any one of which is sufficient:

1. Losing a therapist's client records is the worst thing this app could do. Never put a billing
   state between someone and their own data.
2. UK GDPR data portability. "Renew to get your records out" is not a position to be in.
3. The spreadsheet import is the switching-cost remover. Gate it and nobody reaches the paywall at
   all.

**Practical rule for the code:** the paywall lives in the **view and button layer only**.
`tyNet()`, `taxLiability()`, `mtdQuarters()`, `mtdExport()` and `ledgerBetween()` stay pure and
ungated, partly because that is where correctness lives and partly because `tests/tax-tests.js`
calls them directly and must keep passing regardless of entitlement state.

This now has a second half, and it is new: **the view layer must not call the tax engine for a
locked year at all.** Not because the engine would be wrong, but because a masked figure that was
computed anyway is a figure sitting in the DOM waiting to be read, and because "needs the tax
package to calculate" should be literally true. See §5.

### 2.2 `feat()` is not entitlement

`feat(k)` means *"the user switched this off"*. That is a preference. `plusLocked(k)` means *"this
device has not paid"*. That is a billing state. Do not overload one with the other.

If `feat("tax")` started returning false for unpaid users, `visibleTabs()` would drop the Tax tab
entirely - so there would be no upsell surface at all - and the user's own on/off choice would be
tangled with their entitlement, so subscribing would have to guess which flags to restore.

`TABS[].ft` gating is untouched. A paid tab still **appears** and still **opens**.

### 2.3 The mask covers tax the app computes, never money the practice recorded

This is the rule that decides, case by case, what a locked year hides. It is new, and it is the
one most likely to be got wrong by somebody adding a figure later.

**Masked** (the app worked it out from HMRC's rules):

- `taxLiability()` - on track to owe, the Tax column of the by-year table, the working sheet.
- `taxPot()` - what to keep back, the buffer, the "you are £x ahead" verdict.
- `taxSchedule()` / `nextTaxPayment()` / `taxTimeline()` - payments on account, the balancing
  payment, every amount against a due date.
- `monthlyTakeHome()` - it is net **of tax**.

**Never masked** (it is the therapist's own record, and it is on the Money tab anyway):

- Billed, received, overdue, session counts.
- `tyNet()` - the Net column. That is profit, not tax.
- The MTD quarter **figures** on screen: turnover and expense boxes are the practice's own money
  added up. The **export file** is year-scoped and does follow the package - see §5.4.
- Anything the therapist typed in: what HMRC assessed, a claim to reduce, a pot balance, a pension
  contribution, a student-loan plan, a use-of-home claim.

Say it as a sentence when in doubt: *if the number came out of `ukTax()` or something downstream
of it, it is masked; if it came out of the practice's own records, it is not.*

---

## 3. What you get

### 3.1 Free

Everything needed to run a practice day to day, and now the whole shape of the tax screens:

- Clients, sessions, rooms, the calendar, Sessions › Unpaid and › Incomplete.
- Supervision, peer supervision, CPD.
- Money › Overview and Money › Table - revenue, what is outstanding, month by month.
- What a room costs you, per session and on a rent (already free - see CLAUDE.md § Room rent).
- Receipts, invoices, statements and chasers.
- All import, export, backup, encrypted backup, native auto-backup.
- **The whole Tax tab**: the disclaimer, Per year (student loan, region, use of home), the MTD
  quarter figures, and every screen's structure with its figures masked.

**Receipts stays free** on purpose: a client asking for a statement for their insurer is an
obligation, not a luxury. **Backups stay free** on purpose: §2.1.

### 3.2 GroundWork Pro - the monthly subscription

Everything the practice tells you about itself. Nothing in it depends on where the reader pays tax,
which is what makes it sellable to a therapist in Dublin, Toronto or Auckland without a line of
new rules code.

| Feature | Flag | Entry point |
|---|---|---|
| Business analytics (twenty of them) | `trends` | `renderMetrics()`, the Trends segment |
| Accreditation hours (Form 3A, the 1:6 ratio) | `accreditation` | `mountAccreditation()` |
| GroundWork Notes sync | `notesSync` | `#rosterSync` → `syncSchedules()` |
| Costs & other income | `finances` | `financeCards()` / `financeForm()` |

**Costs & other income is unlocked by Pro OR by owning any tax year package, and that `OR` is not
optional.** It is the one piece of joinery this revision needs, and the reason is the same one the
old document gave for bundling costs with tax: *an estimate that ignores what the practice costs
you is one nobody should set money aside against.* Under the new split, costs sit in Pro and tax
sits in the packages - so without the `OR`, somebody could buy a tax year, have no way to enter
their insurance, supervision, CPD or travel, and be shown a tax figure computed on an overstated
profit. Selling a knowingly overstated tax figure is not on. One `||` in `plusLocked("finances")`
removes the whole problem:

```js
locked("finances") === !(plusHas("pro") || taxPackAny())
```

### 3.3 UK tax year packages - the one-off purchases

One product per UK tax year, bought once, never expiring, restorable on a new phone. **Buying a
year includes every earlier year.**

What a package unlocks, for its year and all earlier ones:

- Every masked figure in §2.3.
- The MTD quarterly **export** (`.csv` and `.json`) for that year.
- The two guided flows' figure previews (`startAfterFileFlow`, `startNewYearFlow`).
- Costs & other income, permanently, per §3.2.

**Only one package is on sale at a time: the tax year in progress.** Somebody who wants last year
buys this year and gets last year with it, which is more than they asked for and one price to
think about. If the "I only want to file the year just ended" case actually turns up, add a second
product for the ended year during its filing window (6 Apr to 31 Jan) - the code handles it
already, because the watermark does not care how the year was reached.

**What the annual charge actually pays for, said plainly:** HMRC bands, thresholds, Class 2 and 4
rates, student-loan plans and the MTD rules move every April, and keeping `ukTax()` right for a
given year is genuine, dateable work. That claim now sits on the thing it describes. It used to be
the justification for a subscription, which was always a slightly awkward fit.

### 3.4 Deliberately not sold

- Receipts, backups, import, what a room costs you. See §2.1 and §3.1.
- Colour schemes. Switched off in the app entirely (`PALETTES_ENABLED`), so gating them would gate
  something nobody can reach. `paletteLocked()` and its `plusLocked("palettes")` call go with this
  revision.
- Multi-device sync - **it does not exist**. Known limitation #8 in `CLAUDE.md`, and the one
  feature that would carry real ongoing server cost and therefore make a *subscription*
  self-evidently fair. If Pro ever struggles to justify its renewal, this is the thing to build,
  not more analytics.

---

## 4. The entitlement model in code

### 4.1 Two caches, two lifetimes, two keys

Device state, never `S` - the same rule that keeps `tt_lock` out of `S`. `S` travels in backups,
and restoring a backup onto somebody else's phone must not carry a purchase with it.

```
tt_plus      {"active":true,"tier":"pro","expiresAt":"2026-10-01T00:00:00Z",
              "source":"storekit","kind":null,"name":null,"checkedAt":"..."}

tt_taxpack   {"through":"2026-27","source":"storekit",
              "ids":["uk.co.charlottebloortherapy.groundwork.taxyear.2026"],
              "checkedAt":"..."}
```

**Two keys rather than one object, and that is deliberate.** A subscription lapses; a
non-consumable never does. `plusClear()` already exists and runs when StoreKit says the
subscription is gone - if the packages lived in the same record, a lapsed subscription would wipe
purchases Apple still considers owned. Separate keys make that impossible rather than merely
unlikely.

### 4.2 The watermark

`through` is a single tax-year string and it is the whole model: **every year at or below it is
unlocked.** Tax years are `YYYY-YY` with fixed width and an incrementing lead, so a plain string
comparison orders them correctly (`"2025-26" < "2026-27"`, and `"2099-00" < "2100-01"`).

```js
const TAX_PACK_KEY = "tt_taxpack";
function taxPackThrough(){ ... }                     // "2026-27" | null
function taxPackAny(){ return !!taxPackThrough(); }
function taxGateOn(){ return plusGateOn(); }          // one gate switch, not two
function taxYearPaid(ty){
  if(!taxGateOn()) return true;                       // the web build is ungated
  const t = taxPackThrough();
  return !!t && String(ty) <= t;
}
function taxYearLocked(ty){ return !taxYearPaid(ty); }
```

**The watermark only ever goes up.** Every writer takes `max(existing, new)`. That one rule makes
the legacy grant (§6), a restore arriving out of order, and a StoreKit refresh that only sees some
entitlements all safe without any of them having to know about each other.

**Pro is deliberately not in `taxYearPaid()`.** If that decision is ever reversed, it is one line:
`return plusHas("pro") && !!t && ty <= t;`. Written this way on purpose so the reversal stays a
one-line change and cannot be half-done across twenty call sites.

### 4.3 Where the fail-open doctrine applies, and where it cannot

`plusTier()` fails open on every error path - an unreadable date, an unrecognised tier, a thrown
read - because locking a paying subscriber out is worse than the alternative. The packages keep
the same posture where they can: nothing here may ever throw, and a record that still carries a
parseable `through` is honoured whatever else is wrong with it.

But a completely unreadable `tt_taxpack` cannot fail open, because there is nothing to fail open
**to** - no year is named, so there is no figure to unlock. The remedy has to be visible instead:
**every mask carries "Already bought this? Restore purchases"**, which re-reads
`Transaction.currentEntitlements` and rewrites the watermark. That is the honest answer and it must
not be left out of the mask markup.

### 4.4 The tier ladder collapses to one rung

```js
const TIERS = ["pro"];
const TIER_NAME = { pro: "GroundWork Pro" };
const FEATURE_TIER = { trends:"pro", accreditation:"pro", notesSync:"pro", finances:"pro" };
```

`tax` and `mtd` leave `FEATURE_TIER` entirely - they are no longer subscription features, and a key
absent from that table is free as far as `plusLocked()` is concerned. They are gated by
`taxYearPaid()` instead, which is a different axis with a different question behind it.

`tierOf()` keeps its fail-open default and it now does the migration for free: `"plus"` is no
longer in `TIERS`, so `tierOf({tier:"plus"})` returns `"pro"`. No migration step, nothing to
half-run. Keep `plusHas()` and `tierRank()` even at one rung - they cost nothing, and a
hand-rolled `plusTier()==="pro"` comparison scattered through the file is how the next tier split
goes wrong.

---

## 5. The mask

### 5.1 What it is

A masked figure is **not a blurred real figure.** The existing `.blurfig` treatment on Money ›
Overview computes the number and blurs it; the mask does not compute it at all. The reasons:

- "Needs the tax package to calculate" should be true, not a figure of speech.
- Nothing is left in the DOM to read.
- The tax engine is the expensive part of a render. A locked year should cost nothing.

`.blurfig` stays exactly as it is on Money › Overview - that tile blurs a figure from the
*projection*, which is the practice's own history, and is a different claim.

### 5.2 The markup

One helper, used everywhere, so the two cannot drift:

```js
/* Never called for an unlocked year. Renders no figure because none was computed. */
function taxMaskHTML(ty, what){ ... }   // a gold pill: lock glyph + "Locked"
function taxMaskCard(ty, title, blurb){ ... }  // the full-card version for a whole screen
```

Rules the markup has to keep:

- **A real `aria-label`, not `aria-hidden`.** `.blurfig` hides its number from a screen reader
  because the number is there and is being withheld. Here there is no number, so the honest thing
  is to announce the state: *"Locked. Unlock the 2026-27 tax year to calculate this."*
- **The label beside it stays honest and unmasked.** "On track to owe for 2026-27" still says what
  the figure would be, exactly as the locked projection tile does.
- **It is a button.** Tapping it opens the package sheet for that year, not a generic paywall.
- **It names the year**, because the year is what is bought and because the reader may be looking
  at a table where some rows are open and some are not.
- **Gold** (`.tier-pro`), like everything else that costs money.

### 5.3 Screen by screen

| Screen | Locked behaviour |
|---|---|
| **Tax › Now** | The current year locked ⇒ one unlock card at the top, then the three cards with masked values and their labels intact. Seasonal moments are **not raised** for a locked year: they quote amounts, and `taxMoments()` reaches `taxPot()` to build them. Give each moment an explicit `ty` and filter on it, rather than inferring the year from the id. |
| **Tax › Estimate** | Take-home card masked. The by-year table masks **only the Tax column**, row by row - Net, Billed, Received, Overdue and Sessions stay (§2.3). This is where the cumulative model shows itself: history open, the newest year masked. |
| **Tax › Pot & payments** | Pot figures masked for the current year. The timeline masks **per row, by the tax year the money belongs to, never by the due date** - one 31 January is usually two years' money, and that is the entire reason `taxTimeline()` assembles by due date. The pot *balance* is a number the therapist typed and stays visible. |
| **Tax › Per year** | Untouched. Student loan, region and use of home are inputs, not calculations. Entering your own circumstances is never behind a paywall. |
| **Tax › Making Tax Digital** | Quarter figures stay visible (§2.3). The **export buttons** check `taxYearPaid(ty)` and open the package sheet when locked. `mtdExport()` itself stays ungated - `check-drift.mjs` asserts that. |
| **Guided flows** | `startAfterFileFlow` is mostly data entry (what HMRC assessed) and stays open; its recomputed-schedule preview masks. `startNewYearFlow` is all settings and stays open. |
| **Money › Overview** | Unchanged. The projection tile's `.blurfig` follows `trends`/Pro as it does today. |

### 5.4 The one judgement call in here

Leaving the MTD quarter figures visible while charging for the export file is a line somebody will
question. The argument for it: the figures are the practice's own income and costs added up, they
are visible on Money already, and what MTD actually needs is a **file** with a digital link to the
submission - a number on a screen that a human retypes breaks the link and is exactly what the
rules prohibit (`docs/tax-positioning-2026-09.md`). So the file is the product and the figures are
the record. If that turns out to be too generous, masking the quarter totals is a small change,
but it should be made deliberately and written down here, not drifted into.

---

## 6. Migration

Nobody may lose a figure they can see today. There are three populations and all three are handled
by defaults rather than by a migration step, for the reason the old document gave and which still
holds: a default cannot half-run.

| Who | What happens |
|---|---|
| **A `tier:"plus"` entitlement** (a licence issued with `--tier plus`; no such product was ever sold) | `"plus"` is not in `TIERS`, so `tierOf()` returns `"pro"`. They gain features rather than losing them. |
| **An entitlement with no `tier`** (everything issued before tiers existed) | Already read as `"pro"`. Unchanged. |
| **A live legacy annual subscriber** (`...groundwork.plus.annual`, which entitled the tax engine) | **Granted tax years through the tax year their subscription runs to.** Written as `tt_taxpack {through: taxYear(expiresAt), source:"legacy"}`, applied by the same monotonic `max()` as everything else. Without it, somebody who is paying today opens the app after the update and finds their tax figure masked - the exact outcome the old `tierOf()` default exists to prevent. |

The legacy grant is applied in the native StoreKit refresh, not in `normalize()`: it is device
state, it is derived from what StoreKit reports, and it must be re-derivable on a new phone from a
restore rather than depending on a one-time write having happened.

**`SCHEMA_VERSION` does not move.** Nothing in `S` changes. No `normalize()` migration, no defaults
seeded, nothing in a backup envelope.

---

## 7. The accent: gold everywhere

The chrome ramp exists only to distinguish two tiers. With one tier it is dead, and a chrome edge
on Business analytics beside a gold edge on tax reads as two products.

| Where | Change |
|---|---|
| `.plusgate` default vars (`--tg1..4`, `--tgglow`, `--tgink`) | Point at `--tier3-*` |
| `.tier-plus` class | Removed, along with its call sites |
| `.seg button.premium` (the Business analytics tab accent) | `--tier2-*` → `--tier3-*` |
| `#crbody.bizA::before` (the frame above Business analytics) | `--tier2-*` → `--tier3-*` |
| `.plkeep` ("this one is yours to keep" under the locked funnel) | `--tier2-ink` / `--tier2-glow` → `--tier3-*` |
| `--tier2-1..4`, `--tier2-glow`, `--tier2-ink` tokens | Deleted from `:root` and the dark block |
| Splash `html[data-plus="plus"]` rules (bar 2 chrome, "Plus" pill) | Deleted. Only `data-plus="pro"` remains: bar 3, gold |
| Pre-paint script in `<head>` | Stops reading `p.tier`; any live entitlement stamps `data-plus="pro"` |
| `icon-ideas/groundwork/subscription-plus-1024.{html,png}` | Obsolete. Delete, and re-check the Pro image is the only one referenced |

The comment block above the tier tokens explains at length why chrome runs white → light steel →
**dark** steel → light. Delete the whole comment with the tokens; leaving the reasoning behind for
a ramp that no longer exists is how a later reader reintroduces it.

**Gold's own contrast rule survives and still applies:** `--tier3-ink` is the only member of the
ramp used as *text*, and it is the only one redefined for dark. Anything new drawn in gold has to
be checked at 13px on a real screen, not in a swatch.

---

## 8. StoreKit and App Store Connect

### 8.1 Products

| Product | Type | ID | Note |
|---|---|---|---|
| GroundWork Pro (monthly) | Auto-renewable subscription | `uk.co.charlottebloortherapy.groundwork.pro.monthly` | **New.** A subscription's billing period cannot be changed, so monthly is a new product, not an edit |
| GroundWork Pro (annual) | Auto-renewable subscription | `uk.co.charlottebloortherapy.groundwork.plus.annual` | **The legacy product. Never re-point this ID.** Keep it purchasable so nobody's renewal breaks; it maps to `pro` and `check-drift.mjs` fails the build if that mapping changes |
| ~~GroundWork Plus~~ | - | `...groundwork.insights.annual` | **Never created in App Store Connect.** Delete the mapping from the Swift table; there is nothing to withdraw |
| UK tax year 2026-27 | **Non-consumable** | `uk.co.charlottebloortherapy.groundwork.taxyear.2026` | One per year. **Start year only in the ID** - short, unambiguous, and `taxYearOfProduct()` derives `"2026-27"` from it |

**Non-consumable, not consumable and not a subscription.** Non-consumables restore with
`AppStore.sync()`, appear in `Transaction.currentEntitlements` for ever, and never expire - which
is what "you bought that tax year" has to mean.

**Both subscriptions stay in ONE subscription group.** Monthly and annual in one group is what
makes moving between them a change Apple prorates rather than two live subscriptions.

**A new product every April is real admin.** Create two or three years ahead so it is never on the
critical path in the week somebody is trying to file. The app only offers a year the store can
answer for: a missing product shows "Unavailable" against that year alone and everything else
carries on selling, the same degradation the second tier used to rely on.

### 8.2 The native seam

`window.GWPlusNative` stays the only seam; shared code never touches Capacitor directly.

- **`plusStatus` returns both**, in one round trip, so one refresh keeps both caches honest:
  `{active, tier, expiresAt, source, taxThrough, taxIds}`. The Swift side computes `taxThrough` as
  the max tax year across owned `taxyear.*` non-consumables, plus the legacy grant from §6.
- **`plusProducts`** gains the tax-year products, keyed by tax year, alongside the subscriptions.
- **New `taxPurchase(year)`** runs the non-consumable purchase flow.
- **`plusRestore`** already calls `AppStore.sync()` and re-reads entitlements, so it covers the
  packages with no change beyond returning the new shape.
- Add every new method name to `PLUS_CALLS` in `scripts/check-drift.mjs`. That list is what stops a
  rename silently killing purchases on iOS while the web build carries on looking fine.

### 8.3 Granting without a sale

`scripts/issue-licence.mjs` loses `--tier` (there is one tier) and gains `--tax-through 2027-28`,
carried in the payload as `tx`. `plusRedeemLicence()` writes both caches, the watermark through the
same monotonic `max()`. Offer codes on iOS still cover the subscription; a comped tax year is
either a licence or a promo code against the non-consumable.

`PLUS_PUBKEY` is still `null` and the redemption UI is still hidden until `--keygen` runs. **The
private key must never enter this repo.**

---

## 9. Copy

This is the largest surface of the change and the easiest to leave half-done. Every one of these
says or implies "two tiers", "annual", or "Pro calculates your tax".

| Where | What it becomes |
|---|---|
| `TIER_BLURB` / `TIER_PROMISE` | One entry. Pro's promise can no longer be "rates kept current each April" - that claim moves to the packages, where it is literally true. Pro's own line is what it is: your practice read back to you, from records you already keep, with nothing in it that depends on where you pay tax |
| `PLUS_SELL` | The three tax lines leave it. What remains is Business analytics, Accreditation hours, Notes sync, Costs & other income, and the ordering rule changes with them: the old rule was "the January bill leads, never the charts", and the January bill is no longer in the subscription |
| `PLUS_REASONS` / `reasonHead()` | `tax` and `mtd` drop out - they no longer open the subscription sheet |
| `openPlusSheet()` | One card, not a ladder. **It must name the tax year packages and link to them**, because "where is tax?" is the first question a reader of this sheet will have, and answering it anywhere else guarantees somebody concludes Pro includes tax |
| New `openTaxPackSheet(ty)` | What the package is, which years it covers ("2026-27 and every earlier year"), the price from StoreKit, Buy, and **Restore purchases**. It must say in as many words that it is a one-off, not a subscription, and that it does not expire |
| `plusSettingsCardHTML()` | Two lines: the subscription and its status, then the tax years owned ("Tax years: 2026-27 and earlier" / "None yet") |
| `VIEWS.tax` lock card | Deleted. The tab opens |
| Trends sneak-peek footer, `plusLockHTML` blurbs, `REVEAL_STEPS` tier chips | Re-check each for "Plus", "Pro includes tax", and "annual" |
| `infoDef` topics | Add one - `tax-packages` - explaining the year model in one sheet, linked from every mask. Register it or `npm run test:guidance` fails, which is the point of that test |
| `docs/plus-launch-checklist.md`, `docs/tax-positioning-2026-09.md`, `docs/app-store-listing.md`, `docs/why-groundwork-infographic.html`, `CLAUDE.md` § the paywall | All name two tiers. `tax-positioning` §2's pitch sentence names "Plus" and needs rewording to the package |

**The claims guard-rails in `docs/tax-positioning-2026-09.md` §2 are unchanged and absolute**, and
this revision adds one to them: *buying a tax year package must never be described as making a
figure HMRC-approved, checked, or filed.* It buys a calculation, and the calculation is still an
estimate.

---

## 10. Tests

| Script | Change |
|---|---|
| `scripts/check-tiers.mjs` | Rewritten. The matrix is now one rung plus the year watermark: nothing held ⇒ everything locked; Pro held ⇒ the four features open and tax still masked; a package through 2026-27 ⇒ that year and every earlier one open, 2027-28 masked; the watermark never goes down; a legacy annual subscriber gets years through their renewal; `tier:"plus"` reads as Pro. Then the rendering: the Tax tab opens without a lock card, the mask renders and names its year, **the masked figure is genuinely absent from the DOM** (this is the test that would catch somebody reimplementing it as a blur), and every gate card is gold. Expectations written out from §3 of this document, never read back from `FEATURE_TIER` |
| `scripts/check-drift.mjs` | New seams: `function taxYearPaid(`, `const TAX_PACK_KEY`, `function taxPackThrough(`. New assertion, the same shape as the existing one for `plusLocked()`: **the tax engine must never call `taxYearPaid()`** - `taxLiability`, `mtdQuarters`, `mtdExport`, `tyNet`, `ledgerBetween`. Extend `PLUS_CALLS` with the new Swift methods. Keep the legacy-product-ID assertion exactly as it is |
| `scripts/check-guidance.mjs` | Picks up the new info topic automatically; it will fail if the topic is linked but unregistered, or registered and never linked |
| `tests/tax-tests.js` | **Untouched, and must keep passing untouched.** If a tax test fails because of this work, the gate has been put in the engine - move it back to the view |
| `npm run test:pins`, `test:projection`, `test:behaviour` | Re-run. They touch Trends and the projection tile, both of which change accent and gate |

---

## 11. Risks and open questions

**The subscription loses its strongest justification, and that is the real risk in this change.**
"HMRC rates are kept current every April" was the honest annual promise behind a recurring charge.
It now belongs to the packages. What is left in Pro - analytics, accreditation, Notes sync, costs -
is local computation with no server cost and no dateable recurring work behind it, which is exactly
the shape that makes a monthly charge hard to defend and easy to cancel in a quiet month. Two
answers, and they are not exclusive:

1. **Build multi-device sync** and put it in Pro. It is the one feature with genuine ongoing cost
   behind it, it is known limitation #8, and it would make the renewal self-evident.
2. **Accept that Pro is the smaller business** and that the packages are the product. That is a
   legitimate read - a therapist who buys a tax year every January may be the whole business.

Decide which before pricing, not after.

**The reversal risk on the standalone question.** The first sketch of this change had Pro as a
prerequisite for tax ("Pro gives you the ability to do tax calcs depending on which package you
chose"). The decision taken is the opposite: a package stands alone. If that is reversed later,
§4.2 keeps it to one line - but the copy written under §9 would all have to change, so reverse it
early or not at all.

**Two things a reader will find confusing, and the copy has to pre-empt both:**

- A monthly subscription beside a one-off purchase is two mental models on one sheet. The package
  sheet must say "one-off, does not expire" in the first sentence.
- "Buying 2026-27 includes every earlier year" is generous, and generous offers read as tricks
  unless they are stated flatly and early.

Open items:

- **OPEN: prices.** Both of them. Anchor against what a therapist pays an accountant, not against
  other apps. The package is the one with a natural anchor - it competes with an hour of an
  accountant's time.
- **OPEN: a trial**, and whether it spans January.
- **OPEN:** whether the ended tax year is put on sale beside the current one during the filing
  window (§3.3).
- **OPEN:** the founding cohort - how many, free-forever or price-locked.

---

## 12. Implementation checklist

In order. Each step is meant to leave the app working.

**Gate mechanics** (`TherapyTracker-web/index.html`, the tier block around line 2004)

1. `TIERS` → `["pro"]`; drop `TIER_SHORT.plus`, `TIER_NAME.plus`, `TIER_BLURB.plus`,
   `TIER_PROMISE.plus`. Keep `tierRank`/`plusHas`.
2. `FEATURE_TIER` → `{trends, accreditation, notesSync, finances}`, all `"pro"`. Remove `tax` and
   `mtd`.
3. Add the package block next to it: `TAX_PACK_KEY`, `taxPackRead/Write`, `taxPackThrough`,
   `taxPackAny`, `taxYearPaid`, `taxYearLocked`, `taxPackGrant(ty)` (monotonic `max`),
   `taxYearOfProduct(id)`.
4. `plusLocked("finances")` gains the `|| taxPackAny()` per §3.2. Do this in `plusLocked` itself as
   a named exception with a comment, not at the two call sites.
5. Delete `paletteLocked()` and its `plusLocked("palettes")` call; the palette gate is dead code
   for a switched-off feature.

**The Tax tab** (around line 8219 onward)

6. Delete the `plusLocked("tax")` branch in `VIEWS.tax`.
7. Add `taxMaskHTML()` / `taxMaskCard()` and the `.taxmask` CSS beside the `.plusgate` rules.
8. `drawNow`: lock branch **before** `taxLiability`/`taxPot`/`nextTaxPayment` are called. Give
   `taxMoments()` entries an explicit `ty` and filter.
9. `VIEWS.tax`'s Estimate branch: mask the take-home card and the Tax column per row.
10. `drawPayments`: mask by the row's own tax year, never by due date.
11. `drawMTD`: leave the figures, gate the two export buttons on `taxYearPaid(ty)`.
12. `drawAllowances`: no change. Confirm by reading it, do not assume.

**Sheets, settings and copy** (§9)

13. `openTaxPackSheet(ty)`, and wire `[data-taxpack]` the way `plusWireLocks` wires `[data-plus]`.
14. Rewrite `openPlusSheet`, `PLUS_SELL`, `PLUS_REASONS`, `plusSettingsCardHTML`, the info topic.

**Accent** (§7)

15. CSS tokens, `.tier-plus`, `.premium`, `.bizA`, `.plkeep`, the splash rules, the pre-paint
    script.

**Native** (§8.2)

16. `GroundWorkNativePlugin.swift`: product table, `plusStatus` shape, `taxPurchase`, the legacy
    grant. **None of it has been compiled here** - the usual caveat applies, and `npm run check` is
    what asserts the two halves still name the same methods.
17. `scripts/issue-licence.mjs`: drop `--tier`, add `--tax-through`.

**Tests and docs** (§10, §9)

18. `check-drift.mjs` seams and the new engine assertion first, so the rest of the work is guarded.
19. Rewrite `check-tiers.mjs`.
20. `npm run check`, `test:tiers`, `test:tax`, `test:guidance`, `test:pins`, `test:projection`,
    `test:behaviour`.
21. `CLAUDE.md` § the paywall, `plus-launch-checklist.md`, `tax-positioning-2026-09.md`,
    `app-store-listing.md`.
22. Bump `sw.js`'s cache constant `C` **only if** a static asset changed (the subscription images).
    `index.html` is network-first and does not need it.

---

## 13. What deliberately does not change

- **`SCHEMA_VERSION`.** No new field in `S`; entitlements are device state.
- **`tests/tax-tests.js`.** Must keep passing untouched. A failure there means the gate went into
  the engine.
- **`normalize()`.** No migration, no defaults, no entitlement seeding.
- **The web build is ungated.** `plusGateOn()` and `taxGateOn()` are both false off-native, so
  nothing Charlotte or the tester sees today changes at all.
- **The privacy label.** StoreKit purchases are Apple's data collection, not ours. No analytics
  SDK, ever.
- **Testing locked states in a browser:** `localStorage.tt_plus_gate = "on"` still switches both
  gates on, and is still incapable of unlocking anything.
