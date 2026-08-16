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
2. **Set up Capacitor.** `npm install @capacitor/core @capacitor/cli`, `npx cap init` (app id suggestion: `uk.co.charlottebloortherapy.groundwork` — reverse-DNS, doesn't have to match a domain you own), `npx cap add ios`, `npx cap copy`. This produces an Xcode project wrapping the existing web app unchanged.
3. **Add the native feature(s)** chosen above via their Capacitor plugins, then `npx cap sync`.
4. **Drop in the brand assets.** Xcode's asset catalog wants the 1024 icon (delivered today) plus a `LaunchScreen.storyboard` (or SwiftUI launch screen) built from the light/dark splash sources — Capacitor's default template already has a slot for this at `ios/App/App/Assets.xcassets/Splash.imageset`.
5. **Enroll in the Apple Developer Program** — **$99/year**. Enroll as an **Individual** (fastest — no D-U-N-S number or company verification needed) unless you specifically want the listing to show "Charlotte Bloor Therapy" as the seller of record, in which case enroll as an Organization, which requires a D-U-N-S number and takes longer.
6. **Create the App Store Connect record.** Bundle ID from step 2, category — **Business** is the safer fit than Medical/Health & Fitness, since this is practice administration, not a clinical tool making health claims (Medical-category apps get extra scrutiny and sometimes need regulatory documentation).
7. **Host the privacy policy and terms live.** The repo already has `privacy.html` and `terms.html` — these need to be reachable at a public URL (GitHub Pages, which is already wired up via `.github/workflows/deploy.yml`, works fine) with the app name updated to GroundWork.
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

1. Confirm the icon/launch screen direction from the preview file (happy to iterate on color, wordmark weight, or try an icon-only launch screen if you'd rather it match Apple's more minimal launch-screen convention).
2. ~~Rebrand pass on `index.html`/`manifest.webmanifest`.~~ Done — see step 1. The SW cache was bumped to `tt-v5` so installed devices pick up the new manifest name rather than keeping "Therapy Tracker" on the Home Screen.
3. Decide Individual vs Organization for the Apple Developer enrollment — that's the one step only you can do (it needs your/Charlotte's Apple ID and payment details).
