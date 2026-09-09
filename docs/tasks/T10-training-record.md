# T10 — The trainee record: schema v9

**Model:** Opus · **Depends on:** nothing · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`, `scripts/make-test-data.mjs` (optional)

## Why

GroundWork stores **how many sessions**. Every institution a trainee reports to needs **how
many minutes, of what kind, in what medium, at which placement** — and the gap between those
two sentences is why the app cannot currently produce a training form for anyone.

Full context: `docs/institutional-partnerships-2026-09.md` (this is its Stage 1) and
`docs/course-provider-pitch.md`. **But this task stands on its own**: a trainee counting client
hours toward accreditation benefits from every field below whether or not a course partnership
ever happens, and one figure the app already shows is quietly wrong today — see change 4.

**Out of scope, deliberately:** rule packs, the progress screen, the training report,
signatures, portfolio items, placement *approval workflow*. This task adds the fields and
nothing that reads them beyond what already exists. Do not start the engine.

## Changes

### 1. Per-session duration — `s.mins`

`sessionMins()` is one practice-wide setting (default 50) and every hours figure in the app is
`count × sessionMins()`. Add an optional per-session override.

- New field `s.mins`, a positive number of minutes. **Absent = `sessionMins()`**, so no existing
  figure moves by a single minute.
- Session form: a Minutes input beside the existing controls, placeholder showing the practice
  default. Leaving it blank must store nothing (not `50`) — a stored default would freeze the
  session against a later change to the practice setting.
- Add a helper `sessionLen(s)` — `+s.mins > 0 ? +s.mins : sessionMins()` — and route the
  existing `sessionMins()` call sites that are **per session** through it. Note `anaCapacity()`
  and friends: read them before changing, some genuinely want the practice default.

### 2. Session type — `s.stype`

Keyed like `CPD_KINDS`, not free text: `individual` · `couple` · `family` · `group` ·
`assessment`. **Absent = `individual`.** A `SESSION_TYPES` const with display names, and an
unknown stored key falls back to `individual` rather than vanishing.

### 3. Medium becomes three-way

`s.mode` is currently `"In-person"` / `"Online"`. Add **`"Telephone"`**.

**This is an addition, never a remap.** Both existing values keep their exact stored meaning.
The trap is `clinicalStats()` (~line 2894), which is written as
`if((s.mode||"")==="Online") onl++; else inP++;` — an *else* that would silently count every
telephone session as in-person. It has to become an explicit three-way test, and every other
`mode === "Online"` comparison in the file needs the same audit (`grep -n 's.mode'`).

The reason this matters: course rules are written as "at least 51% in person", and a two-value
field cannot express the split the rule is written against.

### 4. Supervision gains real hours — and this changes a live figure

`mountAccreditation()` (~line 3063) counts supervision **entries** and treats each as one hour:
`const supSess = (S.supervision||[]).filter(...).length`. Anyone logging fortnightly 90-minute
supervision is currently under-counted by a third. This is the one genuinely wrong number in
the task.

- Add `hours` to a supervision record. **Absent = 1**, which reproduces today's arithmetic
  exactly for every existing entry.
- Add `format` (`individual` | `group`), `groupSize`, `medium`. `supervisor` already exists.
- `supervisionForm()` gains the inputs. Default `hours` to 1 for a new entry.
- `mountAccreditation()` sums hours instead of counting rows, and its `.acc-work` working-out
  line must say so (`"Supervision = logged 12 entries, 18.0 hrs + training 108 + placement 0"`).

**Because this moves a number somebody is already looking at**, say so once: a one-time notice
(the `TIPS` / coach mechanism, or a `.vmsg` on the accreditation card gated on a `meta` flag)
explaining that supervision is now counted in hours and that existing entries were taken as one
hour each until edited. Do **not** silently change it.

Peer supervision already has real `hours` and stays exactly as it is — outside the 1:6 ratio.

### 5. A personal-therapy log — `S.personalTherapy`

Its own array, **not** a `CPD_KINDS` entry, because nearly every institutional form reports it
separately from CPD and it needs fields CPD does not have.

Fields: `date`, `hours`, `therapist`, `medium`, `verified` (boolean), `_id`.
**No content about what was discussed, ever** — the same boundary as `adminNote`.

`CPD_KINDS.personal` stays (existing entries must not vanish) and the CPD form should point at
the new log for anyone starting fresh. Do not auto-migrate existing `personal` CPD rows across:
they were logged as CPD, they count as CPD, and moving them would change a total.

### 6. CPD gains the three audit fields

`S.cpd` has date, hours, kind, title, provider, notes. Add:

- `need` — the identified learning need
- `reflection` — what was learned
- `impact` — how it changed practice

All optional, all free text about the *therapist's own* learning, none of it about a client.
HCPC in particular audits the reflection rather than the hours, so a log without these is not
audit evidence. `exportSupervisionCSV()` must carry them — that export goes to the
accreditation paperwork, and a field left out of it cannot be evidenced.

### 7. Placements — `S.placements`

A new record type. **Rooms stay exactly what they are** (a rate and a landlord); a placement is
an approval, and conflating them would break `effRoomRate()` and the tax figures.

Fields: `org`, `contact`, `approvedBy`, `approvedDate`, `startDate`, `endDate`,
`clientGroups`, `media` (permitted), `insuranceExpiry`, `dbsExpiry`, `supervisor`, `notes`,
`_id`.

A session gets an optional `s.placement` (a placement `_id`). A list and a form, reachable from
Practice; no approval workflow, no expiry warnings — those are Stage 2.

### 8. The Training switch

All of the above is noise for a qualified therapist in private practice. Gate the **UI** on one
new feature flag — `training` — following the existing `feat()` / `settings.reveal` pattern
exactly:

- `normalize()` leaves it **absent = off for a fresh install**, and off for existing installs.
  This is the opposite default from most flags and is deliberate: nobody currently has these
  fields, so nobody loses anything, and a private practitioner should never see a Placement tab
  they did not ask for.
- `startSetup`'s `stepCPD` (which already asks about accreditation and peer) gains the
  question. Also switchable in Settings › App preferences.
- **The flag hides the inputs, never the data.** A stored `s.mins` or a placement record is
  still exported, still restored, still read by anything that reads it. Same rule as every other
  `feat()` flag: off = hidden, never deleted.

### 9. Schema v9

`SCHEMA_VERSION` 8 → 9, with the migration note added to the ordered block in `normalize()` in
the house style (the existing v7→v8 paragraph is the model).

The justification to write down: **a v9 backup can hold a 90-minute couple session by telephone
at an approved placement, and 18 hours of supervision across 12 entries.** A v8 build has none
of those fields — it would read that session as 50 minutes, in person, individual, and that
supervision as 12 hours, then save every one of those losses back over good data.
`validateImport()` already refuses a newer backup; this bump is what makes it fire.

Seed the new arrays in `normalize()` (`st.placements=st.placements||[]`,
`st.personalTherapy=st.personalTherapy||[]`) and add them to the `_id`-stamping loop.

### 10. CLAUDE.md

Update § *State / data model* (the `S` shape and the new arrays), § *Schema versioning* (the v9
paragraph), § *Setup wizard* (the `training` flag), and § *CPD* (the personal-therapy split).
Add a short § *The trainee record* explaining why duration, type, medium and placement exist at
all — a later reader needs to know these are institutional-reporting fields, not features.

## Constraints — the ones that will bite

- **Not one existing figure may move**, except the supervision-hours change in #4, which is a
  correction and must be announced. Every default above (`mins` absent, `stype` absent, `hours`
  absent = 1) is chosen for this. Verify against the test corpus: `npm run test:review` and
  `npm run test:tax` must both pass unchanged.
- **`s.mode` gains a value; it does not change meaning.** Audit every comparison against it.
- **The tax figures must not move.** None of these fields touches `derive().rate`,
  `ledgerBetween` or the SA103 boxes. If a tax test moves, something is in the wrong layer.
- **No clinical content anywhere.** Not in the personal-therapy log, not in a placement note,
  not in a supervision field. The boundary is the product.
- **Nothing here is gated behind Plus.** These are records the therapist is entering — the data
  plane. `plusLocked()` must not appear in any of it (`scripts/check-drift.mjs` asserts the
  principle for `commit`/`export`/`import`; hold to it here too).
- **The session form's `sync()` must read back every control it renders, and nothing it does
  not.** This is the exact failure `npm run test:behaviour` exists for — a form that reads a
  control it no longer renders silently blanks the field on every save.
- One file, no build step. Use the Read/Edit tools, not bash rewrites (CLAUDE.md § Known
  gotchas). Do not bump the SW cache name — HTML is network-first.

## Verify

- `npm run check` — asserts every name the native iOS shell wraps.
- `npm run test:tax`, `npm run test:review`, `npm run test:behaviour` — all three, all
  unchanged. `test:review` is the one that will catch a moved figure across eight practices.
- Extend `check-behaviour.mjs`: open the session form, save with a blank Minutes box, assert
  `s.mins` is **absent** (not 50). Then save with 90 and assert it stores 90. Same for a
  supervision entry's hours.
- By hand: an existing backup restores with every figure identical. Export a v9 backup, confirm
  `schemaVersion: 9`; confirm a v8 build refuses it with the `validateImport` message.
- With `training` off, no new control appears anywhere.
