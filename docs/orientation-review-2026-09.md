# Code, copy and orientation review — September 2026

Three questions were asked of the app on 11 Sep 2026, in this order:

1. **Code** — what refactoring, efficiency or organisation is recommended, with nothing changing
   in behaviour unless the change is an objective improvement?
2. **Copy** — is the text on the face of the app straightforward, clear, not too dense and not
   technical, with any detail that is needed consistently behind an info icon?
3. **Orientation** — the app is feature-dense and heavily configurable: how can a user be guided,
   signposted and steered to what to do or review, after the initial setup has faded?

This document records what was found, what was done, and — for the third question — what is
recommended but deliberately **not** built here, ranked so the next round can pick from it.

---

## 1 · Code

### Method

The whole of `TherapyTracker-web/index.html` (15,000 lines, 1.08 MB) was mapped by its section
banners, then scanned mechanically for: functions and constants referenced only at their
definition; CSS classes that no markup or script ever emits; identical snippets repeated across
sites; and unreachable branches. Every candidate was checked by hand against the native iOS
block, the scripts and the Swift, because a name that nothing in the HTML references can still be
one the wrapper reaches for (`scripts/check-drift.mjs` asserts those).

### Removed (nothing called them)

| What | Why it was dead |
|---|---|
| `lockedTier()`, `floatPill()`, `freqLabel()`, `coachOn()` | Defined, never called. `floatPill` was the reward pill from an earlier gamification pass; its `.floatpill` CSS and `floatup` keyframes went with it. |
| `FIN_CATS` | "Kept for the few places that still want a plain label" — there were none. |
| The streak-card CSS (`.streakcard`, `.flame`, `.streak*`, `flick`, `bump`), `.countup.tick`, `.pbar`, `.ovkey`, `.irow .pdate2` | The components were retired when Home was revised; the CSS stayed. |
| An empty `/* quick-log command bar */` banner | The feature was removed in Sep 2026; the banner survived. |
| `infoDef("backup-restore-detail")` | Registered, never linked; its content is a subset of `backups-explained`. |
| A branch in the sessions list testing `seg==="incomplete"` | That segment had already returned three lines earlier. |

About 3.5 KB. Small in bytes; the point is that a reader searching the file no longer lands on
code that looks live and is not.

### Consolidated

Four snippets were pasted verbatim at many sites. Each is now one function, named for what it
means rather than what it does:

| Helper | Replaces | Sites |
|---|---|---|
| `derivedSessions()` | `S.sessions.map(s=>({s,d:derive(s)}))` | 11 |
| `goSessions(seg)` | `sessFilter.view="list";sessFilter.seg=…;go("sessions")` | 8 |
| `goRoomCosts(card)` | `go("money",{seg:"costs",focus:"roomFeesCard"})` and the rent variant | 6 |
| `emptyNote(text)` | the `<p class="muted small center" style="padding:18px">` empty-state line | 5 |

None of them changes what happens; they change how many places have to be edited when it does.
A **table of contents** now heads the main script, naming each region and what lives in it, so a
reader can search for a banner rather than scroll.

### One objective fix

The session form printed the room's raw due code — `Room: £15 (EOM)` — a storage value that the
rooms list had already stopped showing because "it meant nothing to anybody". The line now prints
the amount; where the fee stands, and when it is due, is the sentence underneath it.

### Looked at and deliberately left

- **`derive()` is recomputed per render, several times.** Home runs it for the KPIs, again inside
  `attentionItems()`, again inside `gameGoals()`. On the largest fixture (1,145 sessions) a pass
  is a few milliseconds, and the honest cost of a cache is a stale figure after a rate change.
  Not worth it at this size; worth measuring again if a practice reaches several thousand
  sessions.
- **`VIEWS.settings` is 400 lines of markup and wiring in one function.** It would read better
  as one function per card, but the sticky-title, search and fold-state code all reach across
  the whole view, and splitting it for its own sake risked the one thing the repo warns about
  most (a control whose save handler no longer finds it). Left for a round that is changing
  Settings anyway.
- **Palettes.** All the code is still present behind `PALETTES_ENABLED=false`, on purpose — see
  CLAUDE.md § Setup wizard § Palettes. Not dead; dormant.
- **Multi-tab overwrite.** Documented as deferred in CLAUDE.md § Known limitations. Not touched.

Every existing suite passes after the changes (`check`, `test:tax`, `test:behaviour`,
`test:rent`, `test:tiers`, `test:pins`, `test:projection`), plus the new `test:guidance`.

---

## 2 · Copy

### Method

Every on-screen paragraph of 170 characters or more, outside the info sheets, was listed by a
script (fifty of them). Each was then judged against three rules the app already states for
itself:

- **One sentence on the screen.** If the reader needs it every time, it stays; if they need it
  once, it goes behind an info dot or a *Find out more* link.
- **No storage vocabulary on the face of the app.** No codes, no field names, no cipher names.
- **A label in copy is the label on the tab today.**

### Changed

| Screen | Before | After |
|---|---|---|
| Setup › rooms | Five sentences on billing modes, dated history and where to set invoice dates, naming a tab that no longer exists | Two sentences; points at Practice › Rooms |
| Setup › CPD | Two three-sentence switch descriptions with "1:6 ratio" and "Form 3A" mechanics | One sentence each |
| Setup › fees | Three sentences on fee history | One |
| Setup › backup | "Encrypts backups with AES-256…" | "Encrypts your backups…" (the cipher is in the info sheet) |
| Settings › Getting paid | Two sentences, the second explaining why the field is free text | One; the rationale already lived in its info sheet |
| Settings › Encrypted backup | "(AES-256)" on the card | Moved into the info sheet |
| Settings › Features › Show everything | Two long descriptions | Shortened |
| Practice › Supervision › Peer | A whole card explaining what peer hours count toward | One line and a *Why ›* link → new topic `peer-counts` |
| Practice › Supervision › CPD | A whole card, "What goes here" | One line and a *What counts ›* link → existing topic `cpd-window` |
| Peer supervision form | Three sentences of the same explanation | One line, same link |
| Sessions › Incomplete | "Room fees aren't here any more — …" | "Room fees are settled separately, under Money › Room fees ›" |
| Money › Overview footer | Two sentences naming three bases | One |
| Money › Room rent | A footnote duplicating the *Find out more* link beside it | Footnote removed |
| Tax › Estimate table | A five-part footnote defining Tax, Net and the asterisk | Basis, "tap a figure for the working", the asterisk, and *What each column means ›* → new topic `tax-table` |
| Tax › Per year | Two sentences on carry-forward | One, plus *How that works ›* → existing topic `carryforward` |
| Tax › Per year › Use of home | Two sentences | One |
| Tax › Making Tax Digital | A paragraph naming free and low-cost tools; a paragraph of thresholds | Both shortened, each with a link to the topic that carries the detail. The "free options exist" claim was also a guard-rail breach (`docs/tax-positioning-2026-09.md` §2) and is gone |
| Pension sheet | "(higher-rate relief is modelled by extending your basic-rate band)" | "the tax estimate allows for the tax relief on it" |
| Gradual reveal › Tax | A 60-word sentence explaining payments on account | Two short sentences |
| Business analytics › Clients | The fold explanation | Shortened |
| Three places | `Clients › Rooms` | `Practice › Rooms` |

### Kept dense on purpose

- **Setup › "How your data is kept safe."** Five points, each a sentence or two. It is the one
  step the wizard tells the reader to read properly, and the consequences of skimming it are the
  worst in the app.
- **The data-removal and re-run-setup sheets.** Warnings before irreversible actions are not
  explanatory prose; the rule exempts them.
- **Tax › Pot & payments legacy rows** ("these fell due before you started keeping track here…").
  The sentence changes what the reader does next; it is read every time it applies.
- **The Business analytics cards' own sentences.** Each already leads with one line and keeps
  the mechanics behind its dot; the longer sentences underneath are the *finding* ("your worst
  month ran 31% below typical"), which is the card's content, not its explanation.

### Two things the pass established

- **The info-sheet pattern was already the app's strongest habit** — 63 topics, a dot on nearly
  every card heading. What the pass found were the leftovers: cards written before the pattern
  existed (the peer and CPD explainers), and screens that had gained a link without gaining a
  `wireInfo()` call. The new `npm run test:guidance` makes both a failing test.
- **Labels rot faster than prose.** Three strings still said `Clients › Rooms` a month after the
  Practice tab arrived, and one screen still printed a storage code. Both are the kind of thing
  a reader notices and a developer does not.

---

## 3 · Orientation: guiding the user after setup

### What the app already does, and where it falls short

The app has more onboarding than most: a setup wizard, an eight-stop tour, first-visit tips per
screen, a gradual reveal that offers features as the practice grows, seasonal tax prompts, a
"needs attention" feed, and a searchable Settings. What it lacked was the thing all of those
assume — a **place to go when you are lost**, and an answer to **"what am I supposed to be doing
in here?"** once the first week is over. Tips fire once and never again; the tour is day-one
material; Settings search only finds settings.

### Built in this round

**Where everything is** (`appMapSheet()`): one sheet listing every tab, every segment and every
Settings group with a line each, then **what to do and how often** — weekly (log, tick off
payments, mark write-ups, back up), monthly (settle room fees and rent, log supervision), every
few months (read Business analytics, glance at Tax › Now), yearly (Tax › Now raises the seasonal
jobs; review retention). Every row is a link. It is built from the same feature switches the tab
bar reads, so a switched-off feature is simply absent. Reached from Settings › Setup & help, from
the empty Home screen, and named at the end of the tour and in What's new.

**What's new** was rewritten for this cycle (it still described the August reorganisation) and
cut from ten steps to five, the first of which points at the map.

### Recommended, not built — ranked

Each is a real change to the app and is left for the owner to choose. Effort is relative to a
single session of work.

1. **A "Getting started" card on Home** *(medium)*. A short checklist derived from the data
   rather than from a stored list: add a client · log a session · set up a room · set your
   cancellation policy · say how you like to be paid · export a backup. Each row links to the
   place; each ticks itself the moment the state says it is done; the card disappears when all
   are done or when dismissed. This is the natural successor to the setup wizard — it turns the
   decisions setup skipped into visible, tickable jobs instead of silent defaults. Fits
   `HOME_CARDS` as a new keyed block (`start`), which `homeOrder()` will place by default for
   everyone who has never rearranged.

2. **A "decisions not yet made" card in Settings › Your practice** *(small)*. The same idea for
   the business settings that have consequences: no cancellation policy, no payment details, the
   working week still on defaults, retention never chosen, tax region never confirmed. One card
   at the top of the group listing what is still at its default, each a link. It would replace the
   quiet failure where a policy nobody set silently charges 100%.

3. **Extend the attention feed beyond money and notes** *(small)*. `attentionItems()` already
   raises unpaid sessions, incomplete notes, room fees, overdue supervision and the backup nag.
   Two more rows follow the same shape and cost nothing to add: **a client past their retention
   date** (from `retentionRows()`), and **no CPD logged in 90 days** while a target is set (from
   `anaCPD().pace`). Both are jobs with a season the reader will otherwise only meet on a renewal
   form.

4. **A "What is this screen for?" button in the header** *(small)*. The first-visit tips are good
   and fire once. A `?` beside the gear that replays the current screen's tip (or opens the map
   when there is none) gives the tips a second life without making them nag. `coachStart` and
   `TIPS` already hold everything needed; it is a lookup by `cur` and `seg`.

5. **One search box for the whole app** *(larger)*. Settings search is the most-used orientation
   tool the app has. The same box on Home, matching client codes, session dates, room names,
   analytics card names and settings cards, would answer "where is X" for everything — the map
   answers it for screens only. Worth doing after 1–4, when the shape of "things a reader looks
   for" is clearer from use.

6. **Keep What's new per release, and short** *(process)*. It is the one channel that reaches an
   existing user with a change they did not ask for. Bump `WHATS_NEW` with every user-visible
   change and keep the steps to what changed since the last bump, never a history.

### Not recommended

- **More tips or a longer tour.** The evidence in this codebase (the T6 copy pass, the tour
  rewrite) is that volume is what gets skipped. The gaps are in *findability* and *cadence*, not
  in explanation.
- **A second onboarding for "advanced" features.** The gradual reveal already does this one
  feature at a time, at the moment the data can support it. A second layer would compete with it.
