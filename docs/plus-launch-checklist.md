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

---

## Step 1 — Decide the price ☐

Blocks everything else, because the price is fixed when the product is created.

A UK therapist pays an accountant roughly £300–600/year for self-assessment. Anchoring there,
**£30–40/year** is comfortable. Suggested start: **£39.99/year**.

Pricing low is harder to undo than pricing high — raising a subscription price later means
handling existing subscribers explicitly.

**Also decide:** free trial? A 1-month trial that spans January is worth more than a discount.

- [ ] Price chosen: ................
- [ ] Trial: yes / no

---

## Step 2 — Create the subscription in App Store Connect ☐

App Store Connect → **Apps** → GroundWork → **Subscriptions**

- [ ] Create a **Subscription Group** named `GroundWork Plus`
- [ ] Create a subscription inside it:
  - **Reference name:** `GroundWork Plus Annual`
  - **Product ID:** `uk.co.charlottebloortherapy.groundwork.plus.annual`
  - **Duration:** 1 Year
  - **Price:** from step 1
- [ ] Add a **Localization** — display name and description. Required; review rejects without it.
- [ ] If offering a trial: **Introductory Offer** → Free → 1 month
- [ ] Add the **review screenshot** — you will have this after step 4, so come back for it

> ⚠️ The product ID must match **exactly**. It is hardcoded at
> `ios/App/App/GroundWorkNativePlugin.swift:47`. A mismatch shows an empty price on the paywall
> and gives no error anywhere. If you want a different ID, change the Swift constant too.

---

## Step 3 — Add the two required URLs ☐

An auto-renewable subscription will not pass review without both. App Store Connect →
**App Information**:

- [ ] **Privacy Policy URL:** `https://<your-pages-url>/privacy.html`
- [ ] **Terms of Use (EULA):** `https://<your-pages-url>/terms.html`

Both already deploy to Pages, and the paywall already links to them.

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

```bash
npm run release
git push && git push --tags
```

That is the whole thing: it refuses a dirty tree, runs the checks, bumps the build number,
syncs the bundled copy of the web app, and prints the tag. Pushing the tag triggers the upload.

> ⚠️ **Pushing to GitHub updates the website, not the iPhone app.** Only `npm run release`
> moves the app. It is very easy to confirm a fix on the live site and assume TestFlight has it.

---

## Step 6 — Sandbox-test on a real iPhone ☐

- [ ] App Store Connect → **Users and Access → Sandbox → Testers** → create one
- [ ] On the iPhone: **Settings → App Store → Sandbox Account** → sign in as that tester
- [ ] Install from TestFlight, buy, confirm it unlocks
- [ ] Delete the app, reinstall, confirm **Restore purchases** brings it back

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
| Paywall shows no price | Product ID mismatch — check `GroundWorkNativePlugin.swift:47` against App Store Connect |
| Upload rejected instantly | Duplicate build number — run `npm run release`, don't archive by hand |
| TestFlight missing a fix you pushed | You pushed to GitHub but did not cut a build |
| Licence field never appears | `PLUS_PUBKEY` is still `null` — that is deliberate until `--keygen` runs |
| A tax test fails | The paywall has been put inside the engine. `npm run check` should have caught it |

---

## Things to hand back to Claude

- Change the product ID (both sides).
- Draft the subscription display name and description for step 2.
- Build the demo dataset for screenshots.
- Start Phase 2 — `docs/monetisation.md` §5 is the spec.
