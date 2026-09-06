# GroundWork — Claude Code Reference

## Project overview
Single-file offline PWA for Charlotte Bloor Therapy (UK sole-trader therapist). Tracks clients, sessions, rooms, supervision, and payments. Installable on iOS/Android/desktop via PWA.

### Naming (renamed from "Therapy Tracker", Aug 2026)
The product is **GroundWork**. The rename covered display strings only — these identifiers were deliberately left alone because changing them orphans or breaks real data:
- **`TherapyTrackerDB`** (`DBN`) and every **`tt_*` localStorage key**. Renaming either abandons the existing database and settings on every installed device.
- The **folder `TherapyTracker-web/`**, which the GitHub Actions deploy path points at.
- Two **backward-compat checks still match the old name**: `applyBranding()`'s title logic and `startSetup()`'s "is the practice name still the placeholder" test. An install that never set a practice name holds the literal string `"Therapy Tracker"`, and without these it would read as a real name and be prefilled into setup.

Renamed: the `<title>`, header, `--appname` tab-rail label, `practiceName()` fallback, manifest `name`/`short_name`, service-worker offline message, terms/privacy, export filenames (`groundwork-*`), and the `app:` marker in backup envelopes (informational only — nothing reads it, and older files say `TherapyTracker`).

### Brand colours — the default palette IS the brand
`:root` (and its `[data-theme="dark"]` pair) is the **sage/GroundWork** scheme; there is no `[data-palette="sage"]` block because sage is the built-in default. Its values are taken from the artwork: `--brand:#5C7A6D` and `--brand-dark:#3C4F44` are the launch screen's mark and wordmark colours, and `--bg:#F5F8F5` is the launch screen's own top colour so the splash fades into the app rather than stepping to a different white.
- These had drifted **teal** (`#0C9683`) in the glassmorphic pass, which left the Sage swatch in Settings promising a green the app never rendered. Anything that names a brand colour must be changed here **and** in the artwork together.
- `--gs1` is deliberately the brand green, a shade darker than the icon's own top stop (`#6A8B7C`): the header title is 18px/700, just under the WCAG large-text threshold, and white on `#6A8B7C` is only 3.75:1. Check contrast before touching the header gradient.
- `icon-180/192/512.png` are downscales of `icon-ideas/groundwork/icon-1024.png`. Regenerate them from that source (PowerShell + `System.Drawing`, HighQualityBicubic) rather than editing them individually, and bump the SW cache — icons are served cache-first.

### Launch screen
`#splash` in `index.html` — inline SVG of the bars-and-leaf mark plus the wordmark, painted before any script runs so a cold start never flashes white. `splashHide()` is called right after the first `go("home")`, with `SPLASH_MIN` (1200ms) so a fast boot doesn't flicker and a **6s failsafe timer** that clears it even if init throws before `go()` ever runs.
- It also reappears on **resume** for `SPLASH_RESUME` (800ms) — `visibilitychange` for a backgrounded tab/PWA, `pageshow`+`persisted` for Safari's bfcache, which restores the page without re-running any of this.
- **`SPLASH_RESUME_AFTER` (2 min) is the guard that makes this bearable.** Without a minimum time away, flicking to another app to read a text and coming straight back re-splashes several times an hour. Tune this constant, not the handler.
- The node is **hidden, never removed** — it has to survive to be shown again. `.out` sets `visibility:hidden` as well as `opacity:0`, flipped at the end of the fade out but immediately on the way in; opacity alone would leave a full-screen layer over the app. Verified by hit-test, not just by eye.
- `splashShow()` restarts the rise animation with a forced reflow. Without it the animation has already run and the mark sits static, which reads as a stalled screen. Brand colours are hard-coded rather than palette tokens — this is the product's identity, not the therapist's chosen scheme — and are sampled from the delivered artwork in `icon-ideas/groundwork/`. Those 2732² PNGs are **not** used by the web app (2.4MB the SW would have to precache); they are the source for the native iOS launch screen — see `docs/groundwork-app-store-roadmap.md`.

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

**Do not edit** `CBT/Therapy Tracker.html` — that is an old diverged copy. Always edit `TherapyTracker-web/index.html`.

## Deployment
Hosted on GitHub Pages. Push to `main` → GitHub Actions deploys `TherapyTracker-web/` automatically.
Live URL: `https://<username>.github.io/<repo>/`

## Native iOS wrapper (Capacitor, added Aug 2026)

> **Pushing to GitHub updates the website, not the iPhone app.** The web app deploys to
> Pages on every push; the iOS app bundles a *copy* of it (`ios/App/App/public`, gitignored,
> rebuilt by `npm run sync`) that only changes when someone cuts a build. `npm run release`
> bumps the build number, syncs and tags; pushing that tag runs `.github/workflows/testflight.yml`.
> Full detail — including the App Store Connect secrets it needs — in **`docs/releasing.md`**.
> Capacitor 8 uses SwiftPM, so there is **no `.xcworkspace`**: build `ios/App/App.xcodeproj`,
> whose `App` scheme is checked in under `xcshareddata` precisely so CI can find it.

The iOS app is **this same `index.html`**, not a fork — `webDir` points at `TherapyTracker-web/`
itself and `ios/App/App/public/` is a gitignored copy rebuilt on every sync. Full detail in
**`docs/ios-native.md`**; the parts that constrain editing this file:

- **One guarded block at the end of `index.html` holds everything iOS-specific.** It returns
  immediately unless `Capacitor.isNativePlatform()`, so the PWA is byte-for-byte unaffected.
  It **wraps** `download()`, `printReceipt()` and `VIEWS.settings` rather than reimplementing
  them, which is what keeps the two builds in step — but it also means **renaming any of those
  silently breaks a native feature while the web app carries on working perfectly.**
  `npm run check` asserts every name it reaches for; run it before pushing a rename.
- **`receiptHTML()` was split out of `printReceipt()`** so the native side can render the same
  markup to a real PDF. Keep it returning `{html,num}` — the native layer names both.
- **`.webonly`** hides copy that only makes sense in a browser tab (currently the "Add to your
  Home Screen" line). Mark, don't delete.
- **Device-only settings are `tt_lock`, `tt_lock_grace`, `tt_notify` in localStorage, never in
  `S`** — `S` travels in backups, and restoring onto another phone must not change that phone's
  lock.
- **`sw.js` is skipped on native** (service workers do not register on Capacitor's scheme and the
  bundle is already local) and pruned from the copied app, along with `icon-ideas/`.

### Automatic backups on the phone (Aug 2026)
Desktop Chrome/Edge auto-saves an encrypted backup silently through the File System Access API.
That API does not exist on iOS, so the only safety net there was the nag banner and a manual
share sheet. Behind the native guard, **every `commit()` also writes a copy into the app's
Documents folder**, 2s debounced:
- `backupPayload()` (near `exportJSON`) is now the **single** backup envelope — `exportJSON`,
  `encPayload` and the native auto-backup all build their file from it. Adding a field in one
  place is the whole point; don't reintroduce a second literal.
- **`encReady()` decides per write.** Passphrase set → `encPayload()` → `GroundWork
  auto-backup.enc.json`; otherwise the plain payload → `GroundWork auto-backup.json`. A change of
  mode deletes the superseded *live* file, or yesterday's readable copy would sit in Files
  forever. The dated copies are deliberately left — they are restore points that cannot be
  re-encrypted, and they age out within a week anyway.
- **Rotation**: at most once a day (`tt_autobk_day`) a dated copy goes to
  `auto-backups/GroundWork YYYY-MM-DD.json`, pruned to the newest 7. Daily, not per-save — seven
  copies from one afternoon are seven copies of the same afternoon.
- **It never toasts and never blocks.** `nativeAutoBackup()` returns a boolean and logs; only the
  Settings › This iPhone › "Back up now" button speaks. The `commit` wrap passes the original's
  `true`/`false` straight back, so a failed IndexedDB write still raises `#saveBanner` and a
  failed backup can neither block nor mask it. Last outcome is in `tt_autobk_status`.
- **`flushAutoBackup()` runs on backgrounding.** iOS suspends the WebView, and a pending 2s timer
  suspends with it — logging a session then putting the phone straight down is exactly the case
  this exists for.
- **`markBackedUp()` is deliberately untouched.** A copy on the same phone is no protection for
  someone with iCloud Backup off, so the manual-export nag is unchanged; the banner detail line
  only appends "(an automatic copy is kept on this iPhone)".
- `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in `Info.plist` are what make that
  folder visible in the Files app. Without them the files exist but nobody can reach them.

### The watchOS app (Sep 2026) — a timer, and nothing else
`ios/App/GroundWorkWatch/` is a SwiftUI watch app embedded in the iPhone app. It times a
session and taps the wrist at ten minutes left and at time. **It is the first code here that
is not the web app**, which is only tolerable because it owns no logic and no data — no
`derive()`, no `S`, no client anything. Two integers and a date. Nothing syncs in either
direction; stage 2 is sketched in `docs/watchos-companion-ideas.md`, mechanics in
`docs/ios-native.md` § The watch app.
- **The end date is the state; nothing counts down.** watchOS suspends the app the moment the
  wrist drops, so every figure derives from `Date()` against `endsAt`, and the digits are drawn
  by `Text(timerInterval:)` / `ProgressView(timerInterval:)`, which keep counting unaided. A
  decrementing counter would stop with the app and look fine doing it.
- **The taps are local notifications, scheduled at Start.** A `Timer` in a suspended app does
  not fire and the tap *is* the feature. The `Timer`s that do exist only flip the screen from
  counting down to counting up, and are allowed to be late — `refresh()` recomputes from the
  dates on wake.
- **`AppDelegate` exists only to present a notification while the app is frontmost**, which
  watchOS otherwise suppresses — without it the one person who gets no tap is the one looking
  at the timer. It plays the haptic itself and returns `[.banner]`, never `[.sound]`, so there
  is no second tap to collide with.
- **The session length lives in the watch's own `UserDefaults`, not in `S`.** A
  `settings.sessionMins` on the phone was considered and dropped: with no sync it would be a
  setting that changes nothing. It becomes the phone's to own when the phone can push.
- **`scripts/add-watch-target.mjs` wires the target**, idempotently, from `npm run sync` — same
  reason as `add-native-plugin.mjs`. `npm run check` asserts the target, all four Swift files
  being compiled, the embed phase, the build dependency, and that the watch's
  `WKCompanionAppBundleIdentifier` still matches `capacitor.config.json`'s `appId`.
- **`CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` are literal in the watch target's build
  settings**, because `release-ios.mjs` bumps them by regex and a watch build number that has
  drifted from its host is rejected at upload.
- Accent is `#5C7A6D` — the header's darker sage, not the icon's `#6A8B7C`, because the Start
  button is white text on it. Same contrast rule as the header gradient.
- **None of it has been compiled** — written without Xcode. See the checklist at the end of
  `docs/ios-native.md` § The watch app.

### Mobile chrome: floating bar, grouped rows, iOS-weight switches (Aug 2026)
A deliberate step toward the way a native app looks, taken in the **shared** CSS rather than behind
the native guard — these read as "modern mobile app", not specifically iPhone, so the Android and
desktop builds keep looking deliberate. Three things, and the traps in each:
- **`nav.tabs` is a floating capsule**, inset from the edges. The safe-area inset became the bar's
  *distance from the bottom* (`bottom:max(10px, env(safe-area-inset-bottom))`), not padding inside
  it — adding to the inset floats it so high a band of content shows underneath. `main`'s
  bottom padding (108px) and `.fab`'s offset both clear it. **The desktop block at `min-width:900px`
  turns this back into a full-height sidebar and must keep undoing `border-radius` and `box-shadow`**
  — anything new added to the base rule has to be reset there too.
- **The active tab is a soft tint, not the filled gradient pill.** A pill inside a capsule reads as
  a button inside a button. Pure colour alone was too close to `--muted` to see at a glance on a real
  screen, hence the 16% sage wash behind it. Desktop overrides this with its own white tint.
- **`.ftrow` is a grouped list**, not one box per row: hairline separators inset to where the text
  starts, with only the ends of a run rounded. It uses **`:has()`, not `:last-child`** — the setup
  wizard puts an `.ovnote` straight after the last row, so the run does not always end its container.
- **`.sw` is 51×31 with a 27px knob**, iOS's size and a bigger tap target than the 48×28 it was. The
  knob overshoots slightly on the way across; a linear slide is what makes a copied switch feel copied.

Not done, and deliberately: **large-title navigation.** It would retire the sage gradient header that
carries the brand on every screen, and it is the change that makes the web builds look like they are
pretending to be an iPhone. See the design comparison referenced in `docs/ios-native.md`.

### WebKit is not Blink — check form controls on a phone
Two layout bugs looked perfect in Chrome and broke on iOS, both fixed here, both improving the
PWA as well. Don't regress either:
- **Checkboxes and radios are excluded from the bare `input` selector.** They were picking up
  `width:100%` and 14px of padding, making a ~160px flex item that pushed its own label off the
  screen edge in a setup step.
- **`.field2>*` and the controls carry `min-width:0`.** Grid items default to `min-width:auto`,
  and WebKit's intrinsic minimum for `input[type=date]`/`[type=time]` is far larger than Blink's,
  so the Time column ran off the right edge in the session form.
- **`.field2` is `repeat(auto-fit,minmax(150px,1fr))`, not `1fr 1fr`** (Sep 2026). `min-width:0`
  stops a date field overflowing its column but cannot stop it being *squeezed* — two of them
  plus the gap do not fit on a 320px phone, and the digits end up under the picker glyph. Below
  that width the pair now stacks. `input[type=date]`/`[type=time]` also carry trimmed side
  padding (10px, not 14px), because those controls are drawn by the platform and size themselves
  from their own text.
- **`.sheet-inner` uses `overflow-y:auto; overflow-x:hidden`, never the `overflow:auto`
  shorthand.** The shorthand gives the sheet a horizontal scroll axis, and a single over-wide
  child then lets the whole form be dragged left and right under the thumb — it reads as the
  sheet wobbling while you type. Content that genuinely has to scroll sideways (`.rawscroll`,
  `.svgwrap`, `.hmgrid`) carries its own scroller and is unaffected.

## Service worker cache strategy
`sw.js` uses **network-first for HTML** (`req.mode === "navigate"`) — every page load fetches a fresh `index.html` from the network, so updates land on next open without needing a cache bump.

Static assets (icons, manifest) use cache-first, so the cache name constant (`C`, currently **`"tt-v6"`**) must be bumped whenever one of them **changes as well as** when one is renamed or removed — an installed device otherwise keeps the old copy indefinitely. The GroundWork rename needed it twice: once for `manifest.webmanifest` (or the Home Screen keeps saying "Therapy Tracker") and again for the redrawn icons.

Two rules the fetch handler depends on — don't regress them:
- **`SHELL` (`./` + `index.html`) is precached at install.** The SW does not intercept the navigation that registers it, so without this a first-time visitor who goes offline before their second visit gets nothing at all.
- **Only `resp.ok && status === 200` is ever cached** (`cacheable()`). A 404/502 served during a deploy window would otherwise become the permanent offline copy. A non-ok navigation response also falls back to the cached shell rather than showing the error page.

## State / data model
Global `S` object — persisted to IndexedDB (`TherapyTrackerDB`) with a localStorage mirror.

```js
S = {
  clients: [],          // each has _id; usualDay/usualTime override the derived slot
  rooms: [],            // {location, rate, due, billing:"session"|"monthly", pay:{freq,day}}
  sessions: [],         // therapy sessions
  supervision: [],      // clinical supervision (counts toward the 1:6 ratio)
  peerSupervision: [],  // peer supervision (total hours only, never the ratio — added Aug 2026)
  rateHistory: [],      // therapist fee history
  roomRateHistory: [],  // per-room per-session rate history
  roomRentHistory: [],  // per-room monthly rent history (added Aug 2026)
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
    palette,            // key into PALETTES: sage|ocean|plum|clay|indigo|slate
    features: {},       // key → false to disable; absent/true = on
    retention: {},      // {notesYears:6, financeYears:6, endedStatuses:[]} — review flags only
    cpdTarget,          // annual CPD hours target (default 30)
    studentLoanYears:{},// tax year → plan key, carried forward (v6)
    taxRegionYears: {}, // tax year → "rUK"|"scotland", carried forward (v6)
    taxYears: {},       // tax year → what HMRC actually assessed / set / a claim to reduce (v6)
    taxPaid: {},        // due date ISO → {date,amount} paid, or {unpaid:true} (v6)
    taxPot: {},         // {bufferPct, balance, balanceAt} (v6)
    taxMoments: {},     // seasonal-prompt id → date dismissed — see taxMoments()
    coach: {},          // {seen:[tip keys], off} — first-visit tips (v6)
    onboarded, onboardedAt, setupRuns
  }
}
```

Key functions:
- `commit(summary)` — save to IndexedDB + audit log + snapshot (up to 120 snapshots). Also calls `gameTouch()`. **Returns `true`/`false`** — false means the write failed and the red `#saveBanner` is now showing.
- `undo()` — reverts to previous snapshot (reads the last two via `snapRecent(2)`).
- `normalize(st)` — seeds missing fields / defaults; called on load. Also runs ordered migrations and stamps `meta.schemaVersion`.
- `loadState()` — initialises DB, loads or seeds state into `S`.
- `mirror(S)` — writes S to localStorage as a safety net. **Returns false** if the write failed (quota / private mode).

### Durability rules (added Aug 2026 — do not regress)
- **Never load every snapshot.** Use `snapCount()`, `snapRecent(n)` and `snapOldestIds(n)` (all cursor-based). The old `snapAll()` getAll in `commit()`'s prune step cost **1,088 ms** per save at the 120-snapshot cap on a 1,145-session dataset; `snapPrune()` does it in ~11 ms.
- **Never swallow a save error.** `commit()` calls `noteSaveFailure()` on failure, which raises `#saveBanner` and corrects the caller's "Saved" toast on the next tick. `clearSaveFailure()` runs on the next successful save.
- **`requestPersistence()`** runs at init (`navigator.storage.persist()`). Without a grant, iOS Safari evicts this app's storage after ~7 days of no visits. Status is shown in Settings › Storage on this device; `denied` is normal until the app is added to the Home Screen.
- **`exportJSON()` must work with `_db === null`** — the crash screen is the only way out of a broken render and it offers Export.
- **`tyNet()` and `tyIncome()` are memoised** (`tyMemo`, cleared in `go()`, `commit()` and `normalize()`). Each walks every session and runs `ledgerBetween` twice; the Payments screen asks for several years at once and each year's schedule reaches into the year either side, so uncached the call count grows quadratically with history. Anything that mutates `S` outside those three entry points must call `tyMemoClear()`.

### Schema versioning
`SCHEMA_VERSION` (currently `7`) is stamped on `S.meta.schemaVersion` and on every backup envelope. Unstamped data is treated as v1.
- **v7 (Sep 2026)** split the old free-text "Notes done?" box into a boolean tick and a separate `adminNote`. A v7 backup can hold "invoice goes to her employer" in `adminNote`; a v6 build has no such field and would drop every one of those comments, then save the loss back. See **Notes vs admin comments** below.
- **v6 (Aug 2026)** dated the whole-practice tax settings to a tax year (`studentLoanYears`, `taxRegionYears`) and added the record of what HMRC actually assessed (`taxYears`), what has been paid (`taxPaid`) and the pot's own settings (`taxPot`). A v6 backup can say "Plan 2 until 2025-26, none after" and "HMRC assessed 2025-26 at £4,310"; a v5 build has neither field, so it would apply one loan plan to every year and show its own estimate in place of the real assessment.
- **v5 (Aug 2026)** stamped a cancellation charge percentage on every missed session and added `settings.cancelRules` + `settings.reveal`. A v5 backup can hold a session charged at 50%; a v4 build has no such field and would bill it in full.
- **v4 (Aug 2026)** gave every cost and income row a category *key* mapping to an SA103 box, migrated from the old free-text label (which is kept). Added `settings.taxBasis`, `useOfHome`, `taxRegion`, `studentLoan`, `class2Voluntary`.
- **v3 (Aug 2026)** added expenses, other income, peer supervision and monthly room rent. No in-place migration: every new field's absence means exactly what it meant in v2. The bump exists for the other direction — a v3 backup carries money a v2 build cannot see, so restoring it there would drop those rows and save the loss back.
- Bump it when a change would be **misread** by an older build, and add the matching step to the ordered migration block in `normalize()`.
- `validateImport()` **refuses** a backup whose version is newer than the running app — importing would silently drop unknown fields and then save that loss back over good data.
- `normalize()` never downgrades newer data in place.

### Business finances (added Aug 2026 — one choke point)
`ledgerBetween(from, to, {toDate})` is the **only** place expenses, other income and monthly room rent are totalled. `tyNet()` adds its `total`; the tax-year table's Net column now prints `tx.netAll` (i.e. `tyNet`) rather than recomputing `billed - room - sup` inline, so the Net and Tax columns cannot drift apart. Anything new that reports money goes through it too.
- Recurring rows are **expanded at read time** (`moneyOccurrences`) — never generated into the data. Correcting an amount corrects every period it applies to. A monthly row repeats on its own day of the month, clamped in short months (31 Jan → 28 Feb → 31 Mar, no drift).
- `scope:"personal"` income (a second job, tutoring — a different trade) is totalled separately as `personalIncome` and deliberately **excluded** from `total`, so it never inflates the practice's Self Assessment figure.
- Monthly rooms: switching a room to monthly pushes a `roomRateHistory` step of `0` **and** a `roomRentHistory` step, both dated. `derive()` and `effRoomRate()` are untouched — past sessions keep their historical per-session charge and new ones stop charging per session by themselves. `room.billing` only drives the UI.

### Payment schedules & what's been paid (added Aug 2026)
`FREQS` is the one vocabulary for repeats (once / weekly / fortnightly / monthly / quarterly / annually), and `freqStep(anchor,freq,n)` is the only place the maths lives — used by both `moneyOccurrences()` and `schedNext()`.
- **A schedule never moves an accrual date.** `roomRentOccurrences()` anchors each charge to the rent history's own day and attaches the payment date separately as `due`. Letting `room.pay` drive the accrual date silently shifted historical rent between tax years — don't reintroduce it.
- `roomSchedule(rm)` reads the legacy `due` field (`EOM` → monthly/last, `EOW` → weekly/Sunday) when `pay` is absent, so old rooms keep working. `roomForm` writes both.
- `S.paidCharges` is a tick-list, **not accounting**: `ledgerBetween()` ignores it entirely, because a cost belongs to the year it fell due whether or not it's been settled.
- Paid rows stay in the list for a fortnight **after being ticked** (not after falling due), or settling an old overdue charge would make the row vanish mid-tap with no undo.

### Room billing and the session form
`derive().roomPaidNA` is the single answer to "is there a per-session room fee to settle here?", and it is **false only when there genuinely is one**. Three cases make it true:
- no room record for the location at all;
- the room is on a monthly rent (settled once a month in Costs & income);
- **the room charged £0 per session on that session's date** — "At home", or any room in a practice that bills monthly. Added Sep 2026; before it, a therapist working from home was asked "room paid?" on every session she ever logged and every one of them sat in the Incomplete worklist until she answered a question that had no answer.

It uses the **dated** rate (`effRoomRate(loc, s.date)`), never the room's rate today: a room that charged £15 when the session happened still has that £15 to account for however it bills now.

`missingReasons()`, `derive().complete`, the Incomplete worklist and the session form (`paintRoomPaid`) all read it, so those sessions never show up as incomplete for a question that doesn't apply. `paintRoomPaid` also **stamps `roomPaid="n/a"` as it hides the controls** — hiding alone would leave the dropdown unanswered and the session incomplete forever. The select stays in the DOM so `sync()` keeps reading it exactly as it always has.

`anyPerUseRoom()` answers the practice-wide version ("do I ever pay for a room by the session?") and only picks the wording for the explanatory note.

### Notes vs admin comments (v7, Sep 2026)
The session "Notes done?" box was one free-text field doing two unrelated jobs: a tick that the write-up was finished, and — for anyone who used it that way — a scratchpad. Now:
- **`s.notes` is still a STRING**, and is deliberately not a boolean. Every backup ever written holds a string there, `derive().complete` reads it, and `isLateCancel()` still matches the historical `"Y (late cancellation)"` convention in it. The form now only ever writes `"Y"` or `""`. **`notesDone(s)` is the one place that decides what counts as written up** — use it, don't re-test the string.
- **`s.adminNote`** is the free-text field, labelled in the UI as practical-only. It appears in the session list (`.adminline`, one line, CSS-truncated), is searchable, and is in both exports.
- **The migration is gated on `meta.adminNoteSplit`** and moves anything that was not simply `"Y"` across rather than dropping it. Order matters twice: it stamps `s.lateCancel` from `isLateCancel(s)` **before** the text moves, and it sits after `cancelChargeBackfill`, which calls `isLateCancel` itself. Moving it earlier silently un-cancels historical sessions.
- `anonymiseClients()` clears `adminNote` — it is free text a human wrote and may name people.
- The spreadsheet importer splits a sheet's "Notes" column the same way, and still reads the **raw** column for `impLateCancel`.

### CPD vs accreditation (added Aug 2026)
`mountCPD()` is the card everyone sees: supervision + peer hours over a rolling 12 months against `settings.cpdTarget`. `mountAccreditation()` (Form 3A, the 1:6 ratio) is gated behind the `accreditation` feature, which `normalize()` defaults **off for new installs and on for anyone who already has data** — pulling it from someone mid-accreditation would lose them the screen they keep records for. `stepCPD()` asks in setup.

### Scrolling rules
- `go(tab,{keepScroll:true})` re-renders without throwing the reader to the top. Use it for anything redrawing the screen the user is already on (segment toggles, saving from a sheet); plain `go(tab)` is for real navigation.
- `scrollChart(wrap,keep)` positions a horizontally-scrolling chart. Charts are built **before their view is attached**, so it has no width at draw time — hence the rAF *and* the `setTimeout(...,0)`. Redraws pass the old `scrollLeft`, so tapping a bar no longer flings the chart back to the oldest period.

### Explanations behind an info icon
`infoDef(key,title,html)` registers a topic; **`infoLink(k,label)`** is the text link and **`infoDot(k,aria)`** the small circled *i*. `cardHead(title,key,right)` is a card heading with the dot already in it. Both resolve through the same `[data-info]` selector, so `wireInfo(host)` picks up either.

**The rule for choosing:** if the reader needs the sentence *every* time, leave it on screen. If they need it once and then never again, it goes behind a dot. That is what makes twenty analytics cards fit on a phone, and it is why Settings is now headings and controls rather than headings, controls and three paragraphs.

**A block that redraws itself must call `wireInfo` again** — `wireCancelRules`'s `draw()` replaces its own markup and would otherwise leave a dead dot behind. `VIEWS.settings` only wires once, at build.

### Settings layout
Six collapsible `<details class="sgrp">` groups (**business / app** / data / records / help / about), plus **device** on native. Every card lives inside a group — don't add loose cards to the settings view.
- **`business` ("Your practice") and `app` ("App preferences") are a deliberate split** (Sep 2026), replacing a single `practice` group that mixed the two. A decision about the *business* — the practice name, the cancellation policy, the tax basis, the tax region — is made once, has consequences, and is nothing like choosing a colour scheme or switching a tab off. `go("settings",{openGroup:"business"})` opens one group on arrival; it is applied **after** the reset that folds everything away, or it would be wiped by it.
- **How your figures are counted** (cash vs accruals) moved here from Tax › Estimate: `basisCardHTML()` / `wireBasisCard(host,after)` live beside the tax engine, and Tax now only states which basis is in force with a link back. It is a business decision, not a view toggle to flick between while reading an estimate.
- **Data & backup separates the backup from the extracts.** "Backup & restore" holds only the `.json` export and Restore; the three CSVs sit in a second, collapsed "Spreadsheet exports" card that says in as many words that they are **not** backups and cannot be restored. The `backups-explained` info topic is the one place all three kinds (export / automatic / CSV) are compared, and it is linked from the backup card, the CSV card, the encrypted-backup card and the native automatic-backup card.
- **Everything starts collapsed on each fresh entry.** `_setGrpOpen` holds open state in memory only and `go()` clears it whenever Settings is entered without `keepScroll`. It must survive a `keepScroll` redraw — saving a setting re-renders the view, and without this the section being worked in folds shut underneath the user. Not persisted to localStorage: a section left open last week is not one you want reopened today.

## Tabs (restructured Aug 2026)
**Home · Sessions · Practice · Money · Tax.** `TAB_ALIAS` maps the old names (`clients`, `supervision`, `income`, `raw`) onto the new tab **and a segment**, so old deep links land somewhere meaningful; `go(tab,{seg})` sets it. A plain tab tap stays on whatever segment the reader last used.
- **Practice** — Clients / Trends / Rooms / Supervision. `supervisionPanel()` and `rawPanel()` are panels, not views: they are mounted whole so their inner sub-tabs keep working.
- **Money** — Overview / Costs & income / Table.
- **Tax** — Now / Estimate / Pot & payments / Per year / Quarterly (MTD). **Now** is the default (`taxSeg`) and the only screen most of the year: the standing disclaimer, any live seasonal moments, then three numbers — on track to owe (`taxLiability`), keep in your pot (`taxPot`), next payment (`nextTaxPayment`) — each tapping through to the screen that owns its detail. It **summarises, never replaces**: the pot *summary* card moved off Estimate onto it, so **Estimate** now carries the take-home, the basis and the by-year table, while everything about paying — the buffer, the balance, every due date, and what HMRC actually assessed — still lives on **Pot & payments**, so no figure appears twice with two different explanations behind it. **Per year** is "things set per tax year" (renamed from "Allowances" in T6 — student loan and region aren't allowances): one year strip at the top governs every card below it (`taxYearStripStatus`), then student loan, then use of home. Region is *not* here — it moved to Settings.
- The old `income` feature flag became `money` + `tax`; `normalize()` carries `income:false` across to both rather than switching a hidden tab back on.

### Home (revised Sep 2026)
- **Four KPIs: billed this tax year · sessions this tax year · outstanding now › · sessions next 7 days ›.** "Received" was dropped: sitting beside "Billed" it answered one question twice, and what was actually missing — the gap — was already the Outstanding tile. The replacement counts **attended** sessions (`isCancelled` excluded) and names the distinct clients behind them, which nothing else on Home said.
- **The year heatmap (`yearHeatmapHTML`) moved here from Money › Overview.** "How busy have I been" is a Home question — nobody opens the money tab to find out whether they took August off. It needs `scrollChart(v.querySelector(".hmgrid"),null)` after render for the same reason the charts do: it is built before the view is attached, so it has no width at draw time, and without it the reader lands on the same date last year.
- The "Quick add" card is now "Log something" and holds only the three buttons.

## UK tax engine (Aug 2026)
- **Basis.** `settings.taxBasis` defaults to **cash** — HMRC's default for sole traders since 2024/25. `tyNet()` counts a session in the year its `paidDate` falls; `ledgerBetween()` counts a cost when `paidCharges` says it was settled. **Where no payment date is recorded, cash falls back to the due date** — strict cash would let an untidied tick-list wipe every cost off the return, which is a far worse failure than being slightly early.
- **Categories.** `EXP_CATS`/`INC_CATS` are keyed objects carrying an `SA103` box. A `risk` field marks deductions HMRC commonly challenges (personal therapy, CPD that trains new skills); those render an amber warning rather than being hidden or silently claimed.
- **Use of home.** `uohMonthly()` — simplified bands (£10/£18/£26 by monthly hours) or actual apportionment. Generated at read time into `ledgerBetween`, never written into the ledger.
- **Payments on account.** `taxSchedule(ty)` — once the liability passes £1,000, January is the balancing payment *plus* 50%, with another 50% in July. `poaBase()` excludes Class 2 and student loan, which never form part of a payment on account.
- **Class 2** is no longer mandatory (2024/25+) but can be paid voluntarily below the Small Profits Threshold; the app offers it rather than omitting it.
- **Region, student loan, pension.** Scottish bands via `settings.taxRegion`; `SL_PLANS` for plans 1/2/4/5/PG; pension contributions extend the basic-rate band (`penGross`) rather than being deducted after tax.
- **Per-year settings.** `yearValue(key, ty, fallback)` / `setYearValue()` hold a setting against a tax year with carry-forward from the most recent earlier year — the same shape as `uohForYear`. Student loan (`studentLoanPlanKey`) and region (`taxRegionFor`) both use it, and `ukTax(profit, ty)` reads them by year. **The legacy scalars migrate onto `earliestTaxYearIn(st)`**, which is what makes carry-forward reproduce exactly the figures the install was already showing. Never read `settings.studentLoan` / `settings.taxRegion` directly — they are kept in step with the latest year only so an older build sees something sensible.
- **Estimate vs assessment.** `taxLiability(ty)` is the one place a year's number comes from, and it reports `src`: `actual` (entered from a filed return — HMRC's figure wins everywhere), `estimate` (year ended, nothing entered) or `projected` (year still running, run-rated to a full year). `poa` is the part instalments are worked out from, never Class 2 or student loan.
- **`poaTowards(ty)`** gives the two instalments due towards a year, set by the year before it. Precedence: a recorded **claim to reduce** (SA303) beats **what HMRC actually set** (`poaSet`) beats the calculated figure. A claim never reduces the tax — it defers it to January pound for pound, and there is a test asserting exactly that.
- **`taxTimeline()` assembles by DUE DATE, never by tax year** — that is the whole point. One 31 January is usually two different years' money (the balancing payment finishing one year plus the first instalment towards the next), and listing by year puts those two amounts on different cards. It is the only place dates and amounts are put together, so the pot, the reminder and the Payments screen cannot drift apart.
- **A past due date with no record is `unknown`, not overdue** (`PAY_GRACE_DAYS`, 60). Someone arriving with three years of history has almost certainly paid those bills; counting them would poison every pot figure. Inside the grace window "not ticked" still means owed, and a row can be marked `{unpaid:true}` to count it back in.
- **`taxPot()`** answers two separate questions and keeps them separate: what should be put by *today* (tax **already earned** + unpaid bills from years that have **ended** + a buffer the therapist chose) and what has to be there by a *date* (`byNext`). Tax on money not yet earned is deliberately excluded. `rate` is projected tax over **projected income**, not profit — it is a share of money arriving in the account. Working it out from tax-to-date over full-year net is what used to display **0%** early in a year while the table showed thousands.
- **MTD.** `mtdQuarters()`/`mtdPeriod()`/`mtdExport()`. **The quarters must reconcile to `tyNet` on both bases** — a regression here means a cost was added to the ledger but not to an SA103 box (per-session room fees were exactly that bug). Submission is deliberately out of scope: it needs an OAuth secret, fraud-prevention headers and HMRC recognition, none of which fit an offline PWA.

### Tax moments & guided flows (added Aug 2026)
`taxMoments()` is a **pure** function returning the seasonal cards that are live *today* — zero of them for most of the year. It adds no arithmetic: everything comes from `today()`, `curTaxYear()`, `prevTY`, `taxYearRec`, `nextTaxPayment`, `taxPot` and `mtdQuarters`.
- **The ids carry their year** (`file-2025-26`, `jan-pay-2027`, `new-year-2027-28`, `mtd-q3-2026-27`). That is what makes dismissal safe: `settings.taxMoments[id] = <date dismissed>` silences *this* year's instance and next year's returns on its own. In settings rather than localStorage, like `coach.seen`, so it travels with a backup.
- Windows: **file** 1–31 Jan (only while the ended year has no `liability` and isn't `filed`), **jan-pay** 1 Jan – 5 Feb and **jul-pay** 1 Jul – 5 Aug (only when `nextTaxPayment()` really is that date — a bill already ticked off gets no card), **new-year** 6 Apr – 31 May, **mtd-q_n_** for `MTD_MOMENT_DAYS` (35) after each quarter end.
- **MTD is gated on `taxPot().projInc >= MTD_INCOME_FLOOR`** (£50,000). MTD for Income Tax does not reach a small practice, and a quarterly nudge it can only ignore is worse than no nudge. Both this tax year's quarters and last year's are scanned — the quarter ending 5 April belongs to a year that has ended before its five weeks are up.
- `nextTaxPayment()` and `taxPot()` are resolved **lazily, once**, so a month with no open window reaches neither.

**Two of the moments launch a guided flow**, because the jobs behind them are done once a year and are therefore the ones nobody remembers how to do. Both run on the existing `flowStart` overlay.
- **`startAfterFileFlow(ty)`** — which year / the bill / instalments (optional) / confirm. Entered from the `file-<TY>` card and from **"Walk me through it ›"** on Pot & payments. Defaults to the most recent ended year with no `liability` yet. Writes `liability`, `liabilityAt`, `filed=true` via `taxYearRecW(ty)`, and `poaSet`/`poaSetAt` on `nextTY(ty)` **only if an instalment was given** — skipping leaves an existing one alone. The SA303 claim to reduce is deliberately **not** in this flow: it has a real interest penalty behind it and stays an expert control on Pot & payments.
- **`startNewYearFlow(ty)`** — region / student loan / use of home / pot buffer / done. Entered from the `new-year-<TY>` card and from **"Review for <TY> ›"** at the top of Per year, which appears only inside `newYearWindowOpen()` — the *same* 6 Apr – 31 May window the card uses, so the two can never disagree about when it is April. Confirming writes nothing: carry-forward already handles it, which is what makes a no-op review four taps of Continue and **zero audit entries**.
- **Every step stages into a local `w` and writes nothing** — the same shape as `startSetup`. Skipping or closing therefore discards, and the single `commit()` happens on the last screen only if `newYearReviewChanges(w)` is non-empty. The use-of-home step's "copy and edit" button is the one early exit: it applies whatever is staged plus `uohCopyFrom`, commits **once**, and hands off to Per year by design.
- **`taxYearsPreview(patches, fn)`** is how the confirm screen shows a recomputed `taxSchedule` without writing: the engine reads `settings.taxYears` and has no pure variant, so the records are staged, read, and restored in a `finally`. It is a staging helper, not maths — no figure is ever computed here that `taxSchedule`/`taxLiability` do not already produce.
- Both flows guard on `_flow` and refuse to stack on setup or on each other. The raw editors (`taxActualSheet`, `poaClaimSheet`, the Per year cards) are **untouched and stay fully functional** — the flows are a guided path to the same fields, never a replacement.

### Tax engine tests
`tests/tax-tests.js` — 118 tests. Serve the app, open it, paste the file into the console. It lives **outside** `TherapyTracker-web/` so it never deploys, never calls `commit()`, and restores the live state when it finishes.

**Expected values are derived from the HMRC rule, never copied from the app.** That is not pedantry: the payment-date bug below initially *passed* a test written by pasting in what the code returned, and only surfaced when a second test approached the same figure from the rule. If a test needs updating after a change, re-derive the number.

Two real bugs it has already caught:
- `SCOT_BANDS` mixed band *widths above the personal allowance* with *absolute* thresholds while the loop treated all of them as absolute — overstating Scottish tax by up to ~£3,300/yr (£2,025 at £40k).
- `taxSchedule()` dated every payment a year early. Self Assessment is due 31 January **following the end** of the tax year, so 2026-27 is 31 Jan 2028, not 2027.

Several tests depend on TY (2026-27) being the year **in progress** — the projection, the pot's "earned so far", and the 60-day grace window. Re-anchor them once the real date passes 5 Apr 2027.

The reconciliation block is the highest-value part: across six practice profiles, `profitBreakdown` = the four MTD quarters summed = `tyNet`. A mismatch means a cost reached one path but not another — exactly how the missing per-session room fee in the SA103 boxes was found.

### Whole-practice test data (Sep 2026)
`tests/test-data/` holds **eight synthetic practices as importable backup envelopes** — the same
shape `backupPayload()` writes, so any of them restores through Settings › Data & backup on a real
device. They exist because the tax engine and the twenty `ana*` trends only say anything
interesting at a few hundred sessions across several years, which is a size nobody hand-writes.
Full description in `tests/test-data/README.md`; the review they were built for, and what it found,
is `docs/test-data-review-2026-09.md`.

```bash
npm i --no-save playwright   # deliberately NOT a dependency: npm ci runs on the release workflow
npm run testdata             # regenerate the eight (deterministic — same bytes every run)
npm run test:review          # Trends + Tax over all eight, invariants asserted, exits non-zero
npm run test:tax             # tests/tax-tests.js in a headless browser instead of by hand
```

- **The fixtures are ANCHORED to a date** (`ANCHOR` in `scripts/make-test-data.mjs`, currently
  2026-09-05) and the engines read the real clock. Once the real date has moved a season on, the
  data no longer lands in the windows the trends use (last 12 months, last 26 weeks, this tax
  year) and the readiness gates start reporting on history that has aged out. **Re-run
  `npm run testdata`** — same caveat, same date, as `tests/tax-tests.js`.
- **The data is described, never enumerated.** A profile says "weekly, 18% missed, pays about three
  weeks late, three weeks off in August"; the review's expectations come from that description and
  from the documented rule, never from what the app returned. Tuning a fixture until the app agrees
  with it is the exact failure the tax suite warns about.
- **`scripts/review-test-data.mjs` loads the real `index.html` in a browser** and injects each
  state, so it cannot pass against a stale copy. It stubs `commit()` first: it reads, never writes.
  Note `S`, `trendSeg` and friends are top-level `let`s — they live in the global *lexical* scope,
  so `window.S = …` creates a second copy nothing reads. Assign the bare name.
- Two profiles carry no `settings.taxAck`, so the Tax tab shows its disclaimer gate rather than any
  figures. That is the gate under test, not an empty screen.
- `groundwork-testdata-scotland-high.json` assumes a pension that is **not in the file** —
  `pensionPcm()` reads `localStorage.tt_pension`, which no backup carries. It is recorded under
  `testData.device` and applied by the harness. See the review, finding 7.

### Two trends traps this corpus caught (Sep 2026) — do not reintroduce
- **`catOf` is not `clientCategory`.** `catOf(kind,key)` is the SA103 expense-category lookup and
  returns its "other business costs" fallback for anything unrecognised, so `catOf(c.status)` is an
  object that can never equal `"Finished"`. `anaDrifting` and `anaEpisodes` both did that: the
  drifting list was 14 discharged clients out of 15, and a client discharged this week was left out
  of the episode median for three of their own intervals. The status→category function is
  **`clientCategory(status)`**.
- **`ledgerBetween()` is not every cost.** A room hired BY THE SESSION hangs off the session
  (`derive().roomRate`) and supervision hangs off its own logs; `tyNet` subtracts both separately.
  `anaCostRatio` used the ledger alone and reported **8%** where the practice's own SA103 breakdown
  said **41%** — while an identical practice on a monthly rent read correctly, because monthly rent
  *does* go through the ledger. It also added `led.useOfHome` on top of `led.expenses`, which
  already contains it. Anything new that totals "what the practice costs" needs all four parts.

### Editing this file with scripts
It is 438KB of single-file app, so bulk edits are scripted. **Always build the whole string, assert every anchor matched, write to `index.html.tmp`, then `os.replace()`.** Opening the real file for writing first truncated it to 0 bytes once when the script raised mid-run.

### Error boundary
`go(tab)` wraps the view render; a throw shows `crashScreen(err, tab)` — which always offers **Export a backup**, Home and Reload — instead of leaving `<main>` empty. `window.onerror` / `unhandledrejection` route to `reportGlobalError()` (console always, one toast per session).

## Spreadsheet import (Settings › Import from a spreadsheet)
Onboarding path for a therapist arriving with history in Excel. `impOpen()` drives three sheet stages: **source** (`impStageSource` — paste TSV / pick .csv / download template) → **mapping** (`impStageMap`) → **dry-run preview** (`impStagePreview`) → `impCommit(plan)`.

Rules that must not regress:
- **Merge, never replace.** `importJSON()` is a whole-state replace and is for *backups only*. `impCommit()` appends to `S.sessions` and auto-creates the clients/rooms the rows reference. Nothing is written until the final button.
- **`impPlan()` is pure** — builds the whole plan without touching `S`, so the preview is exactly what will happen.
- **Fees become dated history, not a flat field.** Sessions have no `rate`; `derive()` reads `effRate(client,date)`. `impCommit()` walks rows oldest-first and pushes `rateHistory` / `roomRateHistory` entries only where the fee differs from what's already effective at that date. The first entry for a brand-new client/room is stamped **`RATE_EPOCH`** (`"2000-01-01"`) so earlier sessions still resolve. **A £60 session imported before a rise to £65 must still derive £60** — that's the tax figures.
- **`RATE_EPOCH` is a floor, not an event.** The import, the room seeder and the setup wizard all stamp it, and reading it as a real date is what put *"since 01 Jan 2000"* at the top of every imported client's profile. `clientAddedDate()` filters it out and takes the earliest of the remaining rate history and the client's own first session. Anything new that reads `effectiveFrom` as a date a human chose has to filter it too.
- **Dedupe key is `client|date|time`** (`impKey`). `onDupe:"skip"` leaves the app's version; `"update"` overwrites in place by `_id` — so re-importing a corrected file never duplicates.
- **Date ambiguity is resolved per column, not per row.** `impDateScan()` takes the whole column: any row with a first number >12 settles day-first vs month-first; nothing conclusive defaults to UK DMY and *says so*. Conflicts (both readings forced) are flagged red. The user can override, and the banner shows a worked example (`"03/04/2026" → 03 Apr 2026`) that updates live. Excel serials, named months and 2-digit years are handled in `impDateParts()`.
- **Late cancellation** is set at import from either the mapped column *or* `/late cancellation/i` in notes — `normalize()`'s backfill is one-time and gated by `meta.lateCancelBackfill`, so it will never see imported rows.
- **One Undo reverses the whole import.** `commit()` already snapshots, so the snapshot on top of the stack *is* the pre-import state; `impCommit()` only lays down its own `"Before spreadsheet import"` snapshot when `snapCount()===0`. Adding one unconditionally makes Undo take two taps — don't.
- **`impTemplate()` generates the template from `IMP_FIELDS`**, so template headers can never drift from the parser. There's a test for this: the template's own column list must guess back to itself exactly.
- `impGuess()` matches header synonyms exact-first then substring, one field per column. Field order in `IMP_FIELDS` breaks ties (`location` claims a bare "Room" before the `room` field does).
- Offered as a setup-wizard step (`stepImport`) on first run only — a re-run promises not to touch client data. Inside the overlay it runs with `{quiet:true}` so it doesn't `go()` or `celebrate()` behind it.

## Session schedules & GroundWork Notes (added Aug 2026)
How often each client is seen, shared with the companion notes app so it can work out which
sessions still need writing up. **The specification both apps implement is
`../GroundWork/docs/schedule-sync.md`** — it is the authority, and a change to the rule has to be
made in three places at once: here, in GroundWork Notes' `SessionPrediction`, and in that document.

- **`clientSchedule(c)`** is the one place a client's cadence comes from: `freqDays(c)` for the
  interval, and their usual day/time. `c.usualDay` / `c.usualTime` are **overrides** — blank means
  `usualSlotFor(code)` reads the commonest day and time out of their last `SLOT_WINDOW` (8)
  attended sessions, so this works for every existing client with nothing typed.
- **`placeOnSchedule(d, sched)`** snaps a date onto the usual day, moving **at most three days
  either way**, and is ported line for line from `SessionPrediction.place` in the notes app.
  Change both, or the two apps offer different dates for the same client. The two clamps together
  map a delta into ±3; note that `>3`/`<-3` is not the same as `>3`/`<-4` — the second bound is
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
  in `SessionScheduleTests.swift`. If it fails, fix both apps and the spec — never just one.

### The schedule file (Settings › Data & backup › GroundWork Notes)
`syncSchedules()` writes `groundwork-schedules.json`: client codes, status, cadence, usual day and
time, and the first session's date. **No names, no fees, no attendance, nothing clinical**, and
nothing comes back — whether notes are done stays a tick in this app.
- **`kind:"schedules"` is what identifies the file.** A full backup also holds client codes and
  would half-work at the other end, so the notes app refuses anything without that marker.
- **`rosterCode()` enforces the notes app's own rule** (2–12 letters and digits). A code that fails
  it is left out of the file *and counted on screen*, rather than exported and silently rejected
  where the counsellor cannot see why.
- **Three ways to write it, one per platform.** Desktop Chrome/Edge keeps a `FileSystemFileHandle`
  in the `state` store (**not** localStorage — a handle is structured-cloneable, and
  `JSON.stringify` would turn it into `{}`) so every later sync overwrites the same file silently.
  iOS goes through the existing share sheet, because `download()` is already wrapped natively.
  Everything else downloads. Last sync is `tt_rostersync` in localStorage — device state, so it
  stays out of `S`.

## Restore from backup (Settings › Data & backup — hardened Aug 2026)
`importJSON()` is a whole-state replace, so it is gated by **smart friction, not uniform friction** — `restoreConfirm()` picks one of two tiers from `restorePlan()`. A restore onto a new phone stays one tap; stamping a stale file over weeks of newer entries earns the same ladder as erase.
- **Tier A** (`sheetPromise`, one Restore button) when the device is effectively empty (`sessions===0 && clients===0`) **or** the backup is neither older nor smaller. **Tier B** (`dzConfirm`, `phrase:"RESTORE"`, 3-second arm) when the backup has **fewer sessions** than the device or an **`exportedAt` older than the device's last change**. Both tiers show the same block: the export date ("unknown date" for a bare state file with no envelope), backup vs device counts side by side, `validateImport`'s `problems`, and the restore-point line.
- **The device's last change is the audit log's newest entry (`auditLatest()`), not `tt_state_ts`.** `loadState()` calls `mirror()` on every open, so that key means "last opened" whenever the database is there — using it would make every backup on a used device look stale and put *everyone* in Tier B, which is the one outcome this design exists to avoid. `tt_state_ts` is read only in fallback mode (`_db===null`), where nothing mirrors at load. An unknown date on either side is not evidence: the counts decide alone.
- **The empty-device short-circuit is load-bearing.** A fresh install's audit already holds "App installed — starting fresh" dated *now*, so without it every restore onto a new phone would be Tier B.
- `dzConfirm` takes an optional **`o.detail`** HTML slot (rendered under the lead) so Tier B can show that same comparison; no other caller passes it.
- **No extra snapshot.** `commit("Restored backup (…)")` already snapshots, so the pre-restore state *is* the top restore point — adding one here would make Undo take two taps, the same rule as the spreadsheet import. `validateImport` is untouched; the `askPassphrase` prompt still runs before validation; an unreadable file still `alert()`s.

## Data removal (Settings › Privacy & removal)
Collapsed `<details class="dz">` → `dzMenu()`. Four routes, all gated by `dzConfirm()`: a summary of what changes, an export-first button, an acknowledgement checkbox, a typed phrase, and a 3-second arming delay on the final button.
- `anonymiseClients(codes)` — code → `Client 001`, notes/invoice/receipt cleared. **Preserves the financial and clinical shape**: dates, fees, payments, attendance and late-cancel flags all survive, so tax figures are unchanged. Captures `s.lateCancel = isLateCancel(s)` *before* clearing notes, because the historical convention stored it in the notes text. Session notes become `"Y"`, not `""`, so `derive().complete` still reads as done.
- `eraseClients(codes)` — removes clients, their sessions and their `rateHistory`; strips their names from `supervision[].clients` but **keeps the supervision entries** (therapist's own CPD/tax record).
- `eraseEverything()` — clears the three object stores **first** (always succeeds), then deletes the DB (another open tab can defer this), then removes `tt_*` localStorage keys. **Leaves the SW caches alone** — they hold no client data, and clearing them would strand the user offline with no app.
- `dzPickClients()` / `sheetPromise()` — sheet-based promises that resolve `null` when dismissed by any route (a MutationObserver on `#sheet`'s class), so no promise hangs.

## Records retention (Settings › Records retention — added Aug 2026)
`retentionRows()` flags clients whose status is in `settings.retention.endedStatuses` and whose **last logged session** is more than `notesYears` / `financeYears` ago. Two clocks, because notes and money are kept for different reasons.
- **Flag only — it never deletes.** The row's Anonymise / Erase buttons hand off to `dzRunAnonymise([code])` / `dzRunErase([code])`, so every removal still goes through the full `dzConfirm()` gauntlet. Don't add a shortcut that skips it.
- `defaultEndedStatuses(st)` reads the therapist's own status→category mapping and takes the statuses under category `Finished`. **Paused / Active enquiry are Pipeline, not ended** — those clients may return, and flagging them would be wrong.
- A client with no logged sessions has no clock to count from and is skipped.

## Peer supervision (added Aug 2026)
`S.peerSupervision` is a separate log from `S.supervision`, reached from a third sub-tab on Supervision. Its hours are added to the **total accreditation hours** in `mountAccreditation()` and are deliberately absent from `sup`, the only figure the 1:6 ratio sees. Keeping the two arrays apart is what makes that rule visible — don't merge them with a `type` field. A peer entry's optional `cost` feeds `tyNet()` like clinical supervision does.

## Long lists: folding history away (added Aug 2026)
Five lists grow with the practice — Practice › Clients, Practice › Trends (attendance, missed sessions, long-term) and Sessions › All. Each lists what's current and folds the rest into an aggregate row that expands on demand.
- **`trendsIsCurrent(c, lastDate)` is the single definition** of "still current", shared by every per-client list so a client can't read as current in one and folded in the next. Status leads — category `Finished` is out — with a `TRENDS_RECENT_DAYS` (365) backstop, because a status nobody updated is exactly what the Review status card exists to catch.
- **Sessions fold by time, not by client**: the newest `SESS_VISIBLE` (60) are listed and older ones group into one block per tax year carrying billed/received totals. This replaced a hard `slice(0,400)` that made session 401 unreachable.
- **`AGED_MIN` (8) gates the whole mechanism.** Below it nothing folds and the screen looks exactly as it always did — hiding three finished clients behind a tap costs a reader more than the rows ever did.
- **Folded rows are built on expand, not up front** (`agedFold` renders an empty `data-pending` body; `wireAgedFolds(host, builders, onRow)` fills it on first `toggle` and wires clicks, which the render-time `querySelectorAll` pass cannot reach — `onRow` decides whether a row opens a profile, the client form or a session).
- **Search never folds.** Someone searching is looking for a specific person or session, very possibly one that finished years ago.
- **Aggregates never lose the folded records**: KPIs, the funnel, the rolling attendance chart and every total still count everyone. Only the individual rows fold.
- Sessions › Unpaid and › Incomplete stay whole — they are worklists to clear, not history to browse.

## Practice analytics — the Trends engine (Sep 2026)
Twenty analytics live behind **Practice › Trends**, computed by a block of **pure functions** (`ana*`) that read `S` and `today()`, return a plain object and write nothing. Same contract as the tax engine: callable from a console, never gated (`plusLocked("trends")` decides what the *view* renders, not what the engine computes).

Three rules every one of them follows — a wrong figure here is worse than no figure:
- **Never invent a trend from nothing.** Each returns `{ready:false, need:"<what is missing>"}` and the view prints that sentence instead of a chart (`anaWaiting`). Twenty-four weeks of zero is not a seasonal pattern.
- **Cancellations are not attendance.** `isCancelled()` sessions are excluded wherever the question is "did I see someone" (hours, capacity, load, episode length) and included wherever it is "what did this earn" (revenue, fee erosion) — a charged late cancellation is real money.
- **Only whole periods.** `anaMonthlySeries(n)` starts at *last* month; a month still running would drag every average down and recover on the 1st.

### The four sections
`TREND_SEGS` / `trendSeg`, with its own segment bar inside the view. **Sections are built only when opened** — `clientAttendance()` across a whole client list and `anaCohorts()` are both real work, and changing section redraws `#trbody` only, never `go()`, so the reader is not thrown to the top of Practice.
- **Clients** — retention funnel, drifting away, review status, attendance, cohort retention, episode length, referral sources, long-term.
- **Money** — seasonality, your floor, fee erosion, days to payment, who pays late, cost ratio, missed sessions.
- **Time** — effective hourly rate, capacity, slot reliability, weeks actually worked.
- **You** — supervision cadence, load, CPD trajectory.

### Things that will bite
- **`anaEpisodes()` counts only FINISHED work.** A client still being seen has a length that has not happened yet; including them drags the median towards nothing.
- **`anaCohorts()` only asks a milestone of a cohort old enough to have reached it** (`ripe`), or a cohort that started last month reads as 0% retention at 24 weeks — a lie, not a gap.
- **`anaDaysToPay()` dates on the SESSION, not the payment.** A March session paid in June belongs to March, or a slow month looks fine simply because nothing has landed yet.
- **`SLOT_DAYS` holds lowercase matcher keys, not display text** — `anaSlots()` renders through `SLOT_DAY_NAMES` or every row says "sun".
- **`anaCPD()` reports pace from the last 90 days, not the running total**, and the card has **four** states: the awkward one (target met, pace since dropped) is exactly what a running total hides.
- Three settings feed it and nothing else: `settings.sessionMins` (50), `adminMinsPerSession` (15) and `fullWeekSessions` (**deliberately unset** — `anaCapacity()` falls back to the busiest week actually worked and says so, rather than inventing a target).
- **`client.source`** is free text with a datalist (`sourceSuggestions()`), not an enum — every practice names its sources differently. `anonymiseClients()` clears it.

## Cancellations & DNAs (added Aug 2026)
Two kinds of missed session, and the charge is **stamped on the session**, never derived live from the policy.
- `settings.cancelRules = {window:[{hoursBefore,chargePct}], dnaChargePct}`. `cancelPolicy()` sorts windows **longest notice first** and `cancelPolicyPct(kind,hrs)` returns the first one the notice clears. Notice that clears no rule — and notice that was never recorded (`hrs==null`) — charges the **full fee**. That direction is deliberate: a draft that is too high gets corrected on the spot, one that is too low is a fee quietly written off. A therapist wanting a lower floor adds a rule at 0 hours.
- The policy is only ever a **starting point**. `cancelPctFor(s)` reads `s.cancelCharge` and nothing else, so editing the policy cannot reach back and rewrite what a client was already billed. Absent = 100, which is what every session was before v5.
- `derive()` returns `fullRate` (the fee in force), `cancelPct` and `rate` (`fullRate × pct`). Everything downstream — revenue, net, SA103, MTD — reads `rate`, so a reduced charge flows through from that one place. **The MTD quarters must still reconcile to `tyNet` on both bases.**
- **`isCancelled(s)` is the exclusion predicate**, not `isLateCancel`. A DNA has to be excluded from clinical hours, attendance, session counts and milestones for exactly the same reasons a late cancellation is. `isLateCancel` still reads the historical `"Y (late cancellation)"` notes convention and is what sets the `lateCancel` flag itself — don't merge them.
- The session form's charge box carries `data-auto` while it holds a policy-derived figure, so adding the cancellation date afterwards re-derives it; typing in the box clears the mark and the number is then left alone.
- A missed session that **was** charged now appears on receipts (`receiptRows`), labelled in the Mode column, or the statement total would not match what the client was asked to pay.

## Gradual reveal (settings.reveal, added Aug 2026)
No new gating layer — this only decides which existing `feat()` flags start off for a brand-new install.
- `settings.reveal = {mode:"simple"|"all", shown:[]}`. `normalize()` defaults `mode` to **"all"**; only `stepDepth` ever sets `"simple"`, and it is only offered when `!rerun && no sessions && no clients`. Hiding tabs from someone already using them is the one outcome this must never produce.
- `REVEAL_CORE` is what stays on: **`supervision`, `money`, `attention`** — who am I seeing next, and who owes me money. `attention` is core because overdue payments are worth knowing about from week one; `gamify` and `receipts` were moved out of it because rings, medals and a statement button answer neither question on day one. `REVEAL_STEPS` is the ordered list of what gets offered back and what earns it. A step's `keys` may hold **more than one flag**: `tax` and `finances` are revealed together at 10 sessions, because an estimate that ignores what the practice costs you is one nobody should set money aside against. `shown` is keyed on `keys[0]`.
- Schedule (ordered by threshold): **5** sessions *and at least one paid* → Receipts & statements · **10** → Tax + Costs & other income · **15** → Streaks & celebrations · **20** → Trends · **40** → Table view.
- Home gates two extras on its own, in **every** mode: the revenue sparkline needs 10 sessions (24 weeks of £0 is not a trend) and the longstanding-clients card needs a client at 6+ sessions. Neither is a `feat()` flag, so neither is ever offered — they simply appear.
- `trends` is a feature flag (a segment inside Practice, not a tab). Absent = on, so existing installs and "show everything" keep it; only the simple preset switches it off.
- **`accreditation` and `peer` are excluded from the simple preset** — `stepCPD` asks about both directly, and an answered question beats a default. Peer is never offered by a milestone: whether someone attends peer supervision is a fact about their practice, not something a session count can infer. `startSetup` unticks `peer` for a fresh install only (normalize leaves it absent = on, so existing installs keep it).
- `revealCheck()` runs from `commit()` **after** the write, never before — an accepted nudge commits again and must not interleave with the save that triggered it. One offer per save; the key goes into `shown` whether accepted or declined, so nothing is ever asked twice.

## GroundWork Plus — the paywall (added Sept 2026)

An annual subscription. Sold on iOS via StoreKit; **the web build is ungated** — Phase 1 keeps the
PWA free as the shopfront, because a lock with no way to buy behind it is a broken feature. Full
design and the decisions behind it in **`docs/monetisation.md`**.

Three rules the code depends on. Breaking any of them is silent.

- **The gate never touches the data plane.** Logging, receipts, and every import/export/backup
  path stay free permanently — a paywall must never sit between a therapist and her own records
  (also UK GDPR portability). `check-drift.mjs` asserts `commit()`, `exportJSON()` and
  `importJSON()` never call `plusLocked()`.
- **`plusLocked()` is not `feat()`.** `feat(k)` is a preference the user set; `plusLocked(k)` is a
  billing state. Overloading `feat` would drop paid tabs out of `visibleTabs()` entirely, leaving
  nothing to sell from, and tangle the two axes so subscribing would have to guess which flags to
  restore. **A paid tab still appears and still opens** — its view renders `plusLockHTML()` instead
  of its content.
- **The gate stays out of the engine.** `tyNet`, `taxLiability`, `mtdQuarters`, `mtdExport` and
  `ledgerBetween` are pure and ungated — `tests/tax-tests.js` calls them directly. Gate the
  *button*, never the function. `check-drift.mjs` asserts this too; a tax test failing because of
  the paywall means it has been put in the wrong layer.

Gated: `tax`, `finances`, `mtd`, `trends`, `accreditation`, `notesSync` (`PLUS_FEATURES`). **`palettes` was dropped in Sep 2026** when colour schemes were switched off entirely — see Setup wizard § Palettes.

- **Trends is a sneak peek, not a wall** (Sep 2026). `renderMetrics()` computes the retention funnel first and only then branches on `plusLocked("trends")`: under the gate the funnel renders **in full on real numbers**, and the other three sections are named underneath with **one real figure each from this practice** (`.peekrow` / `.peekfig`). The old behaviour — `plusLockHTML()` describing four charts nobody had seen — was a poor advert for data that belongs to the reader. The lock is a `return` partway through the function, not a mode: everything below it is untouched. **Deliberately not extended to Tax** — a partial tax figure is a wrong tax figure, and `taxAcked()` exists to stop people acting on numbers they were not walked through.
- Palettes were dropped from the tier and from the app in Sep 2026; the reasoning is `docs/product-proposals-2026-09.md` §2.
Free: everything else, including `receipts`, the spreadsheet import (it is the switching-cost
remover — gate it and nobody ever reaches the paywall) and encrypted/automatic backups.

- **`tt_plus` in localStorage, never in `S`** — same rule as `tt_lock`. `S` travels in backups, so
  an entitlement in it would ride a `.json` onto another phone. `plusActive()` is **synchronous**
  (called from render paths), and every failure path **fails open**: an unreadable date, a thrown
  call or a stale check never locks anyone out. `PLUS_EXPIRY_GRACE_DAYS` (7) covers a renewal that
  could not be verified yet.
- **`window.GWPlusNative` is the only seam to StoreKit.** Shared code never calls Capacitor
  directly. The native block only ever *refreshes* the cache; `applyPlus(r, allowClear)` takes
  `allowClear:false` from `purchase()` so a cancelled purchase is not read as a lapse, and it only
  clears a cache StoreKit owns — a granted licence is not StoreKit's to revoke.
- **Gifts and comps go through Apple's offer codes on iOS** (`plusRedeem` → the code redemption
  sheet), not home-grown keys. Signed licences (`scripts/issue-licence.mjs`, ECDSA P-256) are for
  the web and anything Apple cannot reach. `PLUS_PUBKEY` is `null` until `--keygen` runs, and the
  redemption UI is hidden while it is — **the private key must never enter this repo**. There is no
  revocation; expiry is the only lever.
- **Testing locked states in a browser:** `localStorage.tt_plus_gate = "on"`. It can only switch the
  gate *on*, never unlock.

## Gamification (S.game)
- **Streak**: any `commit()` call marks the current ISO week as active via `gameTouch()`.
- **Home view**: streak flame animation, goal progress rings, records badges.
- **Sounds**: `Sfx` (Web Audio, synthesised). Default ON; toggled via 🔊 header button, persisted to `localStorage('tt_sound')`.
- **Confetti**: canvas-based `Confetti` object.
- **Celebrate overlay**: `celebrate(emoji, title, sub, ribbon)`.

## On-page coaching (added Aug 2026)
The tour used to be eight full-screen `.ov` cards describing controls the reader could not see, because the card was on top of them. `coachStart(steps, opts)` dims the page and cuts a spotlight over the real element instead, with a small bubble beside it.
- **A step with no `sel` is centred, deliberately.** "Your notes don't live here" and "use client codes, not names" are ideas, not controls; highlighting an arbitrary card to give an idea somewhere to live is worse than highlighting nothing. A `sel` that matches nothing (a switched-off feature) degrades to the same centred form rather than pointing at the wrong thing.
- **Never animate a reposition driven by scrolling.** `coachPlace(false)` sets `.noanim`; every scroll event otherwise restarted the 0.3s transition from wherever it had got to, so the mask chased the target for the whole scroll and never arrived. `coachScroll()` also skips `coachPinned()` targets — centring the tab bar or the FAB scrolls the page for nothing.
- **`z-index: 44`** — above the tab bar (35) and FAB (40), both of which it has to point at; below sheets (50) and the setup flow (45), neither of which it may ever cover.
- **`TIPS` is the other half.** The per-screen detail that used to be crammed into the tour fires the *first time* that screen is opened, once ever, keyed in `settings.coach.seen` (in settings, not localStorage, so it travels with a backup and a new phone does not replay everything). `coachMaybeTip(tab)` runs at the end of `go()` and stays quiet when a flow, a sheet or another coach is up. `when()` is what keeps a tip worth reading — a tip about folding away finished clients is noise on an empty list.
- Segment-scoped tips (`seg`) must come **after** the tab-wide one in `TIPS` only if you want the general one first; `TIPS.find` returns the first match, and the natural flow is the tab tip on the default segment, then the segment tip when that segment is first opened.

## Setup wizard & guided tour (S.settings)
- **First run**: `startSetup()` fires from init when `S.settings.onboarded` is false. `normalize()` sets `onboarded = true` for any state that already has clients or sessions, so existing installs never see it.
- **Flow engine**: `flowStart/flowGo/flowNext/flowClose` drive a full-screen `.ov` overlay (z-index 45 — above the tab bar, below `#sheet`) from an array of step objects `{emoji,h,sub,html,mount,validate,onLeave}`. Shared by setup and the tour.
- **Tour**: `startTour()` — now on-page coach marks, not the `.ov` flow. Eight stops on day-one essentials; per-screen depth lives in `TIPS`. Read-only, replayable from Settings › Setup & help, where the tips can also be switched off or reset.
- **Re-run**: `confirmRerunSetup()` — warning sheet requiring the user to type `RESET SETUP`. Skips the rooms step once sessions exist.
- **Feature flags**: `feat(key)` gates tabs (`TABS[].ft`), gamification (`celebrate`, `Confetti.burst`), attention feed, receipts, accreditation, `peer` (peer supervision, dep: supervision) and `finances` (costs & other income, dep: income). Off = hidden, never deleted.
- **Removed Sep 2026: the quick-add command bar** (`parseQuickLog` / `quickLogBuild` / `mountQuickLog`, the `quickadd` flag and its reveal step). It was a second, less capable route into the session form — every session it created still had to be opened and corrected. A stored `features.quickadd` on an existing install is now inert; don't reintroduce the key.
- **Retention step**: `stepRetention()` sits between money and backup, and its `validate()` refuses blanks or anything outside 1–50 years — a retention period nobody chose is a compliance decision made by a default.
- **Palettes: switched OFF (Sep 2026), code kept.** `PALETTES_ENABLED=false` is the whole switch. The `PALETTES` data, the `html[data-palette]` CSS blocks, `paletteOptionHTML()`, the Settings picker and the wizard step are all still here and still work — flip the flag to bring them back. `applyPalette()` **forces `"sage"`** while it is off (forcing, not skipping: an install that had picked Ocean must be repainted), and the pre-paint head script is hard-coded to sage so a stored choice cannot flash before JS runs. **`settings.palette` is deliberately never cleared**, so restoring the flag restores everyone's own choice. Removed from `PLUS_FEATURES` at the same time — gating something nobody can reach is worse than not selling it.
- **Branding**: `practiceName()` / `practiceTagline()` feed the header pill, `--appname` (desktop sidebar title), `document.title` and printed receipts. `applySettings()` re-applies everything after load, import or rollback.

## UI structure
- Single-page app with tab navigation (`nav.tabs`).
- Views rendered into `<main id="main">` — each tab calls its own `render*()` function.
- Bottom-sheet modal: `#sheet` / `#sheetBody` / `openSheet(title, html)`.
- FAB (`#fab`) = quick "Log session".
- Toast notifications: `toast(msg)`.
- Dark/light theme via `data-theme` on `<html>`. `localStorage('tt_theme')` holds `light`/`dark`; **absent = auto** (follow the device, via a `matchMedia` listener). Use `themePref()` to read it, `setTheme('light'|'dark'|'auto')` to set it.
- Colour scheme via `data-palette` on `<html>`, persisted to `localStorage('tt_palette')`.

## Key views / render functions
| Function | Tab |
|---|---|
| `renderHome()` | Dashboard / KPIs |
| `renderClients()` | Clients list |
| `renderSessions()` | Sessions (includes Incomplete sub-tab) |
| `renderIncomplete()` | Bulk room-paid + notes editor |
| `renderUnpaid()` | Bulk unpaid session payment screen |
| `renderCalendar()` | Calendar view |
| `renderRooms()` | Room management (per-session or monthly billing) |
| `financeCards()` / `financeForm()` | Business costs & other income (inside Revenue) |
| `retentionCardHTML()` | Records retention review (inside Settings) |
| `renderReports()` | Raw data / reports |
| `renderSettings()` | Settings / data management |

## Locale / formatting
- Currency: `gbp(n)` → `£` with locale formatting (en-GB).
- Dates: `fmtD`, `fmtDshort`, `fmtDM`, `isoD`, `parseD`.
- Tax year: April 6–April 5 (`taxYear(d)`).

## Known limitations — not yet fixed

### Multi-tab / multi-device writes overwrite each other (audit finding #8, Aug 2026)
**Not addressed. Deliberately deferred — do not assume it is safe.**

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
- **SEED object**: `window.SEED` at the top of the `<script>` block is the initial data seed. It is generic (one "At home" room at £0) — no personal data — update carefully.
- **No build step**: pure vanilla JS/CSS/HTML. No npm, no bundler, no TypeScript.
- **IndexedDB version**: `DBV=1` — only bump if adding new object stores (triggers `onupgradeneeded`).
