# App Store submission pack

> **The paste-ready copy, the step-by-step clicks and the current status live in
> `docs/app-store-launch-guide.md`** (Sep 2026). This file keeps the *reasoning* behind the
> answers - why "Data Not Collected" is honest, what review may ask about the calendar, why the
> images look as they do. The store text that used to be drafted here was out of date (it marked
> features "(Plus)", a tier that no longer exists) and has been removed rather than kept in step
> by hand: two copies of the Description is how the wrong one gets pasted.

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
| Support URL | https://groundworkpractice.co.uk/support.html | a real contact address and FAQ - the site root is the web app itself, which gives a reviewer no way to reach anyone |
| Privacy Policy URL | https://groundworkpractice.co.uk/privacy.html | already live |

The companion app, GroundWork Notes, will also list under Business - the two listings should read as one family, not as a clinical tool paired with an admin tool.

## Privacy nutrition label - "Data Not Collected"

The app has no backend, no accounts and no analytics; everything lives in IndexedDB and
localStorage on the device. Answer **"No"** to "Do you or your third-party partners collect
data from this app?" and the label reads *Data Not Collected*, which is both accurate and
the strongest trust signal on the page.

Two things to keep true, because this answer stops being honest the moment either changes:

- **No analytics SDK, ever** - not Firebase, not Sentry, not a crash reporter. Adding one
  means re-answering the questionnaire.
- **The share sheet is not collection.** Exports go where the therapist sends them. Apple
  does not count a user-initiated share as data the developer collects.
- **Calendar access is not collection either.** The app writes sessions into a calendar the
  therapist picks and reads back only events it created itself, by an identifier it stored;
  nothing is transmitted anywhere. Apple defines collection as data leaving the device, so the
  label is unchanged - but re-read this line if the calendar feature ever grows.

## Calendar permission - what to expect at review

Not a special-approval permission: no entitlement, no form, no pre-approval. Three things carry
it, and the first is the one that gets apps rejected.

- **The prompt is raised at the point of use.** Tapping *Add to my calendar*, or *Choose a
  calendar*, is what asks. Nothing else in the app requests access - Settings reports the status
  without requesting it. Guideline 5.1.1 wants exactly this, and it shipped wrong once (see
  `docs/ios-native.md`), so it is asserted in two places rather than remembered.
- **Full access rather than write-only is the one thing a reviewer may query.** iOS 17 split the
  permission so apps that only add events need not read the diary, so asking for the larger one
  invites the question. The answer is functional and is already in the purpose string: updating a
  session that moved means reading that event back by its identifier, and write-only cannot. If
  review asks, say that; do not soften it into "for a better experience".
- **The purpose strings name what is written and what is not** - the client code, the time and the
  room, never a name, a fee or a note. `NSCalendarsFullAccessUsageDescription` is read on iOS 17+
  and `NSCalendarsUsageDescription` below it; the deployment target is iOS 15, so **both** are
  needed. iOS terminates the app if access is requested without one.

Reviewer note, if one is wanted:

> GroundWork writes the practitioner's own session times into a calendar she chooses. Full
> calendar access is used solely to update an event the app previously created when a session is
> rescheduled; nothing is read for any other purpose and no calendar data leaves the device.

EventKit is not one of Apple's "required reason" APIs, so this adds nothing to a privacy manifest.

Worth adding to `privacy.html` before review, if it is not explicit already: client records
are special-category data under UK GDPR, they never leave the device, and Charlotte remains
the data controller for her own records.

## The 4.2 answer, screenshots and store copy

All three moved to `docs/app-store-launch-guide.md` (Steps 9-10 and "If Apple rejects it"). The
4.2 note there now also names the records folder, EventKit, haptics and the Watch timer - eight
native capabilities, where the first draft listed five.

**Screenshots are generated, not captured by hand:** `node scripts/render-store-screenshots.mjs`
renders the real app at 1320x2868 on the `established` synthetic practice with a fake phone, into
`docs/app-store-screenshots/`. Never from anybody's real records.

## Subscription block for the app Description

App Store Connect has **no Terms of Use URL field** - only Privacy Policy has one. Guideline
3.1.2 wants functional links to both in the binary (the paywall has them) and in the store
metadata, which means the app **Description** - the field on the version page, not the
subscription's own short localised description.

It is already folded into the Description in `docs/app-store-launch-guide.md`, so there is
nothing separate to paste.

Leave **License Agreement** on Apple's Standard EULA; a custom one is entered as text, not a
URL, and the link in the Description is what the guideline asks for.

## Subscription and purchase images - one per product

| Product | Image | Regenerate |
|---|---|---|
| GroundWork Pro (monthly) | `icon-ideas/groundwork/subscription-pro-1024.png` | `node scripts/render-subscription-image.mjs` |
| UK tax year | **not drawn yet** - reuse the Pro (gold) artwork; the tax years wear the same gold | |

1024x1024, opaque, no rounded corners (Apple masks its own). Used for offer-code redemption,
win-back offers, and the product page if App Store Promotion is enabled. The `.html` beside the
PNG is the source and reuses the launch screen's SVG geometry, so the mark cannot drift from the
one in `index.html`. Colours are sampled from `icon-1024.png`: `#6B8B7C` → `#3C4F44`.

No text on purpose: Apple shows each product's name and description beside its image. The gold
rim on the top bar is the one paid accent the app uses everywhere. The chrome "Plus" artwork
(`subscription-plus-1024.*`) was deleted in Sep 2026 with the tier it drew.

## Subscription review screenshot

Two images, one per product, each the *App Review Information* screenshot on that product (customers
never see them): `icon-ideas/groundwork/paywall-review-screenshot.png` for Pro and
`taxyear-review-screenshot.png` for the tax year. Both 1320x2868.

`node scripts/render-paywall-screenshot.mjs --sheet both` renders them from the real
`openPlusSheet()` / `openTaxPackSheet()` with only the store stubbed - which is what breaks the
catch-22 of App Store Connect wanting the screenshot before a product can leave *Missing
Metadata*, while StoreKit cannot fetch a product still in *Missing Metadata*. The default prices
are the decided ones (£1.99/month, £7.99 a year); pass `--price` / `--price-year` if either changes.
