# GroundWork Plus — launch checklist

*Pick this up cold. Everything here is done by you, in Apple's console or on a Mac — the code
side of Phase 1 is finished and pushed.*

Design and reasoning: **`docs/monetisation.md`**. Release mechanics: **`docs/releasing.md`**.
Store copy and the privacy-label answer: **`docs/app-store-listing.md`**.

---

## Where things stand

Branch `claude/app-store-monetization-ujwihp` — built, tested in Chromium, pushed.

- The gate is live in code but **iOS only**. The web app is deliberately ungated, so nothing
  Charlotte or your tester sees today has changed at all.
- Locked features: Tax, Costs & other income, MTD export, Trends, Accreditation, Notes sync,
  the five non-Sage colour schemes.
- Free forever: logging, receipts, the spreadsheet import, every export and backup.
- Nothing is purchasable yet — the App Store Connect product does not exist. That is step 2.

**To see the locked states right now:** serve `TherapyTracker-web/` and run
`localStorage.tt_plus_gate = "on"` in the console, then reload. That key can only switch the
gate *on*; it cannot unlock anything.

**To unlock a TestFlight build, do step 2 — there is no shortcut and none is needed.**
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

## Step 1 — Decide the price ☑

**£29.99 / year.** Decided Sept 2026.

The anchor was what a UK therapist pays an accountant for self-assessment, roughly £300–600 a
year; £29.99 sits comfortably under a tenth of that, which is an easy yes rather than a
deliberation. It is a notch below the £30–40 originally floated — worth knowing that raising
it later means handling existing subscribers explicitly, so treat this as the floor rather
than an opening bid.

- [x] Price: **£29.99 / year**
- [ ] **Trial — still open.** A 1-month free trial spanning January is worth more than a
      discount, because that is when the tax features prove themselves. Set it as an
      *Introductory Offer → Free → 1 month* in step 2 if you want it.

---

## Step 2 — Create the subscription in App Store Connect ☐

App Store Connect → **Apps** → GroundWork → **Subscriptions**

- [ ] Create a **Subscription Group** named `GroundWork Plus`
- [ ] Create a subscription inside it:
  - **Reference name:** `GroundWork Plus Annual`
  - **Product ID:** `uk.co.charlottebloortherapy.groundwork.plus.annual`
  - **Duration:** 1 Year
  - **Price:** **£29.99 / year**
- [ ] Add a **Localization** — display name and description. Required; review rejects without it.
- [ ] If offering a trial: **Introductory Offer** → Free → 1 month
- [ ] Add the **subscription image** — 1024×1024, for offer-code redemption, win-back offers
      and the product page if App Store Promotion is on:
      `TherapyTracker-web/icon-ideas/groundwork/subscription-plus-1024.png`
      Regenerate with `node scripts/render-subscription-image.mjs`; the `.html` beside it is
      the source. Opaque, square, no rounded corners — Apple masks its own.
- [ ] Add the **review screenshot** — the *App Review Information* one, so a reviewer can see
      where the purchase is offered. Customers never see it.
      `TherapyTracker-web/icon-ideas/groundwork/paywall-review-screenshot.png`

> **The catch-22, and how it breaks.** App Store Connect wants this screenshot before the
> subscription can leave *Missing Metadata*, and StoreKit cannot fetch a product that is still
> in *Missing Metadata* — so a TestFlight paywall can only ever say "Subscription unavailable
> right now", which is the one image you must not give a reviewer.
>
> `node scripts/render-paywall-screenshot.mjs --price "£39.99"` breaks it with no Mac and no
> live product: it loads the real `index.html`, forces the gate on, stubs **only** the store,
> opens the shipping `openPlusSheet()` and captures it at 1320×2868 (iPhone 6.9"). Every pixel
> but the price is the real app.
>
> The price is a placeholder. Re-run with the real `--price` once step 2 is saved, and swap in
> a genuine device screenshot before you submit for review.

> ⚠️ The product ID must match **exactly**. It is hardcoded at
> `ios/App/App/GroundWorkNativePlugin.swift:47`. A mismatch shows an empty price on the paywall
> and gives no error anywhere. If you want a different ID, change the Swift constant too.

---

## Step 3 — Privacy Policy and Terms of Use ☐

**There is no "Terms of Use URL" field in App Store Connect** — only Privacy Policy has one.
Guideline 3.1.2 wants functional links to both in the app binary *and* in the store metadata.
The binary half is already done: on iOS the paywall's two links open the bundled copies in a
sheet rather than leaving for Safari.

- [ ] **App Information → Privacy Policy URL:**
      `https://mc392.github.io/therapy-tracker/privacy.html`
- [ ] **App Store → your version → Description** — paste the subscription block; this is where
      the Terms of Use link actually lives. Drafted in `docs/app-store-listing.md`.
- [ ] **App Information → License Agreement** — leave it on Apple's Standard EULA. A custom one
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
back empty. The subscription does **not** need to be submitted or approved to be testable — it
needs to be *Ready to Submit*, and the paid agreement has to be active. Work these in order:

1. **Paid Applications agreement is active.** Business → *Agreements, Tax, and Banking*: accept
   it and complete **bank details and tax forms**. Until it is fully active, every product
   returns empty **with no error of any kind** — the app simply sees nothing. This is the most
   common cause and the least obvious, because nothing about it looks related to the app.
2. **The subscription group has its own localised display name.** The reference name is not
   enough.
3. **The subscription is complete** — reference name, product ID, duration, localisation,
   review screenshot, and a **price for the territory your Apple ID is in**. A price set in
   only some territories gives nothing in the others.
4. **Product ID matches exactly** — `GroundWorkNativePlugin.swift:47` against App Store Connect.
5. **Propagation.** Minutes usually, sometimes hours. Nothing to do but re-check.

Not required, despite how it feels: submitting the subscription, approval, submitting an app
version, or a sandbox tester account. (TestFlight routes to sandbox by itself; a sandbox
account is only for builds run from Xcode.) The "first in-app purchase must be submitted with
an app version" rule is about **going live**, not about testing.

**No rebuild is needed at any point here** — the product is fetched at runtime, so the build
already on your phone starts working the moment App Store Connect is right.

---

## Step 4 — Test in the simulator ☐

No Apple approval needed for this — StoreKit can fake the purchase locally.

```bash
npm run ios
```

Then in Xcode:

- [ ] **File → New → File → StoreKit Configuration File** (choose "Sync with App Store
      Connect", or add the product by hand with the same ID)
- [ ] **Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration** → select it
- [ ] Run on a simulator

Check each of these:

- [ ] Settings shows a **GroundWork Plus** card
- [ ] Tax and Trends show the lock card, not their content
- [ ] The tabs are all still **there** — a locked tab still appears and still opens
- [ ] The paywall shows a **real price** (if blank, the product ID does not match)
- [ ] Buying unlocks everything
- [ ] **Restore purchases** works after deleting and reinstalling
- [ ] Export and backup still work **while locked** — this is the invariant that matters most

- [ ] **Screenshot the paywall** → go back and finish step 2's review screenshot

---

## Step 5 — Cut a TestFlight build ☐

**Two routes. Neither needs a Mac.**

### A. From the Actions tab (no local checkout at all)

`testflight.yml` has a `workflow_dispatch` trigger, and the workflow does everything itself:
`npm ci`, `npm run check`, **`npm run sync`** (so the bundled copy of the web app is rebuilt in
CI, never whatever a local sync left behind), then archive, export and upload. It passes
`CURRENT_PROJECT_VERSION` to `xcodebuild` on the command line, which overrides the number in the
project for every target — the watch app included, so the two cannot drift apart.

- [ ] GitHub → **Actions → TestFlight → Run workflow**
- [ ] Pick the branch — **any branch, not just `main`**, so a fix can reach TestFlight before
      it is merged
- [ ] **Type a build number** higher than the last one Apple accepted. Left blank it uses the
      workflow's run number, which is monotonic but has no idea what a tag-driven build already
      used, so it can collide — and Apple rejects a duplicate outright.

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

> ⚠️ **Pushing to GitHub updates the website, not the iPhone app.** A push alone never builds —
> it takes a tag or a manual run. It is very easy to confirm a fix on the live site and assume
> TestFlight has it.

---

## Step 6 — Buy it on TestFlight ☐

TestFlight purchases are free sandbox purchases, so this is the real flow at no cost.

- [ ] Install from TestFlight, tap **Subscribe**, confirm everything unlocks
- [ ] Delete the app, reinstall, confirm **Restore purchases** brings it back
- [ ] Cancel the purchase sheet once — it should close silently, with no error toast
- [ ] Leave it an hour and confirm the sandbox renewal keeps it active

A **separate sandbox tester account** (App Store Connect → Users and Access → Sandbox →
Testers, then Settings → App Store → Sandbox Account on the phone) is only needed for builds
run straight from Xcode, not for TestFlight.

This catches what the simulator cannot.

---

## Step 7 — Comp Charlotte, yourself and the tester ☐

**On iOS, use Apple's offer codes.** Not licence keys — it is Apple's own mechanism, so there
is no payment-route argument at review, and the subscription lands in the recipient's Apple ID
subscriptions where they expect to manage it.

- [ ] App Store Connect → your subscription → **Offer Codes** → create a batch
- [ ] In the app: Settings → GroundWork Plus → **Redeem a code**

Licence keys are for the web (Phase 2) and anything Apple cannot reach. If you want one now:

```bash
node scripts/issue-licence.mjs --keygen
node scripts/issue-licence.mjs --kind founding --name "Charlotte Bloor" --forever
```

- The keygen writes the private key to `~/.groundwork/licence-key.json`. **Back it up.** It is
  not in the repo and cannot be recovered — losing it means re-keying, which invalidates every
  licence already issued.
- It also patches the **public** key into `index.html`. Commit that, and cut a new build before
  it reaches a phone.
- Keep a record of what you issued (id, name, expiry) **outside this repo** — it holds personal
  data, and there is no revocation. Expiry is the only lever.

---

## Step 8 — Screenshots and listing copy ☐

`docs/app-store-listing.md` already has the store copy, the "Data Not Collected" answer and the
screenshot list drafted.

- [ ] 6.9" iPhone screenshots from demo data
- [ ] The paywall screenshot from step 4
- [ ] Re-read the Guideline 4.2 note in that file before submitting

---

## Step 9 — Submit ☐

- [ ] Submit the **subscription and the build together** — a build referencing an unsubmitted
      product fails
- [ ] Expect at least one round of questions, most often about the paywall or the privacy label

---

## Still open (decide before launch, not after)

- **Price and trial** — step 1.
- **The founding cohort** — how many, and free-forever or price-locked at launch. See
  `docs/monetisation.md` §6.4; they are different promises with very different long-run costs.
- **The Phase 2 legacy policy** — decide *before* the free web app has users worth retracting
  features from, not when Phase 2 starts. `docs/monetisation.md` §7.

---

## If something looks broken

| Symptom | Almost certainly |
|---|---|
| Paywall says "Subscription unavailable right now" | The product does not exist yet, is still in *Missing Metadata*, hasn't propagated, or the ID does not match `GroundWorkNativePlugin.swift:47` |
| Upload rejected instantly | Duplicate build number — type an explicit one on a manual run, or use `npm run release` |
| TestFlight missing a fix you pushed | You pushed to GitHub but did not cut a build |
| Licence field never appears | `PLUS_PUBKEY` is still `null` — that is deliberate until `--keygen` runs |
| A tax test fails | The paywall has been put inside the engine. `npm run check` should have caught it |

---

## Things to hand back to Claude

- Change the product ID (both sides).
- Draft the subscription display name and description for step 2.
- Build the demo dataset for screenshots.
- Start Phase 2 — `docs/monetisation.md` §5 is the spec.
