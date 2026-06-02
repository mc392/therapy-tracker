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

Static assets (icons, manifest) use cache-first. You only need to bump the cache name constant (`C = "tt-v2"`) if you rename or remove a static asset file, to force old caches to clear.

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
  }
}
```

Key functions:
- `commit(summary)` — save to IndexedDB + audit log + snapshot (up to 120 snapshots). Also calls `gameTouch()`.
- `undo()` — reverts to previous snapshot.
- `normalize(st)` — seeds missing fields / defaults; called on load.
- `loadState()` — initialises DB, loads or seeds state into `S`.
- `mirror(S)` — writes S to localStorage as a safety net.

## Gamification (S.game)
- **Streak**: any `commit()` call marks the current ISO week as active via `gameTouch()`.
- **Home view**: streak flame animation, goal progress rings, records badges.
- **Sounds**: `Sfx` (Web Audio, synthesised). Default ON; toggled via 🔊 header button, persisted to `localStorage('tt_sound')`.
- **Confetti**: canvas-based `Confetti` object.
- **Celebrate overlay**: `celebrate(emoji, title, sub, ribbon)`.

## UI structure
- Single-page app with tab navigation (`nav.tabs`).
- Views rendered into `<main id="main">` — each tab calls its own `render*()` function.
- Bottom-sheet modal: `#sheet` / `#sheetBody` / `openSheet(title, html)`.
- FAB (`#fab`) = quick "Log session".
- Toast notifications: `toast(msg)`.
- Dark/light theme via `data-theme` on `<html>`, persisted to `localStorage('tt_theme')`.

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

## Known gotchas
- **Frozen bash mount**: the bash workspace mount of the CBT folder can serve stale content. Use the Read/Edit/Grep file tools (not bash `cat`/`grep`) to read index.html reliably.
- **SEED object**: `window.SEED` at the top of the `<script>` block is the initial data seed. It contains real room names/rates — update carefully.
- **No build step**: pure vanilla JS/CSS/HTML. No npm, no bundler, no TypeScript.
- **IndexedDB version**: `DBV=1` — only bump if adding new object stores (triggers `onupgradeneeded`).
