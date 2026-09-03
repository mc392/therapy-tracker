# App Store submission pack

Everything for the App Store Connect record that does not need an Apple Developer account
to write down. Steps 6, 8 and 10 of `groundwork-app-store-roadmap.md`, drafted and ready to
paste; the account itself (step 5) is the one thing only Charlotte can do.

---

## The record

| Field | Value | Why |
|---|---|---|
| Bundle ID | `uk.co.charlottebloortherapy.groundwork` | already set in `capacitor.config.json` and the Xcode target |
| Name | GroundWork | 30 char limit; fits |
| Subtitle | Private practice records | 30 char limit |
| Primary category | **Business** | practice administration, not a clinical tool. Medical draws extra scrutiny and sometimes regulatory paperwork, for a category that fits worse |
| Secondary category | Productivity | |
| Age rating | 4+ | no user-generated content, no web browsing, no ads |
| Price | Free | |
| Support URL | https://mc392.github.io/therapy-tracker/ | the Pages site already deploys |
| Privacy Policy URL | https://mc392.github.io/therapy-tracker/privacy.html | already live |

The companion app, GroundWork Notes, will also list under Business — the two listings should read as one family, not as a clinical tool paired with an admin tool.

## Privacy nutrition label — "Data Not Collected"

The app has no backend, no accounts and no analytics; everything lives in IndexedDB and
localStorage on the device. Answer **"No"** to "Do you or your third-party partners collect
data from this app?" and the label reads *Data Not Collected*, which is both accurate and
the strongest trust signal on the page.

Two things to keep true, because this answer stops being honest the moment either changes:

- **No analytics SDK, ever** — not Firebase, not Sentry, not a crash reporter. Adding one
  means re-answering the questionnaire.
- **The share sheet is not collection.** Exports go where the therapist sends them. Apple
  does not count a user-initiated share as data the developer collects.

Worth adding to `privacy.html` before review, if it is not explicit already: client records
are special-category data under UK GDPR, they never leave the device, and Charlotte remains
the data controller for her own records.

## The 4.2 answer, if review asks

Guideline 4.2 rejects apps that are just a wrapped website. The reviewer notes should say
plainly what the app does that a browser tab cannot:

> GroundWork stores confidential therapy records entirely on-device. The iOS app adds
> Face ID / Touch ID locking of those records including hiding them in the app switcher,
> scheduled local notifications for overdue payments and outstanding session notes, native
> PDF generation of client receipts with AirPrint and share-sheet delivery, native file
> access for encrypted backups, and automatic on-device backups written to the app's
> Documents folder on every save. None of these are available to the web version.

That is five native capabilities, two of which replace functions that do not work at all
inside a web view. Any one would likely clear 4.2; five is comfortable.

## Screenshots

Required: **6.9" iPhone** (1320×2868). One set is enough — App Store Connect scales down
for smaller classes. Capture on an iPhone 17 Pro Max simulator with demo data, not real
client records.

Suggested five, in order:
1. **Home** — the Attention feed with a couple of items, plus the money tiles.
2. **Sessions** — the list with paid/unpaid states visible.
3. **Money or Tax** — the tax estimate, the thing that replaces the spreadsheet.
4. **Settings › This iPhone** — the Face ID lock and reminders. This is the 4.2 evidence.
5. **A receipt PDF in the share sheet** — the native output.

## Copy

**Promotional text** (170 chars, editable without review):
> Private, offline records for a therapy practice — sessions, clients, rooms, supervision
> and tax. Nothing leaves your phone.

**Description** (first three lines are what people actually read):
> GroundWork keeps the admin side of a therapy practice in one place: sessions, clients,
> room costs, supervision hours and a running estimate of what you will owe HMRC.
>
> Everything stays on your phone. There is no account, no cloud, and no analytics — your
> records are not sent anywhere, and Face ID keeps them shut when the app is closed.
>
> • Log a session in seconds, or type it: "AB tue 14:00 paid"
> • See at a glance what is unpaid, what needs notes, and when supervision is due
> • Room costs per session or as monthly rent, with history kept when rates change
> • Receipts and statements for clients as PDFs, printed or shared straight from the app
> • Supervision and CPD hours tracked against the 1:6 ratio
> • A UK tax estimate that updates as you work, with your business costs counted in
> • Automatic on-device backups kept in your iPhone's own backup, plus encrypted backups you can export yourself
>
> GroundWork records attendance and money. It is not a clinical record and holds no session
> notes — keep those where you keep them now. Tax figures are estimates to help you plan,
> not advice, and the app cannot file for you.

**Keywords** (100 chars, comma-separated, no spaces):
> therapist,therapy,counsellor,counselling,practice,private practice,sessions,supervision,invoice,tax

**What's New** (first release):
> First release on the App Store. GroundWork was already a web app; this version adds Face
> ID locking, reminders for what needs you, and proper PDF receipts you can print or share.

## Before submitting

- Read `terms.html` §4 on tax figures once more — it is the paragraph most likely to draw a
  reviewer question, and it needs to be as plain as the description above.
- Run one TestFlight build first (roadmap step 9). The wrapper has only been exercised in
  the simulator; Face ID, notification delivery and AirPrint all want real hardware.
- Take screenshots from demo data. Never from Charlotte's own records.

## Subscription block for the app Description

App Store Connect has **no Terms of Use URL field** — only Privacy Policy has one. Guideline
3.1.2 wants functional links to both in the binary (the paywall has them) and in the store
metadata, which means the Description. Paste this at the end of it:

```
GroundWork Plus is an auto-renewing annual subscription.
Payment is charged to your Apple ID at confirmation of purchase.
It renews automatically unless cancelled at least 24 hours before the end
of the current period. Manage or cancel in your Apple ID account settings.

Terms of Use: https://mc392.github.io/therapy-tracker/terms.html
Privacy Policy: https://mc392.github.io/therapy-tracker/privacy.html
```

Leave **License Agreement** on Apple's Standard EULA; a custom one is entered as text, not a
URL, and the link above is what the guideline asks for.

## Subscription image

`TherapyTracker-web/icon-ideas/groundwork/subscription-plus-1024.png` — 1024×1024, opaque, no
rounded corners (Apple masks its own). Used for offer-code redemption, win-back offers, and the
product page if App Store Promotion is enabled.

Regenerate with `node scripts/render-subscription-image.mjs`; the `.html` beside it is the
source, and it reuses the same SVG geometry as the app's launch screen so the mark cannot drift
from the one shipping in `index.html`. Colours are sampled from `icon-1024.png` rather than
guessed: `#6B8B7C` → `#3C4F44`, bars at 55% / 78% / 100% white.

It carries **no text** on purpose: Apple shows the subscription's name and description beside
the image, so a word here would be redundant and could not be localised.
