# GroundWork — App Store launch runbook

*Last checked against the app and App Store Connect on **26 Sep 2026**. Follow it top to bottom.
Every box you have to type into has its answer below, ready to copy. Where a step is marked
**✅ Done**, there is nothing for you to do.*

**How long:** about 2–3 hours of your time, most of it clicking through App Store Connect,
plus Apple's review (usually 24–48 hours).

**What you need open:** [App Store Connect](https://appstoreconnect.apple.com), this repo on
GitHub, and your iPhone with the **TestFlight** app installed.

---

## Where things stand

| | Status |
|---|---|
| The app itself (web + iPhone + Watch) | ✅ Built. Latest code is on `main`. |
| Automatic builds to TestFlight | ✅ Working — 24 successful builds; build **24** was this morning's `main`. |
| Apple Developer account, App Store Connect record | ✅ Done (Aug 2026). |
| The two products (Pro monthly, tax year 2026-27) | ⚠️ Created as records — **metadata still to finish** (Steps 4–5). |
| Privacy manifest + encryption declaration in the app | ✅ **Added today** — ships in build 25. |
| Terms of Service | ✅ **Fixed today** — still called the app "beta" and "free"; both are App Review rejections. |
| Privacy Policy | ✅ **Updated today** — now covers the records folder, calendar and purchases. |
| Support page | ✅ **Created today** — `support.html` (the old Support URL had no contact details). |
| App Store screenshots (iPhone 6.9") | ✅ **Made today** — 6 images, demo data. |
| Paywall review screenshots | ✅ **Regenerated today** with the real prices and current design. |
| Store copy (description, keywords, …) | ✅ **Written today**, every field checked against Apple's character limits. |
| Apple Watch screenshot | ⚠️ **You** — needs a real watch or a Mac (Step 9c). |
| Real-iPhone test of build 25 | ⚠️ **You** (Step 8). |
| Submit | ⚠️ **You** (Steps 10–13). |

### What changed in the app since the last guide (15 Sep)

Three pull requests merged (#64–#66): a design pass with **haptics** (a new native feature — it
strengthens the "not just a website" case, so it's now in the reviewer note), **v12 records**
(practitioners who also supervise; session length), and a fix for the **header under the iPhone
status bar**. None of them changes anything in the listing, the products or the privacy answers.

### What I did for you today, and why each matters

1. **Privacy manifests** (`ios/App/App/PrivacyInfo.xcprivacy` and the Watch's). Apple requires one
   whenever the app's own code uses certain "required reason" APIs — ours reads `UserDefaults` and
   file dates. Missing one gets a build flagged (error ITMS-91053). Declared: no tracking, **no data
   collected**, matching the "Data Not Collected" label. A new script wires them into the Xcode
   project on every sync, and `npm run check` now fails if they're ever unwired.
2. **Encryption declaration** (`ITSAppUsesNonExemptEncryption = NO` in `Info.plist`). Without it
   every build sits in TestFlight as *Missing Compliance* until someone answers a questionnaire by
   hand. The answer is honest: the only cryptography is WebCrypto, which is the iPhone's own.
3. **Terms of Service** — removed the "beta software" notice and "Beta terms" section (Apple
   Guideline 2.2 rejects betas on the store), and replaced "Fees: free during beta" with real
   subscription terms (auto-renewal, cancelling, refunds via Apple, restore). Section numbers kept,
   so the app's link to §4 (tax) still works.
4. **Privacy Policy** — added the iCloud Drive records folder, the calendar, and purchases.
5. **Support page** — `support.html`: a contact address and answers to the six questions new
   users will actually ask (web → iPhone move, backups, restore purchases, cancel/refund, "does
   Pro include tax?", "can you see my records?").
6. **Demo practice for reviewers** — `demo/groundwork-demo-practice.json` on the website, a
   synthetic practice (26 clients known only by code). Verified it restores through the app's own
   import checks.
7. **Screenshots** — six App Store screenshots and two paywall review screenshots, from the real
   app. Regenerate any time with `node scripts/render-store-screenshots.mjs`.
8. Tidied the stale docs (the retired "Plus" tier, the deleted chrome artwork).

---

## Step 1 — Merge the pull request (5 min)

Everything above sits on the branch `claude/app-store-launch-guide-ahs8v1`. Merging it puts the new
Terms, Privacy Policy and Support page **live on your website**, which App Review will visit.

1. GitHub → **Pull requests** → open *"Prepare GroundWork for App Store submission"*.
2. Click **Merge pull request** → **Confirm merge**.
3. Wait ~1 minute, then open each link and check it loads:
   - <https://mc392.github.io/therapy-tracker/support.html>
   - <https://mc392.github.io/therapy-tracker/terms.html> — the top box should say *"Before you add
     real client data"*, not *"Beta software notice"*.
   - <https://mc392.github.io/therapy-tracker/privacy.html> — "Last updated 26 September 2026".

## Step 2 — Confirm your contact address works (5 min)

The Support page, Terms and Privacy Policy all give **privacy@groundworkpractice.co.uk**. Apple's
reviewers may email it, and customers will. I couldn't check it from here (this environment
blocks the lookup).

- Send a test email to it from your personal address and confirm it arrives.
- **If it doesn't exist or you'd rather use another address**, tell me the address and I'll
  change all four pages in one go.

## Step 3 — Paid Applications agreement (5–30 min, do this early)

**If this isn't fully active, every product silently shows "unavailable" and nothing says why.**

1. App Store Connect → **Business** (top menu; older accounts: *Agreements, Tax, and Banking*).
2. **Paid Apps** agreement → status must read **Active**. If not: accept it, then complete:
   - **Bank account** — the UK account payouts go to (sort code + account number).
   - **Tax forms** — as a UK individual you'll be asked for a **W-8BEN** (the US form saying you're
     not a US taxpayer). Tick that you're claiming treaty benefits under the **UK–US treaty**;
     Apple's form fills in the rest.
3. **Money tip — join the App Store Small Business Program.** Apple then takes **15%** of each sale
   instead of 30% (you qualify while proceeds are under $1m/year). Apply at
   <https://developer.apple.com/app-store/small-business-program/> → *Enroll*. Takes 2 minutes;
   approval usually within days, and it applies from the next month.

## Step 4 — Finish the GroundWork Pro subscription (15 min)

App Store Connect → **Apps** → **GroundWork** → left sidebar **Monetization → Subscriptions**.

**4a. The subscription group** (the folder the subscription lives in)

- There should be exactly **one** group. Open it (create one called `GroundWork` if there is none).
- Under **App Store Localization** → **Create** → English (U.K.):

  | Field | Paste |
  |---|---|
  | Subscription Group Display Name | `GroundWork` |
  | App Name Display Options | *Use App Name* |

  *Without this group-level name, every product in the group is unfetchable.*
- If **English (U.K.)** is not your app's primary language, also add **English (U.S.)** with the
  same values. (Check under **App Information → Localizable Information → Primary Language**.)

**4b. The product** — open **GroundWork Pro Monthly** (Product ID
`uk.co.charlottebloortherapy.groundwork.pro.monthly`). If it doesn't exist, **Create** it with
Reference Name `GroundWork Pro Monthly`, that Product ID, and Duration **1 Month**.

| Field | Enter |
|---|---|
| Availability | All territories you'll sell in (at least **United Kingdom** — see Step 7) |
| Subscription Prices | **£1.99** for United Kingdom (let Apple fill other countries automatically) |
| Localization → Display Name | `GroundWork Pro` |
| Localization → Description | `Analytics, costs, CPD hours, reports` |
| Image (1024×1024) | `TherapyTracker-web/icon-ideas/groundwork/subscription-pro-1024.png` |
| Review Information → Screenshot | `TherapyTracker-web/icon-ideas/groundwork/paywall-review-screenshot.png` |
| Review Information → Review Notes | `Offered in Settings > App preferences > What you are paying for > See what Pro is, and from any locked Pro screen (e.g. Practice > Business analytics). Pro does not include tax calculations - those are the separate tax year purchase.` |

- **Free trial (optional, your decision):** *Subscription Prices* → **View all Subscription
  Pricing** → *Introductory Offers* → **Free**, **1 month**, all territories. Skip it if unsure;
  you can add it later without a new build.
- Status should now read **Ready to Submit**.

> To download the image files: on GitHub open the file, click **Download raw file** (the ↓ icon).

## Step 5 — Finish the tax-year purchase (10 min)

App Store Connect → **GroundWork** → **Monetization → In-App Purchases** (*not* Subscriptions).
Open **UK tax year 2026-27** (Product ID `uk.co.charlottebloortherapy.groundwork.taxyear.2026`,
type **Non-Consumable**). If missing, create it with exactly that ID — `.2026` means the 2026-27
tax year, and the app reads the year out of the ID.

| Field | Enter |
|---|---|
| Availability | Same territories as Pro |
| Price | **£7.99** (United Kingdom; let Apple fill the rest) |
| Localization → Display Name | `UK tax year 2026-27` |
| Localization → Description | `Tax figures for 2026-27 and earlier` |
| Image (1024×1024, optional) | `TherapyTracker-web/icon-ideas/groundwork/subscription-pro-1024.png` |
| Review Information → Screenshot | `TherapyTracker-web/icon-ideas/groundwork/taxyear-review-screenshot.png` |
| Review Information → Review Notes | `Offered on the Tax tab (tap any masked figure or "What this needs"), and in Settings > App preferences > What you are paying for. It requires GroundWork Pro first: subscribe to Pro in the sandbox, then buy the tax year, and the Tax tab's figures appear.` |

Status should read **Ready to Submit**.

**Also create next year now** (5 min, saves a scramble in April): **+** → Non-Consumable →
Reference Name `UK tax year 2027-28`, Product ID
`uk.co.charlottebloortherapy.groundwork.taxyear.2027`, £7.99, Display Name `UK tax year 2027-28`,
Description `Tax figures for 2027-28 and earlier`, same screenshot. The app won't offer it until
it's added in code next spring — tell me then. Don't submit it with this release.

## Step 6 — App Information (10 min)

**GroundWork** → **General → App Information**.

| Field | Enter |
|---|---|
| Name | `GroundWork` |
| Subtitle | `Private practice records` |
| Category — Primary | **Business** |
| Category — Secondary | **Productivity** |
| Content Rights | **No**, it does not contain, show, or access third-party content |
| Age Rating | **Edit** → answer **None / No to every question** → result **4+**. There are no ads, no chat, no user-generated content, no web browsing, no gambling, and no medical or wellness information *for the user* — it's business admin for the therapist. |
| License Agreement | Leave as Apple's **Standard License Agreement** |

**Privacy Policy URL** is on the **App Privacy** page (Step 7), not here.

## Step 7 — Privacy, pricing and where it's sold (10 min)

**7a. App Privacy** (left sidebar **App Privacy**):

1. **Privacy Policy URL:** `https://mc392.github.io/therapy-tracker/privacy.html`
2. **Data Types** → **Get Started** → *"Do you or your third-party partners collect data from this
   app?"* → **No, we do not collect data from this app** → **Save** → **Publish**.
3. The label now reads **Data Not Collected**. This is true because nothing leaves the device to
   you: the calendar, the iCloud folder and exports all go where *the user* sends them, and Apple
   handles purchases.

**7b. Pricing and Availability:**

| Field | Enter |
|---|---|
| Price | **Free** (£0.00) — money comes from the in-app purchases |
| Availability | **United Kingdom only** (recommended) |

**Why UK only:** the tax engine is UK-only, and selling in the **EU** requires you to publish a
"trader" address and phone number under the EU Digital Services Act. UK-only avoids that. If App
Store Connect asks about **DSA trader status**, you can leave the EU out of availability. You can
add countries later with no new build.

## Step 8 — Test build 25 on your iPhone (30–45 min)

I started build **25** from the PR branch — it's the first build containing today's privacy
manifests and encryption declaration. (If you'd rather build from `main` after merging, run
GitHub → **Actions** → **TestFlight** → **Run workflow** → branch `main`, and leave the build
number blank.)

1. App Store Connect → **TestFlight**: build **25** appears ~15 minutes after the run finishes.
   Thanks to the encryption declaration it should go straight to **Ready to Test** — no compliance
   question. If it does say *Missing Compliance*, click it → *"None of the algorithms mentioned
   above"* → Save.
2. On your iPhone, open **TestFlight** → **GroundWork** → **Update**.
3. Tick off each of these:
   - [ ] **Face ID:** Settings → This iPhone → *Require Face ID* on. Close the app, reopen —
         it asks for Face ID. Swipe up to the app switcher — records are hidden.
   - [ ] **Reminders:** *Daily reminders* on → allow notifications → one arrives next morning.
   - [ ] **Receipt PDF:** open a client → **Invoice / receipt** → create one → it opens as a PDF you can print or share.
   - [ ] **Calendar:** open a future session → *Add to my calendar* → the permission prompt appears
         **then** (not on opening Settings) → the session appears in Calendar. Add it again: still
         one entry, not two.
   - [ ] **Records folder:** Settings → This iPhone → *Where your records are saved* → pick a folder
         in iCloud Drive → make a change → the file appears in the Files app.
   - [ ] **Status bar:** the green header sits cleanly under the clock/battery (fixed in #66).
   - [ ] **Prices:** Settings → App preferences → *What you are paying for* → **See what Pro is**
         shows **£1.99 / month**; **Tax year 2026-27** shows **£7.99**. "Unavailable" = Step 3, 4 or
         5 isn't finished, or it hasn't propagated yet (can take a few hours).
   - [ ] **Buy Pro** (TestFlight purchases are free sandbox purchases) → Business analytics unlocks.
   - [ ] **Buy the tax year** → the Tax tab shows figures instead of `£•,•••`.
   - [ ] Delete the app, reinstall from TestFlight, **Restore purchases** → both come back.
   - [ ] With nothing bought, **Export backup (.json)** still works. (The one rule that matters most.)
   - [ ] **Apple Watch** (if you have one): open GroundWork on the watch → *Start* → it counts down
         and taps your wrist at ten minutes left. **If it doesn't work, tell me before submitting**
         — a broken Watch app is a rejection, and we can ship 1.0 without it.

Anything wrong → tell me what you saw; I'll fix it and cut build 26.

## Step 9 — Build the version page (20 min)

**GroundWork** → **iOS App** → **1.0 Prepare for Submission**.

**9a. iPhone screenshots** — *Previews and Screenshots* → **iPhone** tab → **6.9" Display**. Drag in,
in this order, from `docs/app-store-screenshots/`:

1. `01-home.png` — what needs you today
2. `02-tax.png` — what you'll owe HMRC
3. `03-sessions.png` — the week ahead
4. `04-analytics.png` — practice analytics
5. `05-money.png` — revenue and net income
6. `06-iphone.png` — Face ID lock and reminders (the "native app" evidence)

All are 1320×2868, no transparency, from a synthetic practice. Smaller iPhones are scaled from
these automatically. If an **iPad** tab demands screenshots, the app isn't iPad-targeted and
shouldn't ask; tell me if it does.

**9b. Text fields** — paste exactly:

**Promotional Text** (150/170)
```
Private, offline records for a therapy practice - sessions, clients, rooms, supervision, CPD and tax. No account, no cloud: nothing leaves your phone.
```

**Description** (2,706/4,000)
```
GroundWork keeps the admin side of a therapy practice in one place: sessions, clients, room costs, supervision hours and a running estimate of what you will owe HMRC.

Everything stays on your iPhone. There is no account, no cloud service and no analytics - your records are not sent anywhere, and Face ID keeps them shut when the app is closed.

• See at a glance what is unpaid, what still needs writing up, and who is coming up this week
• Clients known by a code, not a name, if you prefer - nothing identifying is required
• Room costs per session or as rent, with history kept when rates change
• Receipts, statements and invoices as PDFs, printed or shared straight from the app
• Cancellation and DNA charges applied from your own policy
• Supervision and CPD logs, with a CPD target for the year
• Accreditation hours and the 1:6 supervision ratio (Pro)
• Reports for your course or professional body (Pro)
• Over twenty practice analytics: retention, attendance, seasonality, days to payment and more (Pro)
• Your business costs and other income, for a true profit figure (Pro)
• A UK tax estimate that updates as you work, payments on account and Making Tax Digital figures (Pro + that tax year)
• Records saved to a folder in your iCloud Drive, plus encrypted backups you can export yourself
• Sessions added to your iPhone calendar - client code, time and room only

GroundWork records attendance and money. It is not a clinical record and holds no session notes - keep those where you keep them now. Tax figures are estimates to help you plan, not tax advice, and the app cannot file a return for you.

Recording sessions, clients, rooms, supervision and payments, receipts, what your rooms cost you, and every backup and export are free and always will be. GroundWork Pro adds business analytics, your business costs, accreditation hours, reports and GroundWork Notes sync.

Working out your tax is not part of Pro. Each UK tax year is a separate one-off purchase on top of Pro, because the bands, thresholds and rules are fixed to a single year and to where you pay tax. Buying one year includes every earlier year, and it does not expire.

GroundWork Pro is an auto-renewing monthly subscription. Payment is charged to your Apple ID at confirmation of purchase. It renews automatically unless cancelled at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before the end of the current period. Manage or cancel in your Apple ID account settings. Tax years are one-off purchases and do not renew.

Terms of Use: https://mc392.github.io/therapy-tracker/terms.html
Privacy Policy: https://mc392.github.io/therapy-tracker/privacy.html
```

**Keywords** (94/100 — no spaces after commas, on purpose)
```
therapist,counsellor,counselling,psychotherapist,therapy,sessions,supervision,CPD,HMRC,invoice
```

**Support URL**
```
https://mc392.github.io/therapy-tracker/support.html
```

**Marketing URL** — leave blank.

**Version** — `1.0`

**Copyright** — `2026 ` followed by the name shown as the seller on your developer account (for an
Individual enrolment, your own legal name), e.g. `2026 Jane Smith`.

> **Want to mention the Apple Watch timer?** Only after it passes the Step 8 watch test. Then add
> this bullet after the calendar one: `• An Apple Watch timer that taps your wrist ten minutes
> before the end of a session`.

**9c. Apple Watch screenshot (required, because the build includes the Watch app)**

App Store Connect will insist on at least one under *Previews and Screenshots* → **Apple Watch**.
I can't render it — the Watch app is native, not the web app. Pick one route:

- **Real Apple Watch (easiest):** on the iPhone, open the **Watch** app → **General** → turn on
  **Enable Screenshots**. On the watch, open GroundWork (the *Start* screen). Press the **side button
  and Digital Crown together**. The screenshot lands in the iPhone's **Photos**. AirDrop/email it to
  the computer you're using and drag it into the Apple Watch slot — App Store Connect accepts the
  size of whichever watch you have.
- **Mac with Xcode:** `npm run ios` → in Xcode pick the **GroundWorkWatch** scheme and any Apple
  Watch simulator → Run → in the Simulator app, **File → Save Screen**.
- **No watch and no Mac:** tell me and I'll take the Watch app out of 1.0 (a small project change
  plus a new build). It can come back in 1.1.

**9d. In-App Purchases and Subscriptions** (same page, further down) → **Add** / **+** → tick
**GroundWork Pro Monthly** and **UK tax year 2026-27** → Done. *The first purchases must be
submitted together with an app version — skip this and review can't see them.*

**9e. Build** → **Add Build** → choose **25** (or whichever build passed Step 8).

## Step 10 — App Review Information (5 min)

Same page, **App Review Information**:

| Field | Enter |
|---|---|
| Sign-in required | **Untick** — there are no accounts |
| Contact first/last name, phone, email | Yours (Apple uses them only if they have a question) |
| Attachment | none |

**Notes** — paste:
```
GroundWork is practice-administration software for UK therapists and counsellors. There is no account or sign-in, and no server: all records are stored on the device.

GETTING STARTED
On first launch a short setup runs; choose "No - starting fresh" when asked about previous records. Tap + to log a session. To see the app with four years of data, a synthetic demo practice is available: open https://mc392.github.io/therapy-tracker/demo/groundwork-demo-practice.json in Safari, tap Share > Save to Files, then in GroundWork go to Settings > Data & backup > Restore from backup and choose that file. It contains no real people.

IN-APP PURCHASES
- GroundWork Pro (monthly subscription): Settings > App preferences > What you are paying for > See what Pro is, or any locked Pro screen such as Practice > Business analytics.
- UK tax year 2026-27 (non-consumable): the Tax tab, or the same Settings card. It requires GroundWork Pro first, so please subscribe to Pro before buying the tax year. The Tax tab's figures are masked until both are held; the tab itself and the user's own settings on it are free.
Logging, receipts, backups and every export are free and never locked.

NATIVE FUNCTIONALITY (Guideline 4.2)
The iOS app is not a wrapped website. It adds: Face ID / Touch ID locking of the records, including hiding them in the app switcher; scheduled local notifications for overdue payments and outstanding session notes; native PDF generation of receipts with AirPrint and share-sheet delivery; a records folder the user picks with the document picker (typically in iCloud Drive), written on every save with coordinated file access; automatic on-device backups in the app's Documents folder, visible in the Files app; writing sessions into the user's calendar with EventKit; system haptics; and a companion Apple Watch session timer.

CALENDAR ACCESS
Requested only when the user taps "Add to my calendar". Full access (rather than write-only) is needed solely to update an event the app itself created when a session is rescheduled; nothing else is read, and no calendar data leaves the device.

PRIVACY
The privacy label is "Data Not Collected": nothing is transmitted to the developer. Client records are entered and controlled by the practitioner.
```

## Step 11 — Release setting, then submit (2 min)

1. **App Store Version Release** → **Manually release this version** — so it goes live when *you*
   click, not at 3am the moment it's approved.
2. Top right → **Add for Review** → check the summary lists the **app version, GroundWork Pro
   Monthly and UK tax year 2026-27** → **Submit to App Review**.

You'll get emails as the status moves: *Waiting for Review* → *In Review* → *Pending Developer
Release* (approved) or *Rejected* (with a message in App Store Connect → **App Review**).

## Step 12 — When it's approved

1. **Distribution** → the version → **Release This Version**. It's on the store within ~24 hours.
2. Search the App Store for "GroundWork" on your phone and check the listing.
3. Tell existing web-app users (Charlotte first): **records don't carry across automatically** —
   export a backup in the web app, then *Restore from backup* in the iPhone app. The support page
   explains this too.

---

## If Apple rejects it — reply templates

Reply in App Store Connect → **App Review** → the message. Keep it factual. Tell me what they
said and I'll help fix anything real.

**Guideline 4.2 — "not sufficiently different from a mobile web browsing experience"**
```
Thank you for the review. GroundWork uses iOS capabilities a website cannot: Face ID locking of confidential records with app-switcher hiding (Settings > This iPhone), scheduled local notifications for outstanding work, native PDF receipts via AirPrint and the share sheet, a user-chosen records folder in iCloud Drive written through the document picker on every save, EventKit calendar integration, system haptics, and a companion Apple Watch session timer. We would be grateful if you could look again with these in mind.
```

**Guideline 2.1 — "we couldn't find / load your in-app purchases"**
```
Thank you. The subscription is offered in Settings > App preferences > What you are paying for > See what Pro is. The tax year purchase requires GroundWork Pro first, so please subscribe to Pro in the sandbox and then buy the tax year from the same card or from the Tax tab. Both products are attached to this version.
```
(Before replying, check both products show **Waiting for Review** alongside the version, and that
the Paid Apps agreement is **Active** — Step 3.)

**Guideline 3.1.2 — subscription information missing**: the Terms and Privacy links are in the
paywall and at the end of the Description; if they ask for more, reply pointing to both and tell
me what they highlighted.

**Guideline 5.1.1 — calendar permission**
```
Calendar access is requested only when the user taps "Add to my calendar". Full access is used solely to update an event GroundWork itself created when a session is rescheduled - write-only access cannot read that event back, so every change would create a duplicate. No calendar data leaves the device.
```

## Troubleshooting

| What you see | What it means |
|---|---|
| Paywall says "Unavailable" | Paid Apps agreement not **Active** (Step 3), the product isn't *Ready to Submit*, the subscription group has no display name (4a), or it hasn't propagated — wait a few hours. |
| Tax year "Unavailable" but Pro prices fine | The tax year is missing or mistyped. It lives under **In-App Purchases**, not Subscriptions. |
| Tax figures still masked after buying the year | Pro must be active too. |
| Build stuck on *Missing Compliance* | Only builds **older** than 25 — answer *"None of the algorithms mentioned above"*. |
| Upload fails with a 409 "SDK version" | Apple raised the minimum Xcode. Tell me — it's a one-line change to `testflight.yml`. |
| TestFlight doesn't have a fix you pushed | Pushing updates the website only. Run the TestFlight workflow (Actions tab). |
| "Missing screenshot for Apple Watch" | Step 9c. |

---

## Reference

- Pricing and why: `docs/monetisation.md`. Build pipeline: `docs/releasing.md`.
  Privacy-label reasoning: `docs/app-store-listing.md`.
- Regenerate screenshots: `npm i --no-save playwright && node scripts/render-store-screenshots.mjs`
  (add `--dark` for a dark set). Review screenshots:
  `node scripts/render-paywall-screenshot.mjs --sheet both`.
- Product IDs (must match the code exactly):
  `uk.co.charlottebloortherapy.groundwork.pro.monthly` (subscription) ·
  `uk.co.charlottebloortherapy.groundwork.taxyear.2026` (non-consumable) ·
  `uk.co.charlottebloortherapy.groundwork.plus.annual` (legacy — never create, rename or re-point).
