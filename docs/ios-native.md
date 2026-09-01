# GroundWork on iOS — the native wrapper

The iOS app is not a second GroundWork. It is the same `TherapyTracker-web/index.html`,
running inside a Capacitor shell that adds the handful of things a browser tab cannot do.
This document is about the seam between the two: where it is, what holds it together, and
which of iOS's sharp edges have already drawn blood.

---

## The shape of it

```
therapy-tracker/
  TherapyTracker-web/       ← THE app. One file. Deployed to GitHub Pages, unchanged.
  capacitor.config.json     ← webDir points AT the line above, not at a copy
  package.json  scripts/    ← the wrapper's tooling
  ios/                      ← generated Xcode project
    App/App/public/         ← a COPY of TherapyTracker-web, gitignored, rebuilt every sync
    App/App/GroundWorkNativePlugin.swift   ← the only hand-written native code
```

The GitHub Pages workflow uploads `TherapyTracker-web/` and nothing else, so none of the
wrapper can reach the web deploy. The PWA is unaffected by everything in this document.

## The three rules that stop the two builds drifting apart

**1. There is exactly one copy of the app.** `webDir` is `TherapyTracker-web` — the live
folder, not a snapshot of it. `ios/App/App/public/` is a build output: gitignored, deleted
and rewritten by every `npm run sync`. A stale copy cannot be committed because no copy is
ever committed.

**2. The native layer wraps; it never reimplements.** Everything iOS-specific lives in one
guarded block at the end of `index.html`:

```js
if(!(CAP && CAP.isNativePlatform && CAP.isNativePlatform())) return;   /* web: no-op */
```

In a browser that IIFE returns on its first statement. It then *wraps* functions the app
already has — `download()`, `printReceipt()`, `VIEWS.settings` — rather than restating any
of their logic, so a change to an export or a receipt is picked up by the iOS build for
free. Verified: on the web `window.download` is untouched, `VIEWS.settings` is unwrapped,
`window.Capacitor` is undefined and no lock overlay exists in the DOM.

**3. The seams are asserted.** `npm run check` fails the build if any name the native layer
reaches for has been renamed, if the `isNativePlatform()` guard is removed, if a second
`index.html` appears, or if the custom plugin falls out of the Xcode target or the
registration list. Drift here is silent otherwise — rename `download()` and the web app
keeps working perfectly while the iOS share sheet just stops appearing.

## Commands

```bash
npm run check   # syntax + drift, no build
npm run sync    # copy web assets, re-add and re-register the plugin, install artwork, prune
npm run ios     # check, sync, then open Xcode
```

A fresh clone has no app icon or launch image until the first `npm run sync` — the six PNGs
in the asset catalog are 9MB of copies of two files already in `icon-ideas/groundwork/`, so
they are gitignored and regenerated rather than committed. Sync before you build.

`npm run sync` runs `cap sync` and then four repairs, all idempotent, because
`cap sync` regenerates from Capacitor's template and knows nothing about our own files:
the Swift plugin is re-added to the Xcode target, re-registered with the bridge, the brand
artwork is reinstalled into the asset catalog, and `icon-ideas/` + `sw.js` are pruned from
the copied bundle (5.8MB that has no business in an app binary).

## What the native layer adds

| | What it replaces on the web | Where |
|---|---|---|
| **Face ID / Touch ID lock** | nothing — the PWA has no lock at all | custom Swift plugin |
| **Daily reminders** | the Attention feed, which cannot speak while the app is shut | `@capacitor/local-notifications` |
| **Share sheet for exports** | `<a download>`, which does nothing in a WKWebView | `@capacitor/filesystem` + `@capacitor/share` |
| **Receipts as real PDFs** | `window.print()`, a no-op in a WKWebView | custom Swift plugin |
| **Automatic backups** | the File System Access API, which iOS does not have | `@capacitor/filesystem` |

Two of those replace things that were **silently broken** on iOS rather than merely
missing: an installed PWA on an iPhone has always had a dead Export button and a dead
Generate & print button. The wrapper is what makes them work.

Device settings (`tt_lock`, `tt_lock_grace`, `tt_notify`, and the automatic-backup bookkeeping
`tt_autobk_day` / `tt_autobk_status`) live in localStorage, not in `S`. `S` travels in backups,
and restoring a backup onto a different phone must not silently switch that phone's lock off —
or tell it that a copy it has never written was saved five minutes ago.

## Automatic backups

On desktop Chrome/Edge an encrypted backup auto-saves silently through the File System Access
API. iOS has no such API, so until now the only safety net on the platform this app actually
ships on was a nag banner and a manual share sheet: a lost or broken phone lost everything since
the customer last bothered.

Every `commit()` — the app's single save choke point — now also writes a backup file, debounced
2s, into the app's own **Documents** directory:

```
On My iPhone/GroundWork/
  GroundWork auto-backup.json          ← rewritten on every save …
  GroundWork auto-backup.enc.json      ← … or this one, if a passphrase is set
  auto-backups/
    GroundWork 2026-08-31.json         ← one dated copy a day, newest 7 kept
```

- **`encReady()` decides per write**, so a passphrase set halfway through the week takes effect
  on the next save — and the now-superseded live file in the other mode is deleted rather than
  left sitting in Files. The **dated** copies are left alone: they are the only record of what
  the data looked like on those days, they cannot be re-encrypted without the state that made
  them, and deleting somebody's restore points as a side effect of setting a passphrase would
  be the worse trade. They age out of the folder within a week either way.
- **Rotation is daily, not per-save.** The live file is overwritten every time, which on its own
  is one bad edit away from being no backup at all; a mistake noticed on Thursday needs
  Wednesday's file. Seven copies written in one afternoon would just be seven copies of that
  afternoon. `tt_autobk_day` holds the last rotation date, set only after the write succeeds.
- **Nothing is ever toasted.** `nativeAutoBackup()` catches everything, logs, records the outcome
  in `tt_autobk_status` and returns a boolean; a background backup that interrupts someone
  mid-sentence is worse than one that fails quietly. The only caller that speaks is the
  **Back up now** button in Settings › This iPhone, which is a deliberate user action.
- **The `commit` wrap is transparent.** It awaits the original, fires the backup and forgets it,
  and returns the original's `true`/`false` — callers check that value, and a failed IndexedDB
  write must still raise the red save banner. A failed backup can neither block a save nor mask
  a failed one.
- **It flushes on backgrounding.** iOS suspends the WebView and a pending 2s timer with it, so
  `flushAutoBackup()` runs from the same `appStateChange` listener as the lock. Logging a session
  and putting the phone straight down is precisely the case this feature exists for.
- **`Filesystem` may be absent** in some future build; the `P("Filesystem")` guard makes the whole
  thing a clean no-op and the settings card says so instead of lying about a copy.

Two Info.plist keys are what make any of this reachable by a human: `UIFileSharingEnabled` and
`LSSupportsOpeningDocumentsInPlace`. Without them the files are written and nobody can ever open
them. With them, the folder appears in the Files app under On My iPhone.

**The manual-backup nag is deliberately unchanged.** `markBackedUp()` is still tied to explicit
exports only, because a copy sitting on the same phone protects nobody who has iCloud Backup
switched off — which is exactly the person the banner is for. The banner's detail line just
appends "(an automatic copy is kept on this iPhone)"; the thresholds and the clock are untouched.

## The watch app

`ios/App/GroundWorkWatch/` — a SwiftUI watchOS app, embedded in the iPhone app, that does one
thing: time a session and tap the wrist twice, at ten minutes left and at time.

It is the first code in this repository that is **not** the web app. That cuts against rule 1
above, and it is only tolerable because the watch app owns no logic and no data: there is no
`derive()`, no fee history, no client list, no `S`. It holds two integers and a date. Nothing
is synced, in either direction — see `docs/watchos-companion-ideas.md` for what stage 2 would
add and why it is a bigger piece of work than this was.

### Why a timer at all

Therapists watch the clock constantly, and being *seen* to watch it has a clinical cost —
which is what the clock-behind-the-client's-head and the phone-face-down-on-the-table are
both working around. A tap on the wrist is the version that costs the client nothing, and it
is the one thing in this whole product that a phone genuinely cannot do.

### The two rules, both from the same fact

**watchOS suspends the app the moment the wrist drops** — a second or two after the therapist
stops looking at it, and then for the next forty-nine minutes.

1. **The end date is the state. Nothing counts down.** Every number on screen derives from
   `Date()` against `endsAt`, and the digits themselves are drawn by `Text(timerInterval:)` /
   `ProgressView(timerInterval:)`, which keep counting without the app being scheduled to
   redraw — including in the dimmed Always On state. A decrementing counter would have stopped
   with the app and looked perfectly healthy doing it.
2. **The taps are scheduled with the system, not fired by us.** A `Timer` in a suspended app
   does not fire, and the tap *is* the feature. Both cues are `UNTimeIntervalNotificationTrigger`
   local notifications, handed over when Start is pressed and withdrawn on Stop.

The `Timer`s that do exist (`armFlips`) only flip the screen from counting down to counting
up. They are allowed to be late or to never fire, because `refresh()` recomputes everything
from the dates when the app next wakes.

Two consequences worth knowing before changing anything here:

- **`AppDelegate` exists solely to present a notification while the app is frontmost.** watchOS
  suppresses that by default, so without it the therapist *looking at the timer* is the one
  person who gets no tap at ten minutes — exactly backwards. It plays the haptic itself and
  returns `[.banner]` rather than `[.sound]`, so there is no second tap to collide with.
- **A refusal has to be visible.** Permission is asked for at the first Start, which is where
  it makes sense — but a timer without its taps is just a clock, and the watch already has one.
  `cuesBlocked` puts a line on the screen rather than letting someone trust a cue that will
  never come. Worth pressing Start once before a real client rather than during one.

Theatre mode is the setting to be in during a session: screen dark, watch silent, haptics
still delivered. The settings screen says so.

### The session length is on the watch, not in `S`

`docs/watchos-companion-ideas.md` proposed a `settings.sessionMins` on the phone as part of
this stage. It was left out, because with no sync the phone cannot tell the watch anything —
it would have been a setting in the web app that changed nothing anywhere, which is the kind
of thing that quietly rots. Length and warning offset live in the watch's own `UserDefaults`.
When stage 2 lands and the phone can push, that is the moment for the phone to become the
source of the number.

### How it is wired into the project, and what asserts it

`scripts/add-watch-target.mjs` adds the target, idempotently, and runs from `npm run sync` for
the same reason `add-native-plugin.mjs` does: `npx cap add ios` regenerates `ios/` from
Capacitor's template, which knows nothing about anything we wrote. The failure it prevents is
a quiet one — a regenerated project builds and ships an iPhone app with nothing on the wrist.

Three details in that script are load-bearing:

- **`addTarget`'s build dependency is a silent no-op on a single-target project.** The `xcode`
  library only registers it if the `PBXTargetDependency` and `PBXContainerItemProxy` sections
  already exist, and a project with one target has neither. The script seeds both and then
  asserts the dependency landed; without it the watch app is embedded without being built
  first, which is a build-order bug that will not reproduce on a clean machine.
- **The target type is `watch2_app` but the product type is corrected to a plain application.**
  `watch2_app` is what gets the right embed phase (a copy into `$(CONTENTS_FOLDER_PATH)/Watch`);
  its product type is the old watchOS 2 one, and this is a single-target watch app.
- **`CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` are written out literally** rather than
  inherited, because `scripts/release-ios.mjs` bumps them with a global regex over the pbxproj.
  A watch app whose build number has drifted from its host app is rejected at upload, and
  inheriting would have left nothing there for the bump to find.

`npm run check` asserts the target is present, that all four Swift files are actually compiled
by it, that the embed phase and the dependency exist, and that the watch's
`WKCompanionAppBundleIdentifier` still matches `capacitor.config.json`'s `appId` — change the
app id and the watch app stops installing, with the reason in a device log rather than a build
error.

The app icon is the same 1024 master as the iPhone app, installed by `install-assets.mjs` and
gitignored like the others. The accent colour is `#5C7A6D`, the brand sage — deliberately the
header's darker value rather than the icon's `#6A8B7C`, because the Start button puts white
text on it and `#6A8B7C` would be 3.75:1. Same rule as the header gradient in CLAUDE.md.

### Not built, not run

Written on a machine with no Xcode and no Swift toolchain, so **none of this has been
compiled**. The project file round-trips through the `xcode` parser and the drift checks pass;
that is all that has been proven. Before it goes anywhere:

- build the App scheme in Xcode and let it create the watch scheme,
- run it in the watch simulator: start, background, relaunch mid-session, confirm the
  countdown is still right; confirm both notifications arrive,
- register `uk.co.charlottebloortherapy.groundwork.watchkitapp` — CI signs with
  `-allowProvisioningUpdates`, which can create it, but the first archive is the moment to
  find out it cannot,
- then the only test that matters: wear it through a real fifty minutes and see whether the
  tap at ten-minutes-left lands where it should.

## The look, and where it stops

GroundWork Notes has no design system to copy: twelve SwiftUI view files contain thirteen styling
calls between them, and the main screens contain none. What reads as "native" there is iOS 26
drawing stock `TabView`, `List` and `Toggle`. So none of it was ported — the parts worth having
were rebuilt in CSS, in the **shared** stylesheet rather than behind the native guard, because a
floating bar and heavier switches say "modern mobile app" rather than "iPhone" and so cost the
Android and desktop builds nothing. Details and the traps are in CLAUDE.md § Mobile chrome.

What was deliberately **not** taken: large-title navigation. It would retire the sage gradient
header that is the brand on every screen, and it is the one change that would make the web builds
look like they are imitating a platform they do not run on. If the goal ever becomes making it
*feel* native rather than look native, that is SwiftUI and a rewrite, not a restyle.

## Three iOS traps, already hit

**Capacitor 8 does not discover plugins by scanning the runtime.**
`CapacitorBridge.registerPlugins()` reads `packageClassList` from the *generated*
`ios/App/App/capacitor.config.json` and calls `NSClassFromString` on each name. The CLI
builds that list from npm dependencies only. An app-local plugin therefore compiles,
links, and is never registered — `Capacitor.Plugins.GroundWorkNative` is simply
`undefined`, every call quietly takes the web fallback, and nothing is logged anywhere.
`scripts/register-native-plugin.mjs` appends the class after each sync; the drift check
asserts it.

**`UIMarkupTextPrintFormatter` deadlocks the main thread.** Handing HTML straight to a
`UIPrintPageRenderer` freezes the app: the formatter needs to render the markup, that
render wants the main run loop, and the promise never settles — no crash, no log, just a
dead UI. The working route is to load the HTML into an offscreen `WKWebView` and take
`viewPrintFormatter()` only once `didFinish` has fired, so the layout is already done
before the renderer asks for a page count.

**WebKit's intrinsic control widths are not Blink's.** Two layout bugs were invisible in
Chrome and broke the phone:
- a bare `input` selector gave checkboxes `width:100%`, making a ~160px flex item that
  shoved its own label off the screen edge on the beta gate;
- `input[type=date]` / `[type=time]` have a much larger min-content width in WebKit, so
  grid columns could not shrink and the Time field ran off the right edge.

Both are fixed in `index.html`, and both fixes improve the PWA too. If you are laying out
form controls, check it on a phone, not just at a narrow desktop window.

## Verified in the simulator

Face ID lock (enable, background→lock, unlock, app-switcher hiding, grace period), daily
reminders (permission requested only on opt-in; three notifications scheduled with live
Attention-feed text), backup export → share sheet → Save to Files, and receipt → 20KB
one-page PDF → share sheet with AirPrint. Web build re-checked after every change.

**Automatic backups are not yet verified on a device or in the simulator** — the web build and
the drift/syntax checks pass, but the Documents write, the daily rotation, the prune and the
Files-app visibility all need a run in Xcode. Do that before it ships.

**Not yet verified on real hardware**, which is what TestFlight is for: Face ID on a device
with a real enrolment, notifications actually firing at 09:00, AirPrint to a real printer,
the share sheet's iPad popover anchor, and the automatic backups above.

## Data does not carry over from the PWA

The native app is a different origin from `mc392.github.io`, so its IndexedDB starts empty.
Anyone moving from the installed PWA must export a `.json` backup from the web app and
restore it in the native one. This is worth saying out loud in the TestFlight notes.
