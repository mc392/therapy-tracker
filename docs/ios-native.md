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

Two of those replace things that were **silently broken** on iOS rather than merely
missing: an installed PWA on an iPhone has always had a dead Export button and a dead
Generate & print button. The wrapper is what makes them work.

Device settings (`tt_lock`, `tt_lock_grace`, `tt_notify`) live in localStorage, not in `S`.
`S` travels in backups, and restoring a backup onto a different phone must not silently
switch that phone's lock off.

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

**Not yet verified on real hardware**, which is what TestFlight is for: Face ID on a device
with a real enrolment, notifications actually firing at 09:00, AirPrint to a real printer,
and the share sheet's iPad popover anchor.

## Data does not carry over from the PWA

The native app is a different origin from `mc392.github.io`, so its IndexedDB starts empty.
Anyone moving from the installed PWA must export a `.json` backup from the web app and
restore it in the native one. This is worth saying out loud in the TestFlight notes.
