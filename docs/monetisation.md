# GroundWork monetisation plan

*How GroundWork Pro and the UK tax year packages are defined, gated, sold and reviewed. Written
Sept 2026. This revision replaces the two-subscription model that preceded it, and the code
described here is **built**.*

> **Sep 2026, second revision - one subscription, and tax is bought by the year.**
>
> The model this document described until now was **two annual subscriptions**: GroundWork Plus
> (chrome, everything except tax) and GroundWork Pro (gold, everything). That is withdrawn. There
> is now:
>
> - **GroundWork Pro** - one **monthly** subscription, **gold**. The chrome accent is retired.
> - **UK tax year packages** - a **one-off purchase per tax year**, on top of Pro, which includes
>   every earlier tax year. This is what calculates tax.
>
> Anything written before this revision that says "Plus" means Pro. Anything that says "the tax
> bundle is part of Pro" is out of date: **Pro on its own does not calculate tax.**

This document is the decision record. Where it says "decided", the choice has been made and the
reasoning is here so a later reader does not reopen it by accident. Where it says **OPEN**, it has
not. §12 records what shipped.

---

## 1. The decisions

| | Decision | Why |
|---|---|---|
| **Model** | **One monthly subscription (GroundWork Pro) + a one-off purchase per UK tax year** | The old two-tier ladder asked a reader to rank two subscriptions against each other before they had used either. It also made the tax engine a *subscription* feature, which is a poor fit: tax is a job with a deadline, done once a year, and a recurring charge for it feels wrong in every month that is not January. A purchase attached to a named tax year is exactly the shape of the work being paid for. |
| **Tax gating** | **The Tax tab opens for everybody. Computed tax figures are masked until that year is bought.** | A lock card describing four screens nobody has seen is a poor advert, and the reader's own records are behind it - their student-loan plan, their region, their use-of-home claim, what HMRC assessed. They can walk the whole screen, enter everything, and see exactly where the figure will appear. Trends already learned this with the sneak peek. |
| **A tax year needs Pro** | **Pro is a prerequisite. A tax year cannot be bought or used without it.** | Decided, and it reverses the first sketch of this revision - see §11. Costs & other income lives in Pro, and a tax figure worked out with no costs taken off it is wrong every time. Requiring the subscription underneath the year is what makes it impossible to sell somebody a knowingly overstated tax figure. |
| **No mis-selling, as a rule not a hope** | **Every surface that asks for money for Pro states that tax is separate.** | The cost of the decision above: somebody could subscribe to Pro in January expecting a tax figure. So the exclusion is said out loud on the paywall, in the tier blurb, on the Settings card and in its own info topic - never merely omitted. `npm run test:tiers` asserts the sentence is on the sheet. See §2.4. |
| **Cumulative downward** | **Buying a tax year includes every earlier tax year.** | One purchase, one watermark, one comparison. It also means somebody arriving with four years of history in a spreadsheet buys once and sees all of it, which is the case the spreadsheet import exists to create. |
| **Accent** | **Gold (`--tier3-*`) everywhere. Chrome (`--tier2-*`) is retired.** | With one subscription there is nothing to distinguish, and a chrome edge on Business analytics beside a gold one on a tax figure reads as two products. Business analytics, the lock cards, the tab accent, the masks and the splash mark are all gold. |
| **Sequencing** | **iOS first. Web stays free.** | Unchanged. StoreKit needs no accounts, no server, no VAT registration. The PWA on Pages carries on as the free shopfront. |
| **Existing users** | **Charlotte only** is comped. No general grandfathering. | Unchanged, and still close to free: as of Sept 2026 the user base is Charlotte, Matt and one tester. |

---

## 2. Four invariants

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
3. The spreadsheet import is the switching-cost remover. Gate it and nobody reaches the paywall.

**Practical rule for the code:** the paywall lives in the **view and button layer only**.
`tyNet()`, `taxLiability()`, `taxForYear()`, `taxPot()`, `taxSchedule()`, `taxTimeline()`,
`mtdQuarters()`, `mtdExport()` and `ledgerBetween()` stay pure and ungated - partly because that is
where correctness lives, partly because `tests/tax-tests.js` calls them directly and must keep
passing regardless of entitlement state. `check-drift.mjs` asserts that none of them calls
`plusLocked()` **or** `taxYearPaid()`.

This has a second half, and it is new: **the view layer must not call the tax engine for a locked
year where the call exists only to produce the masked figure.** Not because the engine would be
wrong, but because a masked figure that was computed anyway is a figure sitting in the DOM waiting
to be read, and because "needs the tax year to calculate this" should be literally true. The
exception, stated honestly: `taxTimeline()` is still built on Pot & payments even when this year is
locked, because which rows exist at all is something only the engine knows and a reader who owns an
earlier year has paid to see those dates. No locked figure is printed from it.

### 2.2 `feat()` is not entitlement, and neither is the other one

Three separate axes, and nothing may collapse them:

- `feat(k)` - *the user switched this off*. A preference.
- `plusLocked(k)` - *this device does not subscribe*. A billing state.
- `taxYearLocked(ty)` - *this device has not bought that tax year*. A different billing state, per
  year, with Pro underneath it.

If `feat("tax")` started returning false for unpaid users, `visibleTabs()` would drop the Tax tab
entirely, so there would be no upsell surface at all, and the user's own on/off choice would be
tangled with their entitlement. `TABS[].ft` gating is untouched.

### 2.3 The mask covers tax the app computes, never money the practice recorded

This is the rule that decides, case by case, what a locked year hides, and it is the one most
likely to be got wrong by somebody adding a figure later.

**Masked** (the app worked it out from HMRC's rules):

- `taxLiability()` - on track to owe, the Tax column of the by-year table, the working sheet.
- `taxPot()` - what to keep back, the target, the rate, the "you are £x ahead" verdict.
- `taxSchedule()` / `nextTaxPayment()` / `taxTimeline()` - every amount against a due date.
- `monthlyTakeHome()` - it is net **of tax**.
- The app's own estimate beside what HMRC assessed.

**Never masked** (it is the therapist's own record, and most of it is on the Money tab anyway):

- Billed, received, overdue, session counts.
- `tyNet()` - the Net column. That is profit, not tax.
- The MTD quarter **figures** on screen: turnover and expense boxes are the practice's own money
  added up. The **export file** is year-scoped and does follow the package - see §5.4.
- **Due dates.** When money leaves the account is not a calculation, and a due date the reader
  cannot see is the one thing here that could cost them a penalty.
- Anything the therapist typed in: what HMRC assessed, a claim to reduce, a pot balance and its
  buffer, a pension contribution, a student-loan plan, a region, a use-of-home claim.

Say it as a sentence when in doubt: *if the number came out of `ukTax()` or something downstream of
it, it is masked; if it came out of the practice's own records or the reader's own typing, it is
not.*

### 2.4 Pro is never sold on tax

The design deliberately separates the thing most people will be buying for (a tax figure in
January) from the thing they subscribe to. That creates exactly one way to take money unfairly:
somebody subscribes to Pro believing it includes the tax figure, and finds a mask.

So the exclusion is **stated**, not merely not-claimed, everywhere money is asked for:

| Surface | What it says |
|---|---|
| `TIER_BLURB.pro` | "...Tax calculations are not included - each UK tax year is its own one-off purchase, on top of Pro." |
| `openPlusSheet()` | A full-width `.taxsep` panel above the fold: *"Pro does **not** work out your tax."* plus the way through to the year sheet. Not small print, not a footnote. |
| `plusSettingsCardHTML()` | A tax line that is present **even when nothing has been bought** - "No tax year bought yet" is the answer that prevents the misunderstanding, so leaving the line out until there is something to show is exactly how it would survive. |
| `infoDef("tax-packages")` | Opens on the sentence, before explaining anything else. |
| `openTaxPackSheet()` | Two numbered steps, Pro first, so the total cost of getting a tax figure is never split across two screens. |

`npm run test:tiers` asserts the sentence is on the subscription sheet, that the sheet offers a way
to the tax years, and that no withdrawn tier is named anywhere on it.

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
  quarter figures, entering what HMRC assessed, and every screen's structure with its computed
  figures masked.

**Receipts stays free** on purpose: a client asking for a statement for their insurer is an
obligation, not a luxury. **Backups stay free** on purpose: §2.1.

### 3.2 GroundWork Pro - the monthly subscription

Everything the practice tells you about itself. Nothing in it depends on where the reader pays tax,
which is what makes it sellable to a therapist in Dublin, Toronto or Auckland without a line of new
rules code.

| Feature | Flag | Entry point |
|---|---|---|
| Business analytics (twenty of them) | `trends` | `renderMetrics()`, the Trends segment |
| Costs & other income | `finances` | `financeCards()` / `financeForm()` |
| Accreditation hours (Form 3A, the 1:6 ratio) | `accreditation` | `mountAccreditation()` |
| GroundWork Notes sync | `notesSync` | `#rosterSync` → `syncSchedules()` |

`FEATURE_TIER` is the one place that split lives, and **`tax` and `mtd` are deliberately absent from
it**. They are not subscription features any more; they are answered by `taxYearPaid()`.
`plusLocked("tax")` must keep returning false, so that nothing can route a tax lock into the
subscription sheet and sell Pro on a promise it does not keep.

### 3.3 UK tax year packages - the one-off purchases

One product per UK tax year, bought once, never expiring, restorable on a new phone. **Requires
Pro. Buying a year includes every earlier year.**

What a package unlocks, for its year and all earlier ones:

- Every masked figure in §2.3.
- The MTD quarterly **export** (`.csv` and `.json`) for that year.
- The working behind any figure (`taxDetailsSheet`), and a due date's breakdown (`taxDueSheet`).

**Only one package is on sale at a time: the tax year in progress.** Somebody who wants last year
buys this year and gets last year with it - more than they asked for, and one price to think about.
If the "I only want to file the year just ended" case turns up, add a second product for the ended
year during its filing window; the code needs no change, because the watermark does not care how a
year was reached.

**What the charge actually pays for, said plainly:** a tax calculation is region-specific and
year-specific. Bands and thresholds, the personal allowance, Class 2 and Class 4, student-loan plan
thresholds and the Scottish rates against the rest of the UK all move every April, and each year
keeps its own set for good. Getting 2026-27 right is a different piece of work from 2025-26, and
neither stops being needed once done - a return can be amended years later. That claim now sits on
the thing it describes. It used to be the justification for a subscription, which was always a
slightly awkward fit.

### 3.4 Deliberately not sold

- Receipts, backups, import, what a room costs you. See §2.1 and §3.1.
- Colour schemes. Switched off in the app entirely (`PALETTES_ENABLED`), so gating them would gate
  something nobody can reach. `paletteLocked()` is now a constant `false`, kept rather than deleted
  because the picker and the wizard step both still call it and they come back together.
- Multi-device sync - **it does not exist**. Known limitation #8 in `CLAUDE.md`, and the one feature
  with genuine ongoing cost behind it. If Pro ever struggles to justify its renewal, this is the
  thing to build, not more analytics. See §11.

---

## 4. The entitlement model in code

### 4.1 Two caches, two lifetimes, two keys

Device state, never `S` - the same rule that keeps `tt_lock` out of `S`. `S` travels in backups, and
restoring a backup onto somebody else's phone must not carry a purchase with it.

```
tt_plus      {"active":true,"tier":"pro","expiresAt":"2026-10-01T00:00:00Z",
              "source":"storekit","kind":null,"name":null,"checkedAt":"..."}

tt_taxpack   {"through":"2026-27","source":"storekit",
              "ids":["uk.co.charlottebloortherapy.groundwork.taxyear.2026"],
              "checkedAt":"..."}
```

**Two keys rather than one object, and that is deliberate.** A subscription lapses; a non-consumable
never does. `plusClear()` runs when StoreKit says the subscription is gone - if the packages lived
in the same record, a lapse would wipe purchases Apple still considers owned. Separate keys make
that impossible rather than merely unlikely, and `npm run test:tiers` asserts it.

### 4.2 The watermark

`through` is a single tax-year string and it is the whole model: **every year at or below it is
unlocked.** Tax years are `YYYY-YY` with a fixed width and an incrementing lead, so a plain string
comparison orders them correctly (`"2025-26" < "2026-27"`, and `"2099-00" < "2100-01"` when that
eventually matters).

```js
function taxYearPaid(ty){
  if(!taxGateOn()) return true;          // the web build is ungated
  if(!plusHas("pro")) return false;      // Pro is the floor, not an alternative
  const t = taxPackThrough();
  return !!t && String(ty) <= t;
}
```

`taxLockReason(ty)` returns `"sub"`, `"year"` or `"both"` - three answers, not two, because "you
need Pro as well" and "you need the year" are different jobs and a mask that says the wrong one is
a mask that sends somebody to the wrong sheet.

**The watermark only ever goes up.** `taxPackGrant()` is the only writer and it takes the max. That
one rule makes a restore arriving out of order, a StoreKit refresh that only saw some entitlements,
and the legacy grant (§6) all safe without any of them having to know the others exist. A
non-consumable cannot be re-issued, so a write that lowered it would be money taken for something
the reader then did not have.

### 4.3 Where the fail-open doctrine applies, and where it cannot

`plusTier()` fails open on every error path - an unreadable date, an unrecognised tier, a thrown
read - because locking a paying subscriber out is worse than the alternative. The packages keep the
same posture where they can: nothing here may throw, and a record that still carries a parseable
`through` is honoured whatever else is wrong with it.

But a completely unreadable `tt_taxpack` cannot fail open, because there is nothing to fail open
**to** - no year is named, so there is no figure to unlock. The remedy is visible instead: the tax
year sheet carries **"Already bought this? Restore purchases"**, which re-reads
`Transaction.currentEntitlements` and rewrites the watermark.

### 4.4 The ladder collapses to one rung

```js
const TIERS = ["pro"];
const FEATURE_TIER = { finances:"pro", trends:"pro", accreditation:"pro", notesSync:"pro" };
```

`TIERS`, `tierRank()` and `plusHas()` are kept even at one rung. They cost nothing, and a
hand-rolled `plusTier()==="pro"` scattered through the file is how the last tier split went wrong.

`tierOf()` keeps its fail-open default and it now does the migration for free: `"plus"` is no longer
in `TIERS`, so `tierOf({tier:"plus"})` returns `"pro"`. No migration step, nothing to half-run.

---

## 5. The mask

### 5.1 What it is

A masked figure is **not a blurred real figure.** The `.blurfig` treatment on Money › Overview
computes the number and blurs it; the mask does not compute it at all. The reasons:

- "Needs the tax year to calculate this" should be true, not a figure of speech.
- Nothing is left in the DOM to read.
- The tax engine is the expensive part of a render. A locked year should cost nothing.

`.blurfig` stays exactly as it is on Money › Overview - that tile blurs a figure from the
*projection*, which is the practice's own history, and is a different claim. `npm run test:tiers`
asserts that no `£` figure and no `.blurfig` appears anywhere on a locked Tax tab, which is the test
that fails if somebody reimplements this as a blur.

### 5.2 The markup

`taxMaskHTML(ty, cls, shape)` is the inline mask; `taxMaskCard(ty, title, blurb)` is the full card
for a screen whose whole point is a figure. Rules they keep:

- **It is drawn in the shape of the figure it replaces** - `£•,•••`, or `••%` where a percentage
  belongs (`TAX_MASK_SHAPES`, keyed by the `shape` argument, money by default). Until Sep 2026 each
  one was a gold pill carrying a padlock and the word **Locked**, and the Estimate table alone put
  five of them down a single column: the tab read as a sales pitch repeated once per figure rather
  than as one screen waiting on one purchase. The dots make the same statement in the reader's own
  terms - a number goes here and there isn't one yet - and the explaining stays where it was
  already being done properly: the gate card at the top of the screen, the `aria-label`, and the
  tap. **A percentage masked as `£•,•••` would be a different claim**, which is why the shape is an
  argument rather than one string. Nothing is computed either way; that part is unchanged.
- **`.taxmask` sets `font:inherit`**, so the mask is exactly the size and weight of the figure it
  stands in for and no row jumps when a year is unlocked - `.big` is now only vertical rhythm. It
  also has to put `-webkit-text-fill-color` back to `currentColor`: `.nowcard .nv` and `.kpi .v`
  paint their numbers with a clipped gradient over a transparent fill, and that fill inherits.
- **A line that is not standing in for a figure does not get a mask at all.** The MTD export note
  is a sentence about a *file* with every quarter figure already on the screen above it, so it is a
  plain muted line with a lock glyph; the export buttons already open the year's sheet.
- **A real `aria-label`, not `aria-hidden`.** `.blurfig` hides its number from a screen reader
  because the number is there and is being withheld. Here there is no number, only a state, and the
  state is worth announcing: *"Locked. Unlock the 2026-27 tax year to calculate this."* The dots
  themselves are `aria-hidden` inside the button, so nobody is read "pound bullet comma bullet".
- **The label beside it stays honest and unmasked** - "On track to owe for 2026-27" still says what
  the figure would be, exactly as the locked projection tile does.
- **It is a button**, and it opens the package sheet for *that year*, not a generic paywall. It
  calls `stopPropagation()`, because masks sit inside cards that navigate on click.
- **It names the year in its label**, because the year is what is bought and a table can have some
  rows open and some not.
- **Gold** (`.tier-pro`), like everything else that costs money - but a muted gold on a dashed
  outline rather than a filled badge, so it reads as an empty slot and not as a button to buy.
- **One mask per row.** A breakdown line under a masked total says "not calculated" in words -
  otherwise a single timeline row carries four masked figures and says nothing more for them.

### 5.3 Screen by screen

| Screen | Locked behaviour |
|---|---|
| **Tax › Now** | The whole screen short-circuits **before any engine call**: an unlock card, then the three cards with masked values and their labels intact. Seasonal moments are not raised - every one of them quotes an amount, and `taxMoments()` reaches `taxPot()` to build them, so a moment on a locked year is the one place a masked figure would leak out in a sentence. The footer links to Pot & payments, where the filing job still lives. |
| **Tax › Estimate** | Take-home masked (it is net *of tax*). The by-year table masks **only the Tax column**, row by row; `taxForYear()` is not called for a locked year. Net, Billed, Received, Overdue and Sessions stay - the rows come from the sessions, not the engine. This is where the cumulative model shows itself: history open, the newest year masked. |
| **Tax › Pot & payments** | The pot locks as a unit (`taxPot()` is not called), but its **buffer and balance stay editable** - both are the therapist's own settings and one is a number she typed. The timeline masks **per row, by the tax year the money belongs to, never by the due date**; one 31 January is usually two years' money. Entering what HMRC assessed is never locked; the app's own estimate beside it is. |
| **Tax › Per year** | Untouched. Student loan, region and use of home are inputs, not calculations. |
| **Tax › Making Tax Digital** | Quarter figures stay visible (§2.3). The **export buttons** check `taxYearPaid(ty)` and open the package sheet when locked, with a line under them saying the figures above are the reader's own. `mtdExport()` itself stays ungated. |
| **Money › Overview** | Unchanged. The projection tile's `.blurfig` follows `trends`/Pro, now in gold. |

### 5.4 The one judgement call in here

Leaving the MTD quarter figures visible while charging for the export file is a line somebody will
question. The argument for it: the figures are the practice's own income and costs added up, they
are on Money already, and what MTD actually needs is a **file** with a digital link through to the
submission - a number a human reads off a screen and retypes breaks that link and is what the rules
prohibit (`docs/tax-positioning-2026-09.md`). So the file is the product and the figures are the
record. If that turns out to be too generous, masking the quarter totals is a small change, but it
should be made deliberately and written down here, not drifted into.

---

## 6. Migration

Nobody may lose a figure they can see today. Three populations, all handled by defaults rather than
by a migration step, for the reason that still holds: a default cannot half-run.

| Who | What happens |
|---|---|
| **A `tier:"plus"` entitlement** (a licence issued with the old `--tier plus`; no such product was ever sold) | `"plus"` is not in `TIERS`, so `tierOf()` returns `"pro"`. They gain features rather than losing them. |
| **An entitlement with no `tier`** (everything issued before tiers existed) | Already read as `"pro"`. Unchanged. |
| **A live legacy annual subscriber** (`...groundwork.plus.annual`, which entitled the tax engine) | **Granted tax years through the tax year their subscription runs to.** The Swift side reports `legacyTaxThrough` from `Transaction.currentEntitlements`; the web side applies it through the same monotonic `taxPackGrant()`. Without it, somebody paying today would open the app after updating and find their figures masked. |

The legacy grant is **derived on every status call**, not written once, which is what makes it
survive a restore onto a new phone. An undated legacy entitlement is treated as running to today,
which still unlocks the year in progress.

**`SCHEMA_VERSION` does not move.** Nothing in `S` changes. No `normalize()` migration, no defaults
seeded, nothing in a backup envelope.

---

## 7. The accent: gold everywhere

The chrome ramp existed only to distinguish two tiers. What changed:

| Where | Change |
|---|---|
| `--tier2-1..4`, `--tier2-glow`, `--tier2-ink` | Deleted from `:root` and the dark block, with the comment that explained them |
| `.tier-plus` | Removed, along with its call sites |
| `.plusgate` default vars (`--tg1..--tg4`, `--tgglow`, `--tgink`) | Point at `--tier3-*` |
| `.seg button.premium` (the Business analytics tab accent) | Gold |
| `#crbody.bizA::before` (the frame above Business analytics) | Gold |
| `.plkeep` ("this one is yours to keep") | Gold |
| Splash `html[data-plus="plus"]` rules and the `spChrome` SVG gradient | Deleted. Only `data-plus="pro"` remains: bar 3, gold, "Pro" on the wordmark |
| Pre-paint script in `<head>` | Any live entitlement stamps `data-plus="pro"` |
| `icon-ideas/groundwork/subscription-plus-1024.{html,png}` | **Still on disk and now obsolete.** Delete when the App Store images are next regenerated |

The six-variable indirection (`--tg1..--tg4`) is kept even with one ramp to point at: it is what made
the two-tier build possible in one pass, it costs nothing, and a second paid colour (a regional tax
pack, say) is then a class rather than a sweep through every rule.

**Gold's own contrast rule survives:** `--tier3-ink` is the only member of the ramp used as *text*,
and the only one redefined for dark. Anything new drawn in gold has to be checked at 13px on a real
screen, not in a swatch. Tax year packages are deliberately **not** marked on the splash: it marks
who you are, not what you have bought, and a mark that changed every April would read as a fault.

---

## 8. StoreKit and App Store Connect

### 8.1 Products

| Product | Type | ID | Note |
|---|---|---|---|
| GroundWork Pro (monthly) | Auto-renewable subscription | `uk.co.charlottebloortherapy.groundwork.pro.monthly` | **New, and the one on sale.** A subscription's billing period cannot be changed, so monthly is a new product |
| GroundWork Pro (annual) | Auto-renewable subscription | `uk.co.charlottebloortherapy.groundwork.plus.annual` | **The legacy product. Never re-point this ID.** Keep it purchasable so nobody's renewal breaks; it maps to `pro` and `check-drift.mjs` fails the build if that mapping changes. Nothing sells it any more |
| ~~GroundWork Plus~~ | - | `...groundwork.insights.annual` | **Never created in App Store Connect.** The mapping is gone from the Swift; there was nothing to withdraw |
| UK tax year 2026-27 | **Non-consumable** | `uk.co.charlottebloortherapy.groundwork.taxyear.2026` | One per year. **Start year only in the ID**; `taxYearOfProduct()` derives `"2026-27"` from it at both ends, and `check-drift.mjs` asserts the two halves agree |

**Non-consumable, not consumable and not a subscription.** Non-consumables restore with
`AppStore.sync()`, appear in `Transaction.currentEntitlements` for ever, and never expire - which is
what "you bought that tax year" has to mean.

**Both subscriptions stay in ONE subscription group.** Monthly and annual in one group is what makes
moving between them a change Apple prorates rather than two live subscriptions.

**A new product every April is real admin.** `taxYearsForSale` in the Swift is the list; create two
or three years ahead so it is never on the critical path in the week somebody is trying to file. A
missing product shows "Unavailable" against that year alone and everything else carries on selling.

**`taxPurchase` deliberately does not check for a subscription.** The web layer disables the button
without Pro; enforcing it again in Swift would mean a purchase StoreKit had completed that the app
then refused to honour, which is money taken for nothing. Somebody who reaches it without Pro owns
the year and sees it the moment they subscribe.

### 8.2 The native seam

`window.GWPlusNative` stays the only seam; shared code never touches Capacitor directly.

- **`plusStatus` answers for both** in one round trip - `{active, tier, expiresAt, taxThrough,
  taxIds, legacyTaxThrough}` - so one refresh can never leave one cache stale against the other.
- **`plusProducts`** returns `{pro:{…}, years:{"2026-27":{…}}}`.
- **`taxPurchase(year)`** runs the non-consumable purchase flow.
- **`plusRestore`** already calls `AppStore.sync()` and re-reads entitlements, so it covers the
  packages.
- All of it is in `PLUS_CALLS` in `scripts/check-drift.mjs`, which is what stops a rename silently
  killing purchases on iOS while the web build carries on looking fine.

**None of the Swift has been compiled** - the usual caveat for this repo. `npm run check` asserts the
two halves still name the same methods and the same product id prefix.

### 8.3 Granting without a sale

`scripts/issue-licence.mjs` has lost `--tier` (there is one tier) and gained **`--tax-through
2027-28`**, carried in the payload as `tx`. The subscription and the tax years are granted
**separately and deliberately**: comping a subscription is cheap and routine, while comping the tax
engine is the thing with the April rates work behind it, so it should be something somebody types
rather than something that rides along. A licence with no `tx` grants Pro and leaves tax masked.

`PLUS_PUBKEY` is still `null` and the redemption UI is still hidden until `--keygen` runs. **The
private key must never enter this repo.**

---

## 9. Copy

Every one of these said or implied "two tiers", "annual", or "Pro calculates your tax":

| Where | What it became |
|---|---|
| `TIER_BLURB` | One entry, and it names the exclusion (§2.4) |
| `TIER_PROMISE` | Pro's promise is what it is - records you already keep, no jurisdiction in it. The April-rates promise moved to `TAX_PACK_PROMISE`, where it is literally true |
| `PLUS_SELL` | The three tax lines left it. The old ordering rule ("the January bill leads, never the charts") went with them, because the January bill is no longer in the subscription |
| `TAX_PACK_SELL` | New, and kept apart from `PLUS_SELL` rather than appended to it, because the two are bought differently and that difference is what a reader most needs to understand |
| `PLUS_REASONS` / `reasonHead()` | `tax` and `mtd` dropped out - they no longer open the subscription sheet |
| `openPlusSheet()` | One offer card, plus the `.taxsep` panel and a button through to the year sheet |
| `openTaxPackSheet(ty)` | New: two numbered steps, "one-off purchase, not a subscription" in the first sentence, "every earlier tax year" beside it, and Restore purchases |
| `plusSettingsCardHTML()` | "What you are paying for" - a subscription line and a tax-years line, both always present |
| `VIEWS.tax` lock card | Deleted. The tab opens |
| `infoDef("tax-packages")` | New, linked from every mask and both sheets |
| Trends sneak peek, `.peekfig`, the projection tile | Gold, and naming Pro |

**The claims guard-rails in `docs/tax-positioning-2026-09.md` §2 are unchanged and absolute**, and
this revision adds one: *buying a tax year package must never be described as making a figure
HMRC-approved, checked, or filed.* It buys a calculation, and the calculation is still an estimate.

**Still to do in the wider docs:** `docs/tax-positioning-2026-09.md` §2's pitch sentence names
"Plus"; `docs/plus-launch-checklist.md` carries a superseded banner but its App Store Connect steps
describe two subscriptions; `docs/app-store-listing.md` and `docs/why-groundwork-infographic.html`
both name two tiers. None of them is shipped code.

---

## 10. Tests

| Script | State |
|---|---|
| `scripts/check-tiers.mjs` | **Rewritten - 57 assertions.** One rung; the tax matrix (Pro without a year, a year without Pro, Pro plus a year, earlier years included, later years not); the three lock reasons; the watermark refusing to go down; a lapse leaving the years owned; the withdrawn tier reading as Pro; the Tax tab opening; the masks being gold, labelled, year-scoped and announced; **no `£` figure and no `.blurfig` anywhere on a locked tab**; Per year untouched; the mis-selling sentence on the sheet; the two-step year sheet. Expectations written out from §2 and §3, never read back from `FEATURE_TIER` |
| `scripts/check-drift.mjs` | **32 seams.** New: `taxYearPaid`, `taxPackThrough`, `taxPackGrant`, `TAX_PACK_KEY`. New assertions: the engine never calls `taxYearPaid()`/`taxYearLocked()` (extended to `taxForYear`, `taxPot`, `taxSchedule`, `taxTimeline`), the data plane never calls either gate, and the tax-year product id prefix matches between Swift and JS |
| `scripts/check-projection.mjs` | Two assertions updated: the locked tile is gold and names Pro. It named the cheaper of two rungs, and that rung no longer exists |
| `tests/tax-tests.js` | **Untouched, 134/134.** If a tax test fails because of this work, the gate has been put in the engine |
| Everything else | `check`, `test:guidance`, `test:pins`, `test:behaviour`, `test:rent`, `test:import`, `test:review`, `test:folder` all pass unchanged |

---

## 11. Risks and open questions

**The subscription loses its strongest justification, and that is the real risk in this change.**
"HMRC rates are kept current every April" was the honest annual promise behind a recurring charge.
It now belongs to the packages, where it is more honest still. What is left in Pro - analytics,
accreditation, Notes sync, costs - is local computation with no server cost and no dateable
recurring work behind it, which is exactly the shape that makes a monthly charge easy to cancel in a
quiet month. Two answers, not exclusive:

1. **Build multi-device sync** and put it in Pro. It is the one feature with genuine ongoing cost
   behind it, it is known limitation #8, and it would make the renewal self-evident.
2. **Accept that Pro is the smaller business** and that the packages are the product. A therapist
   who buys a tax year every January may be the whole business.

Decide which before pricing, not after. Note that making Pro a *prerequisite* for tax cuts against
answer 2: it props the subscription up on the packages' demand, which is good for revenue and is
also the reason §2.4 exists.

**The standalone question was asked and reversed.** The first draft of this revision had a tax year
standing alone, with Costs & other income unlocked by `Pro || taxPackAny()`. That was withdrawn in
favour of Pro as a prerequisite, which removes the `OR` and the whole class of problem behind it.
Reversing it again is one line in `taxYearPaid()` - written that way on purpose - but the copy in
§2.4 and §9 would all have to change with it, so reverse it early or not at all.

**Two things a reader will find confusing, and the copy pre-empts both:**

- A monthly subscription beside a one-off purchase is two mental models on one sheet. The year sheet
  says "one-off, does not expire" in its first sentence.
- "Buying 2026-27 includes every earlier year" is generous, and generous offers read as tricks
  unless stated flatly and early.

Open items:

- ~~OPEN: prices.~~ **Decided Sept 2026: £1.99 / month for Pro, £7.99 for a UK tax year.** The
  package carries the anchor - it competes with an hour of an accountant's time against the
  £300-600 a therapist pays for self assessment - and the subscription is priced to be an easy yes
  rather than a deliberation. Both together come to £31.87 in a first year, which is the figure a
  reader works out for themselves and the one to sanity-check against. Raising a subscription price
  later means handling existing subscribers explicitly, so £1.99 is a floor rather than an opening
  bid. Neither figure is in the app - both are read from the store per storefront.
- **OPEN: a trial**, and whether it spans January.
- **OPEN:** whether the ended tax year goes on sale beside the current one during the filing window.
- **OPEN:** the founding cohort - how many, free-forever or price-locked.

---

## 12. What shipped

Branch `claude/groundwork-pro-pricing-sulcnp`, built and tested in Chromium.

| | Where |
|---|---|
| One rung; `tax`/`mtd` out of `FEATURE_TIER` | `index.html`, the tier block |
| `tt_taxpack`, the watermark, `taxYearPaid`, `taxLockReason`, `taxPackGrant` | same block |
| `openPlusSheet` rewritten; `openTaxPackSheet` added; price/purchase plumbing shared | same block |
| `taxMaskHTML` / `taxMaskCard` and the `.taxmask` / `.taxsep` / `.tstep` CSS | same block, CSS beside `.plusgate` |
| Tax tab unlocked; Now, Estimate, Pot & payments and MTD masked per §5.3 | `VIEWS.tax`, `drawNow`, `drawPayments`, `drawMTD` |
| `taxDetailsSheet` / `taxDueSheet` guard themselves | ditto |
| `infoDef("tax-packages")`, the Settings card, gold everywhere, the splash | throughout |
| `taxPurchase`, the two-answer `plusStatus`, the legacy grant | `GroundWorkNativePlugin.swift` (uncompiled) |
| `--tax-through`, `--tier` removed | `scripts/issue-licence.mjs` |
| Tests | `check-tiers.mjs` rewritten, `check-drift.mjs` extended, `check-projection.mjs` corrected |

### Not built, and why

- **Phase 2 in its entirety** - accounts, the licence-signing endpoint, magic-link auth, a merchant
  of record. All of it needs external accounts and a deployed Worker, and it is sequenced after iOS
  has shown whether anyone pays.
- **`PLUS_PUBKEY` is `null`.** Run `node scripts/issue-licence.mjs --keygen` when a licence is first
  needed.
- **No App Store Connect products exist yet** - neither the monthly subscription nor any tax year.
  Until they do, the paywall shows "Unavailable" and nothing can be bought, which is the designed
  degradation, not a bug.
- **Price, trial length and the founding cohort** are still open (§11).

---

## 13. What deliberately does not change

- **`SCHEMA_VERSION`.** No new field in `S`; entitlements are device state.
- **`tests/tax-tests.js`.** Passes untouched. A failure there means the gate went into the engine.
- **`normalize()`.** No migration, no defaults, no entitlement seeding.
- **The web build is ungated.** `plusGateOn()` and `taxGateOn()` are both false off-native, so
  nothing Charlotte or the tester sees today changes at all.
- **`sw.js`'s cache constant.** `index.html` is network-first; no static asset changed.
- **The privacy label.** StoreKit purchases are Apple's data collection, not ours. No analytics SDK,
  ever.
- **Testing locked states in a browser:** `localStorage.tt_plus_gate = "on"` switches both gates on
  and is still incapable of unlocking anything.
