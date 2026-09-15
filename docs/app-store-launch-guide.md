# GroundWork — App Store launch guide (the final run)

*Written 15 Sep 2026. One place, in order, with every answer already typed out so you can
copy and paste. This supersedes the scattered "what's left" notes in the older docs and is
cross-checked against the actual code as it stands today.*

**Read this first — what has changed since the older docs were written**

The pricing model was simplified in Sep 2026 and some older docs still describe the retired
two-tier ladder. The truth today, verified against the code:

- There is **one subscription: GroundWork Pro** (gold), monthly.
- Tax is **not** in Pro. Each **UK tax year is a separate one-off purchase** (a non-consumable)
  that requires Pro.
- The old "GroundWork Plus" (chrome, cheaper) tier **does not exist**. Anywhere a doc says
  "Plus" as a tier, read "Pro". Anywhere it says the tax engine is part of Pro, that is out of
  date.

Everything else in `docs/releasing.md`, `docs/app-store-listing.md` and
`docs/plus-launch-checklist.md` about mechanics (signing, TestFlight, sandbox) is still correct;
this guide pulls the parts you still need to *do* into one sequence and fixes the copy.

---

## What is already done (so you don't redo it)

- ✅ Rebrand to GroundWork, Capacitor wrapper, four native features, brand assets installed.
- ✅ Apple Developer enrolment; App Store Connect records exist for GroundWork **and**
  GroundWork Notes, both under **Business**.
- ✅ The two products already exist in App Store Connect as records:

  | Product | Product ID (what the app asks StoreKit for) | Apple internal ID |
  |---|---|---|
  | GroundWork Pro, monthly | `uk.co.charlottebloortherapy.groundwork.pro.monthly` | `6811661858` |
  | UK tax year 2026-27 | `uk.co.charlottebloortherapy.groundwork.taxyear.2026` | `6811663965` |

  Both IDs are verified to match the code (`GroundWorkNativePlugin.swift` and
  `TAX_PACK_PREFIX` in `index.html`). **Nothing needs pasting into the code** — the numbers
  above are Apple's internal IDs, not used by the app.
- ✅ `privacy.html` and `terms.html` are live on GitHub Pages.
- ✅ The TestFlight CI pipeline (`.github/workflows/testflight.yml`) is built and, per the
  release notes, has produced real builds. Current build number in the project is **3**,
  marketing version **1.0**.

**What is genuinely left:** finish the App Store Connect product metadata, fill in the app
listing, cut a fresh TestFlight build and test it on **real hardware**, take screenshots, then
submit. That is this guide.

---

## The prepared answers — copy/paste block

Keep this open in another window; every step below refers back to it.

```
Bundle ID          uk.co.charlottebloortherapy.groundwork
App name           GroundWork
Subtitle           Private practice records
Primary category   Business
Secondary category Productivity
Age rating         4+
Price              Free (the app is free; money is made via Pro + tax-year purchases)
Support URL        https://mc392.github.io/therapy-tracker/
Privacy Policy URL https://mc392.github.io/therapy-tracker/privacy.html
Terms of Use URL   https://mc392.github.io/therapy-tracker/terms.html
Privacy label      Data Not Collected
Encryption         Exempt — uses standard (WebCrypto) encryption only
```

Prices (already decided):

```
GroundWork Pro (monthly)   £1.99 / month
UK tax year 2026-27        £7.99 one-off (non-consumable, requires Pro)
```

---

## STEP 0 — The blocker that hides everything: the Paid Applications agreement

**Do this before anything else and confirm it is fully active.** If it is not, every product
returns empty with *no error of any kind* — the paywall just says "unavailable" and nothing
explains why. This is the single most common cause of "my products don't show up".

1. App Store Connect → **Business** → **Agreements, Tax, and Banking**.
2. Accept the **Paid Applications** agreement.
3. Complete **Bank details** and **Tax forms** in full.
4. Confirm the agreement status shows **Active** (not "Pending").

Until all of that is green, skip ahead and set up the listing text, but know the paywall will
not work on TestFlight.

---

## STEP 1 — Finish the GroundWork Pro subscription

App Store Connect → **Apps → GroundWork → Subscriptions**.

1. **Subscription group.** There must be exactly **one** group, named `GroundWork`, holding the
   subscription(s). Give the **group itself** a localised **display name** — the reference name
   is not enough, and a group without a display name makes every product in it unfetchable.

2. Open the **GroundWork Pro Monthly** subscription and confirm/complete:
   - **Product ID:** `uk.co.charlottebloortherapy.groundwork.pro.monthly`
   - **Duration:** 1 Month
   - **Price:** **£1.99 / month** (and confirm a price is set for **your own Apple ID's
     territory** — a price set only in some territories returns nothing in the others).

3. **Localization** (App Store display name + description). Required — review rejects without it.
   Paste:

   - Display name: `GroundWork Pro`
   - Description:
     > Business analytics, your business costs, accreditation hours and GroundWork Notes sync.
     > Does not include tax calculations — each UK tax year is a separate one-off purchase.

   > ⚠️ **The Pro copy must not promise tax.** Pro does not calculate tax, and the app says so on
   > every screen that asks for money. A store description implying otherwise would make the
   > in-app copy read like a retraction — and is the kind of thing review flags.

4. **Subscription image** (1024×1024, opaque, square, no rounded corners):
   `TherapyTracker-web/icon-ideas/groundwork/subscription-pro-1024.png` (gold).
   Regenerate if needed: `node scripts/render-subscription-image.mjs subscription-pro-1024`

5. **Review screenshot** (*App Review Information* on the subscription — customers never see it;
   it shows a reviewer where the purchase is offered):
   `TherapyTracker-web/icon-ideas/groundwork/paywall-review-screenshot.png`

   > The chicken-and-egg: ASC wants this screenshot before the product can leave *Missing
   > Metadata*, but StoreKit cannot fetch a *Missing Metadata* product — so a TestFlight paywall
   > says "unavailable" until the screenshot is uploaded. Generate one without a live product:
   > ```bash
   > node scripts/render-paywall-screenshot.mjs \
   >   --price "£1.99" --period month --price-year "£7.99" --sheet both
   > ```
   > This renders the real in-app paywall (`--sheet pro` → `paywall-review-screenshot.png`,
   > `--sheet tax` → `taxyear-review-screenshot.png`). Add `--dark` for the dark pair. Swap in a
   > genuine device screenshot before final submission.

6. **Optional — free trial.** If you want one (a 1-month free trial spanning January is worth
   more than a discount), add an **Introductory Offer → Free → 1 month**. A non-consumable (the
   tax year) cannot have a trial, so this only applies to Pro.

7. **The legacy annual product** (`…groundwork.plus.annual`): leave it exactly as it is if it
   exists; **never re-point or delete its ID**. Nobody holds it, so if it does not exist, skip
   it. `npm run check` fails the build if the code's mapping for this ID ever changes.

Target state: the subscription reaches at least **Ready to Submit**.

---

## STEP 2 — Finish the tax-year in-app purchase

This lives in a **different section**: App Store Connect → **Apps → GroundWork → In-App
Purchases** (not Subscriptions). Type = **Non-Consumable**.

1. **UK tax year 2026-27:**
   - **Reference name:** `UK tax year 2026-27`
   - **Product ID:** `uk.co.charlottebloortherapy.groundwork.taxyear.2026`
     (the **start year only** — the app parses the year out of the ID; `.2026` = 2026-27 tax
     year, and `npm run check` asserts the Swift and JS agree on the prefix).
   - **Price:** **£7.99**

2. **Localization** (display name + description). Paste:
   > Works out your 2026-27 tax, and every earlier tax year: what you are on track to owe,
   > what to keep back for it, payments on account, and that year's Making Tax Digital export.
   > A one-off purchase — it does not expire. Requires GroundWork Pro.

3. **Review screenshot** (its **own**, so a reviewer of this product sees where *it* is offered):
   `TherapyTracker-web/icon-ideas/groundwork/taxyear-review-screenshot.png`

4. **Product image:** there is no dedicated tax-year artwork yet — reuse the gold Pro image
   (`subscription-pro-1024.png`). The tax years wear the same gold.

5. **Create next year now, too** — `…groundwork.taxyear.2027` (UK tax year 2027-28). A product
   takes time to propagate and can sit in review; having it ready months early means April is
   never a scramble. The app only ever *offers* the current tax year, so a product that exists
   but isn't yet current costs nothing. (When you want the app to offer it, add `"2027-28"` to
   `taxYearsForSale` in `ios/App/App/GroundWorkNativePlugin.swift` — around line 212 today.)

Target state: the tax-year IAP reaches at least **Ready to Submit**, priced in your Apple ID's
territory.

---

## STEP 3 — Fill in the app listing (the version record)

App Store Connect → **Apps → GroundWork**.

### 3a. App Information

- **Subtitle:** `Private practice records`
- **Primary category:** Business — **Secondary category:** Productivity
- **Privacy Policy URL:** `https://mc392.github.io/therapy-tracker/privacy.html`
- **License Agreement:** leave on Apple's **Standard EULA** (a custom one is entered as text,
  not a URL; the Terms link in the Description covers Guideline 3.1.2).
- **Age rating:** answer the questionnaire so it lands on **4+** (no user-generated content, no
  web browsing, no ads).

### 3b. Privacy "nutrition label" — Data Not Collected

Answer **"No"** to *"Do you or your third-party partners collect data from this app?"* The label
then reads **Data Not Collected**. This is accurate — the app has no backend, no accounts and no
analytics; everything lives in IndexedDB/localStorage on-device.

Keep it true:
- **No analytics SDK, ever** (not Firebase, Sentry, or any crash reporter). Adding one means
  re-answering the questionnaire.
- **The share sheet is not collection** — exports go where the therapist sends them; Apple does
  not count a user-initiated share.
- **Calendar access is not collection** — the app writes sessions into a calendar the therapist
  picks and reads back only events it created, by an identifier it stored. Nothing is transmitted.

### 3c. Pricing and availability

- **Price:** Free.
- Availability: your chosen territories (at minimum, your own).

### 3d. Version metadata — the text to paste

**Promotional text** (170 chars, editable later without review):
```
Private, offline records for a therapy practice — sessions, clients, rooms, supervision and tax. Nothing leaves your phone.
```

**Keywords** (100 chars, comma-separated, no spaces):
```
therapist,therapy,counsellor,counselling,practice,private practice,sessions,supervision,invoice,tax
```

**Description** (paste in full — this is the one field where the subscription/Terms disclosure
must live; note the paid-feature markers below are corrected to the single Pro tier):
```
GroundWork keeps the admin side of a therapy practice in one place: sessions, clients,
room costs, supervision hours and a running estimate of what you will owe HMRC.

Everything stays on your phone. There is no account, no cloud, and no analytics — your
records are not sent anywhere, and Face ID keeps them shut when the app is closed.

• Log a session in seconds
• See at a glance what is unpaid, what needs notes, and when supervision is due
• Room costs per session or as monthly rent, with history kept when rates change
• Receipts and statements for clients as PDFs, printed or shared straight from the app
• Supervision and CPD hours tracked against the 1:6 ratio, with accreditation totals (Pro)
• A UK tax estimate that updates as you work, with your business costs counted in (Pro + that tax year)
• Quarterly figures for Making Tax Digital (Pro + that tax year)
• Retention and attendance trends across your practice (Pro)
• Automatic on-device backups kept in your iPhone's own backup, plus encrypted backups you can export yourself

GroundWork records attendance and money. It is not a clinical record and holds no session
notes — keep those where you keep them now. Tax figures are estimates to help you plan,
not advice, and the app cannot file for you.

Logging sessions, clients, rooms, supervision, receipts, what your rooms cost you and every
backup and export are free and always will be. GroundWork Pro adds business analytics, your
business costs, accreditation hours and notes sync.

Working out your tax is not part of Pro. Each UK tax year is a separate one-off purchase on
top of Pro, because the bands, thresholds and rules are fixed to a single year and to where
you pay tax. Buying one year includes every earlier year, and it does not expire.

GroundWork Pro is an auto-renewing monthly subscription. Payment is charged to your Apple ID
at confirmation of purchase. It renews automatically unless cancelled at least 24 hours
before the end of the current period. Manage or cancel in your Apple ID account settings.
Tax years are one-off purchases and do not renew.

Terms of Use: https://mc392.github.io/therapy-tracker/terms.html
Privacy Policy: https://mc392.github.io/therapy-tracker/privacy.html
```

**What's New** (first release):
```
First release on the App Store. GroundWork was already a web app; this version adds Face
ID locking, reminders for what needs you, and proper PDF receipts you can print or share.
```

**Support URL:** `https://mc392.github.io/therapy-tracker/`

### 3e. Screenshots

Required size class: **6.9" iPhone (1320×2868)**. One set is enough — ASC scales down for
smaller classes. Capture on an **iPhone 17 Pro Max simulator with demo data — never real client
records.**

Suggested five, in order:
1. **Home** — Attention feed with a couple of items, plus the money tiles.
2. **Sessions** — the list with paid/unpaid states visible.
3. **Money or Tax** — the tax estimate (the thing that replaces the spreadsheet).
4. **Settings › This iPhone** — Face ID lock and reminders. *This is the Guideline 4.2 evidence.*
5. **A receipt PDF in the share sheet** — the native output.

---

## STEP 4 — Cut a fresh TestFlight build and test on real hardware

This is roadmap step 9 and the one genuinely outstanding technical task: Face ID, notification
delivery, AirPrint/PDF and the calendar write have been exercised mostly in the simulator, so
they need one run on a real device.

### 4a. Cut the build

Two routes, neither needs the products to be live yet (products are fetched at runtime):

**Route A — from GitHub Actions (no Mac, no checkout):**
1. GitHub → **Actions → TestFlight → Run workflow**.
2. Pick a branch (any branch is fine).
3. **Type a build number higher than the last Apple accepted** (the project is on **3**, so use
   **4** or higher). Left blank it uses the run number, which can collide — and Apple rejects a
   duplicate build number outright.

**Route B — `npm run release` (needs a local Mac checkout):**
```bash
npm run release            # add --version 1.1 to also bump the marketing version
git push && git push --tags
```
This refuses a dirty tree, runs `npm run check`, bumps the build number, runs `npm run sync`
(rebuilds the bundled web copy in `ios/App/App/public/`), commits, and prints the tag to push.

> ⚠️ **Pushing to GitHub updates the website, not the iPhone app.** A plain push never builds an
> iOS app — it takes a tag or a manual run. It is very easy to confirm a fix on the live site and
> wrongly assume TestFlight has it.

**If CI ever fails at the very last step with a 409 "SDK version" / "must be built with the iOS N
SDK"** — Apple raised the SDK floor. Bump `runs-on` in `testflight.yml` to a newer `macos-*`
image (it is on `macos-26` today). See `docs/releasing.md` § "What the runner has to match".

**One-time CI setup** (if not already done): the App Store Connect API key and the signing
certificate secrets. Full walkthrough in `docs/releasing.md` (§ "One-time setup for the
automated upload" and "… for the signing certificate"). The release notes indicate real builds
have already run, so these are likely already in place — if a run fails on missing secrets,
that's the section to revisit.

### 4b. Export compliance (first upload only)

ASC asks whether the app uses encryption. GroundWork encrypts backups with WebCrypto (standard
cryptography), so answer with the **exemption for standard encryption**. It's remembered for
later builds.

### 4c. Test on the device

Install from TestFlight and confirm:
- [ ] **Face ID** locks and unlocks; the app hides in the app switcher.
- [ ] **Notifications** actually arrive (overdue payments / outstanding notes).
- [ ] A **receipt PDF** generates and prints/shares.
- [ ] **Add to calendar** writes a session into a calendar you pick; the permission prompt
      appears *at that moment* (not on opening Settings) — and re-adding the same session updates
      the event rather than duplicating it.
- [ ] Settings → App preferences → **What you are paying for**:
      - **See what Pro is** shows a **real price** beside GroundWork Pro (if "Unavailable": the
        product isn't live/propagated, or the paid agreement isn't active — see Step 0).
      - **Tax year 2026-27** shows a **real price** at step 2 of that sheet.
- [ ] Tap **Subscribe** — everything Pro unlocks (TestFlight uses the free sandbox).
- [ ] Buy the **tax year** — tax figures un-mask (Pro must be active first; the sheet shows both
      steps and ticks each).
- [ ] Delete and reinstall → **Restore purchases** brings both back.
- [ ] **Export and backup still work while locked** — the invariant that matters most.

> Sandbox compresses time: a subscription renews every few minutes, so you can watch renewal and
> the 7-day offline grace without waiting.

---

## STEP 5 — Comp yourself / Charlotte / the tester (optional, before submit)

On iOS use Apple's own mechanisms so there's no payment-route argument at review:

- **Pro (subscription):** ASC → the subscription → **Offer Codes** → create a batch. In the app:
  Settings → App preferences → What you are paying for → **See what Pro is → Redeem a code**.
- **Tax year (non-consumable):** cannot use offer codes. Use a **promo code** (ASC issues up to
  100 per product per version, under the app version's *Promo Codes*). Comping Pro does **not**
  comp tax — they are separate on purpose.

Web/licence keys (`scripts/issue-licence.mjs`) are for Phase 2 and anything Apple can't reach;
not needed for the App Store launch.

---

## STEP 6 — Submit for review

- [ ] Re-read `terms.html` **§4 on tax figures** once more — it's the paragraph most likely to
      draw a reviewer question, and it must be as plain as the description.
- [ ] Attach the **6.9" screenshots** and the **paywall review screenshot(s)**.
- [ ] Add the **reviewer notes** (below).
- [ ] **Submit the app version, the subscription, and the tax-year IAP together** — a build that
      references an unsubmitted in-app product fails. (Apple's rule that "the first in-app
      purchase must be submitted with an app version" is about going live.)
- [ ] Expect at least one round of questions — most often about the paywall or the privacy label.

### Reviewer notes to paste

**Guideline 4.2 (minimum functionality)** — why this is more than a wrapped website:
```
GroundWork stores confidential therapy records entirely on-device. The iOS app adds Face ID /
Touch ID locking of those records including hiding them in the app switcher, scheduled local
notifications for overdue payments and outstanding session notes, native PDF generation of
client receipts with AirPrint and share-sheet delivery, native file access for encrypted
backups, and automatic on-device backups written to the app's Documents folder on every save.
None of these are available to the web version.
```

**Calendar permission (Guideline 5.1.1), if asked** — why full access, not write-only:
```
GroundWork writes the practitioner's own session times into a calendar she chooses. Full
calendar access is used solely to update an event the app previously created when a session is
rescheduled; nothing is read for any other purpose and no calendar data leaves the device.
```
(The permission is requested only at the point of use — tapping *Add to my calendar* — never on
opening Settings. Both `NSCalendarsFullAccessUsageDescription` and `NSCalendarsUsageDescription`
are present because the deployment target is iOS 15.)

---

## Quick troubleshooting

| Symptom | Almost certainly |
|---|---|
| Paywall says "Unavailable" against Pro | Paid Applications agreement not fully active (Step 0); or the product is in *Missing Metadata*; or it hasn't propagated (wait minutes–hours); or the group lacks a display name |
| "Unavailable" against the tax year, but Pro prices fine | The non-consumable is missing/wrong. It lives under **In-App Purchases**, not Subscriptions; ID carries the START year only (`…taxyear.2026` = 2026-27) |
| Tax figures still masked after buying a year | Pro is a prerequisite — check the subscription is live too |
| Upload rejected instantly | Duplicate build number — type an explicit one higher than 3, or use `npm run release` |
| CI fails at upload with a 409 "SDK version" | Apple raised the SDK floor — bump `runs-on` in `testflight.yml` to a newer macOS image |
| TestFlight missing a fix you pushed | You pushed to GitHub but did not cut a build (tag or manual run) |
| A tax test fails after a change | The paywall got put inside the tax engine — `npm run check` guards this |

---

## Source docs (for the deep mechanics)

- `docs/releasing.md` — the two release tracks, CI signing/key setup, what the runner must match.
- `docs/app-store-listing.md` — the listing pack (some copy there predates the single-tier
  correction made here; where they differ, this guide is current).
- `docs/plus-launch-checklist.md` — the product-creation detail (its Step 4 simulator checklist
  still mentions the retired "chrome Plus" tier; ignore that — there is only Pro).
- `docs/monetisation.md` — the pricing design and the reasoning behind Pro + tax-year packs.
- `docs/groundwork-app-store-roadmap.md` — the original end-to-end roadmap.
