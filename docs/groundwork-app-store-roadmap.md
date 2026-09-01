# GroundWork — App Store launch roadmap

*Renaming Therapy Tracker → GroundWork, and taking it from an installable PWA to a public App Store listing.*

## Where this leaves off

- **Name:** GroundWork. TherapyMate was ruled out — it collides directly with an existing practice-management platform (therapymate.com) that already has its own mobile app in the same market. GroundWork has no existing app/software conflicts; a few small therapy practices use "Groundwork" in their website name, which is a minor, non-software overlap.
- **Distribution goal:** a real, public App Store listing (not just a private install for Charlotte).
- **Brand assets delivered today:** `icon-1024.png` (App Store icon, no embedded text per Apple's icon guidelines), `splash-universal-light.png` / `splash-universal-dark.png` (2732×2732 launch screen sources), and `groundwork-launch-preview.html` (visual review of both on a phone frame plus an App Store listing mock). All reuse the existing growth-bars-and-leaf mark already shipping as the PWA icon, so the visual identity carries over — this isn't a from-scratch rebrand.

## The core obstacle: Apple does not accept plain PWAs

This is the one thing that changes the shape of the whole plan, so it's worth stating plainly: **Apple rejects apps that are just a wrapped website**, under App Store Review Guideline 4.2 ("Minimum Functionality") — the app has to do something a browser tab can't. A PWA wrapped in PWABuilder or a bare WebView gets rejected as "not sufficiently different from a mobile web browsing experience."

The fix isn't a rewrite — GroundWork's actual logic (the `S` state model, `commit()`, IndexedDB, everything in `CLAUDE.md`) stays exactly as it is. The path that works is wrapping the existing `index.html` in **Capacitor** (Ionic's native shell) and then bolting on a small number of genuinely native features so the review holds up. Good candidates, because they map onto things the app already half-does:

- **Face ID / Touch ID app lock** via a Capacitor biometrics plugin, replacing or backing up the current password gate.
- **Native push notifications** for the retention-review flags and payment-status nudges the app already computes — right now those just sit in the Attention feed; a native notification is a genuine capability a website can't offer.
- **Native share sheet** for the receipt/statement PDFs, instead of the current hidden-iframe print flow.
- **Native file access** for the encrypted `.enc.json` backup, instead of the File System Access API fallback.

Any one or two of these is enough to clear 4.2 comfortably; doing two or three also make the app better on its own terms.

## Step-by-step

1. ~~**Rebrand the codebase.**~~ **Done (Aug 2026).** `manifest.webmanifest`, `<title>`, header, tab-rail label, `practiceName()` fallback, service-worker offline message, terms/privacy and export filenames all say GroundWork. A web launch screen was added at the same time (inline SVG, not the PNGs — see CLAUDE.md § Launch screen). `TherapyTrackerDB`, the `tt_*` localStorage keys and the `TherapyTracker-web/` folder were deliberately left alone: renaming them orphans existing data or breaks the deploy path.
2. ~~**Set up Capacitor.**~~ **Done (Aug 2026).** Capacitor 8, app id `uk.co.charlottebloortherapy.groundwork`, `webDir` pointed straight at `TherapyTracker-web/` rather than a copy of it. The Xcode project is in `ios/`; none of it touches the Pages deploy, which uploads `TherapyTracker-web/` alone. See **`docs/ios-native.md`**.
3. ~~**Add the native feature(s)**~~ **Done (Aug 2026) — all four, not one or two.** Face ID / Touch ID lock (with app-switcher hiding and a grace period), daily reminders built from the live Attention feed, the share sheet for every export, and receipts rendered to real PDFs. The last two replace things that were *silently broken* in a web view: `<a download>` and `window.print()` both do nothing on iOS, so an installed PWA has always had a dead Export button and a dead Generate & print button.
4. ~~**Drop in the brand assets.**~~ **Done (Aug 2026).** `icon-1024.png` into the app icon slot and both splash sources into `Splash.imageset` with a **dark variant**, so a dark-mode cold start no longer flashes white. `launchAutoHide` is off and the web `#splash` takes over on first paint, so the two launch screens read as one. Installed by `scripts/install-assets.mjs` on every sync, because `cap sync` would otherwise restore Capacitor's placeholders.
5. **Enroll in the Apple Developer Program** — **$99/year**. Enroll as an **Individual** (fastest — no D-U-N-S number or company verification needed) unless you specifically want the listing to show "Charlotte Bloor Therapy" as the seller of record, in which case enroll as an Organization, which requires a D-U-N-S number and takes longer.
6. **Create the App Store Connect record.** Bundle ID from step 2, category — **Business** is the safer fit than Medical/Health & Fitness, since this is practice administration, not a clinical tool making health claims (Medical-category apps get extra scrutiny and sometimes need regulatory documentation).
7. **Host the privacy policy and terms live.** ~~with the app name updated to GroundWork~~ — both already say GroundWork and both already deploy to GitHub Pages via `.github/workflows/deploy.yml`, so this step is just taking the two public URLs. `terms.html` also gained a **section 4 on tax figures** (estimates, not advice; the app cannot file) that is worth re-reading before it goes in front of App Review.
8. **Fill in the privacy "nutrition label."** Because the app has no backend and no analytics — everything lives in IndexedDB/localStorage on-device — this should qualify for Apple's **"Data Not Collected"** label, which is the simplest and most trust-building option. Worth a line in the privacy policy clarifying that client data (which is sensitive/special-category under UK GDPR) never leaves the device, and that Charlotte remains the data controller for her own records.
9. **TestFlight first, regardless.** Before the public submission, run at least one internal TestFlight build so the native wrapper gets tested on a real device — this catches Capacitor plugin issues before they become a rejection.
10. **Assets for the listing.** Beyond the icon: screenshots for at least the 6.9" iPhone size class, a short description, promotional text, keywords, and a support URL (can be a mailto: or the GitHub Pages site).
11. **Submit.** Typical review turnaround is 24–48 hours; expect at least one round of feedback the first time, most commonly around the privacy label or the 4.2 minimum-functionality check — having the native features from step 3 in place is what gets this through cleanly.

## Cost & timeline

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/year | Required for any App Store distribution, public or TestFlight |
| Capacitor + native rebuild | Dev time only | No paid tooling required |
| Hosting privacy/terms pages | Free | GitHub Pages, already set up |
| Realistic timeline | 1–3 weeks | Mostly Capacitor setup + native feature wiring; review itself is 1–2 days once submitted |

## Worth considering: Android/Google Play in parallel

You said "public App Store listing" without specifying a platform — worth knowing that **Google Play is much friendlier to PWAs**: a Trusted Web Activity (TWA) wrapper (via [PWABuilder](https://www.pwabuilder.com) or [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)) is an accepted, common submission path, no equivalent to Guideline 4.2 blocking it. Google Play's developer account is **$25 one-time** (not annual). If reaching other therapists on Android matters, that route could realistically ship in days rather than weeks, well before the iOS native rebuild is ready — and it can run alongside the Capacitor work rather than blocking it.

## Immediate next steps

1. ~~Confirm the icon/launch screen direction.~~ **Confirmed and shipped to the web app (Aug 2026).** The mark is live as the PWA icon and as a launch screen on both cold start (1.2s) and resume (0.8s). The app's own default palette was corrected to the artwork greens at the same time — `:root` had drifted teal, so "Sage" in Settings was advertising a green the app never rendered. One deliberate deviation: the header gradient uses `#5C7A6D`, a shade darker than the icon's own top stop `#6A8B7C`, because white on `#6A8B7C` is only 3.75:1 and the 18px/700 header title falls just under the WCAG large-text threshold.
2. ~~Rebrand pass on `index.html`/`manifest.webmanifest`.~~ Done — see step 1. The SW cache was bumped to `tt-v5` so installed devices pick up the new manifest name rather than keeping "Therapy Tracker" on the Home Screen.
3. Decide Individual vs Organization for the Apple Developer enrollment — that's the one step only you can do (it needs your/Charlotte's Apple ID and payment details).

**Steps 2, 3 and 4 are done** — see `docs/ios-native.md` for the wrapper and the three iOS
traps it walks around. **Steps 6, 8 and 10 are drafted** in `docs/app-store-listing.md`:
the App Store Connect fields, the "Data Not Collected" answer and why it is honest, the
Guideline 4.2 reviewer note, the screenshot list and the store copy.

**Steps 5 and 6 are done (Aug 2026):** the Apple Developer enrolment is in place and both
GroundWork and GroundWork Notes have App Store Connect records, both under **Business**.
The pre-submission release work (seed cleanup, beta-gate removal, restore hardening,
automatic iOS backups, the tax "Now" view — see `docs/tasks/00-INDEX.md`) shipped at the
same time. **What is actually left:** step 9, a TestFlight build on real hardware — Face
ID, notification delivery, AirPrint and the new auto-backup have only been exercised in
the simulator — then step 10 screenshots from demo data, and step 11, submission.

**The remaining steps, written out in order to be followed after testing, are in
`docs/launch-checklist.md`** — build, device testing, screenshots, listing, submission, and
the same again for GroundWork Notes.

One thing to tell testers: **data does not carry across from the installed PWA.** The
native app is a different origin, so its database starts empty. Export a `.json` backup
from the web app and restore it in the native one.
