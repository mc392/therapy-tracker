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
| The app itself (web + iPhone) | ✅ Built. Latest code is on `main`. |
| Automatic builds to TestFlight | ✅ Working — 24 successful builds; build **24** was this morning's `main`. |
| Apple Developer account, App Store Connect record | ✅ Done (Aug 2026). |
| The two products (Pro monthly, tax year 2026-27) | ⚠️ Created as records — **metadata still to finish** (Steps 4–5). |
| Privacy manifest + encryption declaration in the app | ✅ Added — in builds 25 and 26. |
| Terms of Service | ✅ **Fixed today** — still called the app "beta" and "free"; both are App Review rejections. |
| Privacy Policy | ✅ **Updated today** — now covers the records folder, calendar and purchases. |
| Support page | ✅ Live at `groundworkpractice.co.uk/support.html`. |
| App Store screenshots (iPhone 6.9") | ✅ Made — 6 promotional images with captions, plus plain versions. |
| Paywall review screenshots | ✅ **Regenerated today** with the real prices and current design. |
| Store copy (description, keywords, …) | ✅ **Written today**, every field checked against Apple's character limits. |
| Apple Watch app | ✅ **Held back from 1.0** (26 Sep) — so no Watch screenshots are needed. Returns in a later version. |
| iPad | ✅ **iPhone and iPad** (chosen 26 Sep) — iPad screenshots made, and the app says "iPad" on an iPad. **Once released this can never be removed** (Apple's rule). |
| Real-device test of build 27 | ⚠️ **You** (Step 8). |
| Submit | ⚠️ **You** (Steps 10–13). |

### What changed in the app since the last guide (15 Sep)

Three pull requests merged (#64–#66): a design pass with **haptics** (a new native feature — it
strengthens the "not just a website" case, so it's now in the reviewer note), **v12 records**
(practitioners who also supervise; session length), and a fix for the **header under the iPhone
status bar**. None of them changes anything in the listing, the products or the privacy answers.

### What I did for you today, and why each matters

1. **Privacy manifest** (`ios/App/App/PrivacyInfo.xcprivacy`). Apple requires one
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

## Step 1 — Merge the second pull request (5 min)

The first one (#67 — Terms, Privacy, Support page, privacy manifest) is **✅ merged and live**.
The second, *"Hold the Watch app and iPad back from 1.0; move the listing to groundworkpractice.co.uk;
promotional screenshots"*, carries today's follow-up changes.

1. GitHub → **Pull requests** → open it → **Merge pull request** → **Confirm merge**.
2. Wait ~1 minute, then check these open on **your own domain**:
   - <https://groundworkpractice.co.uk/support.html>
   - <https://groundworkpractice.co.uk/terms.html> — top box says *"Before you add real client
     data"*, not *"Beta software notice"*.
   - <https://groundworkpractice.co.uk/privacy.html> — "Last updated 26 September 2026".
   - <https://groundworkpractice.co.uk/demo/groundwork-demo-practice.json> — a page of data (that's
     the reviewers' demo practice).

   If a page doesn't load on the domain, open GitHub → the repo's **Settings → Pages**: *Custom
   domain* should read `groundworkpractice.co.uk` with a green *DNS check successful*, and
   **Enforce HTTPS** should be ticked. The App Store needs `https://` links.

## Step 2 — Contact address ✅ Done

`privacy@groundworkpractice.co.uk` is confirmed working (26 Sep). It's on the Support page, Terms
and Privacy Policy.

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
- **What the status should say — and why it won't say "Approved" yet.** A yellow status is
  normal here. Read the exact words next to the dot:
  - **Missing Metadata** → something is genuinely missing. Check the four places in the box below.
  - **Ready to Submit** or **Prepare for Submission** → **this product is finished.** Nothing more
    to do on this page. The blue banner at the top of the page says why it goes no further: a
    first subscription **can only be submitted together with an app version**. Its status
    changes to *Waiting for Review* in Step 11, when you submit the app with it attached (Step 9c).

  > **The four things that keep a subscription on "Missing Metadata"**
  > 1. **The subscription GROUP's own localisation** — on the *group* page (one level up, click
  >    the group name `GroundWork`), not this page. The most often missed; see 4a.
  > 2. **Availability** — at least one country ticked (United Kingdom).
  > 3. **A price** for that country (the *Subscription Prices* section lists it).
  > 4. **A localisation** (display name + description) *and* the **review screenshot**.
  >
  > The image, the review notes, *App Store Promotion* and *Family Sharing* are optional.

- **The real test is on your phone, not this page:** in the TestFlight app (Step 8), Settings →
  App preferences → *What you are paying for* → **See what Pro is**. A price of **£1.99 / month**
  means the product is complete and reachable. "Unavailable" means it is not yet (or Step 3's
  agreement is not active, or it has not propagated — allow a few hours).

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

Same as Step 4: **Ready to Submit** or **Prepare for Submission** means finished — it is
submitted with the app version in Step 11. **Missing Metadata** means the availability, price,
localisation or review screenshot is still missing. The test on your phone is the **Tax year
2026-27** sheet showing **£7.99**.

**Also create next year now** (5 min, saves a scramble in April): **+** → Non-Consumable →
Reference Name `UK tax year 2027-28`, Product ID
`uk.co.charlottebloortherapy.groundwork.taxyear.2027`, £7.99, Display Name `UK tax year 2027-28`,
Description `Tax figures for 2027-28 and earlier`, same screenshot. The app won't offer it until
it's added in code next spring — tell me then. Don't submit it with this release.

## Step 6 — App Information (10 min)

**GroundWork** → **General → App Information**.

| Field | Enter |
|---|---|
| Name | `GroundWork for Therapists` — **keep what you already have.** App Store names must be unique, so the record was set up under this name. |
| Subtitle | `Private practice records` |
| Category — Primary | **Business** |
| Category — Secondary | **Productivity** |
| Content Rights | **No**, it does not contain, show, or access third-party content |
| Age Rating | **Edit** → answer **None / No to every question** → result **4+**. There are no ads, no chat, no user-generated content, no web browsing, no gambling, and no medical or wellness information *for the user* — it's business admin for the therapist. |
| License Agreement | Leave as Apple's **Standard License Agreement** |

**Privacy Policy URL** is on the **App Privacy** page (Step 7), not here.

## Step 7 — Privacy, pricing and where it's sold (10 min)

**7a. App Privacy** (left sidebar **App Privacy**):

1. **Privacy Policy URL:** `https://groundworkpractice.co.uk/privacy.html`
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

## Step 8 — Test build 27 on your iPhone (and iPad, if you have one) (30–45 min)

Build **27** is the submission candidate: the privacy manifest, the encryption declaration, the
new domain, **no Watch app**, and **iPhone + iPad**. I started it from the PR branch; it is the same code that lands
on `main` when you merge. (To rebuild from `main` later: GitHub → **Actions** → **TestFlight** →
**Run workflow** → branch `main`, build number blank.)

1. App Store Connect → **TestFlight**: build **27** appears ~15 minutes after the run finishes.
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
   - [ ] **No Watch app:** if you have an Apple Watch, GroundWork should no longer offer to
         install on it. (If an older TestFlight build put it there, delete it from the watch.)
4. **On an iPad, if you have one** (App Review *will* test on one — this is the check that
   matters most for iPad). Install the same build from TestFlight on the iPad, then:
   - [ ] It opens full screen with the **green sidebar** on the left, not a phone-sized window.
   - [ ] Settings says **This iPad**, not "This iPhone".
   - [ ] Turn the iPad sideways and back — the layout follows without anything cut off.
   - [ ] **Share a receipt PDF** and **choose a records folder** — both open a small popover
         window. (This is the one place iPad apps commonly crash; the code is written for it.)
   - [ ] Face ID / Touch ID lock works (it names whichever the iPad has).

   No iPad? Tell me, and it is a judgement call: the layout, the wording and the popovers are all
   covered by automated checks, but nobody will have tried it on real iPad hardware before review.

Anything wrong → tell me what you saw; I'll fix it and cut build 28.

## Step 9 — Build the version page (20 min)

**GroundWork** → **iOS App** → **1.0 Prepare for Submission**.

**9a. iPhone screenshots** — *Previews and Screenshots* → **iPhone** tab. App Store Connect needs
**one** iPhone size, and there are two sets ready — use whichever its page asks for:

| If the box says… | Use the files in | Size |
|---|---|---|
| **6.9" Display** (or asks for 1320 × 2868 / 1290 × 2796) | `docs/app-store-screenshots/promo/` | 1320 × 2868 |
| **6.5" Display** (or asks for 1242 × 2688 / **1284 × 2778**) | `docs/app-store-screenshots/6.5/promo/` | 1284 × 2778 |

An error reading *"The dimensions of one or more screenshots are wrong"* means the files went into
the other size's box — switch folder, don't resize anything. Drag in these six **promotional**
screenshots, in this order (same names in both folders):

1. `01-today.png` — *What needs you today*
2. `02-tax.png` — *Know what you'll owe HMRC* (tagged **Pro + tax year**)
3. `03-private.png` — *Private by design* (Face ID — also the "real iPhone app" evidence)
4. `04-week.png` — *Your week in one list*
5. `05-analytics.png` — *See how your practice is doing* (tagged **Pro**)
6. `06-money.png` — *Your money, month by month*

The first three are what people see in **search results**, so they carry the three reasons to
install. Each is a headline on the brand green above the **real app screen** in a phone frame —
Apple allows captions as long as the app itself is shown (Guideline 2.3.3), and the gold tags
say which screens need a purchase, so nothing is sold by implication. All are 1320×2868 with no
transparency, from a synthetic practice. Smaller iPhones are scaled from these automatically.

- **Prefer plain screens?** The un-captioned versions are one folder up
  (`docs/app-store-screenshots/`, same content). Either set is fine; don't mix them.
- **iPad screenshots — required, and ready.** Same page → **iPad** tab → **13" Display** (asks
  for 2064 × 2752 or 2048 × 2732). Drag in the six from `docs/app-store-screenshots/ipad/promo/`,
  same names and order as the iPhone set. They show the iPad's own layout — the green sidebar —
  so they are genuine iPad screens, not stretched phone ones.
- **App Preview video (optional):** a 15–30 second screen recording can sit before the
  screenshots. Not needed to launch; worth adding later.
- To change a caption, edit `PROMOS` in `scripts/render-store-promo.mjs` and run
  `node scripts/render-store-promo.mjs` (add `--size 6.5` or `--size ipad` for those sets; make that set's plain
  screens first with `node scripts/render-store-screenshots.mjs --size 6.5` or `--size ipad`).

**9b. Text fields** — paste exactly:

**Promotional Text** (150/170)
```
Private, offline records for a therapy practice - sessions, clients, rooms, supervision, CPD and tax. No account, no cloud: nothing leaves your phone.
```

**Description** (2,692/4,000)
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

Terms of Use: https://groundworkpractice.co.uk/terms.html
Privacy Policy: https://groundworkpractice.co.uk/privacy.html
```

**Keywords** (97/100 — no spaces after commas, on purpose. "therapist" is left out because it is already in your app name, which Apple searches anyway.)
```
psychologist,counsellor,counselling,psychotherapist,therapy,sessions,supervision,CPD,HMRC,invoice
```

**Support URL**
```
https://groundworkpractice.co.uk/support.html
```

**Marketing URL** — leave blank.

**Version** — `1.0`

**Copyright** — `2026 ` followed by the name shown as the seller on your developer account (for an
Individual enrolment, your own legal name), e.g. `2026 Jane Smith`.

**9c. In-App Purchases and Subscriptions** (same page, further down) → **Add** / **+** → tick
**GroundWork Pro Monthly** and **UK tax year 2026-27** → Done. *The first purchases must be
submitted together with an app version — skip this and review can't see them.*

**9d. Build** → **Add Build** → choose **27** (or whichever later build passed Step 8). Don't pick an older one: 1–25 contain the Watch app, and 26 is iPhone-only, so it would not match the iPad screenshots.

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
On first launch a short setup runs; choose "No - starting fresh" when asked about previous records. Tap + to log a session. To see the app with four years of data, a synthetic demo practice is available: open https://groundworkpractice.co.uk/demo/groundwork-demo-practice.json in Safari, tap Share > Save to Files, then in GroundWork go to Settings > Data & backup > Restore from backup and choose that file. It contains no real people.

IN-APP PURCHASES
- GroundWork Pro (monthly subscription): Settings > App preferences > What you are paying for > See what Pro is, or any locked Pro screen such as Practice > Business analytics.
- UK tax year 2026-27 (non-consumable): the Tax tab, or the same Settings card. It requires GroundWork Pro first, so please subscribe to Pro before buying the tax year. The Tax tab's figures are masked until both are held; the tab itself and the user's own settings on it are free.
Logging, receipts, backups and every export are free and never locked.

NATIVE FUNCTIONALITY (Guideline 4.2)
The iOS app is not a wrapped website. It adds: Face ID / Touch ID locking of the records, including hiding them in the app switcher; scheduled local notifications for overdue payments and outstanding session notes; native PDF generation of receipts with AirPrint and share-sheet delivery; a records folder the user picks with the document picker (typically in iCloud Drive), written on every save with coordinated file access; automatic on-device backups in the app's Documents folder, visible in the Files app; writing sessions into the user's calendar with EventKit; and system haptics.

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
Thank you for the review. GroundWork uses iOS capabilities a website cannot: Face ID locking of confidential records with app-switcher hiding (Settings > This iPhone), scheduled local notifications for outstanding work, native PDF receipts via AirPrint and the share sheet, a user-chosen records folder in iCloud Drive written through the document picker on every save, EventKit calendar integration, and system haptics. We would be grateful if you could look again with these in mind.
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
| Paywall says "Unavailable" | Paid Apps agreement not **Active** (Step 3), the product is still on *Missing Metadata* (see Step 4), the subscription group has no display name (4a), or it hasn't propagated — wait a few hours. |
| Tax year "Unavailable" but Pro prices fine | The tax year is missing or mistyped. It lives under **In-App Purchases**, not Subscriptions. |
| Tax figures still masked after buying the year | Pro must be active too. |
| Build stuck on *Missing Compliance* | Only builds **older** than 25 — answer *"None of the algorithms mentioned above"*. |
| Upload fails with a 409 "SDK version" | Apple raised the minimum Xcode. Tell me — it's a one-line change to `testflight.yml`. |
| TestFlight doesn't have a fix you pushed | Pushing updates the website only. Run the TestFlight workflow (Actions tab). |
| "Missing screenshot for Apple Watch" | You picked a build older than 26 — those still contain the Watch app. Choose build 27. |
| iPad screenshots rejected for size | They went into a box other than **13" Display**. Use that box — the files are 2064 × 2752. |

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
