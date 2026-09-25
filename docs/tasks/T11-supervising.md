# T11 - Supporting a practitioner who also supervises
**Model:** Opus · **Depends on:** T10 change 1 (shipped here) · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`, `scripts/`

**Status (25 Sep 2026): stages 1 and 2 are shipped, schema v12. Stages 3 and 4 are open.**
Tests: `npm run test:supervising` (75 assertions). CLAUDE.md § *Supervising others* is where the
current rules are written up.

## Why

Plenty of experienced counsellors also supervise, and until now the app had nowhere to put that
work except a manual row in `otherIncome`. `docs/practitioner-models-2026-09.md` §2 ruled it out
as "model 7", on the grounds that supervisees would need a second entity type with its own
screens. That turned out to be wrong, and §2 has been amended to say so: a supervisee has the same
fee history, attendance, diary and retention clock as a client. The one real difference is that
their hours must stay **out of every clinical figure**.

## The design

**A supervisee is a client record with `kind:"supervisee"`**, and every clinical reader goes
through **one choke point**, the same approach as the v11 payer work (`sessionEarns()`):

```js
function kindOf(c){ return c && c.kind === "supervisee" ? "supervisee" : "client"; }
function sessionClinical(s){ return !isSupervisee(clientOf(s && s.client)); }
// derive(): d.clinical, d.mins - read once, beside d.earns, from the client lookup already there
```

Reusing the client machinery gives fee history, the Unpaid worklist, invoices, chasers, the
calendar export and the whole tax path for free. The tax engine needs no change: supervision fees
are turnover in the same SA103 box.

## Stage 1 - per-session duration (shipped; T10 change 1)

- `s.mins`, optional. **Blank stores nothing**, never 50.
- `sessionLen(s, cl)` works through three steps and uses the first that has a value: the session's
  own length, then (**for supervisees only**) `client.mins`, then `sessionMins()`. Clinical clients
  deliberately skip the middle step. Editing a client record must never move a clinical hours
  figure; only a length recorded against a session can.
- Routed through: `sessionEndsAt` (the Incomplete clock), `reportHours` (all three modes now sum
  real lengths, and per-client rows are sums of `h.of(x)`), `anaHourlyRate`, `anaLoad`
  (back-to-back measured from the previous session's own end), `anaSupervisionCadence`, the
  client profile's hours tile, and both `.ics` routes.
- Session form: a Length box, shown when `feat("supervising")` is on **or** the session already
  carries a length. If the box isn't on screen, the save doesn't read it. `validateSession`
  refuses anything outside 5 to 600 minutes.

## Stage 2 - the flag, the field, the choke point, the exclusions (shipped)

**Excluded from, because each would produce a silently wrong number:**

| Reader | Why |
|---|---|
| `clinicalStats()` → Form 3A | flatters the 1:6 ratio in the direction that hides a compliance problem. The working-out line now says how many sessions it left out |
| `reportCtx()` → every report section | inflated client hours on a form submitted to a course |
| `anaCtx()`, `anaCohorts`, `anaEpisodes`, `anaDrifting`, `anaSources` | two populations mixed in the Clients section of Business analytics |
| `anaSupervisionCadence()` | *missed by the handoff*: it is a per-quarter ratio, same failure as Form 3A |
| Supervision › Insights "Client discussion recency" | *missed by the handoff*: your own supervisees listed as clients never discussed |
| `scheduleRoster()` | supervisees sent to GroundWork Notes as needing clinical write-ups |
| `supervisionForm` chips | your own supervisees offered as "clients discussed". A code already ticked is **kept** on save |
| Home › Longstanding clients | *missed by the handoff*: a clinical card |

**Included, deliberately:** money everywhere, the Unpaid worklist, the Incomplete worklist
(supervisors keep notes too), capacity, load, slots, the hourly rate (it is time worked), the
calendar, Home's sessions figure.

**Retention: kept, not excluded (changed from the handoff).** The handoff proposed leaving
supervisees out of `retentionRows()`. That would mean a supervisee's personal data is never
brought up for review, which is a GDPR failure in the other direction. They stay on the list with
a `supervisee` chip.

**Surfaces:**
- Feature `supervising`, dep `supervision`. `normalize()` defaults it **off**, except where the data
  already holds a supervisee (a restore must never hide the screen those records live on). Setup
  asks about it in `stepCPD`, the same way it asks about peer supervision. The simple preset, the
  "show everything" depth and Settings' *Show all* all leave it alone.
- Client form: **This is** - a client / a supervisee (shown when the flag is on, or when the record
  is already a supervisee), and **Usual length** for a supervisee. `kind` absent means a client,
  and switching back to a client *removes* the field instead of storing the default.
- Session picker: supervisees in their own **Supervisees** optgroup.
- Practice › Supervision › **Supervising** sub-tab (between CPD and Insights): four figures (on the
  books, sessions in 12 months, hours given, billed), the list, Add supervisee, Log a session. Not
  in `SWIPE_BARS` (it is a nested strip). `check-guidance.mjs` walks it by name.
- Clients list: a `supervisee` chip. Info topic `supervising`.

**Schema v12** covers `s.mins`, `client.kind` and `client.mins` in one bump. Nothing migrates. The
bump is for the other direction: a v11 build would count supervision given as clinical hours and a
90-minute session as 50, then save both back.

## Where this departs from the handoff, and why

1. **One schema bump, not two.** T10 had reserved v12. Shipping `s.mins` alone would have spent
   it, and the supervisee field would then have needed v13 a week later. Both went into v12; the
   rest of T10 is now v13.
2. **A usual length on the supervisee's record** (`client.mins`). Supervision is 60 to 90 minutes
   every time. Without this, the Length box would need filling in on every single session, which
   nobody would keep doing. It is read for supervisees only (see stage 1).
3. **Three more exclusions** that the handoff's table missed (marked above). Each one is the same
   ratio or clinical-list failure as the ones it did list.
4. **Retention keeps supervisees** (above).
5. **No new status vocabulary.** The handoff suggested Contracted/Ended. The existing
   Ongoing/Paused/Finished already means the right thing for a supervision contract, and
   `clientCategory()` / `trendsIsCurrent()` read it correctly. A second vocabulary would split
   every status-driven screen. Revisit only if a real supervisor asks.
6. **No ninth fixture practice.** `test:supervising` builds its own practice, as `test:payer` and
   `test:swipe` do. A ninth fixture would have to be regenerated and re-anchored with the other
   eight for a feature most practices never switch on.

## Stage 3 - open

- **Group supervision.** One session row per supervisee sharing an `s.groupId`, so money and
  `derive()` are untouched. The Supervising tab's hours figure and the calendar then de-duplicate
  on the id. Rejected: an attendees array, which breaks the choke point.
- **`REPORT_SECTIONS.supervising`**: supervision given over a period, by supervisee code, with
  hours. It must be its own section and never part of `hours`. Consider a "supervisor's log"
  template.
- **A third CPD switch** beside `cpdCountSupervision`/`cpdCountPeer`: does supervision given count
  toward the CPD target? Default **false**. Unlike the other two, counting it is the unusual
  position.

## Stage 4 - open

- **Supervision of supervision.** Bodies require it to be tracked separately. Add
  `sv.scope: "clinical"|"supervising"` to `S.supervision` rows; the 1:6 ratio reads `clinical` only.
- **Contract dates** on a supervisee (start, review, end), with a review reminder in the attention
  feed.
- **`anonymiseClients()` for a supervisee.** It currently turns them into "Client 001", which is
  the wrong word. Supervisees are named professional colleagues under a contract, and whether
  anonymising is even the right removal route for them is a question to settle before building
  anything.

## Verify

`npm run check` · `npm run test:supervising` · and the whole existing suite, which must pass
**unchanged**: nothing in either stage may move a figure for a practice with no supervisees and no
recorded lengths.
