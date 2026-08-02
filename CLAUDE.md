# Therapy Tracker — Claude Code Reference

## Project overview
Single-file offline PWA for Charlotte Bloor Therapy (UK sole-trader therapist). Tracks clients, sessions, rooms, supervision, and payments. Installable on iOS/Android/desktop via PWA.

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

## Service worker cache strategy
`sw.js` uses **network-first for HTML** (`req.mode === "navigate"`) — every page load fetches a fresh `index.html` from the network, so updates land on next open without needing a cache bump.

Static assets (icons, manifest) use cache-first. You only need to bump the cache name constant (`C = "tt-v3"`) if you rename or remove a static asset file, to force old caches to clear.

Two rules the fetch handler depends on — don't regress them:
- **`SHELL` (`./` + `index.html`) is precached at install.** The SW does not intercept the navigation that registers it, so without this a first-time visitor who goes offline before their second visit gets nothing at all.
- **Only `resp.ok && status === 200` is ever cached** (`cacheable()`). A 404/502 served during a deploy window would otherwise become the permanent offline copy. A non-ok navigation response also falls back to the cached shell rather than showing the error page.

## State / data model
Global `S` object — persisted to IndexedDB (`TherapyTrackerDB`) with a localStorage mirror.

```js
S = {
  clients: [],          // each has _id
  rooms: [],            // {location, rate, due}
  sessions: [],         // therapy sessions
  supervision: [],      // supervision sessions
  rateHistory: [],      // therapist fee history
  roomRateHistory: [],  // per-room rate history
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

### Schema versioning
`SCHEMA_VERSION` (currently `2`) is stamped on `S.meta.schemaVersion` and on every backup envelope. Unstamped data is treated as v1.
- Bump it when a change would be **misread** by an older build, and add the matching step to the ordered migration block in `normalize()`.
- `validateImport()` **refuses** a backup whose version is newer than the running app — importing would silently drop unknown fields and then save that loss back over good data.
- `normalize()` never downgrades newer data in place.

### Error boundary
`go(tab)` wraps the view render; a throw shows `crashScreen(err, tab)` — which always offers **Export a backup**, Home and Reload — instead of leaving `<main>` empty. `window.onerror` / `unhandledrejection` route to `reportGlobalError()` (console always, one toast per session).

## Data removal (Settings › Privacy & removal)
Collapsed `<details class="dz">` → `dzMenu()`. Four routes, all gated by `dzConfirm()`: a summary of what changes, an export-first button, an acknowledgement checkbox, a typed phrase, and a 3-second arming delay on the final button.
- `anonymiseClients(codes)` — code → `Client 001`, notes/invoice/receipt cleared. **Preserves the financial and clinical shape**: dates, fees, payments, attendance and late-cancel flags all survive, so tax figures are unchanged. Captures `s.lateCancel = isLateCancel(s)` *before* clearing notes, because the historical convention stored it in the notes text. Session notes become `"Y"`, not `""`, so `derive().complete` still reads as done.
- `eraseClients(codes)` — removes clients, their sessions and their `rateHistory`; strips their names from `supervision[].clients` but **keeps the supervision entries** (therapist's own CPD/tax record).
- `eraseEverything()` — clears the three object stores **first** (always succeeds), then deletes the DB (another open tab can defer this), then removes `tt_*` localStorage keys. **Leaves the SW caches alone** — they hold no client data, and clearing them would strand the user offline with no app.
- `dzPickClients()` / `sheetPromise()` — sheet-based promises that resolve `null` when dismissed by any route (a MutationObserver on `#sheet`'s class), so no promise hangs.

## Gamification (S.game)
- **Streak**: any `commit()` call marks the current ISO week as active via `gameTouch()`.
- **Home view**: streak flame animation, goal progress rings, records badges.
- **Sounds**: `Sfx` (Web Audio, synthesised). Default ON; toggled via 🔊 header button, persisted to `localStorage('tt_sound')`.
- **Confetti**: canvas-based `Confetti` object.
- **Celebrate overlay**: `celebrate(emoji, title, sub, ribbon)`.

## Setup wizard & guided tour (S.settings)
- **First run**: `startSetup()` fires from init when `S.settings.onboarded` is false. `normalize()` sets `onboarded = true` for any state that already has clients or sessions, so existing installs never see it.
- **Flow engine**: `flowStart/flowGo/flowNext/flowClose` drive a full-screen `.ov` overlay (z-index 45 — above the tab bar, below `#sheet`) from an array of step objects `{emoji,h,sub,html,mount,validate,onLeave}`. Shared by setup and the tour.
- **Tour**: `startTour()` — feature-aware, read-only. Replayable from Settings › Setup & help.
- **Re-run**: `confirmRerunSetup()` — warning sheet requiring the user to type `RESET SETUP`. Skips the rooms step once sessions exist.
- **Feature flags**: `feat(key)` gates tabs (`TABS[].ft`), gamification (`celebrate`, `Confetti.burst`), quick-add, attention feed, receipts and accreditation. Off = hidden, never deleted.
- **Palettes**: `PALETTES` + `html[data-palette]` CSS blocks. `applyPalette()` mirrors to `localStorage('tt_palette')` so the head script applies it before first paint. `paintThemeColor()` keeps `#tcMeta` in sync.
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
| `renderRooms()` | Room management |
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
- **SEED object**: `window.SEED` at the top of the `<script>` block is the initial data seed. It contains real room names/rates — update carefully.
- **No build step**: pure vanilla JS/CSS/HTML. No npm, no bundler, no TypeScript.
- **IndexedDB version**: `DBV=1` — only bump if adding new object stores (triggers `onupgradeneeded`).
