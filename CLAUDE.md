# GroundWork - Claude Code Reference

## Project overview
Single-file offline PWA for Charlotte Bloor Therapy (UK sole-trader therapist). Tracks clients, sessions, rooms, supervision, and payments. Installable on iOS/Android/desktop via PWA.

### Naming (renamed from "Therapy Tracker", Aug 2026)
The product is **GroundWork**. The rename covered display strings only - these identifiers were deliberately left alone because changing them orphans or breaks real data:
- **`TherapyTrackerDB`** (`DBN`) and every **`tt_*` localStorage key**. Renaming either abandons the existing database and settings on every installed device.
- The **folder `TherapyTracker-web/`**, which the GitHub Actions deploy path points at.
- Two **backward-compat checks still match the old name**: `applyBranding()`'s title logic and `startSetup()`'s "is the practice name still the placeholder" test. An install that never set a practice name holds the literal string `"Therapy Tracker"`, and without these it would read as a real name and be prefilled into setup.

Renamed: the `<title>`, header, `--appname` tab-rail label, `practiceName()` fallback, manifest `name`/`short_name`, service-worker offline message, terms/privacy, export filenames (`groundwork-*`), and the `app:` marker in backup envelopes (informational only - nothing reads it, and older files say `TherapyTracker`).

### Brand colours - the default palette IS the brand
`:root` (and its `[data-theme="dark"]` pair) is the **sage/GroundWork** scheme; there is no `[data-palette="sage"]` block because sage is the built-in default. Its values are taken from the artwork: `--brand:#5C7A6D` and `--brand-dark:#3C4F44` are the launch screen's mark and wordmark colours, and `--bg:#F5F8F5` is the launch screen's own top colour so the splash fades into the app rather than stepping to a different white.
- These had drifted **teal** (`#0C9683`) in the glassmorphic pass, which left the Sage swatch in Settings promising a green the app never rendered. Anything that names a brand colour must be changed here **and** in the artwork together.
- `--gs1` is deliberately the brand green, a shade darker than the icon's own top stop (`#6A8B7C`): the header title is 18px/700, just under the WCAG large-text threshold, and white on `#6A8B7C` is only 3.75:1. Check contrast before touching the header gradient.
- `icon-180/192/512.png` are downscales of `icon-ideas/groundwork/icon-1024.png`. Regenerate them from that source (PowerShell + `System.Drawing`, HighQualityBicubic) rather than editing them individually, and bump the SW cache - icons are served cache-first.

### Launch screen
`#splash` in `index.html` - inline SVG of the bars-and-leaf mark plus the wordmark, painted before any script runs so a cold start never flashes white. `splashHide()` is called right after the first `go("home")`, with `SPLASH_MIN` (1200ms) so a fast boot doesn't flicker and a **6s failsafe timer** that clears it even if init throws before `go()` ever runs.
- It also reappears on **resume** for `SPLASH_RESUME` (800ms) - `visibilitychange` for a backgrounded tab/PWA, `pageshow`+`persisted` for Safari's bfcache, which restores the page without re-running any of this.
- **`SPLASH_RESUME_AFTER` (2 min) is the guard that makes this bearable.** Without a minimum time away, flicking to another app to read a text and coming straight back re-splashes several times an hour. Tune this constant, not the handler.
- The node is **hidden, never removed** - it has to survive to be shown again. `.out` sets `visibility:hidden` as well as `opacity:0`, flipped at the end of the fade out but immediately on the way in; opacity alone would leave a full-screen layer over the app. Verified by hit-test, not just by eye.
- `splashShow()` restarts the rise animation with a forced reflow. Without it the animation has already run and the mark sits static, which reads as a stalled screen. Brand colours are hard-coded rather than palette tokens - this is the product's identity, not the therapist's chosen scheme - and are sampled from the delivered artwork in `icon-ideas/groundwork/`. Those 2732² PNGs are **not** used by the web app (2.4MB the SW would have to precache); they are the source for the native iOS launch screen - see `docs/groundwork-app-store-roadmap.md`.

## Canonical files
```
TherapyTracker-web/
  index.html          ← THE canonical app (all HTML, CSS, JS in one file)
  sw.js               ← Service worker (cache name must be bumped on every edit)
  manifest.webmanifest
  icon-180.png
  icon-192.png
  icon-512.png
```

**Do not edit** `CBT/Therapy Tracker.html` - that is an old diverged copy. Always edit `TherapyTracker-web/index.html`.

## Deployment
Hosted on GitHub Pages. Push to `main` → GitHub Actions deploys `TherapyTracker-web/` automatically.
Live URL: `https://<username>.github.io/<repo>/`

## Native iOS wrapper (Capacitor, added Aug 2026)

> **Pushing to GitHub updates the website, not the iPhone app.** The web app deploys to
> Pages on every push; the iOS app bundles a *copy* of it (`ios/App/App/public`, gitignored,
> rebuilt by `npm run sync`) that only changes when someone cuts a build. `npm run release`
> bumps the build number, syncs and tags; pushing that tag runs `.github/workflows/testflight.yml`.
> Full detail - including the App Store Connect secrets it needs - in **`docs/releasing.md`**.
> Capacitor 8 uses SwiftPM, so there is **no `.xcworkspace`**: build `ios/App/App.xcodeproj`,
> whose `App` scheme is checked in under `xcshareddata` precisely so CI can find it.

The iOS app is **this same `index.html`**, not a fork - `webDir` points at `TherapyTracker-web/`
itself and `ios/App/App/public/` is a gitignored copy rebuilt on every sync. Full detail in
**`docs/ios-native.md`**; the parts that constrain editing this file:

- **One guarded block at the end of `index.html` holds everything iOS-specific.** It returns
  immediately unless `Capacitor.isNativePlatform()`, so the PWA is byte-for-byte unaffected.
  It **wraps** `download()`, `printReceipt()` and `VIEWS.settings` rather than reimplementing
  them, which is what keeps the two builds in step - but it also means **renaming any of those
  silently breaks a native feature while the web app carries on working perfectly.**
  `npm run check` asserts every name it reaches for; run it before pushing a rename.
- **`receiptHTML()` was split out of `printReceipt()`** so the native side can render the same
  markup to a real PDF. Keep it returning `{html,num}` - the native layer names both.
- **`.webonly`** hides copy that only makes sense in a browser tab (currently the "Add to your
  Home Screen" line). Mark, don't delete.
- **Device-only settings are `tt_lock`, `tt_lock_grace`, `tt_notify` in localStorage, never in
  `S`** - `S` travels in backups, and restoring onto another phone must not change that phone's
  lock.
- **`sw.js` is skipped on native** (service workers do not register on Capacitor's scheme and the
  bundle is already local) and pruned from the copied app, along with `icon-ideas/`.
- **Two Swift files are wired by `scripts/add-native-plugin.mjs`**, not one:
  `GroundWorkNativePlugin.swift` (the `@objc` surface) and `GroundWorkRecordsFolder.swift` (the
  records folder's bookmark and file IO). Adding a third means adding it to that script's `FILES`
  list, and `npm run check` asserts both are in the Xcode target.

### The records folder (Sep 2026) - where the data actually lives on iOS
**The counsellor picks a folder, normally in iCloud Drive, and every save is rewritten into it.**
The same idea as GroundWork Notes, which has always kept records in a folder the counsellor owns;
the point is that there is nothing to remember. Settings › This iPhone › *Where your records are
saved*. Native half is `ios/App/App/GroundWorkRecordsFolder.swift` (document picker +
security-scoped bookmark + coordinated IO); full detail in **`docs/ios-native.md` § The records
folder**.

- **It is NOT a rewrite of the store and NOT sync.** `S` is still one object read synchronously
  from IndexedDB on every render; the folder holds the durable copy. Export/Restore are untouched
  and are still how records move between devices - "Multi-tab / multi-device writes" below is
  unchanged.
- **The folder is never overwritten blind, and WHO wrote it is recorded, never inferred.**
  `checkFolder()` reads `.GroundWork-writer.json` - a hidden marker beside the records naming the
  device that last wrote them (`tt_folder_device`). Its own id is never a conflict however the
  dates have drifted; a different id always is. A marker is written **after** the records, never
  before: one claiming this device over somebody else's records is what would let the next save
  overwrite them. A conflict pauses folder writes (`_folderHeld`) and asks which copy wins;
  IndexedDB saving carries on regardless, so "Decide later" loses nothing.
  - **This replaced a modification-date comparison, which was wrong twice over** and asked "two
    copies of your records?" on every launch of a phone that was the only writer (Sep 2026).
    **iCloud restamps** a file when it uploads, so the date read back is not the date written; and
    **the WebView is suspended on backgrounding** - `flushAutoBackup()` fires, the native write
    lands on its own queue, and iOS suspends JS before the continuation that records the write can
    run. Both leave a date this device cannot account for. Don't reintroduce an mtime test; the
    marker is the answer and the mtime is only ever wording for the sheet.
  - **No marker + this device has written here before = adopt it and stamp one.** That is the
    one-time migration for folders written before markers existed, and it is why the fix does not
    ask everybody once more. A folder this device has *never* written to still asks - that is the
    new-phone case, which is the whole point.
- **A failed folder write falls back to the Documents copy.** `retireDeviceCopy()` runs only after
  a folder write has landed, and `tt_autobk_retired` is cleared the moment one fails. A save that
  cannot reach the folder must never be a save with no copy at all.
- **`markBackedUp()` is called only when the folder is in iCloud Drive** (`RecordsFolder.isInICloud`,
  which answers no whenever it cannot tell). That is the one change to the manual-backup nag, and
  the whole point of the feature. A folder under "On My iPhone" is not off this phone, so the
  reminder stays on and the card says why.
- **Reading back goes through `importFromText()`** - `importJSON()` minus the file input, split out
  for exactly this. Same passphrase prompt, same `validateImport`, same two tiers of
  `restoreConfirm`. Never add a shortcut past it.
- The offer to pick a folder is made **once** (`tt_folder_asked`), 5s after launch, to somebody
  with 3+ sessions - deliberately not a setup-wizard step.
- **`npm run test:folder`** (`scripts/check-records-folder.mjs`) drives all of it in a real browser
  with a fake Capacitor, 36 assertions including the conflict → restore → resume path, all
  three marker cases, and (Sep 2026) the calendar-file routing that shares its fake phone. Needs
  `npm i --no-save playwright`. **The Swift has never been compiled** - same caveat as the watch
  app; `npm run check` asserts the two halves still name the same methods.

### Automatic backups on the phone (Aug 2026) - the fallback since Sep 2026
What an iPhone with **no records folder chosen** gets, and what comes back if the chosen folder
stops answering. Desktop Chrome/Edge auto-saves an encrypted backup silently through the File
System Access API; that API does not exist on iOS, so behind the native guard **every `commit()`
also writes a copy into the app's Documents folder**, 2s debounced:
- `backupPayload()` (near `exportJSON`) is now the **single** backup envelope - `exportJSON`,
  `encPayload` and the native auto-backup all build their file from it. Adding a field in one
  place is the whole point; don't reintroduce a second literal.
- **`encReady()` decides per write.** Passphrase set → `encPayload()` → `GroundWork
  auto-backup.enc.json`; otherwise the plain payload → `GroundWork auto-backup.json`. A change of
  mode deletes the superseded *live* file, or yesterday's readable copy would sit in Files
  forever. The dated copies are deliberately left - they are restore points that cannot be
  re-encrypted, and they age out within a week anyway.
- **Rotation**: at most once a day (`tt_autobk_day`) a dated copy goes to
  `auto-backups/GroundWork YYYY-MM-DD.json`, pruned to the newest 7. Daily, not per-save - seven
  copies from one afternoon are seven copies of the same afternoon.
- **It never toasts and never blocks.** `nativeAutoBackup()` returns a boolean and logs; only the
  Settings › This iPhone › "Back up now" button speaks. The `commit` wrap passes the original's
  `true`/`false` straight back, so a failed IndexedDB write still raises `#saveBanner` and a
  failed backup can neither block nor mask it. Last outcome is in `tt_autobk_status`.
- **`flushAutoBackup()` runs on backgrounding.** iOS suspends the WebView, and a pending 2s timer
  suspends with it - logging a session then putting the phone straight down is exactly the case
  this exists for.
- **`markBackedUp()` is deliberately untouched by this path.** A copy on the same phone is no
  protection for someone with iCloud Backup off, so the manual-export nag is unchanged; the banner
  detail line only appends "(an automatic copy is kept on this iPhone)". A *records folder in
  iCloud Drive* is the only thing that answers that nag.
- `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in `Info.plist` are what make that
  folder visible in the Files app. Without them the files exist but nobody can reach them.

### The watchOS app (Sep 2026) - a timer, and nothing else
`ios/App/GroundWorkWatch/` is a SwiftUI watch app embedded in the iPhone app. It times a
session and taps the wrist at ten minutes left and at time. **It is the first code here that
is not the web app**, which is only tolerable because it owns no logic and no data - no
`derive()`, no `S`, no client anything. Two integers and a date. Nothing syncs in either
direction; stage 2 is sketched in `docs/watchos-companion-ideas.md`, mechanics in
`docs/ios-native.md` § The watch app.
- **The end date is the state; nothing counts down.** watchOS suspends the app the moment the
  wrist drops, so every figure derives from `Date()` against `endsAt`, and the digits are drawn
  by `Text(timerInterval:)` / `ProgressView(timerInterval:)`, which keep counting unaided. A
  decrementing counter would stop with the app and look fine doing it.
- **The taps are local notifications, scheduled at Start.** A `Timer` in a suspended app does
  not fire and the tap *is* the feature. The `Timer`s that do exist only flip the screen from
  counting down to counting up, and are allowed to be late - `refresh()` recomputes from the
  dates on wake.
- **`AppDelegate` exists only to present a notification while the app is frontmost**, which
  watchOS otherwise suppresses - without it the one person who gets no tap is the one looking
  at the timer. It plays the haptic itself and returns `[.banner]`, never `[.sound]`, so there
  is no second tap to collide with.
- **The session length lives in the watch's own `UserDefaults`, not in `S`.** A
  `settings.sessionMins` on the phone was considered and dropped: with no sync it would be a
  setting that changes nothing. It becomes the phone's to own when the phone can push.
- **`scripts/add-watch-target.mjs` wires the target**, idempotently, from `npm run sync` - same
  reason as `add-native-plugin.mjs`. `npm run check` asserts the target, all four Swift files
  being compiled, the embed phase, the build dependency, and that the watch's
  `WKCompanionAppBundleIdentifier` still matches `capacitor.config.json`'s `appId`.
- **`CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` are literal in the watch target's build
  settings**, because `release-ios.mjs` bumps them by regex and a watch build number that has
  drifted from its host is rejected at upload.
- Accent is `#5C7A6D` - the header's darker sage, not the icon's `#6A8B7C`, because the Start
  button is white text on it. Same contrast rule as the header gradient.
- **None of it has been compiled** - written without Xcode. See the checklist at the end of
  `docs/ios-native.md` § The watch app.

### Mobile chrome: floating bar, grouped rows, iOS-weight switches (Aug 2026)
A deliberate step toward the way a native app looks, taken in the **shared** CSS rather than behind
the native guard - these read as "modern mobile app", not specifically iPhone, so the Android and
desktop builds keep looking deliberate. Three things, and the traps in each:
- **`nav.tabs` is a floating capsule**, inset from the edges. The safe-area inset became the bar's
  *distance from the bottom* (`bottom:max(10px, env(safe-area-inset-bottom))`), not padding inside
  it - adding to the inset floats it so high a band of content shows underneath. `main`'s
  bottom padding (108px) and `.fab`'s offset both clear it. **The desktop block at `min-width:900px`
  turns this back into a full-height sidebar and must keep undoing `border-radius` and `box-shadow`**
  - anything new added to the base rule has to be reset there too.
- **The active tab is a soft tint, not the filled gradient pill.** A pill inside a capsule reads as
  a button inside a button. Pure colour alone was too close to `--muted` to see at a glance on a real
  screen, hence the 16% sage wash behind it. Desktop overrides this with its own white tint.
- **`.ftrow` is a grouped list**, not one box per row: hairline separators inset to where the text
  starts, with only the ends of a run rounded. It uses **`:has()`, not `:last-child`** - the setup
  wizard puts an `.ovnote` straight after the last row, so the run does not always end its container.
- **`.sw` is 51×31 with a 27px knob**, iOS's size and a bigger tap target than the 48×28 it was. The
  knob overshoots slightly on the way across; a linear slide is what makes a copied switch feel copied.

Not done, and deliberately: **large-title navigation.** It would retire the sage gradient header that
carries the brand on every screen, and it is the change that makes the web builds look like they are
pretending to be an iPhone. See the design comparison referenced in `docs/ios-native.md`.

### Two CSS traps this file has now hit more than once
- **A later single-class rule beats `.card`, and `.plusgate` did exactly that** (Sep 2026). `.plusgate{padding:4px 2px 2px}` is right for a paid *surface* dropped inside a sheet that already has padding, but on a `.card` it outranked `.card{padding:18px}` on source order alone - so every gate card had **two pixels** of side padding and its full-width CTA sat hard on the gold ring, reading as a second outline on the button rather than as a frame around it. `.card.plusgate{padding:20px 18px 18px}` puts it back; the ring is `::before`/`::after` at `left:0;right:0` and is unaffected.
- **`input:not([type=checkbox]):not([type=radio]){width:100%}` outranks a plain `.cxrow input`**, so a rule asking for a fixed-width number box never applies and you get a 100%-wide flex item squeezed to whatever is left. That is how the cancellation policy's two boxes came to be 41px wide with the digits clipped inside them. Write the override **in the base selector's shape** - `.cxrow input:not([type=checkbox]):not([type=radio])` - which is the same fix, for the same reason, as the date/time block below. **Measure the computed width; do not eyeball it.**

### WebKit is not Blink - check form controls on a phone
Two layout bugs looked perfect in Chrome and broke on iOS, both fixed here, both improving the
PWA as well. Don't regress either:
- **Checkboxes and radios are excluded from the bare `input` selector.** They were picking up
  `width:100%` and 14px of padding, making a ~160px flex item that pushed its own label off the
  screen edge in a setup step.
- **`.field2>*` and the controls carry `min-width:0`.** Grid items default to `min-width:auto`,
  and WebKit's intrinsic minimum for `input[type=date]`/`[type=time]` is far larger than Blink's,
  so the Time column ran off the right edge in the session form.
- **Date and time inputs carry `appearance:none`, and that line is load-bearing** (Sep 2026). While they keep their native appearance, iOS WebKit sizes them from their own content and adds the padding and border on **top** of the author `width` - `box-sizing:border-box` is ignored for them - so a 177px column held a 199px control, the Time field sat over the Date field's right edge and ran off the screen, and Chrome honoured the width throughout and looked perfect. Turning the appearance off makes them ordinary boxes; `min-height` puts back the height WebKit used to supply. **Measure the computed width, don't eyeball it**: the previous `padding-left:10px` override here had never applied at all, losing on specificity to the base `input:not([type=checkbox]):not([type=radio])` rule, which is why this block is now written in that selector's shape.
- **A date beside a time splits 1.5:1, not evenly** - `.field2:has(input[type=time])`, stacking below ~348px. "15:29" never needed half the row, and an even split made the Time box read as a mistake.
- **`.field2` is `repeat(auto-fit,minmax(150px,1fr))`, not `1fr 1fr`** (Sep 2026). `min-width:0`
  stops a date field overflowing its column but cannot stop it being *squeezed* - two of them
  plus the gap do not fit on a 320px phone, and the digits end up under the picker glyph. Below
  that width the pair now stacks. `input[type=date]`/`[type=time]` also carry trimmed side
  padding (10px, not 14px), because those controls are drawn by the platform and size themselves
  from their own text.
- **`.sheet-inner` uses `overflow-y:auto; overflow-x:hidden`, never the `overflow:auto`
  shorthand.** The shorthand gives the sheet a horizontal scroll axis, and a single over-wide
  child then lets the whole form be dragged left and right under the thumb - it reads as the
  sheet wobbling while you type. Content that genuinely has to scroll sideways (`.rawscroll`,
  `.svgwrap`, `.hmgrid`) carries its own scroller and is unaffected.

## Service worker cache strategy
`sw.js` uses **network-first for HTML** (`req.mode === "navigate"`) - every page load fetches a fresh `index.html` from the network, so updates land on next open without needing a cache bump.

Static assets (icons, manifest) use cache-first, so the cache name constant (`C`, currently **`"tt-v7"`**) must be bumped whenever one of them **changes as well as** when one is renamed or removed - an installed device otherwise keeps the old copy indefinitely. The GroundWork rename needed it twice: once for `manifest.webmanifest` (or the Home Screen keeps saying "Therapy Tracker") and again for the redrawn icons.

Two rules the fetch handler depends on - don't regress them:
- **`SHELL` (`./` + `index.html`) is precached at install.** The SW does not intercept the navigation that registers it, so without this a first-time visitor who goes offline before their second visit gets nothing at all.
- **Only `resp.ok && status === 200` is ever cached** (`cacheable()`). A 404/502 served during a deploy window would otherwise become the permanent offline copy. A non-ok navigation response also falls back to the cached shell rather than showing the error page.

## State / data model
Global `S` object - persisted to IndexedDB (`TherapyTrackerDB`) with a localStorage mirror.

```js
S = {
  clients: [],          // each has _id; usualDay/usualTime override the derived slot;
                        //   payer/payerId/authorised say who pays for their work (v11)
  rooms: [],            // {location, rate, due, billing:"session"|"monthly", pay:{freq,day}}
  sessions: [],         // therapy sessions
  supervision: [],      // clinical supervision (counts toward the 1:6 ratio)
  peerSupervision: [],  // peer supervision (total hours only, never the ratio - added Aug 2026)
  cpd: [],              // CPD that is not supervision (v8) - {date, hours, kind, title, provider, notes}
  rateHistory: [],      // therapist fee history
  roomRateHistory: [],  // per-room per-session rate history
  roomRentHistory: [],  // per-room rent history - {location,effectiveFrom,amount,freq?,endDate?} (v9)
  expenses: [],         // {desc, amount, date, recurrence (see FREQS), endDate, category}
  otherIncome: [],      // as expenses + scope:"practice"|"personal"
  paidCharges: {},      // "kind:ref|dueDate" -> date settled. Reminders only, never the tax figures
  clientCategories: [], // {status, category} mapping
  game: {               // gamification (added June 2026)
    activeWeeks: [],    // ISO week strings for streak tracking
    records: { longestStreak, mostClearedAtOnce, biggestCatchup },
    seenStreak: 0
  },
  settings: {           // practice branding + feature switches (added Aug 2026)
    practiceName, practiceTagline,
    reports: {},        // {saved:[spec], defaultId} — Practice › Reports (v9)
    palette,            // key into PALETTES: sage|ocean|plum|clay|indigo|slate
    features: {},       // key → false to disable; absent/true = on
    retention: {},      // {notesYears:6, financeYears:6, endedStatuses:[]} - review flags only
    cpdTarget,          // annual CPD hours target (default 30)
    cpdCountSupervision,// does clinical supervision count toward cpdTarget? (v8, default true)
    cpdCountPeer,       // ditto peer supervision (v8, default true)
    defaultPayer,       // what a NEW client starts as: "client"|"mixed"|"none" (v11)
    payers: [],         // organisations that pay - {_id,name,contact,invoiceDays,defaultRate,notes} (v11)
    employmentYears:{}, // tax year → {pay} before tax, carried forward (v11)
    studentLoanYears:{},// tax year → plan key, carried forward (v6)
    taxRegionYears: {}, // tax year → "rUK"|"scotland", carried forward (v6)
    taxYears: {},       // tax year → what HMRC actually assessed / set / a claim to reduce (v6)
    taxPaid: {},        // due date ISO → {date,amount} paid, or {unpaid:true} (v6)
    taxPot: {},         // {bufferPct, balance, balanceAt} (v6)
    taxMoments: {},     // seasonal-prompt id → date dismissed - see taxMoments()
    coach: {},          // {seen:[tip keys], off} - first-visit tips (v6)
    homeOrder: [],      // HOME_CARDS keys, the reader's own order (absent = the default)
    homePins: [],       // ANA_CARDS keys pinned to Home, max ANA_PIN_MAX (absent = none)
    start: {},          // Getting started: records "imported"|"restored"|"fresh", recordsLater (a job
                        //   outstanding, NOT an answer), homeOnly, dismissed (Sep 2026)
    cancelRulesChosen,  // true once the cancellation policy has been touched at all - see cancelChosen()
    onboarded, onboardedAt, setupRuns
  }
}
```

Key functions:
- `commit(summary)` - save to IndexedDB + audit log + snapshot (up to 120 snapshots). Also calls `gameTouch()`. **Returns `true`/`false`** - false means the write failed and the red `#saveBanner` is now showing.
- `undo()` - reverts to previous snapshot (reads the last two via `snapRecent(2)`).
- `normalize(st)` - seeds missing fields / defaults; called on load. Also runs ordered migrations and stamps `meta.schemaVersion`.
- `loadState()` - initialises DB, loads or seeds state into `S`.
- `mirror(S)` - writes S to localStorage as a safety net. **Returns false** if the write failed (quota / private mode).

### Durability rules (added Aug 2026 - do not regress)
- **Never load every snapshot.** Use `snapCount()`, `snapRecent(n)` and `snapOldestIds(n)` (all cursor-based). The old `snapAll()` getAll in `commit()`'s prune step cost **1,088 ms** per save at the 120-snapshot cap on a 1,145-session dataset; `snapPrune()` does it in ~11 ms.
- **Never swallow a save error.** `commit()` calls `noteSaveFailure()` on failure, which raises `#saveBanner` and corrects the caller's "Saved" toast on the next tick. `clearSaveFailure()` runs on the next successful save.
- **`requestPersistence()`** runs at init (`navigator.storage.persist()`). Without a grant, iOS Safari evicts this app's storage after ~7 days of no visits. Status is shown in Settings › Storage on this device; `denied` is normal until the app is added to the Home Screen. **That card is `.webonly`** (Sep 2026): it talks about a browser clearing the app's data and tells the reader to add it to the Home Screen, neither of which means anything in the native iOS app, which has its own durability story - the records folder and the Documents auto-backups. Everything the card says stays true for the PWA; it is suppressed on native by the existing `[data-native] .webonly` rule, not deleted.
- **`exportJSON()` must work with `_db === null`** - the crash screen is the only way out of a broken render and it offers Export.
- **`tyNet()` and `tyIncome()` are memoised** (`tyMemo`, cleared in `go()`, `commit()` and `normalize()`). Each walks every session and runs `ledgerBetween` twice; the Payments screen asks for several years at once and each year's schedule reaches into the year either side, so uncached the call count grows quadratically with history. Anything that mutates `S` outside those three entry points must call `tyMemoClear()`.

### Schema versioning
`SCHEMA_VERSION` (currently `11`) is stamped on `S.meta.schemaVersion` and on every backup envelope. Unstamped data is treated as v1.
- **v11 (Sep 2026)** records **who pays** for a client's work (`client.payer`, `payerId`, `authorised`, plus `settings.payers` and `settings.defaultPayer`) and **pay from a job** (`settings.employmentYears`). Nothing migrates: absent means "the client pays me", which is what every record written before it meant. The bump is for the other direction and it matters twice. A v10 build has no payer field, so every salaried or placement session in a v11 backup turns back into a debt - back on the Unpaid worklist, back on its badge, back in the attention feed, with a Chase button over clients who were never billed. And a v10 build has no employment figure, so it puts the personal allowance and the whole basic-rate band back onto practice profit alone and shows a tax estimate thousands of pounds light - then saves both losses back. See **Who pays for the work** below.
- **v10 (Sep 2026)** added `settings.reports` - the reports a therapist has built and saved, and which one is their default. A v10 backup can hold "CPCAB client log, everything so far, these nine sections, counted as one clinical hour each"; a v9 build has no such field, so it would drop every saved report and save that loss back. **Only the definitions are stored** - the figures are always rebuilt from the sessions, so an older build loses the saved report, never the data behind it.
- **v9 (Sep 2026)** gave a room-rent step its own **rhythm** (`freq`) and its own **end date** (`endDate`) - "£150 every week from 1 June until 31 August" rather than "£150, monthly, for ever". Both are optional and their absence means what it always meant, so nothing migrates in place. The bump is for the other direction and it matters twice: a v8 build reading a weekly rent charges it 12 times a year instead of 52, and goes on charging a rent that ended two years ago - then saves both wrong figures back. See **Room rent** below.
- **v8 (Sep 2026)** added `S.cpd` - CPD that is not supervision - and `settings.cpdCountSupervision` / `cpdCountPeer`. A v8 backup can hold twenty hours of workshops plus "supervision doesn't count for me"; a v7 build has neither field, so it would drop every one of those hours, put supervision back into the total, and save both losses back.- **v7 (Sep 2026)** split the old free-text "Notes done?" box into a boolean tick and a separate `adminNote`. A v7 backup can hold "invoice goes to her employer" in `adminNote`; a v6 build has no such field and would drop every one of those comments, then save the loss back. See **Notes vs admin comments** below.
- **v6 (Aug 2026)** dated the whole-practice tax settings to a tax year (`studentLoanYears`, `taxRegionYears`) and added the record of what HMRC actually assessed (`taxYears`), what has been paid (`taxPaid`) and the pot's own settings (`taxPot`). A v6 backup can say "Plan 2 until 2025-26, none after" and "HMRC assessed 2025-26 at £4,310"; a v5 build has neither field, so it would apply one loan plan to every year and show its own estimate in place of the real assessment.
- **v5 (Aug 2026)** stamped a cancellation charge percentage on every missed session and added `settings.cancelRules` + `settings.reveal`. A v5 backup can hold a session charged at 50%; a v4 build has no such field and would bill it in full.
- **v4 (Aug 2026)** gave every cost and income row a category *key* mapping to an SA103 box, migrated from the old free-text label (which is kept). Added `settings.taxBasis`, `useOfHome`, `taxRegion`, `studentLoan`, `class2Voluntary`.
- **v3 (Aug 2026)** added expenses, other income, peer supervision and monthly room rent. No in-place migration: every new field's absence means exactly what it meant in v2. The bump exists for the other direction - a v3 backup carries money a v2 build cannot see, so restoring it there would drop those rows and save the loss back.
- Bump it when a change would be **misread** by an older build, and add the matching step to the ordered migration block in `normalize()`.
- `validateImport()` **refuses** a backup whose version is newer than the running app - importing would silently drop unknown fields and then save that loss back over good data.
- `normalize()` never downgrades newer data in place.

### Who pays for the work (v11, Sep 2026) - the sole-trader assumption, lifted
GroundWork was built for one practitioner selling sessions to the people in front of her, and the
assumption ran the whole length of the money chain: `effRate` → `derive().rate` → `s.paidDate` →
`tyNet` → `ukTax`. Plenty of counselling work is not like that - salaried at a charity or a
service, on placement, or EAP and insurer clients an organisation pays for - and **the commonest UK
career shape is two of those at once**, a salaried post with a private caseload beside it. Analysis
and the staged plan this implements: `docs/practitioner-models-2026-09.md`.

- **It is a fact about a CLIENT, never a practice-wide mode.** `client.payer` is keyed - `client` /
  `org` / `none`, `PAYERS` holds the display text - and **absent means `client`**, which is what
  every record written before this meant, so nothing migrates and no existing figure moves. An
  unrecognised stored key falls back the same way, like `CPD_KINDS`. A practice-wide switch cannot
  say "these six are the charity's and these four are mine", and it would put a third axis beside
  `feat()` and `plusLocked()` answering nearly the same question.
- **`sessionEarns(s)` is THE choke point** - "does this session raise money somebody has to
  collect?" - and `derive()` reads it into `d.earns`, which gates `d.overdue`. That one line is the
  whole of the worst bug this fixed: four readers used to add their own `rate > 0` test and **two
  forgot**, so a practitioner who charges nothing carried a permanent red badge on Sessions
  counting every session she had ever logged, over a button offering to chase her clients for the
  money. The four surviving `rate > 0` guards are now redundant and are deliberately **kept** -
  they still answer the different question of a genuinely free session for a client who does pay.
- **The clinical half must never read it.** Who funds the work does not touch `derive().complete`,
  the Incomplete worklist, attendance, hours, supervision, the ratio or a report's figures. That is
  the room-fee lesson from Sep 2026 one level up, and `npm run test:payer` asserts a salaried
  caseload still produces its clinical hours and still chases its own write-ups.
- **`anyPayingClient()`** answers the practice-wide version, for screens that have to decide
  whether to exist at all. A practice with no clients yet has not said it charges nothing, so the
  default is yes.
- **A money analytic needs money, not sessions.** `anaHourlyRate` and `anaFloor` gated on a session
  count, so a salaried caseload sailed past ten sessions and was told its effective hourly rate was
  **£0.00** under a heading explaining this is the figure to compare against an employed salary.
  Both now also count revenue-bearing rows (`anaEarning`, and `m.earn` on `anaMonthlySeries`), and
  where nobody pays at all the **Money section of Trends** is replaced by one sentence rather than
  seven cards each explaining what they are waiting for. `anaMonthlySeries`'s `revenue`/`full` count
  only earning sessions; `n` and `attended` deliberately still count every session, because "how
  busy was this month" is a question a salaried caseload has a real answer to.
- **Setup asks once, before Choose what you need.** `stepPaid` - my clients pay me / some of it is
  paid another way / I'm salaried or on placement - sets `settings.defaultPayer` for **new clients
  only** and, on a genuinely fresh install, switches `tax` and `finances` off in its `onLeave` so
  the very next step shows the result and can overrule it. Same placement and same reason as
  `stepDepth`. It never rewrites existing clients: who pays for somebody's work is a fact about that
  arrangement, not something a setup screen bulk-edits. `REVEAL_STEPS`' tax step also now requires
  somebody to be paying.

**The organisation that pays.** `settings.payers[]` is a small list, and it lives on **Practice ›
Clients**, on that screen's own inner strip - *Clients* / *Clients' insurers*. A client names one
by **id**, so renaming an organisation never orphans a caseload.
- **It was beside Rooms first, and that was the wrong grouping.** The reasoning was "the external
  parties a practice deals with" - a room is a named outside party with a rate and a rhythm, an EAP
  is the same shape with the money running the other way. True, and beside the point: who pays for
  a client is a fact about the **client**, it is set on the client's own record, and Clients is the
  screen somebody is already on when they need it. Rooms is rooms again, under that name.
- **`renderClients` is a PANEL with a nested strip**, the same shape as `supervisionPanel()`.
  `clientsTab` is module-level for the reason `supTab` and `pracTab` are: saving a client
  re-renders Practice, and a choice held in a closure vanishes underneath the reader.
  **It is deliberately not in `SWIPE_BARS`** - one bar per screen answers the gesture and it is the
  screen's own, exactly as for Supervision's four. It is also not in `APP_MAP` (which lists tabs and
  segments, not nested strips), so `check-guidance.mjs` walks it **by name** alongside Supervision
  and Trends, or the `who-pays` dot inside it goes unchecked.
- **`drawOrgs(host)` takes its host** rather than reaching for a fixed id, which is what let the
  card move screens without the card caring. **The card renders with nothing in it, deliberately**:
  it was first gated on an organisation already existing, which is a chicken-and-egg - setup and
  the client form both send the reader here to add their *first* one, and the card that does it was
  the one thing not on the screen. A set-up surface that appears only once you have used it is not
  a set-up surface.
- **Every "add one first under…" pointer goes through `goPayers()`**, and is a LINK, not a sentence
  naming a screen. A pointer that cannot be followed is worse than none - the reader has to hold
  the path in their head and go looking, and when the screen moves the sentence silently becomes a
  lie (which is exactly what happened to "under Practice › Rooms"). `goPayers()` sets `clientsTab`
  **before** `go()`, because `renderClients` reads it as it draws. From the client form the link
  closes the sheet first, and the wording never implies the edit is kept.
- **`clientPayerOrg(c)` refuses to answer for a client whose payer is not `org`**, so a stale
  `payerId` left behind by a change of mind can never put an invoice back in front of somebody.
  Deleting an organisation unlinks its clients back to `client` rather than leaving a dead id.
- **The document reads the payer off the CLIENT, never a new argument.** `receiptHTML(c, rows,
  label, paidOnly)` still takes exactly four parameters - the native shell re-declares
  `printReceipt` with those four and a fifth would be dropped silently, so every invoice printed
  from an iPhone would come out addressed to the wrong party. `npm run test:payer` asserts the
  arity. An organisation's own `invoiceDays` beats the practice default, because "30 days" is
  usually their number.
- **`chaseText` writes a different message**, not the same one re-addressed: the person reading it
  at an EAP has never met anybody in the list, so it leads on the client *reference*.
- **Sessions › Unpaid groups by age OR by who owes it** (`unpaidBy`, module-level so a redraw does
  not throw the choice away). Age is right for private practice; it is wrong for an EAP caseload,
  where six clients' sessions arrive on one remittance and by age are scattered down the screen.
  The toggle only appears once some of the outstanding money is actually owed by an organisation.
- **`client.authorised`** is the block an EAP authorises, counted against sessions that **went
  ahead** - a DNA the funder will not pay for has not used one up. It lives on the client, not the
  organisation, because authorisation is per person.
- **`none` HIDES the fee box (`#c_rateWrap`), it does not reword it.** A greyed box with a changed
  placeholder is still a box asking to be filled in, and the one thing that answer means is that
  there is no fee to enter. The rate history on an existing client goes with it. **And the save
  path must not read the hidden control** - it holds whatever `defaultRate()` prefilled before the
  answer was given, so reading it would stamp a fee, and a `rateHistory` row, onto a client nobody
  pays for. Hiding a control and then saving what it still holds is the same failure the session
  form's `roomPaid` comment warns about, one form along. Nothing is deleted either way: switching
  back to a paying answer brings the block and its history straight back.

### Business finances (added Aug 2026 - one choke point)
`ledgerBetween(from, to, {toDate})` is the **only** place expenses, other income and monthly room rent are totalled. `tyNet()` adds its `total`; the tax-year table's Net column now prints `tx.netAll` (i.e. `tyNet`) rather than recomputing `billed - room - sup` inline, so the Net and Tax columns cannot drift apart. Anything new that reports money goes through it too.
- Recurring rows are **expanded at read time** (`moneyOccurrences`) - never generated into the data. Correcting an amount corrects every period it applies to. A monthly row repeats on its own day of the month, clamped in short months (31 Jan → 28 Feb → 31 Mar, no drift).
- `scope:"personal"` income (a second job, tutoring - a different trade) is totalled separately as `personalIncome` and deliberately **excluded** from `total`, so it never inflates the practice's Self Assessment figure.
- Monthly rooms: switching a room to monthly pushes a `roomRateHistory` step of `0` **and** a `roomRentHistory` step, both dated. `derive()` and `effRoomRate()` are untouched - past sessions keep their historical per-session charge and new ones stop charging per session by themselves. `room.billing` only drives the UI.

### Payment schedules & what's been paid (added Aug 2026)
`FREQS` is the one vocabulary for repeats (once / weekly / fortnightly / monthly / quarterly / annually), and `freqStep(anchor,freq,n)` is the only place the maths lives - used by both `moneyOccurrences()` and `schedNext()`.
- **A schedule never moves an accrual date.** `roomRentOccurrences()` anchors each charge to the rent history's own day and attaches the payment date separately as `due`. Letting `room.pay` drive the accrual date silently shifted historical rent between tax years - don't reintroduce it. The one thing that legitimately re-anchors is a change of **rhythm** - see **Room rent** below.
- `roomSchedule(rm)` reads the legacy `due` field (`EOM` → monthly/last, `EOW` → weekly/Sunday) when `pay` is absent, so old rooms keep working. `roomForm` writes both.
- `S.paidCharges` is a tick-list, **not accounting**: `ledgerBetween()` ignores it entirely, because a cost belongs to the year it fell due whether or not it's been settled.
- Paid rows stay in the list for a fortnight **after being ticked** (not after falling due), or settling an old overdue charge would make the row vanish mid-tap with no undo.

### Room rent: a rhythm, a date range, and outside the gate (reworked Sep 2026)
A rent step is `{location, effectiveFrom, amount, freq?, endDate?}` - the last two added in v9. It
was previously an amount and a start date, always read as monthly and never ending, while a
*separate* "when do you pay for this room?" picker on the room claimed a frequency the charge
itself ignored. A £500 rent paid weekly therefore said "£500 / month" beside "every Monday" and
billed £500 a month; and there was no way to say a tenancy had ended short of setting the rent to
zero. The three answers are now one arrangement:

- **`freq` lives on the STEP, not on the room**, because it is dated history exactly like the
  amount. Going from monthly to weekly must not rewrite the months already accrued at the old
  rhythm, for the same reason a rise from £450 to £500 does not rewrite them. `rentFreqOf()`
  reads it (absent = monthly, which is every step ever written before v9) and `rentFreqSet()`
  answers the different question of whether anybody actually *chose* one.
- **`roomRentOccurrences()` is one timeline per room, split into regimes by frequency change.**
  An **amount** change dated mid-cycle corrects the money and never moves the day a charge lands
  on - that is the tax-year rule above. A **rhythm** change is the one thing that re-anchors:
  "£150 a week from 1 June" cannot be paid on the old monthly day, so each frequency runs from the
  step that introduced it. Legacy data has exactly one regime - monthly, from the first step -
  which is precisely what the old month-by-month loop did, and `npm run test:rent` asserts it.
- **`rentSyncSchedule()` is the only writer of `room.pay` for a room on a rent**, and the rent
  form is the only caller. A step whose rhythm was chosen is **due on the day it is charged**; a
  legacy step still reads the room's own schedule, so nobody's existing reminder dates move.
  The room form therefore renders no payment picker for a rent room, and `roomForm`'s save
  deliberately does not read one - the same rule that stopped the session form writing `roomPaid`.
- **`endDate` is enforced in `rentAmountOn()`**, which every read goes through (`effRoomRent`,
  `rentSummary`, the occurrence loop). A rent that has ended is not a rent of £0 - but it charges
  the same, and one place knows the difference.
- **Never seed a rent at `RATE_EPOCH`.** The setup wizard did, copying what it does for a
  per-session rate, where the epoch is a *floor* that makes a fee resolve for sessions logged
  before the app existed. A rent is not a price, it is a charge on a rhythm: dated at the epoch it
  bills every month back to the year 2000 and puts thousands of pounds of imaginary cost into
  every past tax year. It starts at the top of the current month, and the room screen is where a
  real start date is set.
- **What a room costs is OUTSIDE the Pro gate and outside `feat("finances")`** - `roomRentCard()`
  renders beside `roomFeesCard()`, before the lock, on Money › Costs & income. Being able to set a
  room up for free and then unable to see, tick off or chase what it owes was worse than not
  having the feature: the app knew money was owed to a landlord and would not say so. `Payments
  due` (gated) now deliberately excludes `kind:"rent"`, and both cards read the same
  `dueListRows()` window and `chargeRow()` renderer so they can never disagree about what is
  overdue.
- **`npm run test:rent`** (`scripts/check-room-rent.mjs`) is 43 assertions in a real browser: the
  legacy shape, the anchor rule, every rhythm, the end date, the ledger totals, the form writing
  what it showed, and the card rendering with tickable rows while the ledger beside it is locked.
  Expectations are derived from the rule - a tax year holds **53** weekly rents when it starts on
  the rent's own weekday, and the test computes that rather than assuming 52.

### Room fees: raised by the session, settled in Money (reworked Sep 2026)
A session in a room hired by the hour **raises a fee**, tagged to that session, the moment it is
logged. Nobody is asked to confirm it. Until Sep 2026 the only place that fee existed was a "Room
fee paid?" dropdown inside the session form, and leaving it blank left the session permanently
*incomplete* - a bookkeeping question inside a clinical worklist, on a session that could not be
"done" until the therapist had said whether she had paid her landlord for it.

- **`derive().complete` is the write-up tick plus the attendance answer, and nothing
  else** - `complete = notesDone(s) && attendConfirmed(s)`, and `missingReasons()` returns
  those two. Attendance joined it in Sep 2026 (it was notes only when room fees moved out);
  the bookkeeping question is what was removed and it stays out. `meta.attendConfirmBackfill`
  grandfathers in anything that counted as done under the old rule (notes ticked), once, and is
  gated so it can never re-stamp a session deliberately left unanswered - without it every
  already-done session in an existing practice would flip to incomplete the moment this build
  loads and flood the worklist. See **Attendance** below for how the answer is now written.
- **`derive().roomOwed`** is the liability: a per-session rate applies, and `roomPaid` is neither
  `"Y"` nor `"n/a"`. **Blank means "not settled yet"** - which is what `roomDue` always took it to
  mean. `roomDue` still splits that into `"Y"` (the room's own payment date has passed) and `"N"`
  (accrued, not yet due), so an unpaid fee from yesterday is not reported as late.
- **`roomPaid === "n/a"` now means "deliberately not owed"**, written from the settle screen for a
  fee the room never actually charged. The `roomnafee` validation warning was removed with it -
  it would flag the therapist's own decision back at her. Historical `"n/a"` rows, which the old
  form stamped where `roomPaidNA` was true, are excluded by `roomPaidNA` anyway.
- **The session form writes neither field.** `sync()` deliberately does not read them back; a form
  that read controls it no longer renders is exactly how a save would blank a settlement. A
  read-only line says what the session raised and where it stands, and links across.
- **`roomFeesCard()` / `wireRoomFees()` on Money › Costs & income** is the management surface,
  beside Payments due and the rest of the bills. Due now vs merely accrued, grouped by room, a
  fortnight of settled fees behind a fold with Undo on each. It renders **before, and outside,
  both `feat("finances")` and `plusLocked("finances")** - money already owed for sessions that
  happened is neither a preference nor a purchase. Money › Overview keeps a read-out that hands
  over to it (`go("money",{seg:"costs",focus:"roomFeesCard"})`), which is also where Home's prompt
  and the attention feed now land.
- `roomDueSheet(loc)` lists accrued fees as well as due ones (ticking only the due ones), and its
  two buttons - paid, and not owed - share one write path so the two cases cannot drift apart.
- **Storage is unchanged**: `roomPaid` / `roomPaidDate`, exactly what the bulk editor always wrote,
  so `derive()`, the SA103 boxes and the MTD quarters are untouched. It still uses the **dated**
  rate (`effRoomRate(loc, s.date)`), never the room's rate today: a room that charged £15 when the
  session happened still has that £15 to account for however it bills now.

`derive().roomPaidNA` is still the single answer to "is there a per-session room fee here at all?",
false only when there genuinely is one. Three cases make it true: no room record; the room is on a
monthly rent; or the room charged £0 per session **on that session's date** ("At home", or any room
in a practice that bills monthly). `anyPerUseRoom()` answers the practice-wide version and decides
whether the Room fees card appears at all.

### Attendance: always asked, never required (Sep 2026)
"Did it go ahead?" is on the session form for **every** session, future ones included, and leaving
it blank is a real answer-shaped hole rather than a silent "attended". It was previously a
three-way control (`"" attended | late | dna`) **hidden whenever the date was in the future**, and
`attendConfirmed` was stamped true by the mere act of saving a past-dated session - so the app
recorded an answer nobody had given, and a client ringing on Monday to call off Thursday had
nowhere to be recorded at all.

- **Four values now, and the blank is the point.** `attendVal(s)` returns `""` (not recorded yet),
  `"attended"`, `"late"` or `"dna"`; `attendAnswered(v)` is the three that count as an answer.
  **There is deliberately no `cancelKind:"attended"`** - every reader downstream (`isDNA`,
  `cancelTag`, `derive().cancelKind`) treats a truthy `cancelKind` as a *missed* session, so an
  attended session is a blank `cancelKind` plus `attendConfirmed`. Storage is unchanged: the two
  fields the form already wrote, carrying one extra distinction between them.
- **`m.attendConfirmed = attendAnswered(kind)`** in the form's `sync()`, straight from the control,
  never from the date. That is the whole change: the flag is the therapist's answer, not a
  side-effect of pressing Save.
- **`derive().ended` is the Incomplete worklist's clock, and it is NOT `past`.** `past` is a
  whole-**day** test and it is what money runs on - a payment is not overdue until the day of the
  session is out. `ended` (`sessionEnded()`, start plus `sessionMins()`) asks the same question to
  the minute, because "did it go ahead?" cannot be answered before it has. They differ only for
  sessions dated today, which is exactly the case somebody logging this morning's client falls
  into. A session with no time recorded has no minute to test and falls back to the day.
- **`incompleteRows()` is the one definition** - the worklist, the attention-feed count, the
  "anything left?" test after a catch-up and the Goals ring's completion half all read it, so they
  cannot disagree about what is outstanding. The ring's own link lands on that list.
- **The Incomplete worklist answers all three, and Notes done stopped answering attendance.**
  Ticking notes used to stamp `attendConfirmed` as well, which was defensible while blank *meant*
  attended and is not now: it would be the app answering on the therapist's behalf, on the one
  screen she is going through her sessions precisely to answer them. Each row renders controls
  only for the reasons it is actually missing, and attendance renders **three mutually exclusive
  chips - Attended / Late cancel / DNA** (`setAtt()`: choosing one clears the others, choosing the
  chosen one puts the row back to unanswered). A worklist that could only ever say "attended" is
  one a therapist has to leave for every missed session she has.
  - **A missed session states its charge on the row before it is saved.** This is the one control
    on the screen that moves money, and a fee written off in a bulk sweep with nothing on screen to
    say so is exactly the silent loss `settings.cancelRules` exists to prevent. The figure comes
    from `cancelPolicyPct(kind, cancelNoticeHrs(s))` - null notice on an unanswered session, so the
    policy's fallback, which is the same figure the session form's own box opens on.
  - **Saving only ever STAMPS `cancelCharge`, never overwrites one**, for the same reason
    `cancelPctFor()` reads the session and not the policy: a figure already there was put there
    deliberately. "Attended" does clear a cancellation - kind, flag, date and charge - because that
    is what choosing it in the form does, and an attended session carries no cancellation.
  - **Bulk is "All attended" and deliberately nothing else.** Sweeping a worklist into DNA is not
    something anybody means to do, and it would write off a fee on every row at once.
  - **The finer detail stays in the session form**, which the row opens by tapping the client's
    name: the date the session was called off, a charge other than the policy's, and the fee it
    works out to. The chips answer the question; they are not a second copy of that screen.
- **`validateSession` no longer warns about a late cancellation dated ahead** (the `lcfuture`
  warning became `dnafuture`). Cancelling a future session is now the intended flow, and warning
  about it would make it ask for a second confirmation. A **DNA** dated ahead is still flagged -
  nobody can have failed to turn up to a session that has not happened.
- **The spreadsheet importer still stamps `attendConfirmed:true` on every row** and should: the
  sheet's own late-cancellation column, or its absence, *is* the answer, and re-asking it per
  imported row would mean opening hundreds of sessions to confirm what the file already said.
- `npm run test:behaviour` drives all of it: the control rendering on a future session, a
  cancellation saved ahead of the date, a blank surviving a save, the `ended` clock recomputed from
  the rule on every session in four practices, and Notes done leaving attendance alone.

### Notes vs admin comments (v7, Sep 2026)
The session "Notes done?" box was one free-text field doing two unrelated jobs: a tick that the write-up was finished, and - for anyone who used it that way - a scratchpad. Now:
- **`s.notes` is still a STRING**, and is deliberately not a boolean. Every backup ever written holds a string there, `derive().complete` reads it, and `isLateCancel()` still matches the historical `"Y (late cancellation)"` convention in it. The form now only ever writes `"Y"` or `""`. **`notesDone(s)` is the one place that decides what counts as written up** - use it, don't re-test the string.
- **`s.adminNote`** is the free-text field, labelled in the UI as practical-only. It appears in the session list (`.adminline`, one line, CSS-truncated), is searchable, and is in both exports.
- **The migration is gated on `meta.adminNoteSplit`** and moves anything that was not simply `"Y"` across rather than dropping it. Order matters twice: it stamps `s.lateCancel` from `isLateCancel(s)` **before** the text moves, and it sits after `cancelChargeBackfill`, which calls `isLateCancel` itself. Moving it earlier silently un-cancels historical sessions.
- `anonymiseClients()` clears `adminNote` - it is free text a human wrote and may name people.
- The spreadsheet importer splits a sheet's "Notes" column the same way, and still reads the **raw** column for `impLateCancel`.

### CPD: composition, not a total (reworked Sep 2026)
`mountCPD()` is the card everyone sees: CPD hours over a rolling 12 months against
`settings.cpdTarget`. It lives on its own **CPD sub-tab** under Practice › Supervision
(Log / Peer / **CPD** / Insights) together with `cpdForm()`'s log.

- **`S.cpd` is CPD that is not supervision** - `CPD_KINDS` keys it (workshop, course, conference,
  webinar, e-learning, reading, podcast, personal therapy, reflective practice, other) so a stored
  entry keeps its meaning if the wording changes; an unknown key falls back to `other`.
- **Hours only - there is deliberately no `cost` field.** What a course cost is a business cost,
  `ledgerBetween` is the only place costs are totalled, and a second source here would be
  double-counted or missed, breaking the MTD-reconciles-to-`tyNet` invariant. `cpdForm` says so
  and links to Costs & income.
- **`cpdYearHours()` returns the composition**, not one number: `sup`/`peer` (hours that exist),
  `supCounted`/`peerCounted` (hours allowed into `total`), `own`, `byKind`, and the ordered `parts`
  list both the card and the Trends chart draw from. A bare total cannot answer the question in
  front of a renewal form - how much of this is supervision?
- **`cpdCountsSup()` / `cpdCountsPeer()` are the therapist's call, defaulting true**, which is what
  the app did before the question could be asked, so upgrading moves nobody's figure. Accrediting
  bodies genuinely differ. Set in `cpdSettingsSheet()`. Switching one off leaves every hour logged
  - it only takes them out of the target - and when the target is met *only* because supervision
  counts, the card says what the figure would be without it.
- **`anaCPD()`'s pace is built from exactly what the target counts.** Counting supervision into the
  pace while the therapist has excluded it from her target makes the two figures on one card answer
  different questions.
- CPD rows ride along in `exportSupervisionCSV()` - that export goes to the accreditation
  paperwork, and hours left out of it are hours that cannot be evidenced.

`mountAccreditation()` (Form 3A, the 1:6 ratio) is unchanged and stays on **Insights**, gated behind
the `accreditation` feature, which `normalize()` defaults **off for new installs and on for anyone
who already has data** - pulling it from someone mid-accreditation would lose them the screen they
keep records for. `stepCPD()` asks in setup.

### Charts
- **`.cbar` reveals itself with a keyframe animation, never with JS.** Every bar used to be
  written `style="transform:scaleY(0)"` and flipped back by a `requestAnimationFrame` in the
  **Trends** renderer - which meant the Revenue & net income chart on Money, drawn by a different
  function, painted every bar at zero height and showed nothing but the net line. An animation
  beats an inline style in the cascade, so it plays wherever a chart is drawn and no render site
  has to remember to reveal anything. `chartCombo` marks its bars `.still` when a selection is
  set, because a redraw from tapping a bar would otherwise replay the whole grow-in every time
  somebody opened a tooltip.
- **`moneyShort()` puts the sign outside the symbol** - a month that cost more than it earned
  reads `−£500`, not `£-500`.

### Scrolling rules
- **`go(tab,{focus:"cardId"})`** scrolls a named card into view and flashes it once. A prompt that says "room fees are due" and then lands the reader at the top of a long money screen has not taken them anywhere. `focusCard()` fires on rAF *and* on a timer, for the same reason `scrollChart()` does: rAF may never fire on a backgrounded tab, and a section can be drawn a beat after the view is attached.
- `go(tab,{keepScroll:true})` re-renders without throwing the reader to the top. Use it for anything redrawing the screen the user is already on (segment toggles, saving from a sheet); plain `go(tab)` is for real navigation.
- `scrollChart(wrap,keep)` positions a horizontally-scrolling chart. Charts are built **before their view is attached**, so it has no width at draw time - hence the rAF *and* the `setTimeout(...,0)`. Redraws pass the old `scrollLeft`, so tapping a bar no longer flings the chart back to the oldest period.

### Explanations behind an info icon
`infoDef(key,title,html)` registers a topic; **`infoLink(k,label)`** is the text link and **`infoDot(k,aria)`** the small circled *i*. `cardHead(title,key,right)` is a card heading with the dot already in it. Both resolve through the same `[data-info]` selector, so `wireInfo(host)` picks up either.

**The rule for choosing:** if the reader needs the sentence *every* time, leave it on screen. If they need it once and then never again, it goes behind a dot. That is what makes twenty analytics cards fit on a phone, and it is why Settings is now headings and controls rather than headings, controls and three paragraphs.

**A block that redraws itself must call `wireInfo` again** - `wireCancelRules`'s `draw()` replaces its own markup and would otherwise leave a dead dot behind. `VIEWS.settings` only wires once, at build. **A sheet or screen that gains its first info link needs a `wireInfo(host)` call** - the peer-supervision form and Tax › Per year both lacked one when links were added in Sep 2026. `npm run test:guidance` (`scripts/check-guidance.mjs`) walks every screen, segment, sub-tab and info-bearing form and fires every `[data-info]`, so an unregistered key or an unwired link is a failing test rather than a dead tap. Registered topics nobody links are dead code: `backup-restore-detail` was removed for that reason.

**Copy review, Sep 2026** (`docs/orientation-review-2026-09.md`): every on-screen paragraph over ~170 characters outside the info sheets was listed and either trimmed to one sentence with the reasoning moved behind a link, or kept deliberately (warnings, the backup step of setup, the removal flows). Two things the pass settled: raw storage codes never reach the screen (the session form printed a room's legacy `EOM` due code), and a screen label in copy must be the label on the tab today (`Clients › Rooms` had outlived the Practice tab by a month).

### Settings layout
Six collapsible `<details class="sgrp">` groups (**business / app** / data / records / help / about), plus **device** on native. Every card lives inside a group - don't add loose cards to the settings view.
- **`business` ("Your practice") and `app` ("App preferences") are a deliberate split** (Sep 2026), replacing a single `practice` group that mixed the two. A decision about the *business* - the practice name, the cancellation policy, the tax basis, the tax region - is made once, has consequences, and is nothing like choosing a colour scheme or switching a tab off. `go("settings",{openGroup:"business"})` opens one group on arrival; it is applied **after** the reset that folds everything away, or it would be wiped by it.
- **How your figures are counted** (cash vs accruals) moved here from Tax › Estimate: `basisCardHTML()` / `wireBasisCard(host,after)` live beside the tax engine, and Tax now only states which basis is in force with a link back. It is a business decision, not a view toggle to flick between while reading an estimate.
- **GroundWork Notes gets the one non-plain card on the screen** (`.card.companion`, Sep 2026). A whole second app was being pointed at from a card identical to the six around it. It carries the brand's own wash and a mark - deliberately **not** the gold gate treatment even though the sync is a Pro feature: gold means "this is being sold to you here", and the tap is what asks for payment (the tier tag lives on the button).
- **Data & backup separates the backup from the extracts.** "Backup & restore" holds only the `.json` export and Restore; the three CSVs sit in a second, collapsed "Spreadsheet exports" card that says in as many words that they are **not** backups and cannot be restored. The `backups-explained` info topic is the one place all three kinds (export / automatic / CSV) are compared, and it is linked from the backup card, the CSV card, the encrypted-backup card and the native automatic-backup card.
- **Everything starts collapsed on each fresh entry.** `_setGrpOpen` holds open state in memory only and `go()` clears it whenever Settings is entered without `keepScroll`. It must survive a `keepScroll` redraw - saving a setting re-renders the view, and without this the section being worked in folds shut underneath the user. Not persisted to localStorage: a section left open last week is not one you want reopened today.

## Tabs (restructured Aug 2026)
**Home · Sessions · Practice · Money · Tax.** `TAB_ALIAS` maps the old names (`clients`, `supervision`, `income`, `raw`) onto the new tab **and a segment**, so old deep links land somewhere meaningful; `go(tab,{seg})` sets it. A plain tab tap stays on whatever segment the reader last used.
- **Practice** - Clients / Rooms / Supervision / Business analytics / **Reports, last** (Sep 2026: the first three are places you go to *do* something, the last two are where you go to read and to produce something, so they stay together at the end rather than splitting the doing screens). The last two carry the `premium` segment class and put `.bizA` on the panel - they are the parts of Practice this practice pays extra for. `supervisionPanel()` and `rawPanel()` are panels, not views: they are mounted whole so their inner sub-tabs keep working. Supervision's own sub-tabs are Log / Peer / **CPD** / Insights.
- **Money** - Overview / Costs & income / Table.
- **Tax** - Now / Estimate / Pot & payments / Per year / Making Tax Digital (renamed from "Quarterly (MTD)", Sep 2026). **Now** is the default (`taxSeg`) and the only screen most of the year: the standing disclaimer, any live seasonal moments, then three numbers - on track to owe (`taxLiability`), keep in your pot (`taxPot`), next payment (`nextTaxPayment`) - each tapping through to the screen that owns its detail. It **summarises, never replaces**: the pot *summary* card moved off Estimate onto it, so **Estimate** now carries the take-home, the basis and the by-year table, while everything about paying - the buffer, the balance, every due date, and what HMRC actually assessed - still lives on **Pot & payments**, so no figure appears twice with two different explanations behind it. **Per year** is "things set per tax year" (renamed from "Allowances" in T6 - student loan and region aren't allowances): one year strip at the top governs every card below it (`taxYearStripStatus`), then student loan, then use of home. Region is *not* here - it moved to Settings.- The old `income` feature flag became `money` + `tax`; `normalize()` carries `income:false` across to both rather than switching a hidden tab back on.

### Swiping between sub-tabs (Sep 2026)
A horizontal swipe across the screen moves one chip along that screen's segment bar. The strip already scrolls sideways on a phone, so the chip you want is often off the edge and two taps away; this is the same move without the aiming. Four rules, and each of them is load-bearing:
- **One bar per screen, and it is the screen's own.** `SWIPE_BARS` names the strip that divides the tab into the sections `APP_MAP` lists for it (`seg` / `crtab` / `moneyseg` / `taxseg`) and **nothing else on the page answers the gesture** - not Supervision's Log / Peer / CPD / Insights, not Trends' four sections, not the projection card's basis picker. On Practice › Supervision a swipe moves to Rooms or Business analytics; on Business analytics it leaves Trends rather than changing section. A gesture whose meaning depends on how deep into a screen the finger landed is one nobody trusts. Adding a nested bar to `SWIPE_BARS` is not a small change - it is a different design.
- **A swipe never leaves the tab.** The ends of the bar are walls: swiping past Business analytics does not land on Money. Moving between tabs is what the tab bar is for, and a gesture that can carry somebody out of the screen they were reading - bar and all - is how a reader loses their place entirely. The bar **nudges** at the end rather than doing nothing, because a swipe that silently does nothing reads as a swipe that did not register.
- **The move is a click on the neighbouring chip.** Every bar wires its button differently (some redraw a body; Tax re-runs `go()`), so `swipeSeg()` calls `.click()` rather than `setSeg()` plus a render of its own. That is the tap route, so a swipe can never reach a state a tap could not, and there is no second path to keep in step.
- **What owns the gesture instead** is decided by `swipeBlocked()`, walking up from the touch target: form controls, `.segwrap`, `.swrow` (swipe-to-mark-paid) and **anything that can scroll sideways at all** - `.svgwrap`, `.rawscroll`, `.hmgrid`. Whether that scroller has room left to travel is deliberately not asked: "your finger is on the chart" is a rule a reader can hold, "your finger is on the chart *and the chart has run out*" is not.

Touch only - a mouse drag across a page is a text selection and a trackpad's horizontal scroll is how a wide chart is read. Every listener is passive and nothing is ever `preventDefault()`ed, so the gesture reads the page's scrolling rather than taking it over. Sessions › Calendar is the one screen with no answer: its strip lists the four worklists and the calendar is a view of "All" rather than a fifth section, so there is nothing to move along. `.segslide-*` / `.segbump-*` are decoration played **after** the work is done; the **14px slide is a ceiling, not a taste** - `main` carries 16px of side padding, so a shift inside it never gives the document a horizontal scroll axis, which is the same wobble-under-the-thumb `.sheet-inner` avoids. Widening it means giving `main` an `overflow-x:clip` (never `hidden`, which would make it the scroll container and strand every sticky bar inside it). **`npm run test:swipe`** is 71 assertions driving real touch events through the browser's own input pipeline.

### Home (revised Sep 2026)
- **The attention feed raises two jobs with a season** (Sep 2026): a client past a retention date (`retentionRows()`, linking to the retention card) and CPD that has stopped (`anaCPD().recent===0`, only once there are 20 sessions or some CPD ever logged, so day one is not nagged). Same shape as the other rows; both read functions that already existed.
- **Four KPIs: billed this tax year · sessions this tax year · outstanding now › · sessions next 7 days ›.** "Received" was dropped: sitting beside "Billed" it answered one question twice, and what was actually missing - the gap - was already the Outstanding tile. The replacement counts **attended** sessions (`isCancelled` excluded) and names the distinct clients behind them, which nothing else on Home said.
- **The year heatmap (`yearHeatmapHTML`) moved here from Money › Overview.** "How busy have I been" is a Home question - nobody opens the money tab to find out whether they took August off. It needs `scrollChart(v.querySelector(".hmgrid"),null)` after render for the same reason the charts do: it is built before the view is attached, so it has no width at draw time, and without it the reader lands on the same date last year.
- The "Quick add" card is now "Log something" and holds only the three buttons.
- **The reader chooses the order (Sep 2026).** `HOME_CARDS` is the keyed list of every block and the default order; `VIEWS.home` builds them into a `parts` map and emits `homeOrder().map(k=>parts[k])`. A block whose conditions are not met is still `""` and simply does not appear.
  - **`homeOrder()` repairs on every read rather than migrating.** A key this build no longer has is dropped; a key the saved order has never heard of - a block *added* by an update - is put back at its **default position**, never appended. A new block below "Records" for everyone who has ever rearranged is a block nobody sees. Nothing is stored while the order is the default, so an untouched install follows whatever ships next.
  - **Order only, never hiding.** Whether a block exists at all is already `feat()` in Settings › App preferences. A second switch answering nearly the same question is how a card ends up on in one place and off in another.
  - `_homeVisible` is set by the last render and read by `homeArrangeSheet()`. Recomputing it there would mean walking every session again to ask whether the revenue trend qualifies, and the sheet can only be opened from a Home that has just rendered. The arrows swap a block with its nearest **visible** neighbour, so anything off-screen keeps its index and comes back roughly where it was.
  - Staged until **Done**, like the guided flows: closing discards, and one `commit()` rather than one per arrow tap.
- **`pins` is the block of analytics the reader pinned** (Sep 2026) - see **Pinned analytics** below. It sits third by default, after the four figures, and moves with the rest in the arrange sheet. With nothing pinned it is the dotted invitation instead, and only past `ANA_PIN_PROMPT_MIN` (20 sessions): a dashed "pin an analytic here" on somebody's second day is an empty promise about data they do not have. Its rows are wired **inside `#homePins`, never across the view** - "Coming up" renders `.list-item[data-id]` where the id is a *session*, and one selector over `v` would make every upcoming session open somebody's client record, silently.

## Invoices, receipts and chasing (Sep 2026)
`receiptSheet(c,{kind})` offers three documents rather than a statement with a "paid only" tick, because they differ only in which sessions they carry and what the total says: **statement** (everything in the period), **receipt** (the paid ones) and **invoice** (the unpaid ones, with a due date and how to pay).
- **The kind travels in `receiptHTML`/`printReceipt`'s FOURTH argument** - the old `paidOnly` boolean, still accepted via `docKind()`. Not a fifth one: the native iOS wrapper re-declares `printReceipt(c,rows,label,paidOnly)` and passes exactly those four through, so a fifth would be dropped silently and every invoice printed from an iPhone would come out a statement.
- **Invoice references are derived, not counted** (`docNumber` → `INV-<initials>-<YYYYMMDD>-<CODE>`). Nothing keeps two copies of this app in step (see *Multi-tab / multi-device writes*), so a counter on the phone and on the laptop would eventually issue the same number twice - the one failure an invoice number exists to prevent. Re-generating the same invoice the same day deliberately reproduces it.
- An invoice can stamp its reference onto the sessions it covers, filling the session form's existing **Invoice #** field. Its Status column is dropped - every line on it says Due.
- **Chasers are plain text for the clipboard.** `chaseText()` builds the message, `chaseSheet()` hands it over in an **editable box** and the button copies whatever is in the box, so a rewrite is never lost. There is no mail server here and there should not be one. Reachable from the client card, from an overdue session in the session form (guarded - opening another sheet discards unsaved edits), and from **Chase…** on Sessions › Unpaid, which is where the Home prompt already lands; `chasePickSheet()` copies a client's message in one tap.
- **`copyText()` must run inside the click that asked for it** - iOS discards a clipboard write that has lost its user gesture, so never await anything first. Two routes: `navigator.clipboard` needs a secure context, and the `execCommand` fallback needs its textarea focusable, which is why it is off-screen rather than `display:none`.
- `settings.payTo` (free text) and `settings.invoiceDays` live in **Settings › Your practice › Getting paid**, deliberately **not** gated on `feat("receipts")` - the chaser uses them and is not a receipt.

## UK tax engine (Aug 2026)
- **Basis.** `settings.taxBasis` defaults to **cash** - HMRC's default for sole traders since 2024/25. `tyNet()` counts a session in the year its `paidDate` falls; `ledgerBetween()` counts a cost when `paidCharges` says it was settled. **Where no payment date is recorded, cash falls back to the due date** - strict cash would let an untidied tick-list wipe every cost off the return, which is a far worse failure than being slightly early.
- **Categories.** `EXP_CATS`/`INC_CATS` are keyed objects carrying an `SA103` box. A `risk` field marks deductions HMRC commonly challenges (personal therapy, CPD that trains new skills); those render an amber warning rather than being hidden or silently claimed.
- **Use of home.** `uohMonthly()` - simplified bands (£10/£18/£26 by monthly hours) or actual apportionment. Generated at read time into `ledgerBetween`, never written into the ledger.
- **Payments on account.** `taxSchedule(ty)` - once the liability passes £1,000, January is the balancing payment *plus* 50%, with another 50% in July. `poaBase()` excludes Class 2 and student loan, which never form part of a payment on account.
- **Class 2** is no longer mandatory (2024/25+) but can be paid voluntarily below the Small Profits Threshold; the app offers it rather than omitting it.
- **Region, student loan, pension.** Scottish bands via `settings.taxRegion`; `SL_PLANS` for plans 1/2/4/5/PG; pension contributions extend the basic-rate band (`penGross`) rather than being deducted after tax.
- **Pay from a job (v11, Sep 2026) - the one figure the engine was getting WRONG.** `ukTax(profit, ty)` took self-employed profit and nothing else, applying the **full personal allowance and the whole basic-rate band** to it. On a £40,000 salaried post with a £15,000 private caseload that is £3,460 too little in 2026-27 - in the one direction that hurts, because the shortfall turns up in January. And the app already held the salary: `otherIncome` with `scope:"personal"` exists for "a second job", correctly kept out of the SA103 total and then never stacked for the bands.
  - `settings.employmentYears[ty] = {pay}` via `yearValue`/`setYearValue`, carried forward exactly like the region and the loan plan - somebody in a job in April is usually still in it in March, and assuming it stopped understates the bill. Edited on **Tax › Per year**, which is inputs rather than calculations and is therefore outside the paywall.
  - **`ukBands(taxable, ty, penGross)` was split out of `ukTax`** so the wage can sit underneath: tax on profit is `tax(wage + profit) − tax(wage)`, and `ukBandsMinus` subtracts the breakdowns so a card reports the bands the **profit** fell in rather than the whole stack. With no salary recorded `below` is zero and every figure is byte-identical to what it always was - there is a parity harness behind that claim, and all 134 tax tests still pass untouched.
  - **The allowance taper is on TOTAL income** (correct - it is adjusted net income), but **Class 4 and Class 2 stay on profit alone**: they are charges on self-employment and the employer deals with Class 1. Stacking them would replace one wrong figure with another.
  - **Student loan is the INCREMENT the practice adds** (`studentLoanDue(wage+profit) − studentLoanDue(wage)`), on the assumption the employer deducted correctly. Self Assessment works it out on combined income and credits what PAYE already took, which this app cannot see - so it reports the increment and says so, rather than ignoring the wage (far too little) or charging the whole combined amount again (far too much).
  - **The tax deducted by the employer is deliberately NOT stored.** What this engine produces is the tax on the *practice*, which is the part Self Assessment collects; PAYE has already dealt with the wage. A second field that changed nothing would be a field somebody fills in expecting it to.
  - **`setEmploymentPay(ty, 0)` stores a zero, it does not delete the year.** "I left the job in June" is said with a 0, and a zero that cleared the entry would let carry-forward keep the old salary alive for ever. Only null or a blank hands a year back to the earlier one. One writer, so the card and the helper cannot disagree.
  - **`taxEmploymentBar(ty)` renders NOTHING for a purely self-employed practice.** It speaks only on a signal the reader has already given - a salary recorded, income logged as a separate trade, or a caseload somebody else pays for - because a second permanent banner beside the standing disclaimer is one nobody reads (the same rule that made that disclaimer `.calm`). And a year the reader has **explicitly** put a zero against is an answer, not a gap - the bar stays silent rather than arguing with the app's own record.
- **Per-year settings.** Both student loan and **region** are editable against a *past* year on **Tax › Per year** (Sep 2026). The engine always read region by year, but the only control that wrote it was the Settings card and it always wrote `curTaxYear()` - so a move to or from Scotland silently re-assessed every earlier year under today's bands. Settings still owns the "from now on" decision and links across for the rest. `yearValue(key, ty, fallback)` / `setYearValue()` hold a setting against a tax year with carry-forward from the most recent earlier year - the same shape as `uohForYear`. Student loan (`studentLoanPlanKey`) and region (`taxRegionFor`) both use it, and `ukTax(profit, ty)` reads them by year. **The legacy scalars migrate onto `earliestTaxYearIn(st)`**, which is what makes carry-forward reproduce exactly the figures the install was already showing. Never read `settings.studentLoan` / `settings.taxRegion` directly - they are kept in step with the latest year only so an older build sees something sensible.
- **Estimate vs assessment.** `taxLiability(ty)` is the one place a year's number comes from, and it reports `src`: `actual` (entered from a filed return - HMRC's figure wins everywhere), `estimate` (year ended, nothing entered) or `projected` (year still running, run-rated to a full year). `poa` is the part instalments are worked out from, never Class 2 or student loan.
- **`poaTowards(ty)`** gives the two instalments due towards a year, set by the year before it. Precedence: a recorded **claim to reduce** (SA303) beats **what HMRC actually set** (`poaSet`) beats the calculated figure. A claim never reduces the tax - it defers it to January pound for pound, and there is a test asserting exactly that.
- **`taxTimeline()` assembles by DUE DATE, never by tax year** - that is the whole point. One 31 January is usually two different years' money (the balancing payment finishing one year plus the first instalment towards the next), and listing by year puts those two amounts on different cards. It is the only place dates and amounts are put together, so the pot, the reminder and the Payments screen cannot drift apart.
- **A past due date with no record is `unknown`, not overdue** (`PAY_GRACE_DAYS`, 60). Someone arriving with three years of history has almost certainly paid those bills; counting them would poison every pot figure. Inside the grace window "not ticked" still means owed, and a row can be marked `{unpaid:true}` to count it back in.
- **"What's actually in your tax account?" was removed from Pot & payments in Sep 2026**, along with the balance-derived verdicts it fed on both that screen and Tax › Now. It was a figure the app could never check, went stale the moment anything was paid in or out, and every sentence built on it ("that surplus is not tax money") was only as true as the last time somebody retyped it. **The engine is untouched** - `taxPot()` still returns `balance`, `over`, `vsFloor` and `vsNext` from a stored figure and `tests/tax-tests.js` still asserts them; it is the view that stopped asking. Note `vsNext` is null without a balance, which is why Tax › Now's next-bill line went with it - the Next payment card below carries the same amount and date.
- **`taxPot()`** answers two separate questions and keeps them separate: what should be put by *today* (tax **already earned** + unpaid bills from years that have **ended** + a buffer the therapist chose) and what has to be there by a *date* (`byNext`). Tax on money not yet earned is deliberately excluded. `rate` is projected tax over **projected income**, not profit - it is a share of money arriving in the account. Working it out from tax-to-date over full-year net is what used to display **0%** early in a year while the table showed thousands.
- **MTD.** `mtdQuarters()`/`mtdPeriod()`/`mtdExport()`. **The quarters must reconcile to `tyNet` on both bases** - a regression here means a cost was added to the ledger but not to an SA103 box (per-session room fees were exactly that bug). Submission is deliberately out of scope: it needs an OAuth secret, fraud-prevention headers and HMRC recognition, none of which fit an offline PWA.
  - **`mtdRows(ty)` is the one shape both exports render** (Sep 2026). `mtdExport(ty,fmt)` dispatches to `mtdExportJSON` or `mtdExportCSV`, and both build their file from `mtdRows` - same rule as `backupPayload()`, and for the same reason: two files built from two literals eventually disagree, and the one place that would surface is somebody's quarterly update. The no-argument call still writes the `.json`, because `scripts/check-drift.mjs` asserts `function mtdExport(` exists and stays free of `plusLocked()`.
  - **The CSV is long/tidy and carries a UTF-8 BOM.** One row per figure with a `section` column (income / expense / total), not one row per quarter with the boxes spread across columns - reading a figure out of a wide sheet means knowing which column that box landed in. The BOM is load-bearing: without it Excel on Windows reads the quarter labels' en-dashes in the system codepage and prints `â€“`. The three older CSV exports do not have one and were deliberately left alone.
  - **The field set is FIXED, and the zeros are the point** (Sep 2026). `MTD_EXP_BOXES` is emitted in full by every quarter, in box order, `£0.00` rows included, so the `.csv` is always 11 rows per quarter and the `.json` always the same seven expense entries. Emitting only the boxes that happen to carry a figure means the rows *move* between quarters: a consumer that worked out "the third expense row is box 21" from Q1 silently reads something else in Q2. A zero is also a real answer - "no premises costs this quarter" is a figure, not a gap. **A box outside the fixed list is appended, never dropped**: `expenseTotal` counts every box `mtdExpenseBoxes` returned, so omitting one would hand somebody a file whose own rows do not add up to its own total.
  - **`MTD_HMRC_FIELD` maps each SA103 box to the property name in HMRC's Self Employment Business API** (`premisesRunningCosts`, `professionalFees`, `adminCosts`, …), carried as `hmrcField` in both files. It is a **hint for whoever files, never a claim that this file can be submitted** - same guard-rail as everything else on this screen (`docs/tax-positioning-2026-09.md` §2). Two caveats ride with it permanently: box 24 is "advertising **and** business entertainment" and the API splits those two (every GroundWork category under box 24 is advertising, so it maps to `advertisingCosts`); and the API is versioned and has changed shape between versions, so **the box number is the stable thing** and this column is a convenience. `SA103` gained boxes **15 (turnover) and 16** so the income rows can name a box too - it is a lookup map, never enumerated, so adding keys is safe.
  - **Nothing here is verified against a real bridging tool.** The tests assert the file is internally consistent and its shape is stable; no one has yet fed it to a tool that files. Don't let the copy imply otherwise.
  - **The screen sells the route, not the feature.** Tax › Making Tax Digital's "Filing these" card exists because the old copy ended on *"this app cannot file for you"* - true, and a dead end. It states the three parts, marks the two GroundWork has already done, and links to HMRC's own software list. It must never name a vendor, promise a free option exists for this reader, or rule on whether their setup satisfies the rules; `mtd-what` / `mtd-route` / `mtd-exports` carry the detail. The full claims guard-rail list is `docs/tax-positioning-2026-09.md` §2.
- **The standing disclaimer is `.vmsg calm`, not `.vmsg warn`** (Sep 2026). `taxDisclaimBar()` is on the screen every time Now or Estimate is opened and nothing has gone wrong, so in amber it shouted a caution at the reader on every visit - and a warning that is always on stops being read as a warning at all. It wears the dotted brand outline of the empty pinned-analytics card (`.card.pinempty`), which is this app's shape for "context, not a problem". **The words are unchanged and must stay** - the caveat is what makes the figures usable; only the shouting went. Anything that genuinely is news keeps `.warn` and keeps the amber.

### Tax moments & guided flows (added Aug 2026)
`taxMoments()` is a **pure** function returning the seasonal cards that are live *today* - zero of them for most of the year. It adds no arithmetic: everything comes from `today()`, `curTaxYear()`, `prevTY`, `taxYearRec`, `nextTaxPayment`, `taxPot` and `mtdQuarters`.
- **The ids carry their year** (`file-2025-26`, `jan-pay-2027`, `new-year-2027-28`, `mtd-q3-2026-27`). That is what makes dismissal safe: `settings.taxMoments[id] = <date dismissed>` silences *this* year's instance and next year's returns on its own. In settings rather than localStorage, like `coach.seen`, so it travels with a backup.
- Windows: **file** 1–31 Jan (only while the ended year has no `liability` and isn't `filed`), **jan-pay** 1 Jan – 5 Feb and **jul-pay** 1 Jul – 5 Aug (only when `nextTaxPayment()` really is that date - a bill already ticked off gets no card), **new-year** 6 Apr – 31 May, **mtd-q_n_** for `MTD_MOMENT_DAYS` (35) after each quarter end.
- **MTD is gated on `taxPot().projInc >= MTD_INCOME_FLOOR`** (£50,000). MTD for Income Tax does not reach a small practice, and a quarterly nudge it can only ignore is worse than no nudge. Both this tax year's quarters and last year's are scanned - the quarter ending 5 April belongs to a year that has ended before its five weeks are up.
- `nextTaxPayment()` and `taxPot()` are resolved **lazily, once**, so a month with no open window reaches neither.

**Two of the moments launch a guided flow**, because the jobs behind them are done once a year and are therefore the ones nobody remembers how to do. Both run on the existing `flowStart` overlay.
- **`startAfterFileFlow(ty)`** - which year / the bill / instalments (optional) / confirm. Entered from the `file-<TY>` card and from **"Walk me through it ›"** on Pot & payments. Defaults to the most recent ended year with no `liability` yet. Writes `liability`, `liabilityAt`, `filed=true` via `taxYearRecW(ty)`, and `poaSet`/`poaSetAt` on `nextTY(ty)` **only if an instalment was given** - skipping leaves an existing one alone. The SA303 claim to reduce is deliberately **not** in this flow: it has a real interest penalty behind it and stays an expert control on Pot & payments.
- **`startNewYearFlow(ty)`** - region / student loan / use of home / pot buffer / done. Entered from the `new-year-<TY>` card and from **"Review for <TY> ›"** at the top of Per year, which appears only inside `newYearWindowOpen()` - the *same* 6 Apr – 31 May window the card uses, so the two can never disagree about when it is April. Confirming writes nothing: carry-forward already handles it, which is what makes a no-op review four taps of Continue and **zero audit entries**.
- **Every step stages into a local `w` and writes nothing** - the same shape as `startSetup`. Skipping or closing therefore discards, and the single `commit()` happens on the last screen only if `newYearReviewChanges(w)` is non-empty. The use-of-home step's "copy and edit" button is the one early exit: it applies whatever is staged plus `uohCopyFrom`, commits **once**, and hands off to Per year by design.
- **`taxYearsPreview(patches, fn)`** is how the confirm screen shows a recomputed `taxSchedule` without writing: the engine reads `settings.taxYears` and has no pure variant, so the records are staged, read, and restored in a `finally`. It is a staging helper, not maths - no figure is ever computed here that `taxSchedule`/`taxLiability` do not already produce.
- Both flows guard on `_flow` and refuse to stack on setup or on each other. The raw editors (`taxActualSheet`, `poaClaimSheet`, the Per year cards) are **untouched and stay fully functional** - the flows are a guided path to the same fields, never a replacement.

### Tax engine tests
`tests/tax-tests.js` - 134 tests. Serve the app, open it, paste the file into the console. It lives **outside** `TherapyTracker-web/` so it never deploys, never calls `commit()`, and restores the live state when it finishes.

**Expected values are derived from the HMRC rule, never copied from the app.** That is not pedantry: the payment-date bug below initially *passed* a test written by pasting in what the code returned, and only surfaced when a second test approached the same figure from the rule. If a test needs updating after a change, re-derive the number.

Two real bugs it has already caught:
- `SCOT_BANDS` mixed band *widths above the personal allowance* with *absolute* thresholds while the loop treated all of them as absolute - overstating Scottish tax by up to ~£3,300/yr (£2,025 at £40k).
- `taxSchedule()` dated every payment a year early. Self Assessment is due 31 January **following the end** of the tax year, so 2026-27 is 31 Jan 2028, not 2027.

Several tests depend on TY (2026-27) being the year **in progress** - the projection, the pot's "earned so far", and the 60-day grace window. Re-anchor them once the real date passes 5 Apr 2027.

The reconciliation block is the highest-value part: across six practice profiles, `profitBreakdown` = the four MTD quarters summed = `tyNet`. A mismatch means a cost reached one path but not another - exactly how the missing per-session room fee in the SA103 boxes was found.

### Whole-practice test data (Sep 2026)
`tests/test-data/` holds **eight synthetic practices as importable backup envelopes** - the same
shape `backupPayload()` writes, so any of them restores through Settings › Data & backup on a real
device. They exist because the tax engine and the twenty `ana*` trends only say anything
interesting at a few hundred sessions across several years, which is a size nobody hand-writes.
Full description in `tests/test-data/README.md`; the review they were built for, and what it found,
is `docs/test-data-review-2026-09.md`.

```bash
npm i --no-save playwright   # deliberately NOT a dependency: npm ci runs on the release workflow
npm run testdata             # regenerate the eight (deterministic - same bytes every run)
npm run test:review          # Trends + Tax over all eight, invariants asserted, exits non-zero
npm run test:tax             # tests/tax-tests.js in a headless browser instead of by hand
npm run test:behaviour       # opens the sheets, clicks Save, asserts what landed in S
npm run test:reports         # the report engine, the gate and the screen, over all eight
npm run test:rent            # room rent: rhythms, date ranges, the ledger, and the ungated card
npm run test:payer           # who pays: the payer field and its choke point, the Unpaid worklist
                             #   and its badge, the money analytics' readiness, the organisation
                             #   documents and batching, and employment income stacked under profit
npm run test:tiers           # the Pro / tax-year gate matrix, the mask, and the migration defaults
npm run test:pins            # pinning an analytic to Home: the registry, the cap, the picker,
                             #   and that Home's copy of a card is identical to Trends'
npm run test:projection      # the year-end projection: the run rate against the tax engine's own,
                             #   the seasonal share re-derived a day at a time, the trailing window
npm run test:guidance        # every info icon on every screen and form opens a real sheet, every
                             #   row of "Where everything is" lands somewhere, What's new runs through;
                             #   Getting started, Still on defaults, Search & help and the new
                             #   attention rows, from the documented rule for each
npm run test:import          # the spreadsheet importer against the shapes real sheets take: datetime
                             #   cells, time ranges, "Amount paid", "closed", workbooks, no heading row
npm run test:calendar        # the .ics export against RFC 5545: escaping, 75-octet folding,
                             #   floating times across midnight and a DST morning, the stable UID,
                             #   the range filter. Pure node - no browser, no Playwright
npm run test:swipe           # swiping between sub-tabs, as real touch events through the browser's
                             #   own input pipeline: every bar end to end, the walls at both ends,
                             #   and everything that owns a sideways drag instead. Builds its own
                             #   practice rather than reading a fixture - it tests a gesture```

**`scripts/check-behaviour.mjs` is the only test that presses a button.** The tax suite checks the
engine, `review-test-data` checks the engines against whole practices, and neither would have
caught the failure mode that made it necessary: when room-fee settling moved out of the session
form, `sync()` had to *stop* reading `roomPaid` from a control the form no longer renders. Had it
gone on reading it, every save would have silently blanked a settlement - no error, no failing
engine test, no crash, just a field quietly emptied. Only opening the form, clicking Save and
looking at the record afterwards finds that. Its expectations are recomputed from the documented
rule, never pasted from what the function returned - the same discipline, for the same reason, as
the tax suite.

- **The fixtures are ANCHORED to a date** (`ANCHOR` in `scripts/make-test-data.mjs`, currently
  2026-09-05) and the engines read the real clock. Once the real date has moved a season on, the
  data no longer lands in the windows the trends use (last 12 months, last 26 weeks, this tax
  year) and the readiness gates start reporting on history that has aged out. **Re-run
  `npm run testdata`** - same caveat, same date, as `tests/tax-tests.js`.
- **The data is described, never enumerated.** A profile says "weekly, 18% missed, pays about three
  weeks late, three weeks off in August"; the review's expectations come from that description and
  from the documented rule, never from what the app returned. Tuning a fixture until the app agrees
  with it is the exact failure the tax suite warns about.
- **`scripts/review-test-data.mjs` loads the real `index.html` in a browser** and injects each
  state, so it cannot pass against a stale copy. It stubs `commit()` first: it reads, never writes.
  Note `S`, `trendSeg` and friends are top-level `let`s - they live in the global *lexical* scope,
  so `window.S = …` creates a second copy nothing reads. Assign the bare name.
- **Its invariants are derived from the documented rule, not from the function.** The drifting
  check rebuilds the expected set (past 1.5x their own interval, nothing booked, not finished) and
  compares it to `rows` **plus** `review`, because the ladder splits that set in two; the episode
  check rebuilds "finished status or gone three intervals". Both fail on the pre-fix code, which is
  how they were verified. **A change to either rule has to change the harness too** - if it does
  not fail first, it is not testing anything.
- Two profiles carry no `settings.taxAck`, so the Tax tab shows its disclaimer gate rather than any
  figures. That is the gate under test, not an empty screen.
- **`online-only` is the practice that is paid in advance** (`payLagDays: [-7, 3]`, ~71% of sessions
  settled on or before the day). A negative lag means paid before the session. Until Sep 2026 no
  profile did this, so the whole corpus could not exercise `anaDaysToPay`'s up-front path - which is
  the shape most therapy is actually paid in, and the one the card was rebuilt for.
- `groundwork-testdata-scotland-high.json` assumes a pension that is **not in the file** -
  `pensionPcm()` reads `localStorage.tt_pension`, which no backup carries. It is recorded under
  `testData.device` and applied by the harness. See the review, finding 7.

### Editing this file with scripts
It is 438KB of single-file app, so bulk edits are scripted. **Always build the whole string, assert every anchor matched, write to `index.html.tmp`, then `os.replace()`.** Opening the real file for writing first truncated it to 0 bytes once when the script raised mid-run.

### Error boundary
`go(tab)` wraps the view render; a throw shows `crashScreen(err, tab)` - which always offers **Export a backup**, Home and Reload - instead of leaving `<main>` empty. `window.onerror` / `unhandledrejection` route to `reportGlobalError()` (console always, one toast per session).

## Spreadsheet import (Settings › Import from a spreadsheet)
Onboarding path for a therapist arriving with history in Excel. `impOpen()` drives three sheet stages: **source** (`impStageSource` - paste TSV / pick .csv / download template) → **mapping** (`impStageMap`) → **dry-run preview** (`impStagePreview`) → `impCommit(plan)`.

Rules that must not regress:
- **Merge, never replace.** `importJSON()` is a whole-state replace and is for *backups only*. `impCommit()` appends to `S.sessions` and auto-creates the clients/rooms the rows reference. Nothing is written until the final button.
- **`impPlan()` is pure** - builds the whole plan without touching `S`, so the preview is exactly what will happen.
- **Fees become dated history, not a flat field.** Sessions have no `rate`; `derive()` reads `effRate(client,date)`. `impCommit()` walks rows oldest-first and pushes `rateHistory` / `roomRateHistory` entries only where the fee differs from what's already effective at that date. The first entry for a brand-new client/room is stamped **`RATE_EPOCH`** (`"2000-01-01"`) so earlier sessions still resolve. **A £60 session imported before a rise to £65 must still derive £60** - that's the tax figures.
- **`RATE_EPOCH` is a floor, not an event.** The import, the room seeder and the setup wizard all stamp it, and reading it as a real date is what put *"since 01 Jan 2000"* at the top of every imported client's profile. `clientAddedDate()` filters it out and takes the earliest of the remaining rate history and the client's own first session. Anything new that reads `effectiveFrom` as a date a human chose has to filter it too.
- **Dedupe key is `client|date|time`** (`impKey`). `onDupe:"skip"` leaves the app's version; `"update"` overwrites in place by `_id` - so re-importing a corrected file never duplicates.
- **Date ambiguity is resolved per column, not per row.** `impDateScan()` takes the whole column: any row with a first number >12 settles day-first vs month-first; nothing conclusive defaults to UK DMY and *says so*. Conflicts (both readings forced) are flagged red. The user can override, and the banner shows a worked example (`"03/04/2026" → 03 Apr 2026`) that updates live. Excel serials, named months and 2-digit years are handled in `impDateParts()`.
- **Late cancellation** is set at import from either the mapped column *or* `/late cancellation/i` in notes - `normalize()`'s backfill is one-time and gated by `meta.lateCancelBackfill`, so it will never see imported rows.
- **One Undo reverses the whole import.** `commit()` already snapshots, so the snapshot on top of the stack *is* the pre-import state; `impCommit()` only lays down its own `"Before spreadsheet import"` snapshot when `snapCount()===0`. Adding one unconditionally makes Undo take two taps - don't.
- **`impTemplate()` generates the template from `IMP_FIELDS`**, so template headers can never drift from the parser. There's a test for this: the template's own column list must guess back to itself exactly.
- `impGuess()` matches header synonyms exact-first then substring, one field per column. Field order in `IMP_FIELDS` breaks ties (`location` claims a bare "Room" before the `room` field does).
- Named by a setup-wizard step (`stepImport`) on first run only - a re-run promises not to touch client data - but **never launched from inside it** since Sep 2026; the wizard describes it and hands the job to Getting started on Home (see Setup wizard § Previous records). `impOpen`'s `quiet` option (don't `go()` or `celebrate()` behind a full-screen overlay) is kept but now has no caller.
- **Shapes real spreadsheets take, all handled since Sep 2026** (`npm run test:import` asserts each): a date cell carrying a time (`07/04/2026 10:00`, ISO `T…`) parses as the date, and `impTimeInDate()` supplies the time when no Time column is mapped; a Time written as a range (`10:00 - 11:00`, `10.30 to 11.20`) or with seconds keeps its start; **an amount in the paid column means paid** (`impYN("£60")` is `Y`, `0` is `N`) because "Amount paid" is how most sheets record it; `impStatus()` maps "current / closed / on hold" onto Ongoing / Finished / Paused and keeps anything else as typed; `Name`, `ID`, `Patient` guess as the client code and `Amount paid` as the paid column. The plan counts **rows with no fee for a client the app has no rate for** (`plan.noFee`) and the preview warns they will count as £0 - that is the one silent failure of an import, and the Money tab was where it used to surface. Picking a workbook (`.xlsx`, `.numbers`) says how to save it as a `.csv` instead of pasting a zip into the box, and a paste whose first row contains a date is told it has no heading row.

## Session schedules & GroundWork Notes (added Aug 2026)
How often each client is seen, shared with the companion notes app so it can work out which
sessions still need writing up. **The specification both apps implement is
`../GroundWork/docs/schedule-sync.md`** - it is the authority, and a change to the rule has to be
made in three places at once: here, in GroundWork Notes' `SessionPrediction`, and in that document.

- **`clientSchedule(c)`** is the one place a client's cadence comes from: `freqDays(c)` for the
  interval, and their usual day/time. `c.usualDay` / `c.usualTime` are **overrides** - blank means
  `usualSlotFor(code)` reads the commonest day and time out of their last `SLOT_WINDOW` (8)
  attended sessions, so this works for every existing client with nothing typed.
- **`placeOnSchedule(d, sched)`** snaps a date onto the usual day, moving **at most three days
  either way**, and is ported line for line from `SessionPrediction.place` in the notes app.
  Change both, or the two apps offer different dates for the same client. The two clamps together
  map a delta into ±3; note that `>3`/`<-3` is not the same as `>3`/`<-4` - the second bound is
  the one that decides whether a four-day pull-back is allowed, and it must not be.
- **`SLOT_DAYS` is not `WEEKDAYS`.** `WEEKDAYS` further up the file is the payment-schedule picker
  and runs Monday-first with its own numbering; `SLOT_DAYS` is indexed to match `Date.getDay()`,
  Sunday first. They collided once already.
- **`suggestFor()` now goes through this**, so the session form offers a client's usual slot back
  after a session that was moved, rather than repeating the moved day forever.
- **The cadence travels as a number of days, never a label.** `freqDays()` maps "Monthly" to a flat
  **28**; a calendar month at the Swift end would drift a few days per quarter and neither app
  would look wrong on its own. `npm run check` runs `scripts/check-schedule-parity.mjs`, which
  pulls these functions out of `index.html` and asserts the **same 14 cases** the notes app asserts
  in `SessionScheduleTests.swift`. If it fails, fix both apps and the spec - never just one.

### The schedule file (Settings › Data & backup › GroundWork Notes)
`syncSchedules()` writes `groundwork-schedules.json`: client codes, status, cadence, usual day and
time, and the first session's date. **No names, no fees, no attendance, nothing clinical**, and
nothing comes back - whether notes are done stays a tick in this app.
- **`kind:"schedules"` is what identifies the file.** A full backup also holds client codes and
  would half-work at the other end, so the notes app refuses anything without that marker.
- **`rosterCode()` enforces the notes app's own rule** (2–12 letters and digits). A code that fails
  it is left out of the file *and counted on screen*, rather than exported and silently rejected
  where the counsellor cannot see why.
- **Three ways to write it, one per platform.** Desktop Chrome/Edge keeps a `FileSystemFileHandle`
  in the `state` store (**not** localStorage - a handle is structured-cloneable, and
  `JSON.stringify` would turn it into `{}`) so every later sync overwrites the same file silently.
  iOS goes through the existing share sheet, because `download()` is already wrapped natively.
  Everything else downloads. Last sync is `tt_rostersync` in localStorage - device state, so it
  stays out of `S`.

## Adding sessions to a real calendar (.ics, Sep 2026)
Sessions › Calendar carries an **Add to your calendar** card, and the session form an **Add to my
calendar** button. Both build an `.ics` file and hand it to `download()`. That choke point is the
whole design: the native block already redirects `download()` into the iOS share sheet, so an
iPhone gets Calendar / Files / AirDrop **with no Swift written**, and a browser hands the same file
to Apple Calendar or Outlook. Nothing was added to `GroundWorkNativePlugin.swift`.

- **It is a copy, not a live link, and the card says so.** Editing a session afterwards cannot
  reach into a calendar the app has no connection to. Real two-way sync means EventKit, an
  identifier stored on every session and an iOS-only feature; the reasoning for not doing that
  yet is in the info topic and in this section's history, not in the code.
- **The UID is derived from the session's `_id`, and `SEQUENCE` only ever rises.** That pair is
  what makes a second export *update* the entry already in Apple or Google Calendar instead of
  leaving a duplicate beside it. **Never make the UID random.** Nothing counts revisions in the
  record, so `icsSeq()` uses minutes since 2020 as the counter - monotonic, and a very long way
  inside the 32-bit integer the format allows.
- **The event is deliberately thin: client code, time, length, room. Nothing else.** No name, no
  fee, no session number, no admin note, and **no `DESCRIPTION` field at all**. Same discipline as
  `syncSchedules()` and for a sharper reason - once imported it is on Apple's or Google's servers
  and readable by anything granted calendar access, and "somebody is in therapy at 10am on
  Tuesday" is special-category data under UK GDPR with no name attached. The room is carried
  because it is a fact about the therapist's own day. If a title ever needs changing, it is
  `icsTitle()` and nowhere else.
- **Times are FLOATING** - no trailing `Z`, no `TZID`. A session stores a wall-clock time and no
  timezone, so converting to UTC would bake in the timezone of whichever device ran the export,
  which is not a fact in the data. `icsFloating()` does its arithmetic **in UTC** so that adding
  `sessionMins()` can never be stretched by a daylight-saving jump: on a local `Date` in London a
  50-minute session starting 00:30 on 29 Mar 2026 comes back as 110 minutes. There is a test.
- **`icsFold()` counts OCTETS, not characters** (RFC 5545 caps a content line at 75). An accented
  room name folded on character count produces a 129-byte line, and some parsers answer an
  over-long line by dropping the whole event.
- **Cancellations are excluded.** A charged late cancellation is real money, which is why the rest
  of the app keeps it - but it is not an appointment, and the session form hides the button for one
  rather than offering a diary entry nobody should turn up to.
- **Both windows count forward from TODAY, never from the month being browsed**, and the card
  prints the dates under the buttons. Somebody three months ahead looking at next spring has not
  asked to put next spring in their diary.
- **Ungated, and permanently so** - it is an export of the therapist's own records, which is the
  same rule that keeps `commit`/`exportJSON`/`importJSON` out of `plusLocked()`.
- `renderCal()` gained this screen's **first info dot**, so it gained a `wireInfo(body)` call with
  it. The guidance test walks `APP_MAP` segments and the calendar is a view toggle rather than a
  segment, so that dot is asserted in `check-behaviour.mjs` instead.
- **ON iOS THE SESSIONS ARE WRITTEN INTO THE CALENDAR, NOT HANDED OVER AS A FILE** (Sep 2026).
  **Handing iOS a file is a dead end, and it took three attempts to accept that.** The share
  sheet buries Calendar among Save to Files and AirDrop. Quick Look
  (`UIDocumentInteractionController.presentPreview`, the route Safari takes) renders the events
  perfectly and then offers **no way to accept them** - a close button and a share icon, nothing
  else. The *2 Events / Add All* screen Safari shows is Calendar's own import sheet and **there
  is no public API for it**. So iOS goes through **EventKit** (`calendarAdd` / `calendarList`):
  one tap, no sheet, nothing to find in Files.
- **That is also the only route that can UPDATE.** The event identifier is kept against the
  session, so a session that moves is rewritten in place - which Calendar's own Add All button
  does not do. Don't try to fix the file instead: the derived UID and rising `SEQUENCE` are
  already exactly what the format asks for, and turning `METHOD:` into `REQUEST` makes every
  session an invitation with an organiser, which is worse.
- **Full access, not write-only, and the update is the reason.** iOS 17 split the permission and
  write-only is the smaller ask, but reading an event back by its identifier needs full access -
  and without that read a move is a duplicate. **`Info.plist` must carry both**
  `NSCalendarsFullAccessUsageDescription` and `NSCalendarsUsageDescription` (deployment target is
  iOS 15): **iOS terminates the app** if access is requested without one, so `check-drift.mjs`
  asserts both.
- **`tt_calmap` (session id → event identifier) and `tt_calendar` (the chosen calendar) are
  localStorage, NEVER `S`** - the same rule as `tt_lock`, and the reason a schema bump was not
  needed. An event identifier means nothing on another phone, so carrying one in a backup would
  point a restore at events that do not exist; an empty map on a new phone correctly adds afresh.
- **The reader is asked WHICH calendar** when more than one is writable, once, through
  `sheetPromise` like every other question - a therapy diary landing in a calendar shared with
  the family by default is what that prevents. Changeable in Settings › This iPhone.
- **THE PERMISSION SHEET BELONGS TO THE MOMENT SOMEBODY ASKS FOR A SESSION TO BE ADDED, AND
  NOWHERE ELSE.** `calendarList({ask:false})` reports where access stands without requesting it,
  and the Settings card is its only caller. It shipped calling `calendarList()` plainly, so
  opening Settings › This iPhone to check a backup raised "GroundWork would like access to your
  calendar" on a screen nobody had asked a calendar question on - startling, and squarely what
  **App Review Guideline 5.1.1** means by a request with no context. `check-drift.mjs` asserts
  both halves of the flag and `npm run test:folder` counts prompts, because this is invisible in
  any test that only checks what a screen renders.
- **The card answers THREE states, not two** - granted (names the calendar), denied or restricted
  (where to turn it back on), and never-asked (it will be asked for when it is needed). Reporting
  "no access - go to iPhone Settings" to somebody who has never been offered the permission sends
  them to fix something nobody asked them.
- **`window.GWCalendarNative` is the only seam** (same rule as `window.GWPlusNative`: shared code
  never calls Capacitor directly), and it is declared **only when the plugin really has both
  methods**, so the shared code's `if(N)` is a true test of whether this device can write at all.
  The native layer is handed wall-clock strings built by **`icsFloating`**, never its own
  arithmetic, so the session length and the DST rule are worked out once for both platforms.
- **Every failure path falls back to the `.ics`** - permission refused (which also says where to
  turn it on), a bridge that throws, or an older build. The file route below is still live: it is
  what a browser gets and what an iPhone gets when it cannot write.
- **Three tests, deliberately split.** `npm run test:calendar` proves the file is well formed (68
  assertions, pure node, functions lifted out of `index.html` by their markers).
  `check-behaviour.mjs` proves the *controls* exist, are wired and produce it - a perfect builder
  nothing calls ships nothing. `npm run test:folder` proves the **iOS write path** against a fake
  Capacitor and a fake calendar (53 assertions in all): the session is written rather than turned
  into a file, the event is thin, the times come from the shared arithmetic, **adding the same
  session twice rewrites one event rather than making two**, a move updates it, the picker blocks
  until answered, and refusal / a throw / an older build each fall back to the `.ics`. **The Swift
  itself has never been compiled** - so whether EventKit behaves as written is the one thing none
  of this proves.

## Restore from backup (Settings › Data & backup - hardened Aug 2026)
`importJSON()` is a whole-state replace, so it is gated by **smart friction, not uniform friction** - `restoreConfirm()` picks one of two tiers from `restorePlan()`. A restore onto a new phone stays one tap; stamping a stale file over weeks of newer entries earns the same ladder as erase.
- **Tier A** (`sheetPromise`, one Restore button) when the device is effectively empty (`sessions===0 && clients===0`) **or** the backup is neither older nor smaller. **Tier B** (`dzConfirm`, `phrase:"RESTORE"`, 3-second arm) when the backup has **fewer sessions** than the device or an **`exportedAt` older than the device's last change**. Both tiers show the same block: the export date ("unknown date" for a bare state file with no envelope), backup vs device counts side by side, `validateImport`'s `problems`, and the restore-point line.
- **The device's last change is the audit log's newest entry (`auditLatest()`), not `tt_state_ts`.** `loadState()` calls `mirror()` on every open, so that key means "last opened" whenever the database is there - using it would make every backup on a used device look stale and put *everyone* in Tier B, which is the one outcome this design exists to avoid. `tt_state_ts` is read only in fallback mode (`_db===null`), where nothing mirrors at load. An unknown date on either side is not evidence: the counts decide alone.
- **The empty-device short-circuit is load-bearing.** A fresh install's audit already holds "App installed - starting fresh" dated *now*, so without it every restore onto a new phone would be Tier B.
- `dzConfirm` takes an optional **`o.detail`** HTML slot (rendered under the lead) so Tier B can show that same comparison; no other caller passes it.
- **No extra snapshot.** `commit("Restored backup (…)")` already snapshots, so the pre-restore state *is* the top restore point - adding one here would make Undo take two taps, the same rule as the spreadsheet import. `validateImport` is untouched; the `askPassphrase` prompt still runs before validation; an unreadable file still `alert()`s.

## Data removal (Settings › Privacy & removal)
Collapsed `<details class="dz">` → `dzMenu()`. Four routes, all gated by `dzConfirm()`: a summary of what changes, an export-first button, an acknowledgement checkbox, a typed phrase, and a 3-second arming delay on the final button.
- `anonymiseClients(codes)` - code → `Client 001`, notes/invoice/receipt cleared. **Preserves the financial and clinical shape**: dates, fees, payments, attendance and late-cancel flags all survive, so tax figures are unchanged. Captures `s.lateCancel = isLateCancel(s)` *before* clearing notes, because the historical convention stored it in the notes text. Session notes become `"Y"`, not `""`, so `derive().complete` still reads as done.
- `eraseClients(codes)` - removes clients, their sessions and their `rateHistory`; strips their names from `supervision[].clients` but **keeps the supervision entries** (therapist's own CPD/tax record).
- `eraseEverything()` - clears the three object stores **first** (always succeeds), then deletes the DB (another open tab can defer this), then removes `tt_*` localStorage keys. **Leaves the SW caches alone** - they hold no client data, and clearing them would strand the user offline with no app.
- `dzPickClients()` / `sheetPromise()` - sheet-based promises that resolve `null` when dismissed by any route (a MutationObserver on `#sheet`'s class), so no promise hangs.

## Records retention (Settings › Records retention - added Aug 2026)
`retentionRows()` flags clients whose status is in `settings.retention.endedStatuses` and whose **last logged session** is more than `notesYears` / `financeYears` ago. Two clocks, because notes and money are kept for different reasons.
- **Flag only - it never deletes.** The row's Anonymise / Erase buttons hand off to `dzRunAnonymise([code])` / `dzRunErase([code])`, so every removal still goes through the full `dzConfirm()` gauntlet. Don't add a shortcut that skips it.
- `defaultEndedStatuses(st)` reads the therapist's own status→category mapping and takes the statuses under category `Finished`. **Paused / Active enquiry are Pipeline, not ended** - those clients may return, and flagging them would be wrong.
- A client with no logged sessions has no clock to count from and is skipped.

## Peer supervision (added Aug 2026)
`S.peerSupervision` is a separate log from `S.supervision`, reached from a third sub-tab on Supervision. Its hours are added to the **total accreditation hours** in `mountAccreditation()` and are deliberately absent from `sup`, the only figure the 1:6 ratio sees. Keeping the two arrays apart is what makes that rule visible - don't merge them with a `type` field. A peer entry's optional `cost` feeds `tyNet()` like clinical supervision does.

## Long lists: folding history away (added Aug 2026)
Five lists grow with the practice - Practice › Clients, Practice › Trends (attendance, missed sessions, long-term) and Sessions › All. Each lists what's current and folds the rest into an aggregate row that expands on demand.
- **`trendsIsCurrent(c, lastDate)` is the single definition** of "still current", shared by every per-client list so a client can't read as current in one and folded in the next. Status leads - category `Finished` is out - with a `TRENDS_RECENT_DAYS` (365) backstop, because a status nobody updated is exactly what the Review status card exists to catch.
- **Sessions fold by time, not by client**: the newest `SESS_VISIBLE` (60) are listed and older ones group into one block per tax year carrying billed/received totals. This replaced a hard `slice(0,400)` that made session 401 unreachable.
- **`AGED_MIN` (8) gates the whole mechanism.** Below it nothing folds and the screen looks exactly as it always did - hiding three finished clients behind a tap costs a reader more than the rows ever did.
- **Attendance folds by exception, not only by age** (Sep 2026). It lists clients under `ATT_OK_PCT` (65 - where the red chip starts, so the split is the one the colours already show) or sitting in a pause right now; everyone else goes behind an "Attending as expected" fold once there are `ATT_FOLD_MIN` (3) of them. A roll-call of every current client each wearing a green chip is a list nobody reads to the bottom, and the ones worth seeing are at the bottom because it sorts worst-first. Both constants are declared **up with the `ana*` helpers, not beside `AGED_MIN`**: `infoDef("attendance-mechanics")` builds its text at load time and a later `const` is a temporal dead zone.
- **Folded rows are built on expand, not up front** (`agedFold` renders an empty `data-pending` body; `wireAgedFolds(host, builders, onRow)` fills it on first `toggle` and wires clicks, which the render-time `querySelectorAll` pass cannot reach - `onRow` decides whether a row opens a profile, the client form or a session).
- **Search never folds.** Someone searching is looking for a specific person or session, very possibly one that finished years ago.
- **Aggregates never lose the folded records**: KPIs, the funnel, the rolling attendance chart and every total still count everyone. Only the individual rows fold.
- Sessions › Unpaid and › Incomplete stay whole - they are worklists to clear, not history to browse.

## Practice analytics - the Trends engine (Sep 2026)
Twenty analytics live behind **Practice › Trends**, computed by a block of **pure functions** (`ana*`) that read `S` and `today()`, return a plain object and write nothing. Same contract as the tax engine: callable from a console, never gated (`plusLocked("trends")` decides what the *view* renders, not what the engine computes).

Three rules every one of them follows - a wrong figure here is worse than no figure:
- **Never invent a trend from nothing.** Each returns `{ready:false, need:"<what is missing>"}` and the view prints that sentence instead of a chart (`anaWaiting`). Twenty-four weeks of zero is not a seasonal pattern.
- **Cancellations are not attendance.** `isCancelled()` sessions are excluded wherever the question is "did I see someone" (hours, capacity, load, episode length) and included wherever it is "what did this earn" (revenue, fee erosion) - a charged late cancellation is real money.
- **Only whole periods.** `anaMonthlySeries(n)` starts at *last* month; a month still running would drag every average down and recover on the 1st.

### One analytic, one function - and the registry (Sep 2026)
Each card is its own builder, `(cx, pin) -> {html, folds?, folded?, empty?, funnel?}`, and
**`ANA_CARDS` is the list of all of them** - key, section, name, one-line description, builder.
They were inline in the three section functions until pinning arrived, which needs to draw **one**
card on its own: Home renders exactly what the reader pinned, and building a whole section to pull
one card out would run every other analytic in it for nothing.
- **`anaSection(seg, cx)`** is a section: registry order, one merged `folds` map (because
  `wireAgedFolds` is given a host, not a card) and the `folded` count the Clients section prints a
  line about. `trendsMoneyHTML`/`TimeHTML`/`YouHTML` are gone - they were three copies of it.
- **`cx` is `anaCtx()`, built once per screen.** `counts`, `lastSeen`, `withSess`, `base` are a
  pass over the sessions each; **`cx.att()` is lazy and cached** because `clientAttendance()` is a
  pass over the sessions *per client*, and Attendance and Review status both want it. Never call
  `clientAttendance` across the client list again from inside a card.
- **The key lives in `ANA_CARDS` and nowhere else.** It is passed *into* the builder as `pin`, so a
  card cannot end up drawing a button that toggles a different analytic. Keys are what
  `settings.homePins` stores: rename a card freely, never its key.
- **`empty:true` is "this card has nothing to say about this practice"** - Review status with
  nobody to review, Long-term clients with nobody past twenty. The Trends section **drops** those
  (which is how it has always behaved); Home **keeps** them, because a card the reader pinned must
  not silently vanish - an empty space where a chosen figure used to be reads as a fault.

### Pinned analytics (Sep 2026)
Any card in Business analytics can be pinned to Home with the small house (`pinBtn`) in its heading
row. `settings.homePins` holds the keys.
- **The pinned card is the SAME card, not a summary of it** - the same builder, the same figures,
  so the two screens can never disagree. A second, smaller rendering of "days to payment" that
  rounds differently or uses a different window is the failure this design exists to prevent, and
  `npm run test:pins` asserts the two renderings are character-for-character equal for all of them.
- **`ANA_PIN_MAX` is 4.** Home is the screen you glance at, and every pinned card is real work on
  the app's hottest render. A fifth is refused with a message, never silently swapped in.
- **`homePins()` repairs on read, like `homeOrder()`** - a key this build does not have is dropped,
  so an old backup can never put a card on Home that no longer exists. In settings rather than
  localStorage (so a pin travels in a backup), and nothing is stored while nothing is pinned.
- **`plusLocked("trends")` or `feat("trends")` off ⇒ `pinBtn()` returns nothing and the Home block
  is empty.** A control that pins a card the reader cannot open is not a control; the locked view's
  free funnel is a shopfront, not a pinnable card.
- **Behind the gate the invitation still appears, at the FOOT of Home** (`homePinLockedHTML()`,
  Sep 2026). Trends under the gate is a sneak peek rather than a wall, so the screen a locked
  reader opens every morning must not be the one place that says nothing about it. Four rules,
  each borrowed from a neighbour: it renders **outside `HOME_CARDS`** and last, so a card nobody
  has paid for can neither sit above the reader's own figures nor take an arranged block's slot
  (`homePinsBlock()` still returns `""` while the gate is down, and `_homeVisible` still has no
  `pins` in it); **`feat("trends")` off shows nothing**, because switched off is a preference and
  there is nothing to sell - the same split Money's projection tile makes; it obeys the **same
  `ANA_PIN_PROMPT_MIN`** as the real invitation; and a **lapsed** subscriber with pins still
  stored is told they are saved rather than watching them vanish. The button lands on Business
  analytics with **no `focus`**, for the reason `goProjection()` does. `homePinSheet()` answers
  the two states separately as well - switched off is a toast about the switch, locked opens the
  paywall sheet.
- **Toggling from Trends repaints the buttons (`paintPins`), never redraws the section** - a pin
  tapped halfway down must not throw the reader back to the top. Home redraws itself with
  `keepScroll`, because the card being unpinned is the one on screen.
- `homePinSheet()` is the picker behind the empty card's button: grouped by section, staged until
  **Done**, one `commit()`. Readiness is deliberately **not** shown - working out whether all
  twenty-two have enough data means running all twenty-two, and a card that is waiting says so in
  its own words once it is on the screen.

### Where this year lands - the year-end projection (Sep 2026)
`anaProjection()` answers "what will this year come to" **three ways at once**, because there is no
single right answer and hiding the working behind one number is how a projection gets believed more
than it deserves. Revenue and profit before tax for the current tax year, on a basis the reader
picks; it lives in **Business analytics › Money** (`acProjection`, registry key `projection`) and
not on Money › Overview, for three reasons: it is inference from history rather than a record of
what happened, the seasonal basis needs `anaSeasonality()` which lives here, and only an `ANA_CARDS`
entry can be pinned to Home.
- **Run rate is deliberately the dumb one, and that is load-bearing.** `elapsed`/`yearDays` is
  copied from `taxForYear()` character for character so the run-rate profit **is** the figure
  Tax › Estimate projects its bill from. A smarter scale here - projecting income and costs
  separately, say, since `ledgerBetween` already knows a whole year's recurring costs - is more
  accurate and was rejected: two screens quoting two different year-ends is worse than one screen
  quoting a rougher one, and nothing would throw. `npm run test:projection` asserts the equality.
- **Seasonal divides by a share of a typical YEAR, not a share of the days.** `projSeasonWeight()`
  walks the tax year a month at a time against `anaSeasonality()`'s indices, pro-rating the two
  April stubs by days. A month with no history is worth an **average** month (100): `idx == null`
  means "not measured", which is a different fact from £0. It gates on seasonality's own two-year
  rule and says so rather than quietly falling back to the flat one.
- **Trailing 12 months is not a forecast and must never be worded as one.** The twelve **complete**
  months to last month end - the month in progress is excluded, or it reads low every time and
  lowest on the 1st. Home's one-line summary carries a **separate sentence** for it: substituting
  the basis name into "on X, 2026-27 lands near £28,170" says the year just gone is this year,
  which is the one claim the card exists to let the reader check.
- **`projWindow(from,to)` returns income AND profit together**, counted exactly the way
  `tyIncome`/`tyNet` count a tax year (same basis, same room/supervision/ledger arithmetic). One
  function rather than two so the pair cannot drift into a margin nobody can reconcile.
  `tyIncome`/`tyNet` stay the source for the tax year itself - they are memoised and they are what
  the tax engine reads - so this is only ever asked about windows that are **not** a tax year.
- **The chart is CLIENT FEES ONLY, and it says so above itself.** Other income and the ledger are
  in the headline figures; charting them per month means twelve more `ledgerBetween()` passes on
  the app's hottest render for a line most practices do not have.
- **Thirteen bars, in the order the year happens.** A tax year starts and ends in April. Folding
  the closing 1–5 April stub into the opening bar was tried first and puts a "still to come" cap on
  the **leftmost** bar - five days of next April sitting on top of a month that finished in the
  spring. Both Aprils are labelled plainly (at 9px "Apr ’27" runs into March beside it) and the
  chart states its full span in its own heading instead.
- **`scrollChart` gained `data-keepleft`.** Every other chart here reads backwards from now, so the
  newest period is the one to land on; this one reads **forward from a fixed start**, and without
  it the reader lands in next February with April off the left edge. Marked on the wrap rather than
  passed at every call site - the generic sweeps in Trends and on Home pass `null` and have no idea
  which chart they are looking at.
- **Memoised through `tyMemo`**, which is cleared on every navigation, save and `normalize()`.
  Home draws it on the app's hottest render and Business analytics draws it again a tap later.
- **The basis toggle is not a redraw.** All three panes are in the markup and `wireProjection()`
  flips which is hidden. The same card is drawn on Home when it is pinned, where a redraw means
  re-running the whole home screen to change one word. `projBasis` is module-level like `trendSeg`,
  so Home and Business analytics can never be showing two different bases.
- **Money is the actuals tab and borrows this figure rather than computing one** (Sep 2026).
  `incomeForecast()` used to work out its own month projection - billed to date plus the larger of
  what was already booked and an eight-week daily average - and Money › Overview's *This month &
  year at a glance* showed it. **That projection is gone.** Two projections of one practice, on two
  screens, by two methods is exactly the drift this codebase keeps warning about, and
  `anaProjection()` is the one with three bases, profit before tax and its own tests. The tile now
  carries `anaProjection()`'s revenue and hands the reader over to the card that shows the working.
  Three states, and the last two differ for the reason `feat()` and `plusLocked()` always differ:
  - **Locked** is a billing state, so the therapist's **own figure is shown blurred** (`.blurfig`)
    with a `tierTagHTML` chip and the way in beside it. Blurred, never replaced and never invented:
    same posture as the sneak peek, which shows real figures from this practice. The number is
    `aria-hidden` and the tile carries the honest label - a screen reader reading out the very
    figure the design is withholding is the worst of both. It is a shopfront, not a secret
    (`docs/monetisation.md` §5.4). The locked money **peek row names the projection first**, so the
    promise the blurred tile makes is kept on the screen it lands on.
  - **Switched off** is a preference the reader set, so there is nothing to sell: no tile and no
    tease, and the slot goes back to being a fact ("Last month, in full").
  - `goProjection()` lands a locked reader on Business analytics **with no `focus`** - under the
    gate that screen is the sneak peek and the card is not rendered, so focusing its id would
    scroll nowhere in particular.
- **Removing that projection took its comparison with it.** "vs last month" was *projected month
  against whole last month*; with no projection the honest replacement is month-to-date against
  **the same span of last month** (`mtdLast`/`deltaTD`), clamped so the 31st compares against the
  end of a 30-day month. When nothing was billed by that point last month - an August off, or a
  practice that had not started - the label **says so** rather than printing "-" beside "(£0)",
  which reads as a broken tile.
- **Home links through** (`goProjection`): "Billed this tax year" is a part-year figure and the
  question in front of it is what the whole year comes to, so the tile is now `.clk` with a
  chevron and one line under the four figures carries the projection. Both are gated on
  `anaPinnable()` for the same reason `pinBtn()` is - a figure linking to a screen this device
  cannot open is not a link. `trendsHeadFig("money")` leads with it too, falling back to
  `anaFloor`'s typical month.

### The four sections
`TREND_SEGS` / `trendSeg`, with its own segment bar inside the view, and above the cards a **headline strip** (`trendsHeadline`) carrying one real figure from each of the three sections you are *not* reading, each tapping through to it - navigation as much as decoration. Same contract as everything else here: `trendsHeadFig()` returns `null` rather than invent one, the tile is left out, and if none of the three is ready the strip does not render. **Sections are built only when opened** - `clientAttendance()` across a whole client list and `anaCohorts()` are both real work, and changing section redraws `#trbody` only, never `go()`, so the reader is not thrown to the top of Practice.
- **Clients** - retention funnel, drifting away, review status, attendance, cohort retention, episode length, referral sources, long-term.
- **Money** - seasonality, your floor, what a session actually earns, days to payment, who pays late, cost ratio, missed sessions.
- **Time** - effective hourly rate, capacity, your regular slots, weeks actually worked.
- **You** - supervision cadence, load, CPD trajectory.

### Things that will bite
- **`clientCategory(status)`, never `catOf(status)`.** `catOf(kind,key)` is the *expenses/income* category lookup and takes two arguments; called with a client status it returns an object and the comparison is silently always false. `anaDrifting` and `anaEpisodes` both did this, which put finished clients on a list headed "clients you have **not** marked as finished" and counted every ongoing client as completed work. Fixed Sep 2026 - there is no other status→category helper, so reach for that name.
- **`anaEpisodes()` reports two numbers, and the second one is not optional.** `median` counts FINISHED work only - a client still being seen has a length that has not happened yet. But short work finishes first, so the finished pile is permanently over-supplied with it while the long-running clients sit on the books: a practice whose ongoing work is much longer reads as one that does shorter work than it does. `floor` is the median with the in-progress clients counted at the length they have reached so far - those can only grow, so the true answer is at or above it. `beyond` counts the ongoing clients already past `median`, which is the sentence that says the headline is being dragged down. Show both or the card is misleading.
- **`anaCohorts()` ripeness is the WHOLE cohort, not whoever is old enough.** A milestone is answered only when every member has had those weeks. Measuring on the ripe subset built a percentage out of the early joiners alone, and a group with nobody old enough could still land on a red 0% - the exact misreading the dash exists to prevent. A dash means "not yet"; a nought means "nobody stayed", and the table must never confuse the two.
- **`anaDaysToPay()` never averages up-front payments in with real waits** (Sep 2026). The gap used to be clamped at zero and every payment averaged together, which is wrong for the way most therapy is paid for: a practice paid at the session, or by standing order the week before, has gaps of mostly 0, a median of 0 or 1, and a flat line along the bottom of the chart every month. It also hid the only part worth asking about - fifty same-day payments averaged against three sixty-day waits reports "typically 0 days" about a practice with a real collection problem. Rows are split at the session date: **`upfrontPct` is a percentage** (that is what "everyone pays at the session" looks like as a figure) and **every waiting figure - `avg`, `worst`, `over30`, `recentAvg`/`olderAvg` - describes the `after` group alone.** Nothing is clamped, so paying a fortnight ahead reads as a fortnight ahead. The chart plots only genuine waits; a month where everyone paid on the day is *absent* rather than plotted as a nought, which would read as "instant" instead of "nothing to measure". Fewer than three real waits gets its own card, not a chart of zeroes.
- **`anaDaysToPay()` dates on the SESSION, not the payment.** A March session paid in June belongs to March, or a slow month looks fine simply because nothing has landed yet. **The month in progress is a bucket (`i=0`)** - the loop used to start at last month while the readiness test counted every paid session, so a practice whose payments were all from this month passed the gate and then printed a 0-day wait against an empty chart. All the headline figures come from the rows, not the buckets, for the same reason. The then/now windows must not overlap (`compareMonths`): `slice(-6)` against `slice(0,6)` shared five months on a short history and compared a period against itself.
- **`anaLatePayers()` reports drift, not debt** (Sep 2026). It was sorted by what each client owed *today*, which made it a worklist - and the app already has that one, on Sessions › Unpaid with a Chase button. Under a Trends heading it answered a question nobody came to Trends to ask and buried the one they did. Each client's payments are now split into **their own** earlier and later half (`ANA_LP_MIN` = 4 payments before anyone gets a trend, `ANA_LP_DRIFT` = 5 days before movement is called a change), and `drift` sorts the list, so the client who has quietly gone from paying on the day to paying three weeks late leads it with nothing overdue. **Halves of their own record, never a calendar window** - a fortnightly client and a weekly one cover very different ground in the same six months. Up-front payments are kept out of the waiting figure for the same reason as above. Current debt stays on the row as context and must not be put back in the sort.
- **`anaFeeErosion()`'s gap is written-off fee on missed sessions and NOTHING else** (Sep 2026). `derive()` gives every session a `fullRate` and a `rate`, and `rate` differs from `fullRate` in exactly one way - the cancellation charge stamped on it - so the distance between the card's two lines can only be that charge. The card used to claim the gap was also made of "clients still on an older rate" and "a mix that has shifted": those move the fee line *itself* and arithmetically cannot appear in the gap. It is now titled **"What a session actually earns"**, carries three figures because the reader has three questions (per session booked, per session that went ahead, what the fees say), names the gap for what it is and counts the missed sessions behind it. **Headlines are averages over the whole span, not last month alone** - one month of a small practice is a handful of sessions, and the old last-month headline read −£8.64/14% on the established fixture where the real 18-month figure is −£1.48/2%.
- **Drifting away and Review status are one ladder, not two views of the same names.** `anaDrifting()` returns `rows` (1.5×–3× their own interval: text them) and `review` (past 3×: their status is wrong), split on `clientAttendance(c).currentPause` - the same predicate the Review status card reads, so the two cannot disagree about which side of the line somebody is on. Don't render `rows.concat(review)`.
- **`anaCostRatio()` must count the costs that hang off a session.** Per-session room fees (`derive().roomRate`) and supervision never reach `ledgerBetween` - it only knows about entered costs, monthly rent and use of home - and `tyNet` subtracts both by hand for that reason. For a therapist hiring a room by the hour the room is the largest line of the year, and leaving it out understated "what the practice costs to run" by most of it. Rooms on a monthly rent carry a per-session rate of £0, so they arrive via `led.roomRent` and are not double-counted. **Do not add `led.useOfHome` on top of `led.expenses`** either - `ledgerBetween` folds the use-of-home claim into `expenses` before it returns, so counting it again inflates the ratio and is why the itemised categories stopped adding up to the headline figure. Found Sep 2026 by the whole-practice corpus.
- **`SLOT_DAYS` holds lowercase matcher keys, not display text** - `anaSlots()` renders through `SLOT_DAY_NAMES` or every row says "sun".
- **`anaSlots()` is "Your regular slots", not "Slot reliability"** (renamed and refocused Sep 2026). It used to draw a bar per slot showing the share of that slot's bookings that went ahead, and the answer to that question is nearly always "almost all of them": a slot is only in the records **because** it was booked, and a booked session is kept far more often than not, so every practice read as a wall of 90-somethings. It now leads on **`share`** - what proportion of the last six months' bookings sit in each day-and-hour - with `busiest`, `busiestDay`, `top3Pct` and `regularPct` behind the sentence under the bars. Two things to keep: the **bars are scaled to the busiest slot, not to 100%**, because no single hour of one day is much of a whole week and ten honest stubs compare nothing; and the leaky-slot footnote is gated on **five bookings**, not the three that get a slot onto the card at all - "one in three of your three fell over" is not grounds for dropping an hour. `days` counts **every** timed booking, not only the ones in a repeating slot, because "which day am I busiest" is a question about the day.
- **`anaCPD()` reports pace from the last 90 days, not the running total**, and the card has **four** states: the awkward one (target met, pace since dropped) is exactly what a running total hides.
- Three settings feed it and nothing else: `settings.sessionMins` (50), `adminMinsPerSession` (15) and `fullWeekSessions` (**deliberately unset** - `anaCapacity()` falls back to the busiest week actually worked and says so, rather than inventing a target).
- **`client.source`** is free text, not an enum - every practice names its sources differently. The *input* is a `<select>` of `sourceSuggestions()` plus "Something else…" (`SRC_OTHER` / `srcPickValue` / `wireSourcePicker`), **not a `<datalist>`**: that control is the one browsers cannot agree on - Chrome opens it on a double-click, iOS Safari not until a matching letter is typed, and nothing hints a list exists - and the suggestions are the whole point, since "Word of mouth" / "word of mouth" / "WoM" become three rows in the analytic. `anonymiseClients()` clears it.
- **`anaSources()` shows an `Unknown` row** (`ANA_SOURCE_UNKNOWN`, always sorted last, flagged `unknown`) rather than dropping clients with nothing filled in. It is still kept apart from any real source - never asked is a different fact from found us themselves - but the table has to add up to the whole practice, or a reader draws the wrong conclusion from the half of it they can see. One named source is enough to be ready; a table that is nothing but Unknown stays a prompt.

## Reports for courses and professional bodies (Sep 2026)

**Practice › Reports**, after Business analytics. A therapist picks a period and a set of
sections and gets one page — client hours, the in-person share, supervision and the ratio, CPD
— to print, save as a PDF, or hand over as a spreadsheet. Gated on `feat("reports")` and in
`PLUS_FEATURES`. Strategy and where this is going: `docs/institutional-partnerships-2026-09.md`.

- **The engine is pure and ungated**, the same contract as `ana*` and the tax engine.
  `reportBuild(spec)` reads `S` and `today()`, returns a plain object and writes nothing;
  `plusLocked("reports")` decides what the **view** renders. `npm run test:reports` asserts
  that a locked build still computes and that a locked screen prints no figure.
- **One shape, two renderers.** Every `REPORT_SECTIONS[k].build(ctx)` returns the same
  `{title, kpis, work, table, note, decl}` block, and `reportBlockHTML(b, doc)` draws it for
  the screen *and* for paper. Same rule as `mtdRows()` and `backupPayload()`, for the same
  reason: two renderers built from two literals eventually disagree, and the place that would
  surface is a form somebody has already submitted.
- **The preview truncates a long table; the document never does.** `REPORT_PREVIEW_ROWS` (25)
  caps the on-screen copy and the preview says how many rows it is not showing. A client log is
  every session by definition — the established fixture prints 1,145 rows and came out 35,000
  pixels tall, which is the correct document and an unusable screen. There is a test asserting
  the document is not capped, because a truncated submitted log would be silent.
- **Every date in a report carries its year** (`fmtRD`, not `fmtDshort`). "Mon, 05 Dec" is the
  right in-context format on a screen showing this month and useless on a four-year report read
  by a tutor who was not there.
- **A 50-minute session IS one clinical hour, and `clinical` is therefore the DEFAULT.**
  `CLINICAL_HOUR_MINS` is 50, not 60 — the therapeutic hour is 50 minutes with the rest for
  notes, and that is the convention across UK counselling training and accreditation. Counting
  a standard session as elapsed time (0.83 hrs) understates a trainee's hours **by a sixth**
  against the figure their course is actually asking for. The report shipped defaulting to
  elapsed time; that was wrong and was corrected the same day.
- **Three modes, in `REPORT_HOUR_MODES`, and the course decides which.** `clinical` (one hour
  per session), `prorata` (`mins / CLINICAL_HOUR_MINS` — a 90-minute session is 1.8 hours, a
  25-minute one 0.5) and `actual` (elapsed clock time). `reportHourMode(spec)` is the one place
  the mode is read and **falls back to `clinical` for a mode it does not recognise**, so a spec
  restored from another build never produces `NaN` hours.
- **A non-standard session length counting one hour each is warned about on the page**, not
  silently reported. `reportHours().mismatch` fires when `sessionMins()` is outside 45–60 and
  the mode is `clinical`, and names the pro-rata figure. Counting 90-minute sessions as one
  hour each understates by nearly half, and only the therapist knows which basis her course
  wants — so say it, never quietly pick.
- **`reportHours()` is the honest bit and must stay that way.** GroundWork stores a session,
  not a duration, so every figure comes from `sessionMins()` — one practice-wide setting, never
  a sum of recorded lengths — and every report prints its own arithmetic and the caveat beside
  it. Per-client rows derive their per-session figure from `h.hours / h.sessions`, so a row can
  never disagree with the headline above it whatever mode is in force. Per-session duration is
  `docs/tasks/T10-training-record.md`; when it lands the three modes keep their meanings and
  only the source of `mins` changes.
- **Missed sessions never count toward hours**, whether or not they were charged — what a late
  cancellation earned is a separate question, answered under Money. A future booking is not a
  delivered hour either; `reportCtx` clamps the range end to `today()`. Both are tested by
  probe: the harness adds a DNA and a future session and asserts the figure does not move.
- **A saved spec stores the RANGE KEY, never resolved dates.** "Last 12 months" saved in March
  has to still mean twelve months when it is run in June, or every saved report quietly becomes
  a snapshot of the day it was written.
- **`REPORT_TEMPLATES` are starting points, never approved forms**, and nothing may describe
  them otherwise. Each carries a `source` line naming what it was shaped from, printed on the
  document. The footer states what the document is and is not, and there is a test asserting it
  never says "approved by", "guarantees" or "certifies". Same guard-rail discipline as
  `docs/tax-positioning-2026-09.md` §2.
- **Nothing clinical, no names, no money.** Clients appear by code only. The harness scans the
  printed document for every client name, every `adminNote` and any currency figure, on all
  eight practices — the claim in the footer has to be true, not merely intended.
- **The signature block prints lines, it does not attest anything.** Nothing is hashed and a
  report is not locked against later editing; the info topic says so. Signatures, locked
  periods and a verifier are Stage 3 in the partnerships plan, deliberately not here.
- **Printing goes through `printDoc(html, filename)`, not `printReceipt`.** `printReceipt`
  keeps its own body because the native shell already re-declares it with exactly four
  arguments; `printDoc` is wrapped natively in its own right, so a report becomes a real PDF on
  an iPhone rather than silently doing nothing (`window.print()` is a no-op in WKWebView).
  `check-drift.mjs` asserts the name.
- `_reportDraft` is module-level for the same reason `pracTab` is: saving re-renders Practice,
  and a draft in a closure would vanish underneath the reader. Nothing is written to `S` until
  Save — the staging shape the guided flows use.
- The two `infoDef` topics are registered **with all the others, after `const INFO`**. Calling
  `infoDef()` from the report block would be a temporal dead zone and would throw at load — the
  same trap as `ATT_OK_PCT`.

## Cancellations & DNAs (added Aug 2026)
Two kinds of missed session, and the charge is **stamped on the session**, never derived live from the policy.
- `settings.cancelRules = {window:[{hoursBefore,chargePct}], dnaChargePct}`. `cancelPolicy()` sorts windows **longest notice first** and `cancelPolicyPct(kind,hrs)` returns the first one the notice clears. Notice that clears no rule - and notice that was never recorded (`hrs==null`) - charges the **full fee**. That direction is deliberate: a draft that is too high gets corrected on the spot, one that is too low is a fee quietly written off. A therapist wanting a lower floor adds a rule at 0 hours.
- The policy is only ever a **starting point**. `cancelPctFor(s)` reads `s.cancelCharge` and nothing else, so editing the policy cannot reach back and rewrite what a client was already billed. Absent = 100, which is what every session was before v5.
- `derive()` returns `fullRate` (the fee in force), `cancelPct` and `rate` (`fullRate × pct`). Everything downstream - revenue, net, SA103, MTD - reads `rate`, so a reduced charge flows through from that one place. **The MTD quarters must still reconcile to `tyNet` on both bases.**
- **`isCancelled(s)` is the exclusion predicate**, not `isLateCancel`. A DNA has to be excluded from clinical hours, attendance, session counts and milestones for exactly the same reasons a late cancellation is. `isLateCancel` still reads the historical `"Y (late cancellation)"` notes convention and is what sets the `lateCancel` flag itself - don't merge them.
- The session form's charge box carries `data-auto` while it holds a policy-derived figure, so adding the cancellation date afterwards re-derives it; typing in the box clears the mark and the number is then left alone.
- A missed session that **was** charged now appears on receipts (`receiptRows`), labelled in the Mode column, or the statement total would not match what the client was asked to pay.

## Gradual reveal (settings.reveal, added Aug 2026)
No new gating layer - this only decides which existing `feat()` flags start off for a brand-new install.
- `settings.reveal = {mode:"simple"|"all", shown:[]}`. `normalize()` defaults `mode` to **"all"**; only `stepDepth` ever sets `"simple"`, and it is only offered when `!rerun && no sessions && no clients`. Hiding tabs from someone already using them is the one outcome this must never produce.
- `REVEAL_CORE` is what stays on: **`supervision`, `money`, `attention`** - who am I seeing next, and who owes me money. `attention` is core because overdue payments are worth knowing about from week one; `gamify` and `receipts` were moved out of it because rings, medals and a statement button answer neither question on day one. `REVEAL_STEPS` is the ordered list of what gets offered back and what earns it. A step's `keys` may hold **more than one flag**: `tax` and `finances` are revealed together at 10 sessions, because an estimate that ignores what the practice costs you is one nobody should set money aside against. `shown` is keyed on `keys[0]`.
- Schedule (ordered by threshold): **5** sessions *and at least one paid* → Receipts & statements · **10** → Tax + Costs & other income · **15** → Streaks & celebrations · **20** → Trends · **40** → Table view.
- Home gates two extras on its own, in **every** mode: the revenue sparkline needs 10 sessions (24 weeks of £0 is not a trend) and the longstanding-clients card needs a client at 6+ sessions. Neither is a `feat()` flag, so neither is ever offered - they simply appear.- `trends` is a feature flag (a segment inside Practice, not a tab). Absent = on, so existing installs and "show everything" keep it; only the simple preset switches it off.
- **`accreditation` and `peer` are excluded from the simple preset** - `stepCPD` asks about both directly, and an answered question beats a default. Peer is never offered by a milestone: whether someone attends peer supervision is a fact about their practice, not something a session count can infer. `startSetup` unticks `peer` for a fresh install only (normalize leaves it absent = on, so existing installs keep it).
- `revealCheck()` runs from `commit()` **after** the write, never before - an accepted nudge commits again and must not interleave with the save that triggered it. One offer per save; the key goes into `shown` whether accepted or declined, so nothing is ever asked twice.

## GroundWork Pro & the UK tax year packages - the paywall (reworked Sep 2026)

Two things are sold, and they are different shapes: **GroundWork Pro**, one **monthly**
subscription, and a **one-off purchase per UK tax year**, which is what calculates tax. **The web
build is ungated** - Phase 1 keeps the PWA free as the shopfront. Full design and the decisions
behind it in **`docs/monetisation.md`**.

**This replaced a two-tier ladder** (GroundWork Plus in chrome, GroundWork Pro in gold, both
annual). Anything written before Sep 2026 that says "Plus" means Pro; anything that says the tax
bundle is part of Pro is out of date. Chrome (`--tier2-*`) is retired and **gold is the one paid
accent** - Business analytics, every lock card, the tab accent, the masks and the splash mark.

- **GroundWork Pro** (`FEATURE_TIER`): `trends`, `finances`, `accreditation`, `notesSync`. Nothing
  in it depends on where the reader pays tax, which is what makes it sellable outside the UK.
- **A tax year package**: every computed tax figure for that year **and every earlier year**, plus
  that year's MTD export. **It requires Pro.**

### The three rules the code depends on

- **The gate never touches the data plane.** Logging, receipts, and every import/export/backup path
  stay free permanently - a paywall must never sit between a therapist and her own records (also UK
  GDPR portability). `check-drift.mjs` asserts `commit()`, `exportJSON()`, `importJSON()` and
  `importFromText()` call neither `plusLocked()` nor `taxYearPaid()`.
- **Three axes, never collapsed.** `feat(k)` is a preference the user set; `plusLocked(k)` is a
  billing state; `taxYearLocked(ty)` is a *different* billing state, per year. Overloading `feat`
  would drop paid tabs out of `visibleTabs()` entirely, leaving nothing to sell from.
- **The gate stays out of the engine.** `tyNet`, `taxForYear`, `taxLiability`, `taxPot`,
  `taxSchedule`, `taxTimeline`, `mtdQuarters`, `mtdExport` and `ledgerBetween` are pure and ungated
  - `tests/tax-tests.js` calls them directly. Gate the *button*, never the function.
  `check-drift.mjs` asserts this for both gates; a tax test failing because of the paywall means it
  has been put in the wrong layer.

### The entitlement: two caches, two lifetimes

- **`tt_plus` and `tt_taxpack` in localStorage, never in `S`** - same rule as `tt_lock`. `S` travels
  in backups, so an entitlement in it would ride a `.json` onto another phone. **Two keys, not one
  object:** a subscription lapses and `plusClear()` wipes its record, while a non-consumable is
  owned for good; in one record a lapse would delete purchases Apple still considers owned.
- **`tt_taxpack.through` is a single tax year and it is the whole model** - every year at or below it
  is unlocked. `YYYY-YY` is fixed-width with an incrementing lead, so a plain string compare orders
  them. **`taxPackGrant()` is the only writer and it takes the max**: a non-consumable cannot be
  re-issued, so a write that lowered the watermark is money taken for something the reader then does
  not have. That one rule makes an out-of-order restore, a partial StoreKit refresh and the legacy
  grant all safe without any of them knowing the others exist.
- **`taxYearPaid(ty)` is Pro AND the year, in that order**, and Pro being a prerequisite is
  load-bearing: Costs & other income is in Pro, and a tax figure worked out with no costs taken off
  it is wrong every time. `taxLockReason()` returns `"sub"` / `"year"` / `"both"` - three answers,
  because "you need Pro as well" and "you need the year" send a reader to different places.
- **An entitlement with no `tier`, or on the withdrawn `"plus"` rung, is Pro.** `tierOf()` applies
  it. There is no migration step and there must never be one - a default cannot half-run.
- **A live legacy annual subscriber is granted tax years through their renewal date.** The Swift
  reports `legacyTaxThrough` and it is **derived on every status call**, not written once, so it
  survives a new phone. Without it, somebody paying today finds their figures masked on update.
- **The legacy StoreKit product id sells Pro.** `…groundwork.plus.annual` says "plus" and entitles
  everything, because that is what it has always done and an id can never be reused. Never
  re-point it; `check-drift.mjs` fails if the mapping changes. The monthly product
  (`…groundwork.pro.monthly`) is the one on sale, in the **same subscription group**.
- **Tax years are non-consumables**, id `…groundwork.taxyear.<start year>` (so `.2026` is 2026-27).
  `check-drift.mjs` asserts the prefix matches between the Swift and the JS - a change to it orphans
  every purchase already made, silently.
- **`plusActive()` and `taxYearPaid()` are synchronous** (called from render paths) and every
  failure path **fails open**. `PLUS_EXPIRY_GRACE_DAYS` (7) covers a renewal not yet verified. The
  one place fail-open cannot apply is an unreadable `tt_taxpack` - no year is named, so there is
  nothing to open to; the remedy is the **Restore purchases** button on every year sheet.
- **`window.GWPlusNative` is the only seam to StoreKit.** `plusStatus` answers for both axes in one
  round trip, so a refresh can never leave one cache stale against the other.

### The tax mask - "not calculated", not "blurred"

**The Tax tab opens for everybody and must never become a locked view again.** It used to render a
card describing four screens nobody had seen, which is a poor advert for figures worked out from the
reader's own records - and the tab holds their own settings besides. What is bought is the
*calculation*, so the whole tab walks and only computed figures are masked.

- **`taxMaskHTML` / `taxMaskCard` compute nothing.** `.blurfig` on Money › Overview computes a real
  figure and blurs it, which is right there because that figure is the practice's own history. Here
  the view **must not call the engine** for a locked year where the call exists only to produce the
  masked figure - so "needs the tax year to calculate this" is literally true, nothing is left in
  the DOM to read, and the most expensive render in the app costs nothing for a reader who cannot
  see it. `npm run test:tiers` asserts no `£` figure and no `.blurfig` appears on a locked Tax tab,
  which is the test that fails if somebody reimplements this as a blur.
- **The mask covers tax the app computed, never money the practice recorded.** Masked:
  `taxLiability`, `taxPot`, `taxSchedule`/`nextTaxPayment`/`taxTimeline` amounts,
  `monthlyTakeHome`, and the app's own estimate beside what HMRC assessed. Never masked: billed,
  received, overdue, session counts, **`tyNet` (the Net column - that is profit, not tax)**, the MTD
  quarter figures, **due dates** (when money leaves the account is not a calculation, and a date the
  reader cannot see could cost them a penalty), and anything the therapist typed in.
- **It is drawn in the SHAPE of the missing figure - `£•,•••`, or `••%` where a percentage belongs -
  never as a badge reading "Locked"** (Sep 2026). Every mask used to be a gold pill with a padlock
  and that word in it, so the Estimate table alone carried five of them and the tab read as a
  sales pitch repeated once per figure rather than as one screen waiting on one purchase. The dots
  say the same thing in the reader's own terms, and the explaining is left where it was already
  being done properly: the gate card at the top of the screen, the `aria-label`, and the tap.
  `TAX_MASK_SHAPES` holds the two shapes and `taxMaskHTML(ty, cls, shape)` takes the key - **a
  percentage masked as `£•,•••` is a different claim**, which is why the pot's rate KPI passes
  `"pct"`. Nothing computes anything either way, and that is the part that must never move.
  - **`.taxmask` sets `font:inherit`, and that is load-bearing twice.** The mask takes the size and
    weight of the figure it stands in for, so a row cannot jump when the year is unlocked (`.big`
    now only keeps the vertical rhythm, it no longer guesses at a headline's size); and it must put
    `-webkit-text-fill-color` back to `currentColor`, because `.nowcard .nv` and `.kpi .v` paint
    their numbers with a clipped gradient over a **transparent fill**, which inherits straight
    through and would render the dots invisible.
  - **A line that is not standing in for a figure does not get a mask.** The MTD export note is a
    sentence about a *file*, with every quarter figure already on the screen above it, so it is a
    plain muted line with a lock glyph - the export buttons themselves already open the year's
    sheet.
- **Unlike `.blurfig` it is not `aria-hidden`** - there is no number being withheld, only a state,
  and the state is announced. The label beside it stays honest and unmasked.
- **One mask per row**: a breakdown line under a masked total says "not calculated" in words, or a
  single row carries four masked figures and says nothing more for it.
- **Tax › Now short-circuits before any engine call**, and seasonal moments are not raised for a
  locked year - every one of them quotes an amount and `taxMoments()` reaches `taxPot()` to build
  them, so a moment is the one place a masked figure would leak out in a sentence.
- **Pot & payments masks per row by the tax year the money BELONGS to, never by the due date** - one
  31 January is usually two years' money, which is the whole reason `taxTimeline()` assembles by due
  date. Its buffer and balance stay editable, and entering what HMRC assessed is never locked.
- **Tax › Per year is untouched.** Student loan, region and use of home are inputs, not
  calculations. Entering your own circumstances is never behind a paywall.
- **MTD quarter figures stay visible; the export file is what the year buys.** The figures are the
  practice's own money added up and are on Money either way; what MTD needs is a *file* with a
  digital link (`docs/tax-positioning-2026-09.md`). A judgement call, documented in
  `docs/monetisation.md` §5.4 - change it deliberately, don't drift into it.

### Pro is never sold on tax

The one way this design could take money unfairly is somebody subscribing to Pro in January
expecting a tax figure. So the exclusion is **stated**, not merely not-claimed, everywhere money is
asked for: `TIER_BLURB.pro`, the `.taxsep` panel on `openPlusSheet()` (full width, above the fold,
not small print), the Settings card's tax line - **present even when nothing has been bought**,
because "No tax year bought yet" is what prevents the misunderstanding - `infoDef("tax-packages")`,
and `openTaxPackSheet()`'s two numbered steps with Pro first. `npm run test:tiers` asserts the
sentence is on the sheet and that no withdrawn tier is named on it.

- **`npm run test:tiers`** (`scripts/check-tiers.mjs`) is 57 assertions in a real browser: the free/
  Pro/tax-year matrix, the three lock reasons, the watermark refusing to go down, a lapse leaving
  the years owned, the withdrawn tier reading as Pro, the Tax tab opening, the masks, the
  mis-selling sentence and the two-step year sheet. The matrix is written out from
  `docs/monetisation.md` §§2-3, never read back from `FEATURE_TIER` - a test that read the table it
  is checking would assert nothing.

Gated: `trends`, `finances`, `accreditation`, `notesSync` (**Pro**) - `FEATURE_TIER`. `tax` and
`mtd` are **deliberately absent from that table**, and their absence is load-bearing: they are
answered by `taxYearPaid()`, and `plusLocked()` has to say "not locked" for them so nothing can
route a tax lock into the subscription sheet. **`palettes` was dropped in Sep 2026** when colour
schemes were switched off entirely; `paletteLocked()` is now a constant `false`, kept rather than
deleted because the picker and the wizard step still call it.

- **Trends is a sneak peek, not a wall.** `renderMetrics()` computes the retention funnel first and
  only then branches on `plusLocked("trends")`: under the gate the funnel renders **in full on real
  numbers**, and the other three sections are named underneath with **one real figure each from this
  practice** (`.peekrow` / `.peekfig`). The lock is a `return` partway through the function, not a
  mode. **Deliberately not extended to Tax** - a partial tax figure is a wrong tax figure, and the
  mask is the opposite move: it shows nothing rather than something incomplete.
- **What a room costs is never gated** (Sep 2026) - `roomRentCard()` renders beside `roomFeesCard()`
  before the lock on Money › Costs & income.
- **Every lock and mask paints from six local variables** (`--tg1`..`--tg4`, `--tgglow`, `--tgink`)
  set by `.tier-pro`, rather than naming the ramp. That indirection is kept at one rung because it
  is what made the two-tier build possible in one pass and a second paid colour would then be a
  class rather than a sweep. The ring is a `::before` rather than a gradient border, because `.card`
  is a translucent glass surface and a border-box gradient would have to repaint the fill and lose
  the blur. `--tier3-ink` is the only member of the ramp redefined for dark, because it is the only
  one used as **text** - check any change at 13px on a real screen, not in a swatch.
- **The launch screen wears the subscription, not the purchases.** A pre-paint script in `<head>`
  reads `tt_plus` and stamps `data-plus="pro"` on `<html>`, so a subscriber's splash never starts
  plain and changes its mind; `applyPlusChrome()` keeps it honest after a purchase, a restore or a
  lapse. Tax years are deliberately unmarked - the splash marks who you are, not what you have
  bought, and a mark that changed every April would read as a fault.
- **Gifts and comps go through Apple's offer codes on iOS** (`plusRedeem`), not home-grown keys.
  Signed licences (`scripts/issue-licence.mjs`, ECDSA P-256) are for the web and anything Apple
  cannot reach; **`--tax-through` grants tax years separately from the subscription**, deliberately,
  because comping the tax engine is the thing with the April rates work behind it. `PLUS_PUBKEY` is
  `null` until `--keygen` runs - **the private key must never enter this repo.**
- **Testing locked states in a browser:** `localStorage.tt_plus_gate = "on"`. It switches both gates
  on and can never unlock.
Free: everything else, including `receipts`, the spreadsheet import (it is the switching-cost
remover - gate it and nobody ever reaches the paywall), encrypted/automatic backups, and the whole
shape of the Tax tab.

## Gamification (S.game)
- **Streak**: any `commit()` call marks the current ISO week as active via `gameTouch()`.
- **Home view**: streak flame animation, goal progress rings, records badges.
- **Sounds**: `Sfx` (Web Audio, synthesised). Default ON; toggled via 🔊 header button, persisted to `localStorage('tt_sound')`.
- **Confetti**: canvas-based `Confetti` object.
- **Celebrate overlay**: `celebrate(emoji, title, sub, ribbon)`.

## On-page coaching (added Aug 2026)
The tour used to be eight full-screen `.ov` cards describing controls the reader could not see, because the card was on top of them. `coachStart(steps, opts)` dims the page and cuts a spotlight over the real element instead, with a small bubble beside it.
- **A step with no `sel` is centred, deliberately.** "Your notes don't live here" and "use client codes, not names" are ideas, not controls; highlighting an arbitrary card to give an idea somewhere to live is worse than highlighting nothing. A `sel` that matches nothing (a switched-off feature) degrades to the same centred form rather than pointing at the wrong thing.
- **Never animate a reposition driven by scrolling.** `coachPlace(false)` sets `.noanim`; every scroll event otherwise restarted the 0.3s transition from wherever it had got to, so the mask chased the target for the whole scroll and never arrived. `coachScroll()` also skips `coachPinned()` targets - centring the tab bar or the FAB scrolls the page for nothing.
- **`z-index: 44`** - above the tab bar (35) and FAB (40), both of which it has to point at; below sheets (50) and the setup flow (45), neither of which it may ever cover.
- **`TIPS` is the other half.** The per-screen detail that used to be crammed into the tour fires the *first time* that screen is opened, once ever, keyed in `settings.coach.seen` (in settings, not localStorage, so it travels with a backup and a new phone does not replay everything). `coachMaybeTip(tab)` runs at the end of `go()` and stays quiet when a flow, a sheet or another coach is up. `when()` is what keeps a tip worth reading - a tip about folding away finished clients is noise on an empty list.
- Segment-scoped tips (`seg`) must come **after** the tab-wide one in `TIPS` only if you want the general one first; `TIPS.find` returns the first match, and the natural flow is the tab tip on the default segment, then the segment tip when that segment is first opened.

## Setup wizard & guided tour (S.settings)
- **First run**: `startSetup()` fires from init when `S.settings.onboarded` is false. `normalize()` sets `onboarded = true` for any state that already has clients or sessions, so existing installs never see it.
- **Flow engine**: `flowStart/flowGo/flowNext/flowClose` drive a full-screen `.ov` overlay (z-index 45 - above the tab bar, below `#sheet`) from an array of step objects `{emoji,h,sub,html,mount,validate,onLeave}`. Shared by setup and the tour.
- **Tour**: `startTour()` - now on-page coach marks, not the `.ov` flow. Eight stops on day-one essentials, plus a ninth pointing at the Getting started records row for anyone carrying `start.recordsLater`; the intro names the count, so it is substituted in at the end of `tourSteps()` rather than written into the copy. Per-screen depth lives in `TIPS`. Read-only, replayable from Settings › Setup & help, where the tips can also be switched off or reset. Its last stop names the map below.
- **Where everything is** (Sep 2026): `appMapSheet()` - one sheet listing every tab, segment and Settings group with a line each, every row a link. Built from `APP_MAP`, filtered through the same `tabEnabled()` / `feat()` the tab bar uses, so it never lists a screen this install cannot open. Reached from Settings › Setup & help, from the empty Home screen, and named at the end of the tour and in What's new. It answers "where did that go". Keep `APP_MAP` in step when a segment is added, renamed or removed; `npm run test:guidance` clicks every row.
- **What to do, and how often** (Sep 2026): `appJobsSheet()` - **what am I supposed to be doing in here**, split out of "Where everything is" into its own sheet, since asking one of those questions had a reader scroll past the other. Weekly / monthly / every few months / yearly, built from `APP_JOBS`, every row a link (some open a form directly, e.g. logging a session). Reached from Search & help, as the row directly under Getting started - the two "what should I do next" answers sit together. `npm run test:guidance` clicks every row here too.
- **Getting started** (Sep 2026): `startCardHTML()` / `startItems()` - the first block on Home (`HOME_CARDS` key `start`) for a practice under `START_MAX_SESSIONS` (25) sessions, until dismissed. Seven rows, **every one derived from the data** (a client exists, a session is logged, `cancelChosen()`, `payToDetails()`, `lastBackupTs()`), never from a stored tick; the two answers that cannot be read from data - "I'm starting fresh" and "I only work from home" - are the only stored ones, in `settings.start`, so they travel in a backup. `settings.start.recordsLater` is the third thing stored there and is **not** an answer: it is setup's "yes, but not this minute", so it leaves the records row undone and only marks it as the one to start on (`lead` → the **Start here** chip). **The first row is the point of the card**: `startRecordsSheet()` asks which kind of records the reader has and hands them to the right tool, saying which one *adds* (the spreadsheet import) and which *replaces* (a backup restore). `impCommit()` and `importFromText()` stamp `start.records` themselves, so the row ticks without the reader saying so. An established practice never sees it; the **Still on defaults** card is its version for them.
- **Still on defaults** (Sep 2026): `decisionsCardHTML()` at the top of Settings › Your practice - the business settings the app is deciding by default until the reader does: the cancellation policy (`cancelChosen()`: `normalize()` seeds a default, so the test is "still exactly the default and never touched"; `wireCancelRules`'s save sets `cancelRulesChosen`), a blank *how to pay*, an unconfirmed tax region, a working week on defaults. Rows link with `focus` to the card (every Settings card now carries an id), and the card disappears with the last row.
- **Search & help** (Sep 2026): the magnifier in the header (`#helpBtn`, kept on desktop where the gear is hidden) opens `findSheet()`. Empty, it holds the help this screen has - its own `TIPS` replayed (the tips fire once by themselves; this is their second life), Getting started while it shows, **what to do and how often right under it** (`appJobsSheet()`), the app map, the tour, What's new. Typed into, `findIndex(q)` searches clients, sessions, rooms, `ANA_CARDS`, `APP_MAP` screens, `SETTINGS_INDEX` (a static list of Settings cards with keywords, group and card id - keep it in step with `VIEWS.settings`), `INFO` topics and `APP_JOBS`. Every hit is a link. `segOf(tab)` is the one place a tab's current segment is read; `coachMaybeTip` uses it too.
- **What's new**: `WHATS_NEW` (currently **6**) against `tt_whatsnew` in localStorage; `whatsNewSteps()` is rewritten each release cycle and describes only that cycle - the Aug 2026 reorganisation notes were replaced in Sep 2026 rather than appended to, because ten steps is a wall nobody reads. Bump the constant whenever the steps change.
- **Previous records are asked about, not assumed - and the wizard only ever TELLS** (Sep 2026). `stepImport` is "Do you have records from before?": it describes the two kinds (a spreadsheet, which **adds**; a GroundWork backup, which **replaces**) and then takes one of two answers - **"Yes - I'll bring them in"** (`later`) or **"No - starting fresh"** (`fresh`, stored as `start.records="fresh"` by `setupSave`).
  - **`later` is a job outstanding, never an answer, and must never reach `start.records`** - that field is what ticks the Getting started row off. It is recorded as **`settings.start.recordsLater`**, cleared the moment the question is really answered (`startAnswer("records",…)`, `impCommit()`, `importFromText()`).
  - This replaced three answers that were each an *action*: picking a kind launched the importer or a file picker there and then. Somebody whose spreadsheet was on the other computer had no honest answer - "starting fresh" ticks the row and they are never reminded, and picking "a spreadsheet" then cancelling still stamped `start.records="imported"`, a job marked done that nobody did. **Don't reintroduce an in-step launch that stages an answer.**
  - The hand-over is the point: `setupSave` lands a `later` reader on `go("home",{focus:"startCard"})`, the Getting started row carries a **Start here** chip and says why, and `tourSteps()` gains a **ninth stop** pointing at that row (conditional on `recordsLater`, which is why the intro's stop count is substituted in rather than written into the copy).
  - **Restoring a backup is the one route still offered in place**, from the step's footer link and from the welcome step, because it carries the practice's own settings and therefore **finishes setup** (`setupRestoreBackup()` closes the overlay and opens the app as it was on the other device) rather than interrupting it. A cancelled or failed restore leaves the wizard where it was.
- **Re-run**: `confirmRerunSetup()` - warning sheet requiring the user to type `RESET SETUP`. Skips the rooms step once sessions exist.
- **Feature flags**: `feat(key)` gates tabs (`TABS[].ft`), gamification (`celebrate`, `Confetti.burst`), attention feed, receipts, accreditation, `peer` (peer supervision, dep: supervision) and `finances` (costs & other income, dep: income). Off = hidden, never deleted.
- **Removed Sep 2026: the quick-add command bar** (`parseQuickLog` / `quickLogBuild` / `mountQuickLog`, the `quickadd` flag and its reveal step). It was a second, less capable route into the session form - every session it created still had to be opened and corrected. A stored `features.quickadd` on an existing install is now inert; don't reintroduce the key.
- **How are you paid?** `stepPaid()` sits **before** `stepFeatures`, not with the money questions, because it decides whether they mean anything - and because its `onLeave` switches `tax` and `finances` off for a salaried practitioner on a fresh install, which has to be visible on the very next screen so it can be overruled there. Same placement and same reason as `stepDepth`. It writes `settings.defaultPayer`, which is the default for **new clients only** - see **Who pays for the work**.
- **Retention step**: `stepRetention()` sits between money and backup, and its `validate()` refuses blanks or anything outside 1–50 years - a retention period nobody chose is a compliance decision made by a default.
- **Every icon in a setup step is `gi()`, never an emoji character** (Sep 2026). The step heroes already were; the bodies still carried 🌱 🗂 🔒 📥 🔐 ⤓ ↩︎ ✕ ＋ ☀ ☾ and an inline ⚙ in "⚙ Settings › Features", which is exactly the mismatch the glyph table was built to end - the wizard is the first screen anyone sees and it was the last one still drawing in the platform's emoji font. `settings` (the header's own gear), `sprout`, `grid`, `sun`, `moon`, `plus`, `close`, `key` and `undo` were added to `GLYPH` for it. Two places still hold characters on purpose: the `celebrate()` overlay, which is emoji by design, and `startSetup`'s skip `confirm()`, which is a native dialog and cannot render markup. Settings' own **theme chips and sound button** were converted in the same pass - they are the same two controls the wizard draws, and leaving one pair on ☀/☾/🔊 would have been a visible split between the wizard and the screen it sends people to. Both segs carry `flex-wrap:wrap`: three chips with a glyph each are wider than a 320px phone and neither has a `.segwrap` scroller. A label set through `textContent` has to become `innerHTML` when it takes a glyph - that caught the passphrase button and the sound button.
- **`.palopt`'s `.pn`/`.pd` are `display:block`.** As inline spans the name and description ran together into one paragraph - *"Start simpleSessions, clients, money owed…"* - which reads as a typo. Same shape as `.ftrow .fn`/`.fd`.
- **`.palgrid.choices` is the long-form variant** used by `stepDepth`. The palette grid packs `minmax(150px,1fr)` columns because a swatch and two words fit one; a choice carrying three sentences does not, and two of them on a phone gave 40-character columns and a card twenty lines tall. It stacks one per row at every width, and top-aligns the icon in a tinted tile - a swatch centred against the whole height of a long card parks itself halfway down the text.
- **Palettes: switched OFF (Sep 2026), code kept.** `PALETTES_ENABLED=false` is the whole switch. The `PALETTES` data, the `html[data-palette]` CSS blocks, `paletteOptionHTML()`, the Settings picker and the wizard step are all still here and still work - flip the flag to bring them back. `applyPalette()` **forces `"sage"`** while it is off (forcing, not skipping: an install that had picked Ocean must be repainted), and the pre-paint head script is hard-coded to sage so a stored choice cannot flash before JS runs. **`settings.palette` is deliberately never cleared**, so restoring the flag restores everyone's own choice. Removed from `FEATURE_TIER` at the same time - gating something nobody can reach is worse than not selling it; `paletteLocked()` is now a constant `false`.
- **Branding**: `practiceName()` / `practiceTagline()` feed the header pill, `--appname` (desktop sidebar title), `document.title` and printed receipts. `applySettings()` re-applies everything after load, import or rollback.

## UI structure
- Single-page app with tab navigation (`nav.tabs`).
- Views rendered into `<main id="main">` - `go(tab)` calls `VIEWS[tab]()` and attaches what it returns.
- Bottom-sheet modal: `#sheet` / `#sheetBody` / `openSheet(title, html)`.
- FAB (`#fab`) = quick "Log session".
- Toast notifications: `toast(msg)`.
- Dark/light theme via `data-theme` on `<html>`. `localStorage('tt_theme')` holds `light`/`dark`; **absent = auto** (follow the device, via a `matchMedia` listener). Use `themePref()` to read it, `setTheme('light'|'dark'|'auto')` to set it.
- Colour scheme via `data-palette` on `<html>`, persisted to `localStorage('tt_palette')` - **switched off** while `PALETTES_ENABLED` is false (see Setup wizard § Palettes); the attribute is always `sage`.

## Key views / render functions
There are no `render*()` functions for tabs any more. `VIEWS[tab]` is a function returning the
view element, and `go(tab,opts)` calls it. Inside a view the segments are plain closures.

| Function | What it draws |
|---|---|
| `VIEWS.home` | Dashboard: attention feed, four KPIs, pinned analytics, the blocks in `HOME_CARDS` order |
| `VIEWS.sessions` | List (Upcoming / Unpaid / Incomplete / All) and Calendar; `renderUnpaid` and `renderIncomplete` are its bulk editors |
| `VIEWS.practice` | Clients, Rooms, Supervision (`supervisionPanel()` - Log / Peer / CPD / Insights), Business analytics (`renderMetrics`) |
| `VIEWS.money` | Overview, Costs & income (`roomFeesCard`, `roomRentCard`, `financeCards`), Table (`rawPanel()`) |
| `VIEWS.tax` | Now (`drawNow`), Estimate, Pot & payments (`drawPayments`), Per year (`drawAllowances`), Making Tax Digital (`drawMTD`). Opens for everybody; computed figures mask per tax year - see the paywall section |
| `VIEWS.settings` | The six collapsible groups; `retentionCardHTML()`, `basisCardHTML()`, `taxRegionCardHTML()` are cards inside it |
| `appMapSheet()` | "Where everything is" - every tab, segment and Settings group as a link |
| `appJobsSheet()` | "What to do, and how often" - the weekly-to-yearly job list, its own sheet off Search & help |
| `findSheet()` | Search & help, from the header magnifier: search across everything, or this screen's tips, Getting started, the jobs list, the map, the tour and What's new |
| `startCardHTML()` / `startRecordsSheet()` | Getting started on Home, and the chooser that routes previous records to the importer or the restore |
| `decisionsCardHTML()` | "Still on defaults" at the top of Settings › Your practice |
| `payerOrgForm()` / `drawOrgs(host)` | The organisations that pay for clients, on Practice › Clients › Clients’ insurers |
| `drawAllowances()` | Tax › Per year — the year strip, region, **pay from a job**, student loan, use of home |

Small helpers most screens reach for (all near the top of the script): `derivedSessions()` (every
session paired with `derive()`), `goSessions(seg)` (land on a Sessions worklist), `goRoomCosts(card)`
(focus a room-cost card on Money › Costs & income) and `emptyNote(text)` (the one empty-state line).
A table of contents for the whole script sits at the top of the main `<script>` block.

## Locale / formatting
- Currency: `gbp(n)` → `£` with locale formatting (en-GB).
- Dates: `fmtD`, `fmtDshort`, `fmtDM`, `isoD`, `parseD`.
- Tax year: April 6–April 5 (`taxYear(d)`).

## Known limitations - not yet fixed

### Multi-tab / multi-device writes overwrite each other (audit finding #8, Aug 2026)
**Not addressed. Deliberately deferred - do not assume it is safe.**

`commit()` writes the **entire** `S` object under one key (`state/current`), and nothing coordinates copies of the app:
- No `BroadcastChannel` or `storage`-event listener, so two open tabs never learn about each other's writes. Both hold a stale in-memory `S`; whichever saves last wins, and the other tab's edits are gone with no warning.
- No `_db.onversionchange` handler, so a `DBV` bump in one tab leaves the others writing to a connection that is about to be force-closed.
- No `onblocked` handler on `indexedDB.open`, so a future version bump can hang silently while another tab holds the old connection.
- `eraseEverything()` inherits this: `deleteDatabase` is deferred while another tab holds the DB. Store-clearing runs first specifically so the data is gone regardless.
- Restore is a destructive whole-state replace with **no merge**, so phone + laptop cannot both be live. It is one device at a time, with backups moved by hand.

Realistic failure: a forgotten tab on the laptop reloads and stamps week-old state over recent phone entries.

Fix sketch when picked up: add a monotonic `S.meta.rev`, refuse a write whose base `rev` is stale, and broadcast changes over `BroadcastChannel` so other tabs reload or warn. True cross-device merge is a much larger piece of work.

## Known gotchas
- **Frozen bash mount**: the bash workspace mount of the CBT folder can serve stale content. Use the Read/Edit/Grep file tools (not bash `cat`/`grep`) to read index.html reliably.
- **SEED object**: `window.SEED` at the top of the `<script>` block is the initial data seed. It is generic (one "At home" room at £0) - no personal data - update carefully.
- **No build step**: pure vanilla JS/CSS/HTML. No npm, no bundler, no TypeScript.
- **IndexedDB version**: `DBV=1` - only bump if adding new object stores (triggers `onupgradeneeded`).
