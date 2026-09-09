# Training providers and institutions — plan of approach

*Written Sept 2026, from the research conclusion on institutional evidence requirements.
Companion to `docs/product-proposals-2026-09.md` §4, which sketched "selling seats to
training courses" and left it as the one item in that round with no decision. This document
supersedes §4 and is the working plan.*

The research doc describes a **destination**: a local-first professional evidence ledger with
versioned institutional rule packs, exact DOCX/PDF form generation, signatures, portfolio
tracking and a supervisor review portal. That destination is correct and this plan does not
argue with it.

What this document adds is a **route**. Built as one project the destination is a multi-tenant
product with a server, an account system and a document-generation pipeline — twelve to
eighteen months before the first course lead sees anything, and it would break the two things
that make GroundWork what it is (one file, no server). Built in the order below, every stage is
worth having on its own, is sellable before the next one starts, and the project can be stopped
at the end of any of them without leaving the app worse than it is today.

---

## 1. Why this is worth doing (and what the prize actually is)

Revenue is the smaller half. **Distribution is the prize.**

A counselling trainee is the single best customer GroundWork will ever meet, for reasons that
have nothing to do with training:

- They have **no existing system to switch away from**. Every other therapist we might sell to
  already has a spreadsheet they have kept for six years and quietly like.
- They are forming their admin habits **right now**, in the year they are most compliance-anxious
  and least confident.
- They qualify, go into private practice, and keep what they know — at which point the tax
  engine, the analytics and Plus become relevant to them for the first time.
- They talk to each other. A cohort is twenty to forty people with a shared WhatsApp group and
  a shared problem.

The course itself is the distribution channel, and it costs nothing per trainee to reach.
There is no cheaper route to that audience, and it is the only route where the app arrives
**recommended by an authority figure** rather than found in a store listing.

The commercial shape follows from that: the institution's money is not the point, and pricing
it as though it were would be a mistake. See §7.

---

## 2. What GroundWork already has, honestly

The research doc's data model is largely a superset of what is here. That is the good news —
the shape is right and the gaps are additive, not a rewrite. The bad news is that three of the
gaps sit in exactly the fields an hours calculation depends on.

| Research requirement | GroundWork today | Verdict |
|---|---|---|
| Opaque local client ID | `client.code`, enforced everywhere, `rosterCode()` validates the format | **Already right.** This is the hardest thing to retrofit and it was designed in from day one. |
| Session sequence number | `s.num`, auto-suggested | Already right |
| Completed / cancelled / DNA | `isCancelled()`, `cancelKind`, `cancelPct` stamped per session | **Already right, and better than most.** The distinction between "0 minutes delivered, £60 charged" is already modelled — that is the exact separation §3 of the research asks for on the revenue side |
| Actual session duration | **Nothing per session.** `sessionMins()` is one practice-wide setting, default 50 | **Real gap.** Every hours total the app prints is `count × 50min`. A course that counts a 50-minute session as one clinical hour and a 90-minute couple session as 1.5 cannot be served by that |
| Session type (individual / couple / group / assessment) | Nothing | **Real gap.** Minimum-client-count and group rules need it |
| Medium | `s.mode` — **two** values, In-person / Online | **Partial.** CPCAB's rule is "at least 51% in person"; telephone is a third category most courses name separately. Two values cannot express the split the rule is written against |
| Placement vs private practice | `location` / `room` are *rooms* — a rate and a landlord, not an approved placement | **Real gap.** No approval status, no approval date, no permitted client groups, no expiry |
| Supervision duration | **Assumed 1 hour.** `mountAccreditation()` counts *entries*, not hours | **Real gap**, and a silent one — a therapist logging fortnightly 90-minute supervision is currently under-counted by a third |
| Supervision format / group size / medium | Nothing (peer is a separate array with real `hours`) | Real gap. Group-supervision weighting is a headline rule in most packs |
| Peer supervision | `S.peerSupervision`, with hours, deliberately outside the 1:6 ratio | **Already right**, and the separation is already documented as load-bearing |
| CPD log | `S.cpd` (v8) — date, hours, `CPD_KINDS`, title, provider, notes | **Two-thirds right.** Missing the three fields every audit actually asks for: identified learning need, reflection, and impact on practice. HCPC in particular audits the reflection, not the hours |
| Personal therapy | A `CPD_KINDS.personal` entry — hours only | **Partial.** Needs its own cumulative log with a therapist and a verification state, because it is separately reported on nearly every form in the research doc |
| Portfolio evidence items | Nothing | Gap — but deliberately Stage 3, see §5 |
| Sign-off / attestation / immutability | `commit()` audit log + snapshots. Nothing signed, nothing locked, no hash | Gap — Stage 3 |
| Versioned rule packs | Hard-coded BACP: 1:6 ratio, `settings.cpdTarget`, manual `trainingSupHrs` / `placementSupHrs` boxes | Gap — Stage 2, and this is the central one |
| Explainable inclusions / exclusions | Nothing formal — **but the house style is already there.** `mountAccreditation()`'s `.acc-work` block prints "Clinical = logged sessions 84 + other 6 = 90 hrs" | **Cheaper than it looks.** The app already believes in showing its working |
| DOCX / PDF form output | `receiptHTML()` → `printReceipt()` → native PDF on iOS; three CSV exports; `exportSupervisionCSV()` already carries CPD rows | **The seam exists.** A second document type is the same pipeline with different markup — this is the thing the research doc treats as a big build that is genuinely small here |
| Local-first, no vendor copy | True today, architecturally, not as a claim | **The whole differentiator.** See §8 |

**Three conclusions from that table.**

1. The data model is closer than the research doc assumes, because the awkward parts
   (pseudonymous codes, cancellation semantics, dated rate history) were solved for other
   reasons.
2. The gaps that matter are all in **one direction**: GroundWork stores *how many sessions*,
   and an institution needs *how many minutes, of what kind, in what medium, at which
   placement*. That is a Stage 1 schema job and it is the prerequisite for everything else.
3. Document generation — which the research doc treats as a major workstream — is the part
   already three-quarters built, because receipts and invoices needed it first.

---

## 3. The strategic call

**Build the ledger and one rule pack. Do not build a rules platform.**

The research doc's rule-pack engine is right in principle and is the thing that would make this
defensible at scale. But a configurable engine with no configurator is worse than a hard-coded
framework with an honest name. The sequence that de-risks it:

- **One framework, hard-coded, in the app** (Stage 2). It is a `const` in `index.html`, the same
  shape as `CPD_KINDS` or `PALETTES` — keyed, versioned, with an effective date.
- **A second framework added by hand** (Stage 4). Adding the second is what tells you which parts
  of the first were framework-specific and which were universal. Designing the abstraction before
  writing the second one is guessing.
- **A pack format and an editor** only if and when a partner asks to maintain their own. That is
  the point at which it becomes a platform, and the point at which it needs a server, a signing
  key and a support commitment.

Everything else follows the same rule: **the institution never gets an account, a login or a
read.** No dashboard, no sync, no org-side view — not in Stage 4 either. The trainee exports and
the trainee sends. This is not a limitation to be engineered away later; it is the product's
position, it is what makes the privacy claim true, and it is what makes a trainee log honestly.
A trainee who believes their tutor can see their client list will keep a second, private,
truthful record — and the moment that happens the whole thing is worthless to the course.

---

## 4. Stage 0 — validate before writing any code

**Nothing in Stages 1–4 is worth starting until one course lead has said yes to a conversation.**
The single biggest risk in the research doc is not technical: it is that the course's answer to
"would you approve a rule pack?" turns out to be "we can't, our awarding body owns that" or
"we'd have to put it through a validation panel". Find that out first. It costs weeks, not
months.

**Target:** a **CPCAB Level 4 Therapeutic Counselling** provider, for the reasons the research
sets out — public forms, objective hour rules, a mode-split rule, minimum client counts, a real
portfolio. Second choice: a BACP-aligned diploma with placements and supervisor reports.

**What to come away with:**

- Their **actual current forms** as files. Not descriptions — the Word documents.
- The spreadsheet or template they currently hand trainees, and the one the tutor reconciles.
- The honest answer to *"how many hours a year do you spend chasing and correcting these?"* —
  that number is the entire business case and it needs saying by them, not by us.
- Where the completed forms go (SharePoint? Moodle? Email?). This decides whether "save to a
  folder the trainee uploads" is acceptable or a dead end.
- Who signs what, and whether a typed attestation is acceptable or it has to be a wet signature.
- **The blocking question:** would they be willing to review and approve a written statement of
  how hours are calculated, and put their name to it for one cohort?

**Approach route.** Cold outreach to course leads has a low hit rate. Better: Charlotte's own
network, supervisors who take trainees on placement, and the placement agencies themselves —
a placement coordinator drowning in hours forms is a warmer lead than a course administrator,
and they talk to the course.

**Kill criteria.** If three providers in a row say the calculation is not theirs to approve,
this becomes a **trainee-direct product** (Stage 1 alone, sold to individuals, marketed at
cohorts rather than through them) and Stages 2–4 do not happen. That is still a good outcome —
Stage 1 is worth shipping on its own merits — and knowing it after four weeks rather than after
eight months is the point of doing Stage 0 first.

---

## 5. The build, in stages

### Stage 1 — the trainee record (schema v9)

**Shippable to individual trainees with no institutional partner at all**, which is what makes
it safe to build before Stage 0 concludes. It is also the only stage that touches the core data
model, so it is the only one with real regression risk.

- **Per-session duration.** `s.mins`, absent = `sessionMins()`. Every existing figure keeps its
  current value; nothing is recomputed for existing data.
- **Session type.** `s.stype` — individual / couple / family / group / assessment. Absent =
  individual.
- **Medium becomes three-way.** `s.mode` gains `Telephone`. **The existing two values keep their
  exact meaning** — this is an addition, not a remap, and `clinicalStats()`'s
  `mode === "Online"` test must be widened rather than inverted.
- **Supervision gains real fields.** `hours` (absent = 1, preserving today's arithmetic exactly),
  `format` (individual / group), `groupSize`, `medium`, `supervisor` already exists.
  `mountAccreditation()` stops counting entries and starts summing hours — **and this changes
  a number people are already looking at**, so it needs the migration note treatment: the app
  should say once that supervision is now counted in hours.
- **A personal-therapy log.** Its own array, not a CPD kind: date, hours, therapist, medium,
  verified. The CPD kind stays and migrates across.
- **CPD gains the audit fields:** identified learning need, reflection, impact on practice,
  evidence reference (a filename or URI, never a file).
- **Placements.** A new record type: organisation, contact, approved-by/approval date, start
  and end dates, permitted client groups, permitted media, insurance and DBS expiry, supervisor.
  A session optionally references one. Rooms stay exactly what they are — a rate and a landlord.
- **Backup health becomes a gate, not a nag.** See §8 — this is not optional for this audience.

Schema **v9**, ordered migration in `normalize()`, and `validateImport()` already refuses a
newer backup on an older build. Every default is chosen so **an existing install's figures do
not move**.

**A "Training" switch.** All of the above is noise for a qualified therapist in private
practice. It goes behind one setting, defaulted on for a new install that says it is in
training during setup, off otherwise — the `settings.reveal` pattern, which already exists for
exactly this.

### Stage 2 — one rule pack, one progress screen, one report

The pilot. Nothing here is generic.

- **`TRAINING_FRAMEWORKS`** — a keyed const, one entry: CPCAB Level 4, with a version, an
  effective date and a source reference. Eligible session types and statuses, minute-to-credit
  conversion, minimum total hours, minimum distinct clients, remote/in-person split limit,
  supervision ratio and minimum frequency, group weighting, personal-therapy minimum.
- **A pure `training*()` engine**, same contract as `ana*` and the tax engine: reads `S` and
  `today()`, returns a plain object, writes nothing, never gated. Returns per-requirement
  status *and the reasons* — every included and excluded session, with the rule that decided it.
- **The progress screen.** Requirements met / outstanding / at risk. Warnings for the things that
  are expensive to discover late: supervision ratio drifting, remote quota approaching, placement
  approval expiring, a client count that will not reach the minimum at the current rate.
- **Explainability is not a nice-to-have.** Every figure taps through to the sessions behind it
  and the sentence that excluded each one — *"Excluded: client cancellation"*,
  *"50 actual minutes counted as one clinical hour under rule 4.2"*,
  *"Remote work is 46%; the course maximum is 49%"*. A tutor who cannot check a number will not
  trust it, and a trainee who cannot see why a session did not count will assume a bug.
- **The report.** HTML → `printReceipt()`'s existing pipeline → PDF, plus a CSV appendix of the
  underlying rows so a tutor can check it in Excel. Aggregate figures, client **codes** only,
  no fees, no clinical content, no session-level detail beyond what the form asks for.

**Deliberately not in Stage 2:** signatures, DOCX, portfolio items, a second framework.

### Stage 3 — what makes an institution adopt rather than tolerate

Only after the pilot has run alongside the course's existing process for a term.

- **Attestations.** A trainee declaration and a supervisor/placement-manager declaration
  recorded as events: who, role, what period, timestamp, declaration wording, and a hash of the
  dataset being attested.
- **Locked periods.** A signed period cannot be silently edited; a change creates an amendment
  record. This is the difference between a report and evidence.
- **A static verifier.** A page on GitHub Pages where a tutor pastes a report and it re-checks
  the hash. No server, nothing stored, nothing transmitted. This is the highest
  credibility-per-line-of-code item in the whole plan.
- **DOCX output** — *only if the pilot proves PDF is not accepted*. It probably will be for
  submission; the case for DOCX is narrative fields the trainee must complete by hand, which the
  fallback in the research doc §6 handles just as well.
- **Accountless supervisor signing** is the big Priority-1 item from the research and is
  deliberately last. Every version of it that is convenient needs a server; every version that
  needs no server is inconvenient. Do not design it until a real supervisor has complained about
  the alternative.

### Stage 4 — the seat business

Mechanically already solved: `scripts/issue-licence.mjs` (ECDSA P-256) issues a batch with an
`org` claim and a course-year expiry; Apple offer codes do the same job on iOS. **No new billing
infrastructure.** Branding stays faint — *"Provided by <org>"* in Settings › About and the report
footer, nothing more.

This is also where the **second framework** goes in, and where the rule-pack abstraction earns
its keep or is proved unnecessary.

---

## 6. What this plan deliberately does not do

Stating these once, so they are decisions rather than omissions:

- **No institution dashboard**, aggregated or otherwise. Even suppressed cohort statistics need a
  server and a data-sharing agreement, and the moment one exists the honesty of "your tutor
  cannot see this" is gone.
- **No direct submission to SharePoint/Moodle.** OAuth to an institution's tenant makes us a
  processor and changes the entire legal analysis for a convenience the trainee can achieve by
  uploading a file.
- **No BABCP pathway in the first two years.** The research is right: it cannot be automated
  without handling recordings, formulations and case studies, which is exactly the boundary this
  app must not cross.
- **No clinical narrative in the administrative record.** Where a form wants "focus of session",
  the generated document leaves the field blank for the trainee to complete in the final
  document. `s.adminNote` is explicitly practical-only and stays that way.
- **No claim of compliance.** *"Supports compliance against the versioned rules approved by your
  training provider"* — never "guarantees", never "approved by BACP/CPCAB" unless it literally is.

---

## 7. Commercial shape

Following from §1 — the institution's money is not the prize:

- **The institution buys a rule pack and seats**, at a real discount. Indicatively £12–15/seat/year
  at 20+ seats against £29.99 retail, invoiced directly. Price it to be trivially approvable out
  of a course budget, not to be a revenue line.
- **A trainee's own records are theirs permanently.** When the seat lapses the training features
  lock; the records, exports and backups never do. This is `monetisation.md` §2.1 applied without
  exception, and it is also the honest answer to "what if I leave the course".
- **The conversion is the business model.** A trainee who qualifies with two years of history in
  GroundWork has a tax return to file, and the tax engine is already the anchor of Plus.
- **Support is a real cost.** An institution expects a human reply within a day or two. That has
  to be in the price and it has to be honoured, or the first partner becomes the last reference.

---

## 8. Two risks specific to this app, not in the research doc

**8.1 Device loss is now an evidence risk, not just a data risk.**

GroundWork is local-first with no server, and a trainee's entire qualification evidence would
live on one device. A course cannot responsibly recommend a tool where a dropped phone costs a
hundred logged client hours.

**The answer to this is already built, on iOS.** The **records folder** (Sep 2026,
`docs/ios-native.md` § *The records folder*) has the counsellor pick a folder — normally in
iCloud Drive — and rewrites the whole practice into it on every save, with a dated copy a day
under *Previous versions*. A folder in iCloud Drive is genuinely off the phone, so losing the
phone loses nothing and setting up a new one is choosing the same folder again. Behind it,
`nativeAutoBackup()` keeps a copy in the app's own Documents as the fallback, and a failed
folder write falls straight back to it — a save that cannot reach the folder is never a save
with no copy at all. `markBackedUp()` is called **only** when the folder really is in iCloud
Drive, so "On My iPhone" does not silence the manual-backup reminder.

So this is not a build. It is three adjustments to how the existing feature is *offered*:

- **The folder becomes part of setup for a training install**, not an offer made once
  (`tt_folder_asked`) five seconds after launch to somebody with three sessions. For this
  audience "where do your records live" is a first-day question, not a nudge.
- **The progress screen must refuse to look healthy while the records are not off the device.**
  A green "84 of 100 hours" on a phone with no backup destination is the single most misleading
  screen this app could draw for a trainee.
- **Web and Android trainees are not covered by any of it.** The records folder is iOS-only;
  desktop Chrome/Edge has the File System Access API auto-backup; an Android or iOS-Safari PWA
  user has neither and gets the manual export nag alone. If the pilot cohort is not all on
  iPhones — and it will not be — this gap is real and needs an honest answer before seats are
  sold, not after.

**8.2 The known multi-device limitation is the one that is genuinely unfixed.**

`CLAUDE.md` § *Known limitations* is explicit: `commit()` writes the whole of `S` under one key,
nothing coordinates two copies of the app, and restore is a whole-state replace with **no
merge**. A trainee on a placement phone and a home laptop is a **more likely** shape than a
settled private practitioner, and the failure mode — a stale tab stamping week-old state over a
term's logged hours — is exactly the data this plan makes load-bearing.

One part of this has been hardened and it is worth being precise about which. The records
folder is **never overwritten blind**: every save leaves `.GroundWork-writer.json` beside the
records naming the device that wrote them, and a marker holding a *different* device's id pauses
folder writes (`_folderHeld`) and asks which copy wins. That is a real second-device detector,
and it deliberately replaced a modification-date comparison that could not work — iCloud
restamps a file on upload, and iOS suspends the WebView mid-write, so the date read back is not
the date this device wrote.

But note exactly what that does and does not give:

- It **detects** a second writer and stops, rather than merging. The trainee still has to choose
  one copy and lose the other.
- It covers **the folder**. Two browser tabs on a laptop still overwrite each other in
  IndexedDB with no marker, no warning and no detection at all.
- It is **iOS-only**, for the same reason as §8.1.

Stage 1 does not have to fix this, but it does have to **say it plainly to the trainee** — one
device is the supported shape, and the folder is how you move to a new one. It should be
reconsidered properly before Stage 4 sells seats to forty people at once, because forty trainees
will include several running phone-plus-laptop and at least one who loses a term. The fix sketch
in CLAUDE.md — a monotonic `S.meta.rev`, refuse a write whose base `rev` is stale, broadcast over
`BroadcastChannel` — is the starting point, and the writer marker is the proof that the
"record who wrote it, never infer it" approach is the right shape for it.

## 9. Immediate next steps

**In order, and the first three involve no code:**

1. **Write the one-page pitch** for a course lead. Not a feature list — the "forty spreadsheets"
   problem, what they get, and the explicit statement that they get no access to trainee data.
2. **Get CPCAB's public forms and the L4 requirements** into `docs/` as the reference the rule
   pack is written against, with a dated source note.
3. **Find three providers and have the Stage 0 conversation.** Route in through supervisors and
   placement coordinators, not course administrators.
4. **Write `docs/tasks/T10-training-record.md`** — the Stage 1 schema work, in the house task
   format, self-contained, one session. It is safe to write and safe to implement regardless of
   how Stage 0 goes, because it is worth having for trainees on its own.
5. Only then, on a yes from step 3: `T11-rule-pack.md` and `T12-training-report.md`.

The decision point is after step 3. Everything before it is cheap; everything after it is not.
