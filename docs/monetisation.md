# GroundWork monetisation plan

*How GroundWork Plus is defined, gated, sold and reviewed. Written Sept 2026, after the
App Store roadmap (`docs/groundwork-app-store-roadmap.md`) reached "everything shipped
except TestFlight, screenshots and submission".*

This document is the decision record. Where it says "decided", the choice has been made and
the reasoning is here so a later reader does not reopen it by accident. Where it says **OPEN**,
it has not.

---

## 1. The decisions

| | Decision | Why |
|---|---|---|
| **Model** | **Annual subscription** — "GroundWork Plus" | Everything in the tier is local computation with no server cost, which normally makes a recurring charge hard to defend. The tax engine is the exception and it is the anchor of the tier: HMRC bands, thresholds, Class 2/4 rates, student-loan plans and MTD rules change every April, and keeping `ukTax()` correct is genuine recurring work. "Your tax figures stay current" is an honest annual promise. A one-off unlock would fund none of it. |
| **Sequencing** | **iOS first. Web stays free until Phase 2.** | StoreKit needs no accounts, no server, no auth and no VAT registration. It answers "will anyone pay for this?" before you build billing infrastructure to find out. The PWA on Pages carries on as the free shopfront. |
| **Tier contents** | Tax · Costs & other income · MTD export · Trends · Accreditation · GroundWork Notes sync · extra colour schemes | See §3. |
| **Existing users** | **Charlotte only** is comped. Other existing PWA users are not grandfathered. | Chosen deliberately. Note the timing consequence in §7 — this decision costs nothing in Phase 1 and is the single biggest risk in Phase 2. |

---

## 2. Two invariants

Everything below depends on these. Break either and the design stops working.

### 2.1 The paywall never touches the data plane

Gate **derived** features. Never gate the records themselves.

**Always free, in every tier, forever:**

- Logging and editing clients, sessions, rooms, supervision, peer supervision.
- `commit()`, `undo()`, snapshots, the audit log.
- **`exportJSON()`, `exportCSV()`, `importJSON()`, `impOpen()`** — every backup and every
  restore path, plus encrypted backups and the native automatic backups.

Three separate reasons, any one of which is sufficient:

1. Losing a therapist's client records is the worst thing this app could do. Never put a
   billing state between someone and their own data.
2. UK GDPR data portability. "Renew to get your records out" is not a position to be in.
3. The spreadsheet import is the switching-cost remover — it is how a therapist gets three
   years of history in and sees the app tell them something true on day one. Gate it and
   nobody reaches the paywall at all. It is one of the most valuable things in the app and
   it must stay free.

**Practical rule for the code:** the paywall lives in the **view and button layer only**.
`tyNet()`, `taxLiability()`, `mtdQuarters()`, `mtdExport()`, `ledgerBetween()` and everything
in the engine stay pure and ungated — partly because that is where correctness lives, and
partly because `tests/tax-tests.js` calls them directly and must keep passing regardless of
entitlement state.

### 2.2 `feat()` is not entitlement

`feat(k)` means *"the user switched this off"*. That is a deliberate preference, and it is a
different axis from *"this person has not paid"*. Do not overload it.

If `feat("tax")` started returning false for unpaid users:

- `visibleTabs()` (`index.html:1612`) would drop the Tax tab entirely, so there would be **no
  upsell surface at all** — the feature just silently ceases to exist.
- The user's own on/off choice and their entitlement would be tangled in one boolean, and
  subscribing would have to guess which features to switch back on.

So add a **second, parallel** predicate:

```js
plusActive()        // is this device entitled right now?
plusSellable()      // can this build actually sell? (native, or web once Phase 2 lands)
plusLocked(key)     // PLUS_FEATURES.includes(key) && !plusActive()
```

`TABS[].ft` gating is untouched. A paid tab still **appears** and still **opens**; its view
renders a locked state instead of its content. The tab bar is the advert.

---

## 3. The tier

### Free

Everything needed to run a practice day to day:

- Clients, sessions, rooms, the calendar, Sessions › Unpaid and › Incomplete.
- Supervision and peer supervision logs.
- Money › Overview and Money › Table (`raw`) — revenue, what is outstanding, month by month.
- `attention`, `quickadd`, `gamify`, **`receipts`**.
- All import, export, backup, encrypted backup, native auto-backup.
- The Sage colour scheme, light/dark, and all branding.

**Receipts stays free** on purpose: a client asking for a statement for their insurer is an
obligation, not a luxury, and charging to meet it reads as punitive.

**Backups stay free** on purpose: see §2.1.

### Plus

| Feature | Flag / entry point | Note |
|---|---|---|
| Tax | `tax` — `VIEWS.tax` (`index.html:4111`), `TABS` entry `index.html:1610` | The anchor. Estimate, pot, payments on account, per-year settings, seasonal moments, both guided flows. |
| Costs & other income | `finances` — `financeCards()` (`3068`), `financeForm()` (`3120`) | **Bundled with tax, never sold separately.** Your own comment at `index.html:7728-7731` gives the reason: an estimate that ignores what the practice costs you is one nobody should set money aside against. That argument applies with more force when money is changing hands — selling a knowingly overstated tax figure is not on. |
| MTD quarterly export | `#mtdExp` button, wired `index.html:5201` → `mtdExport()` (`4861`) | Gate the button, not the function. |
| Trends | `trends` — segment pushed at `index.html:2540` | Retention funnel, attendance vs expected, missed sessions, long-term clients. |
| Accreditation (Form 3A) | `accreditation` — `mountAccreditation()` (`index.html:2149`) | The 1:6 ratio and total hours. |
| GroundWork Notes sync | `#rosterSync` handler (`index.html:5847`) → `syncSchedules()` (`6823`) | Gate in the click handler; leave the card and its copy visible. |
| Extra colour schemes | `PALETTES[].free` (`index.html:1362-1368`) | Sage is `free:true`; the other five are Plus. |

Honest note on two of these: **Trends and colour schemes are tier filler, not tier drivers.**
The funnel and the attendance chart are admired once and rarely reopened. They earn their
place in the bundle; do not build marketing around them. Tax, MTD and Notes sync are what
people actually reach for a card over.

### Deliberately not in Plus

- Receipts, backups, import — see above.
- Multi-device sync — **it does not exist**. It is known limitation #8 in `CLAUDE.md` and it
  is the one feature that would carry real ongoing server cost and therefore make a
  subscription self-evidently fair. If Plus ever struggles to justify its renewal, this is
  the thing to build, not more analytics.

---

## 4. Phase 1 — iOS (StoreKit, no accounts, no server)

### 4.1 The entitlement gate (shared code, both platforms)

Replace the dormant palette-specific block at `index.html:1377-1396`. It currently reads
`S.settings.entitlements.colourSchemes`, which **must change before anything ships**: `S`
travels in backups, so a purchase would ride a `.json` file onto anyone else's phone, and it
breaks the rule already stated in `CLAUDE.md` — device-only settings are `tt_*` in
localStorage, never in `S`.

```
tt_plus  →  {"active":true,"expiresAt":"2027-09-01T00:00:00Z",
             "source":"storekit","checkedAt":"2026-09-01T09:12:00Z"}
```

- **A cache, not the truth.** StoreKit is the truth; this is what makes the app work on a
  train.
- `plusActive()` is **synchronous, no awaits** — it is called from render paths all over the
  file. It reads the cache and compares `expiresAt` against `today()`.
- **Offline grace.** If `checkedAt` is stale but `expiresAt` has not passed, stay active.
  Re-verify silently in the background on resume. **Never hard-block on a failed network
  check** — a flaky café wifi must not lock someone out of their tax screen.
- On expiry, fall back to locked *gracefully*: the paid views show the paywall, everything in
  §2.1 carries on exactly as before, and no data is touched.
- `S.settings.entitlements` is never written. **No `SCHEMA_VERSION` bump** — there is no new
  state in `S` at all.

### 4.2 Native plumbing

Add StoreKit 2 to the **existing** `GroundWorkNativePlugin` (`ios/App/App/GroundWorkNativePlugin.swift`)
rather than a second plugin class — `scripts/add-native-plugin.mjs` and
`scripts/register-native-plugin.mjs` both hardcode that one filename and class name, so a new
class means editing both. Three methods on `pluginMethods` (line 27), all `CAPPluginReturnPromise`:

- `plusStatus` — read `Transaction.currentEntitlements`, return active + expiry.
- `plusPurchase` — run the purchase flow.
- `plusRestore` — `AppStore.sync()`.

Refresh the `tt_plus` cache from `plusStatus` at launch and on resume (there is already a
`visibilitychange` path for the splash screen to hang this off).

Then add the new seam names to `SEAMS` in `scripts/check-drift.mjs` — that list is what stops
a rename silently killing purchases on iOS while the web build carries on looking fine.

### 4.3 UI work

1. **Flip `PALETTE_GATE_ENABLED` to `true`** and generalise its helpers into `plusLocked()`.
2. **Fix `stepLook()` (`index.html:7950`)** — it renders `PALETTES` directly and ignores
   locking entirely, so the setup wizard currently hands out every paid scheme on first run.
   Route it through `paletteOptionHTML()` and the same click check Settings uses at
   `index.html:5734-5739`.
3. **One paywall sheet.** Replace `openPaletteGateSheet()` with `openPlusSheet(reason)` on the
   existing `openSheet()`. It must carry everything in §6.
4. **Locked views.** Tax renders its lock state inside `VIEWS.tax`; Trends and Accreditation
   inside their existing mount points; Notes sync and MTD in their click handlers.
5. **Reuse the reveal cards as the upsell.** `REVEAL_STEPS` (`index.html:7732`) already offers
   `tax`+`finances` at 10 sessions and `trends` at 20 — with a genuine reason each time. Those
   cards become the natural, non-annoying Plus prompt, at exactly the moment the feature
   starts being worth something. Do not add a separate nag.
6. **Seasonal timing.** `taxMoments()` is the other good surface: it only fires when the thing
   is actually live, and a tax-led tier converts hardest in December–January against the Self
   Assessment deadline.

### 4.4 App Store Connect

- Auto-renewable subscription in its own **subscription group**, submitted **with** the first
  build (a build referencing an unsubmitted product fails review).
- Consider an introductory free trial. Given the January conversion peak, a trial that spans
  a deadline is worth more than a discount.

---

## 5. Phase 2 — Web (accounts)

Not started. Sequenced after iOS has proven demand.

### 5.1 Two planes, kept apart

`privacy.html` currently says *"There is no account, no server, no analytics, and no third
party involved"*, and `docs/app-store-listing.md:25-35` builds the "Data Not Collected" label
on it. Phase 2 makes that first sentence false — **and only that sentence**, if this rule holds:

> **The account plane holds an email and an entitlement. The data plane never moves.**

No client record, no session, no fee and no tax figure ever reaches the server. What is being
added is a licence check that happens to know an email address, not a backend for the app.
The privacy policy amendment is then one paragraph: we hold your email and purchase status to
operate your licence; your practice data stays on your device and we still cannot see,
recover or delete it.

### 5.2 Shape

- **Magic-link auth** on the email used to buy. No passwords, no Clerk/Auth0 at this scale.
- Sign-in returns a **short-lived signed licence token**, cached in `tt_plus` in exactly the
  format §4.1 defines — `source:"web"` instead of `"storekit"`. Everything downstream is
  identical, which is the point of doing iOS first with the right cache shape.
- Same offline grace window. Same never-hard-block rule.
- **GitHub Pages stays exactly as it is** — static, no secrets, `deploy.yml` untouched. One
  small serverless endpoint (Cloudflare Worker, Netlify, Vercel) verifies the purchase and
  signs the token.

### 5.3 Billing: use a merchant of record

**Paddle or Lemon Squeezy, not raw Stripe.** Selling digital subscriptions to consumers in
the EU triggers VAT from the first sale with no threshold, and running VAT OSS yourself as a
UK sole trader is a real, permanent admin burden. A merchant of record absorbs it. Stripe
leaves it with you.

### 5.4 Client-side gating is a speed bump, not DRM

The app is one 693KB `index.html` served from Pages. Anyone with devtools can set `tt_plus`
by hand. **Accept this deliberately.** The only way to actually prevent it is to move the tax
engine server-side, which destroys the offline guarantee that makes the app worth having. For
an audience of therapists this is the right trade. Do not spend a week hardening it.

### 5.5 Channel linking — explicitly out of scope for v1

Someone who subscribes on iOS and then opens the web app will not be unlocked. Linking them
properly needs App Store Server Notifications and an account join. **Do not build it in v1.**
Treat the channels as separate and say so plainly in the FAQ.

When it is picked up: Apple's rules on honouring entitlements bought outside the app, and on
linking out to purchase, moved substantially in 2025 and are still moving. Read the current
guideline text at the time you build it rather than trusting this document.

---

## 6. Comped licences (and Charlotte)

Charlotte is comped. Do not hardcode her device or a magic string in `index.html` — build the
general mechanism, because you will want it again for support cases, refunds, press and beta
testers.

**An offline signed licence key.** A short signed blob, pasted into a field in Settings ›
About, verified against a public key embedded in the app, writing `tt_plus` with
`source:"comp"` and a long or absent expiry. No network, works on both platforms, revocable
only by expiry — which is fine for the handful of cases it exists for.

---

## 7. Risks and open questions

**The Phase 2 retraction is the real risk.** "Charlotte only" costs nothing in Phase 1,
because the web app is not gated at all — no existing PWA user notices anything. It bites the
day Phase 2 ships: every existing web user who has been using Tax, Trends or Accreditation
loses them. That is precisely the outcome the gradual-reveal design was built to avoid
(`CLAUDE.md`: "Hiding tabs from someone already using them is the one outcome this must never
produce"), and those users are also the most likely to have told other therapists about it.

Mitigations, none chosen yet — **OPEN, and worth deciding before Phase 2 starts, not during**:

- a long notice period announced in-app before the gate lands;
- a legacy window (anyone with data before date *X* keeps their current features);
- read-only grace (existing tax figures stay visible, new tax years need Plus).

Other open items:

- **OPEN: price.** Not set. Anchor it against what a therapist pays an accountant, not against
  other apps.
- **OPEN: trial length**, and whether it spans January.
- **OPEN:** whether the annual renewal message leans on "tax rates kept current" (honest,
  specific, and the actual reason) or on a broader "support development" framing.

---

## 8. What deliberately does not change

- **`SCHEMA_VERSION` stays 6.** No new field in `S`; the entitlement is device state.
- **`sw.js` cache `C` does not need bumping** for this work — `index.html` is network-first.
  Bump it only if a paywall image or other static asset is added.
- **`tests/tax-tests.js` needs no changes** and must keep passing untouched. If a test starts
  failing because of a paywall, the paywall has been put inside the engine — move it out to
  the view layer. That is the tell.
- **`normalize()` is untouched.** No migration, no defaults, no entitlement seeding.
- **The PWA's privacy label and Phase-1 privacy policy are unaffected.** StoreKit purchases are
  Apple's data collection, not yours. Keep the rule from `docs/app-store-listing.md:34`: no
  analytics SDK, ever.
