# GroundWork Plus & Pro - launch checklist

*Pick this up cold. Everything here is done by you, in Apple's console or on a Mac - the code
side of Phase 1 is finished and pushed.*

> **SUPERSEDED IN PART - read `docs/monetisation.md` first.** The pricing model was reworked again
> in Sep 2026: **one monthly subscription (GroundWork Pro, gold)** plus **a one-off purchase per UK
> tax year**, which is what calculates tax. The two-tier ladder this checklist was written against
> (Plus in chrome, Pro in gold, both annual) is withdrawn, and the App Store Connect steps below
> change with it - two subscriptions in one group become monthly + the legacy annual, and a
> non-consumable is needed for each tax year. **The code side is built and tested** - see
> `docs/monetisation.md` §12 for what shipped. What is left is all in Apple's console, and the
> product list below is what changes:
>
> - `…groundwork.pro.monthly` - **GroundWork Pro**, monthly, in the same subscription group as the
>   legacy annual `…groundwork.plus.annual` (which stays purchasable and must never be re-pointed).
> - `…groundwork.taxyear.2026` - **UK tax year 2026-27**, a **non-consumable**, not a subscription.
>   One per year, created two or three years ahead so it is never on the critical path in January.
> - `…groundwork.insights.annual` - never created, and no longer needed. Nothing to withdraw.
>
> Everything here about TestFlight, sandbox behaviour, screenshots and submission mechanics is
> unaffected and still correct.
>
> *Below, as originally written:* **GroundWork Pro** is the top tier (everything, gold) and is the
> ORIGINAL product - the same product ID, renamed. **GroundWork Plus** is a new, cheaper tier below
> it (everything except tax, chrome). Anywhere below that says "the subscription" in the singular,
> it means Pro unless it says otherwise.

Design and reasoning: **`docs/monetisation.md`**. Release mechanics: **`docs/releasing.md`**.
Store copy and the privacy-label answer: **`docs/app-store-listing.md`**.

---

## Where things stand

Branch `claude/app-store-monetization-ujwihp` - built, tested in Chromium, pushed.

- The gate is live in code but **iOS only**. The web app is deliberately ungated, so nothing
  Charlotte or your tester sees today has changed at all.
- **Behind GroundWork Pro** (the monthly subscription): Business analytics, Costs & other income,
  Accreditation hours, Notes sync.
- **Behind a tax year** (a one-off purchase, on top of Pro): every computed tax figure for that
  year and every earlier one, plus that year's MTD export. The Tax tab itself **opens for
  everybody** - only the worked-out figures are masked.
- Free forever: logging, receipts, what your rooms cost you, the spreadsheet import, every export
  and backup, and every setting on the Tax tab.
- Nothing is purchasable yet - no App Store Connect product exists. That is step 2.

**To see the locked states right now:** serve `TherapyTracker-web/` and run
`localStorage.tt_plus_gate = "on"` in the console, then reload. That key can only switch the
gate *on*; it cannot unlock anything.

**To unlock a TestFlight build, do step 2 - there is no shortcut and none is needed.**
TestFlight routes StoreKit to the **sandbox**, so once the subscription exists in App Store
Connect, tapping Subscribe on a TestFlight build costs nothing and grants a real entitlement
through the real code path. No sandbox tester account is needed for TestFlight, and no
test-only unlock had to be built into the app (which is why there is none to remember to
remove before launch). Two things to know:

- The product must reach at least **Ready to Submit**. One sitting in *Missing Metadata* is
  not fetchable, and the paywall will say "Subscription unavailable right now."
- It can take a few hours to propagate after you create it.
- **Sandbox compresses time:** a 1-year subscription renews every hour and auto-renews 6 times
  before stopping. Useful \u2014 it lets you exercise expiry and the 7-day offline grace without
  waiting a year.

---

## Step 1 - Decide the two prices ☐

There are **two things to price now**, and they are different kinds of decision.

**The subscription (GroundWork Pro, monthly).** The old £29.99/year was priced when the
subscription included the tax engine. It no longer does, so that anchor is gone and the figure
has to be reconsidered rather than divided by twelve.

**The tax year (a one-off, per year).** This one has the natural anchor: it competes with an hour
of an accountant's time, and it is bought in January by somebody who has just seen what their bill
is. A UK therapist pays an accountant roughly £300-600 a year for self assessment.

- [ ] Price: **GroundWork Pro, per month** - ______
- [ ] Price: **UK tax year, one-off** - ______
- [ ] **Trial - still open.** A 1-month free trial on Pro spanning January is worth more than a
      discount. Set it as an *Introductory Offer → Free → 1 month* in step 2 if you want one.
      A non-consumable cannot have a trial, so this only applies to the subscription.

Nothing in the app hardcodes either figure - both are read from the store at runtime, per
storefront. You can change them later without a release.

---

## Step 2 - Create the products in App Store Connect ☐

**Three products, two kinds.** Do them in this order; the first is the one that lets a TestFlight
build sell anything at all.

> **Before anything else: the Paid Applications agreement must be fully active.**
> Business → *Agreements, Tax, and Banking* → accept it, then complete **bank details and tax
> forms**. Until every part of that is done, **every product returns empty with no error of any
> kind** - the paywall just says "unavailable" and nothing anywhere explains why. This is the most
> common cause of "my products don't show up" and the least obvious, because nothing about it
> looks related to the app.

### 2a. The subscription group

App Store Connect → **Apps** → GroundWork → **Subscriptions**

- [ ] There must be exactly **ONE Subscription Group**, named `GroundWork`, holding **both**
      subscriptions. This is not cosmetic: one group is what makes moving between monthly and the
      legacy annual a change Apple prorates, rather than two live subscriptions billing the same
      person twice. Nothing in the app could detect that if it happened.
- [ ] Give the **group itself** a localised display name. The reference name is not enough, and a
      group without one makes every product in it unfetchable.

### 2b. GroundWork Pro, monthly - the one now on sale

- [ ] New subscription in that group:
  - **Reference name:** `GroundWork Pro Monthly`
  - **Product ID:** `uk.co.charlottebloortherapy.groundwork.pro.monthly`
  - **Duration:** 1 Month
  - **Price:** your step 1 figure
- [ ] **Localization** - display name and description. Required; review rejects without it.
- [ ] **Subscription image**, 1024×1024:
      `TherapyTracker-web/icon-ideas/groundwork/subscription-pro-1024.png` (gold).
      Regenerate with `node scripts/render-subscription-image.mjs subscription-pro-1024`.
      Opaque, square, no rounded corners - Apple masks its own.
- [ ] **Review screenshot** (*App Review Information*) so a reviewer can see where the purchase is
      offered. Customers never see it.
      `TherapyTracker-web/icon-ideas/groundwork/paywall-review-screenshot.png`
- [ ] Optional: **Introductory Offer** → Free → 1 month.

**The copy on this product must not promise tax.** Pro does not calculate tax and the app says so
on every screen that asks for money; a store description that implies otherwise is the one thing
that would make the in-app copy look like a retraction. The wording is drafted in
`docs/app-store-listing.md`.

### 2c. The legacy annual - leave it alone

- [ ] `uk.co.charlottebloortherapy.groundwork.plus.annual` - if it already exists, **change
      nothing about its ID and do not delete it.** It stays purchasable so nobody's renewal
      breaks, and the app maps it to Pro. Rename its *display name* to `GroundWork Pro (annual)`
      if you like; never re-point the ID.
- [ ] If it does **not** exist yet, skip it. It only matters for people already subscribed, and
      there are none.

`npm run check` fails the build if the code's mapping for this ID ever changes.

### 2d. The tax years - non-consumables, not subscriptions

App Store Connect → **Apps** → GroundWork → **In-App Purchases**

**This is a different section of the console from Subscriptions.** Pick type
**Non-Consumable** - not Consumable (it would be usable once and then gone) and not
Auto-Renewable (a tax year does not renew; the *next* year is a different product).

- [ ] Create the year in progress:
  - **Reference name:** `UK tax year 2026-27`
  - **Product ID:** `uk.co.charlottebloortherapy.groundwork.taxyear.2026`
        ← **the START year only**, and the format is not negotiable: the app parses the year back
        out of the ID at both ends, and `npm run check` asserts the Swift and the JavaScript agree
        about the prefix. `.2026` means the 2026-27 tax year.
  - **Price:** your step 1 figure
- [ ] **Localization** - display name and description. Suggested:
      *"Works out your 2026-27 tax, and every earlier tax year: what you are on track to owe,
      what to keep back for it, payments on account, and that year's Making Tax Digital export.
      A one-off purchase - it does not expire. Requires GroundWork Pro."*
- [ ] **Review screenshot** - the same paywall image is fine.
- [ ] **Product image** - there is no tax-year artwork yet. Reuse the gold Pro image.

**Then create next year too, now.** `…taxyear.2027` (UK tax year 2027-28). A product takes time to
propagate and can sit in review; having it ready months early means April is never a scramble. Add
it to `taxYearsForSale` in `ios/App/App/GroundWorkNativePlugin.swift:198` when you want the app to
offer it - the app only ever puts the *current* tax year on sale, so a product that exists but is
not yet current costs nothing.

### 2e. The ID checklist

These must match **exactly**. A mismatch shows an empty price on the paywall and produces no error
anywhere at all.

| What | Product ID | Type | Where it is in code |
|---|---|---|---|
| GroundWork Pro, monthly | `uk.co.charlottebloortherapy.groundwork.pro.monthly` | Auto-renewable, 1 month | `GroundWorkNativePlugin.swift:172` |
| GroundWork Pro, legacy annual | `uk.co.charlottebloortherapy.groundwork.plus.annual` | Auto-renewable, 1 year | `GroundWorkNativePlugin.swift:173` |
| UK tax year 2026-27 | `uk.co.charlottebloortherapy.groundwork.taxyear.2026` | **Non-consumable** | built from the prefix at `:195`, offered per `:198` |

> **The catch-22, and how it breaks.** App Store Connect wants a review screenshot before a
> product can leave *Missing Metadata*, and StoreKit cannot fetch a product that is still in
> *Missing Metadata* - so a TestFlight paywall can only ever say "unavailable right now", which is
> the one image you must not give a reviewer.
>
> `node scripts/render-paywall-screenshot.mjs --price "£4.99"` breaks it with no Mac and no live
> product: it loads the real `index.html`, forces the gate on, stubs **only** the store, opens the
> shipping `openPlusSheet()` and captures it at 1320×2868 (iPhone 6.9"). Every pixel but the price
> is the real app.
>
> The price is a placeholder. Re-run with the real `--price` once step 2 is saved, and swap in a
> genuine device screenshot before you submit for review.

### 2f. What "done" looks like

- [ ] Every product reaches at least **Ready to Submit**. One in *Missing Metadata* is not
      fetchable.
- [ ] Each has a **price in the territory your own Apple ID is in**. A price set in only some
      territories gives nothing in the others, silently.
- [ ] Wait. Propagation is minutes usually, sometimes hours. Nothing to do but re-check.

**No rebuild is needed at any point here.** Products are fetched at runtime, so the build already
on your phone starts working the moment App Store Connect is right.

### 2g. How to tell it worked, from the app

Open the app on TestFlight and go to **Settings → App preferences → What you are paying for**:

- Tap **See what Pro is**. A real price beside "GroundWork Pro" means 2b is live. "Unavailable"
  means it is not.
- Tap **Tax year 2026-27**. A real price against step 2 of that sheet means 2d is live.

The two are independent, deliberately: the subscription can sell while a tax year is still
propagating, and the sheet reports each one separately rather than failing as a pair.

---

## Step 3 - Privacy Policy and Terms of Use ☐

**There is no "Terms of Use URL" field in App Store Connect** - only Privacy Policy has one.
Guideline 3.1.2 wants functional links to both in the app binary *and* in the store metadata.
The binary half is already done: on iOS the paywall's two links open the bundled copies in a
sheet rather than leaving for Safari.

- [ ] **App Information → Privacy Policy URL:**
      `https://mc392.github.io/therapy-tracker/privacy.html`
- [ ] **App Store → your version → Description** - paste the subscription block; this is where
      the Terms of Use link actually lives. Drafted in `docs/app-store-listing.md`.
- [ ] **App Information → License Agreement** - leave it on Apple's Standard EULA. A custom one
      is entered as *text*, not a URL, and the description link covers the requirement.

The URLs, for pasting:

```
Privacy Policy   https://mc392.github.io/therapy-tracker/privacy.html
Terms of Use     https://mc392.github.io/therapy-tracker/terms.html
Support URL      https://mc392.github.io/therapy-tracker/
```

---

## Why can't TestFlight see the subscription?

The paywall saying **"Subscription unavailable right now"** means `Product.products(for:)` came
back empty. The subscription does **not** need to be submitted or approved to be testable - it
needs to be *Ready to Submit*, and the paid agreement has to be active. Work these in order:

1. **Paid Applications agreement is active.** Business → *Agreements, Tax, and Banking*: accept
   it and complete **bank details and tax forms**. Until it is fully active, every product
   returns empty **with no error of any kind** - the app simply sees nothing. This is the most
   common cause and the least obvious, because nothing about it looks related to the app.
2. **The subscription group has its own localised display name.** The reference name is not
   enough.
3. **The subscription is complete** - reference name, product ID, duration, localisation,
   review screenshot, and a **price for the territory your Apple ID is in**. A price set in
   only some territories gives nothing in the others.
4. **Product IDs match exactly** - `GroundWorkNativePlugin.swift:171-198` against App Store
   Connect. See the table in step 2e.
5. **Propagation.** Minutes usually, sometimes hours. Nothing to do but re-check.

Not required, despite how it feels: submitting the subscription, approval, submitting an app
version, or a sandbox tester account. (TestFlight routes to sandbox by itself; a sandbox
account is only for builds run from Xcode.) The "first in-app purchase must be submitted with
an app version" rule is about **going live**, not about testing.

**No rebuild is needed at any point here** - the product is fetched at runtime, so the build
already on your phone starts working the moment App Store Connect is right.

---

## Step 4 - Test in the simulator ☐

No Apple approval needed for this - StoreKit can fake the purchase locally.

```bash
npm run ios
```

Then in Xcode:

- [ ] **File → New → File → StoreKit Configuration File** (choose "Sync with App Store
      Connect", or add the product by hand with the same ID)
- [ ] **Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration** → select it
- [ ] Run on a simulator

Check each of these:

- [ ] Settings shows a **Subscription** card listing both tiers
- [ ] Tax shows a **gold** lock card naming GroundWork Pro; Business analytics shows a **chrome**
      one naming GroundWork Plus, with the retention funnel still readable above it
- [ ] The tabs are all still **there** - a locked tab still appears and still opens
- [ ] The paywall shows a **real price against each tier** (if one is blank, that product ID does
      not match; if both are, the group does not)
- [ ] Buying **Plus** unlocks Business analytics, accreditation and Notes sync - and leaves Tax
      locked
- [ ] Buying **Pro** (or upgrading from Plus) unlocks everything, and the upgrade is charged as a
      proration rather than a second subscription
- [ ] The launch screen shows the tier's own mark: chrome "Plus" on bar 2, gold "Pro" on bar 3
- [ ] **Restore purchases** works after deleting and reinstalling
- [ ] Export and backup still work **while locked** - this is the invariant that matters most

- [ ] **Screenshot the paywall** → go back and finish step 2's review screenshot

---

## Step 5 - Cut a TestFlight build ☐

**Two routes. Neither needs a Mac.**

### A. From the Actions tab (no local checkout at all)

`testflight.yml` has a `workflow_dispatch` trigger, and the workflow does everything itself:
`npm ci`, `npm run check`, **`npm run sync`** (so the bundled copy of the web app is rebuilt in
CI, never whatever a local sync left behind), then archive, export and upload. It passes
`CURRENT_PROJECT_VERSION` to `xcodebuild` on the command line, which overrides the number in the
project for every target - the watch app included, so the two cannot drift apart.

- [ ] GitHub → **Actions → TestFlight → Run workflow**
- [ ] Pick the branch - **any branch, not just `main`**, so a fix can reach TestFlight before
      it is merged
- [ ] **Type a build number** higher than the last one Apple accepted. Left blank it uses the
      workflow's run number, which is monotonic but has no idea what a tag-driven build already
      used, so it can collide - and Apple rejects a duplicate outright.

### B. `npm run release` (needs a local checkout)

```bash
npm run release
git push && git push --tags
```

Does the same, plus the things a repo should remember: it refuses a dirty tree, **commits** the
bumped build number so a build is identifiable later, sets `MARKETING_VERSION` with
`--version 1.1`, and tags. Pushing the tag triggers the same workflow.

Use **A** for a quick fix you want on a phone now; **B** when cutting a release you will want to
find again.

> ⚠️ **Pushing to GitHub updates the website, not the iPhone app.** A push alone never builds -
> it takes a tag or a manual run. It is very easy to confirm a fix on the live site and assume
> TestFlight has it.

---

## Step 6 - Buy it on TestFlight ☐

TestFlight purchases are free sandbox purchases, so this is the real flow at no cost.

- [ ] Install from TestFlight, tap **Subscribe**, confirm everything unlocks
- [ ] Delete the app, reinstall, confirm **Restore purchases** brings it back
- [ ] Cancel the purchase sheet once - it should close silently, with no error toast
- [ ] Leave it an hour and confirm the sandbox renewal keeps it active

A **separate sandbox tester account** (App Store Connect → Users and Access → Sandbox →
Testers, then Settings → App Store → Sandbox Account on the phone) is only needed for builds
run straight from Xcode, not for TestFlight.

This catches what the simulator cannot.

---

## Step 7 - Comp Charlotte, yourself and the tester ☐

**On iOS, use Apple's offer codes.** Not licence keys - it is Apple's own mechanism, so there
is no payment-route argument at review, and the subscription lands in the recipient's Apple ID
subscriptions where they expect to manage it.

- [ ] App Store Connect → the **subscription** → **Offer Codes** → create a batch.
- [ ] In the app: Settings → App preferences → What you are paying for → **See what Pro is** →
      **Redeem a code**

**Offer codes only cover the subscription.** A non-consumable cannot have one, so a comped tax
year is either a **promo code** (App Store Connect issues up to 100 per product per version,
under the app version's *Promo Codes*) or a licence key. Comping Pro does **not** comp tax - the
two are separate on purpose, because the tax year is the part with the April rates work behind it.

Licence keys are for the web (Phase 2) and anything Apple cannot reach. If you want one now:

```bash
node scripts/issue-licence.mjs --keygen
node scripts/issue-licence.mjs --kind founding --name "Charlotte Bloor" --forever
node scripts/issue-licence.mjs --kind comp --name "Charlotte Bloor" --forever --tax-through 2027-28
node scripts/issue-licence.mjs --kind gift --name "A N Other" --months 12
```

Every licence grants **GroundWork Pro**. `--tax-through` is what additionally grants tax years -
that year and every earlier one - and leaving it off grants the subscription alone, with tax
figures still masked. There is no `--tier` any more: there is one subscription, and a licence
carrying the withdrawn `plus` rung is read as Pro.

- The keygen writes the private key to `~/.groundwork/licence-key.json`. **Back it up.** It is
  not in the repo and cannot be recovered - losing it means re-keying, which invalidates every
  licence already issued.
- It also patches the **public** key into `index.html`. Commit that, and cut a new build before
  it reaches a phone.
- Keep a record of what you issued (id, name, expiry) **outside this repo** - it holds personal
  data, and there is no revocation. Expiry is the only lever.

---

## Step 8 - Screenshots and listing copy ☐

`docs/app-store-listing.md` already has the store copy, the "Data Not Collected" answer and the
screenshot list drafted.

- [ ] 6.9" iPhone screenshots from demo data
- [ ] The paywall screenshot from step 4
- [ ] Re-read the Guideline 4.2 note in that file before submitting

---

## Step 9 - Submit ☐

- [ ] Submit the **subscription and the build together** - a build referencing an unsubmitted
      product fails
- [ ] Expect at least one round of questions, most often about the paywall or the privacy label

---

## Still open (decide before launch, not after)

- **Price and trial** - step 1.
- **The founding cohort** - how many, and free-forever or price-locked at launch. See
  `docs/monetisation.md` §6.4; they are different promises with very different long-run costs.
- **The Phase 2 legacy policy** - decide *before* the free web app has users worth retracting
  features from, not when Phase 2 starts. `docs/monetisation.md` §7.

---

## If something looks broken

| Symptom | Almost certainly |
|---|---|
| Paywall says "Unavailable" against Pro | The subscription does not exist yet, is still in *Missing Metadata*, hasn't propagated, or the ID does not match `GroundWorkNativePlugin.swift:172` |
| "Unavailable" against a tax year, but Pro prices fine | The non-consumable is missing or wrong. It lives under **In-App Purchases**, not Subscriptions, and its ID carries the START year only (`…taxyear.2026` = 2026-27) |
| Tax figures still masked after buying a year | Pro is a prerequisite - check the subscription is live too. The tax year sheet shows both steps and ticks each one it has |
| Upload rejected instantly | Duplicate build number - type an explicit one on a manual run, or use `npm run release` |
| TestFlight missing a fix you pushed | You pushed to GitHub but did not cut a build |
| Licence field never appears | `PLUS_PUBKEY` is still `null` - that is deliberate until `--keygen` runs |
| A tax test fails | The paywall has been put inside the engine. `npm run check` should have caught it |

---

## Things to hand back to Claude

- Change the product ID (both sides).
- Draft the subscription display name and description for step 2.
- Build the demo dataset for screenshots.
- Start Phase 2 - `docs/monetisation.md` §5 is the spec.
