# A watchOS companion — what would earn its place

*Ideas, not a commitment. Written Sep 2026, before any watch code exists.*

The question this document answers is not "could GroundWork run on a watch" — it is
**which job is better done on a wrist than on the phone already in the room.** Most of
GroundWork fails that test outright. The parts that pass all cluster around the same
ninety seconds: the end of a session and the gap before the next one.

---

## The shape of the opportunity

A therapist's day is a series of fifty-minute hours with ten-minute gaps. In that gap they
are standing up, showing someone out, and getting the room ready. Everything GroundWork
currently asks of them — was it attended, did they pay, was the room fee settled, are the
notes written — is known **precisely then** and is reconstructed from memory whenever it is
asked for later. That is why `attentionItems()` has an "N sessions incomplete" card at all.

A phone in that gap is a bad tool for two reasons. It is in a bag, and during the session
it is a phone on the table between two people, which is a boundary problem rather than a
convenience one. A watch is neither.

So the watch app is **not a small GroundWork**. It carries three verbs and no lists.

---

## Tier 1 — the case that justifies the project

### 1. A silent session timer

Start at the top of the hour; a haptic tap at ten minutes remaining and another at time.

Therapists watch the clock constantly and being *seen* to watch it has a clinical cost.
Every workaround in the field — a clock placed behind the client's head, a phone face-down
and glanced at — exists to hide the same thing. A tap on the wrist is the version that
costs the client nothing.

This is the feature that is genuinely impossible on the phone, and it needs almost nothing
from the data model: a start time and a length.

> **Web-side addition:** sessions have no duration field today (`sessionForm`'s model is
> client/num/date/time/mode/location/room/invoice/paidDate/receipt/notes/roomPaid/
> roomPaidDate/lateCancel). A `settings.sessionMins`, default 50, is the whole change —
> a practice-level default, overridable on the watch for the one client seen for 80
> minutes. It is a settings field, not a schema bump: an older build that has never heard
> of it simply keeps showing what it always showed.

### 2. Close out the session before leaving the room

The moment the timer ends, offer exactly what `missingReasons()` and `derive().complete`
will otherwise complain about on Sunday night:

- attended · late cancellation · DNA
- paid ✓ (and how)
- room fee paid ✓ — **suppressed entirely when `derive()` says `roomPaidNA`**, i.e. the
  room is on monthly rent and there is no per-session fee to settle. The web app already
  hides those controls; the watch must not resurrect a question the phone knows does not
  apply.

Two taps. The incomplete-sessions card goes to zero and stays there, which is worth more
than any screen the watch could display.

Notes are deliberately **not** here. A wrist is not where a clinical note gets written —
see Tier 2.

### 3. A complication: who is next, and what is outstanding

`.accessoryRectangular`: **`JB · 14:00`**. `.accessoryCorner`: the unpaid count.

The roster is already derived — `clientSchedule()` gives the cadence and the usual slot,
`usualSlotFor()` infers it from the last eight attended sessions for the majority of
clients who have nothing typed in. Nothing new is stored to make this work.

**The codes-only convention is what makes a wrist display defensible at all.** GroundWork
has never held client names in the place this data comes from; a code on a watch face that
a client can see across a room is not a confidentiality incident, and a name would be. If
a future version ever adds names, this feature has to be re-argued from scratch, not
quietly inherited.

---

## Tier 2 — the biggest payoff, and the one to be careful with

### Dictate the write-up for GroundWork Notes

Watch mic → on-device transcription → a draft attached to the session that
`SessionPrediction` already knows is expected → synced to the phone when back in range.

Notes dictated while walking back to the car, rather than at nine in the evening from
memory, is the largest single time saving anywhere in this product family. It is also the
feature that puts clinical content and a live microphone on a wrist, so the constraints are
not negotiable:

- `SFSpeechRecognizer` with **`requiresOnDeviceRecognition = true`**. Server recognition
  would ship special-category personal data to Apple and end the "Data Not Collected"
  privacy label in one line of code.
- The audio file is deleted the instant transcription finishes. The transcript is what
  syncs; the recording never leaves the watch and never persists past the transfer.
- What arrives on the phone is a **draft awaiting review**, never a filed note. Watch
  dictation accuracy on clinical vocabulary is not good enough to be trusted unread, and a
  note nobody reread is a worse record than no note.
- It belongs to **GroundWork Notes**, not GroundWork. This app has never held clinical
  content and there is no reason to start.

---

## Explicitly not on the watch

Clients, rooms, money, tax, supervision, backups, settings.

A tax-pot figure answers no question anyone has while wearing a watch, and a scrollable
client list buys a confidentiality risk in exchange for nothing that could not wait for
the phone. The temptation with a watch app is to port the tab bar; that is the failure
mode to name up front.

Supervision logging is the closest call and still a no: it happens monthly, sitting down,
with a phone to hand.

---

## How it would actually be built

### It is the first genuinely non-shared code

There is no WebView on watchOS, so the watch app is SwiftUI. That cuts directly against
the rule the whole iOS wrapper is built on — *there is exactly one copy of the app*
(`docs/ios-native.md` § The three rules). It is survivable only because **the watch owns
no logic**: it has no `derive()`, no `commit()`, no fee history, no idea what anything
costs. It captures what happened and hands it over.

`npm run check` would need a fourth assertion in the same spirit as the existing three:
the watch target exists, and the payload keys it sends are the ones the JS drain reads.

### The watch appends events; the phone reconciles them

The watch **never** sends state. It sends facts:

```json
{ "kind":"capture", "id":"<uuid>", "at":"2026-09-01T14:52:11Z",
  "code":"JB", "date":"2026-09-01", "time":"14:00",
  "outcome":"attended", "paid":true, "roomPaid":true }
```

The phone matches that against the session it predicted, or creates one through the same
path `sessionForm` uses, and calls `commit()` once. Fees, cancellation percentages and
everything downstream are derived on the phone exactly as they are today.

This is not a stylistic preference. CLAUDE.md § *Multi-tab / multi-device writes overwrite
each other* already documents what happens when two copies of the app hold `S` and race:
last writer wins, silently. A watch that synced state would be that known bug with a second
device attached. Append-only events with a `uuid` for idempotency sidestep it entirely — and
if the multi-writer work is ever picked up (`S.meta.rev` + `BroadcastChannel`), an event
queue is already the right shape to fold in.

### The transport, and the trap in it

`WCSession`, both directions, no server — which keeps the whole privacy story intact.

- **Phone → watch (the roster):** `updateApplicationContext`. Latest-wins, cheap, and
  correct for a payload that is entirely derived: today's and tomorrow's expected sessions
  as `{code, time, mins, roomPaidNA}`. Codes and times only. No names, no fees, no notes,
  no attendance history. It is the same instinct as `syncSchedules()` — send the shape of
  the week, never the contents of it.
- **Watch → phone (captures):** `transferUserInfo`. FIFO, guaranteed delivery, survives
  both apps being closed. This is the one that must not drop anything.

**The trap:** `WCSession` wakes the *iOS app*, not the WebView inside it. Capacitor's
WebView is very likely not alive when a capture arrives, and if the JS listener is treated
as the receiver then captures vanish with nothing logged anywhere — the same failure class
as the plugin-registration trap in `docs/ios-native.md`, where everything compiles and
nothing runs.

So `GroundWorkNativePlugin.swift` must **persist arriving payloads to disk immediately**
(a queue file alongside the auto-backups in Documents) and hand them to the WebView on the
next launch. The JS side gets a small drain that runs at init, applies each capture through
the existing session code, and clears the queue only after `commit()` returns `true` — the
same discipline as the automatic backups, which already treat a failed write as something
that must never be swallowed.

The watch's own store is a **cache of the roster plus an outbox**, so a complication still
renders on a phoneless dog walk. It is never authoritative about anything.

### Privacy and the App Store

Nothing about this changes the "Data Not Collected" answer drafted in
`docs/app-store-listing.md`: no backend, no analytics, on-device transcription, and a
paired-device transport that never touches a server. The watch store is small enough to
encrypt at rest without thinking about it.

Worth noting for completeness: a real watch app would also have comfortably settled
Guideline 4.2 — but the Face ID lock, notifications, share sheet and PDF receipts already
did that, so this is not a reason to build it.

---

## If it gets picked up

Rough order, each stage useful on its own:

1. **Timer only.** No sync, no complication, `settings.sessionMins` on the phone. Proves
   the watch target, the build, and whether the haptic actually feels right in a real
   session — which is the only question that matters and cannot be answered from a desk.
2. **Roster push + complication.** `updateApplicationContext` one way. Read-only, so
   nothing can be lost while the transport is being learned.
3. **Captures.** `transferUserInfo`, the Swift-side disk queue, the JS drain. The stage
   with all the risk in it; budget accordingly.
4. **Dictation**, in GroundWork Notes, as its own piece of work.

Stages 1–3 are a fortnight or so of real work, not a weekend — most of it in stage 3, and
most of *that* in making the queue survive an app that is not running. Stage 4 is a
separate project in a separate repository.
