# Practitioner models - what GroundWork assumes, and what it costs

*Written Sept 2026. A review of the one assumption running under the whole app - that the
practitioner sells sessions to the people sitting in front of them - and what it would take to
lift it without turning GroundWork into a different product.*

*Companion to `docs/institutional-partnerships-2026-09.md`, which covers the trainee case from the
evidence side. This document covers the money side, which that plan deliberately left alone.*

---

## The answer, before the working

GroundWork models a session as **a billable event**: a fee is in force, it is charged to the
client, the client pays, and the result is self-employed profit that HMRC taxes. That chain is
`effRate` → `derive().rate` → `s.paidDate` → `tyNet` → `ukTax`, and every screen on Home, Money
and Tax hangs off some link in it.

Everything the app does that is **not** money is already model-neutral and works perfectly for a
practitioner who is paid some other way: sessions, clients, attendance, cancellations, rooms,
supervision, peer supervision, CPD, accreditation hours, retention, the calendar export, and -
most valuably - Practice › Reports. That is the great majority of the app.

So the uplift is not "add employment support". It is **separating "did I see this person" from
"did this earn money, and from whom"** - a separation this codebase has already made once, on
purpose, and documented as a rule. When room fees moved out of the session form in Sep 2026, the
reasoning was that a bookkeeping question did not belong in a clinical worklist, and
`derive().complete` stopped demanding one. The same cut, one level up, is the whole of this work.

**One field does most of it:** who pays for this client's sessions. Not a practice-wide mode - see
§3, the commonest real shape is a practitioner doing two of these at once.

---

## 1. The models

Ranked by how much of GroundWork already serves them.

| # | Model | Who pays | Served today? |
|---|---|---|---|
| 1 | **Sole trader, private practice** | The client | **Fully.** This is the built model. |
| 2 | **Mixed portfolio** - salaried two days, private three | Employer + clients | **Partly, and one figure is wrong.** See §4.5 |
| 3 | **Third-party funded** - EAP, insurer, charity contract | An organisation, per session, in arrears | **Partly.** The money works; nothing knows who to invoice |
| 4 | **Salaried / employed** - NHS TT, charity, school, university, hospice | An employer, monthly, regardless of sessions | **Badly.** See §4 |
| 5 | **Trainee on placement** | Nobody - often the trainee pays | **Badly on money, well on evidence.** T10 and the partnerships plan cover the evidence half |
| 6 | **Associate in a group practice** | Client pays the practice; practice pays a % | **Partly.** A desk or room fee works; a percentage split does not |
| 7 | **Supervisor / trainer** | Supervisees, course providers | **Partly** - `otherIncome` holds the money, nothing holds the supervisee relationship |

Models 2–5 are one problem wearing four hats, and §5 solves all four at once. Model 6 is a variant
of arithmetic the room code already does. Model 7 is a second caseload of a different kind of
person, and is left out for the reason in §2.

**Why this matters commercially, not just technically.** A salaried or placement practitioner is a
Pro subscriber who will never buy a tax year: `reports`, `accreditation` and `notesSync` are their
whole reason to pay, `finances` is dead to them, and the UK tax packages are worth nothing. That is
a *good* shape for the business - recurring revenue with no April rates work behind it - and it is
the same customer `docs/product-proposals-2026-09.md` §1 was chasing when it split the tiers so Pro
could be sold outside the UK. **Serving the salaried practitioner and making Pro internationally
sellable are the same piece of work.** Neither needs a line of jurisdiction code.

---

## 2. Where the line is

Out of scope, and each for a reason that would break something load-bearing:

- **More than one practitioner.** A practice with employees or associates whose caseloads are
  separately visible needs accounts, per-user data and permissions, and therefore a server.
  GroundWork is one file with no server, and it cannot currently survive *the same person* having
  two tabs open (CLAUDE.md § *Multi-tab / multi-device writes*). Multi-practitioner is not an
  extension of that limitation, it is the opposite of it.
- **Limited company or partnership.** Corporation tax, dividends, a director's payroll, RTI
  filings. That is a different engine, not a wider one, and `ukTax()` would have to stop being the
  single place a year's number comes from.
- **Running payroll for the practitioner.** If they are employed, their employer does this. The app
  should never compute a payslip; at most it should *read* the P60 figure the practitioner types in.
- **Organisation-side reporting** - an EAP's own dashboard, a charity's service statistics. That is
  a B2B product with a different buyer.
- **Clinical records.** Already out, deliberately, and GroundWork Notes is the answer.
- **A supervisee caseload** (model 7). Supervisees are not clients: no fee history, no attendance,
  no retention clock, and the hours count on the other side of the 1:6 ratio. It is a second
  entity type with its own screens, which is a bigger change than everything in §5 put together
  and serves far fewer people. Supervision *income* already has a home in `otherIncome`.

Everything below stays inside: **one practitioner, one device, one set of records**, however that
practitioner happens to be paid.

---

## 3. Why the funding model belongs on the CLIENT, not the practice

The instinct is a practice-wide setting - "I am salaried" / "I am self-employed" - and it is wrong,
for the same reason `roomRentHistory`'s `freq` went on the step rather than on the room: it is a
fact about a particular arrangement, not about the practitioner.

The commonest real counselling career in the UK is **model 2**: a salaried or sessional post at a
charity or service, a private caseload alongside it, and often a couple of EAP clients on top. A
practice-wide switch cannot express that, and forcing it would make the app choose between showing
somebody a tax figure that ignores half their week and showing them an Unpaid list full of
sessions nobody will ever pay for.

A per-client field costs no more to implement and answers all four models at once.

---

## 4. What is actually broken today

Each of these was checked against the code, not assumed.

### 4.1 Every past session of a zero-fee practice sits in the Unpaid worklist, for ever

`derive()` sets `overdue = past && !clientPaid`, where `clientPaid` is just `!!s.paidDate`
(`index.html:2043`). There is no fee test in it, and the readers are split on whether they add
one for themselves:

| Reader | Guards on `rate > 0`? |
|---|---|
| `attentionItems()` overdue row | Yes - `index.html:12633` |
| `gameGoals()` payment ring | Yes - `payPast` filters on rate |
| `clientProfile()` owed figure | Yes - `index.html:12721` |
| Swipe-to-mark-paid | Yes - `index.html:5054` |
| **Sessions › Unpaid, the rows** | **No** - `rows.filter(x=>x.d.overdue)`, `index.html:5034` |
| **Sessions › Unpaid, the tab badge** | **No** - `index.html:5026` |

Four places remembered the fee test and two forgot it, which is the usual argument for a single
predicate rather than a convention repeated six times.

So a practitioner who charges nothing gets a permanent red badge on Sessions counting every session
they have ever logged, and a worklist that can never be cleared - offering, at the bottom of it, a
button to chase the clients for the money. That is the single worst thing in this review, and it is
a four-line fix.

### 4.2 Two analytics draw confident charts of £0

The `ana*` contract says *"never invent a trend from nothing"* and it is honoured everywhere the
readiness test is about the right thing. In the Money section two are about the wrong thing:

- `anaHourlyRate()` gates on `rows.length < 10` - **ten sessions, not ten pounds**. A salaried
  practitioner with two hundred sessions passes, and the card tells them their effective hourly
  rate is **£0.00**, under a heading explaining that this is the number to compare against an
  employed salary.
- `anaFloor()` gates on four months *with sessions*, then prints worst, typical and best month, all
  £0.

Everything else in the section fails closed and says what it is waiting for. These two do not.

### 4.3 Nothing records who pays, although the app knows the case exists

There is no payer concept anywhere. The only place a third-party funder can be written down today
is free text, and the app's own placeholder copy says so twice:

- Client notes: `placeholder="Admin reminders only - e.g. “invoices via employer”"` (`index.html:12417`)
- Session admin comment: `placeholder="e.g. “invoice goes to her employer”"` (`index.html:12152`)
- Referral sources ship `"EAP / employer"` as a suggestion (`index.html:12359`)

So `receiptSheet`, `chaseText` and `docNumber` all address the client for work the client never
pays for, and an EAP caseload has to be invoiced by hand outside the app. The bulk editor does
mitigate the settlement half well - `renderUnpaid` (`index.html:5090`) has tick-many, *Apply date
to ticked* and one Save, which is genuinely the right shape for a monthly BACS run from an
organisation. It is the invoice and the identity of the payer that have nowhere to live.

### 4.4 A client's fee cannot be "not applicable", only zero

`clientForm` refuses a blank starting rate and tells the reader to *"Enter a starting rate (0 if
you don't charge)"* (`index.html:12458`). The comment above it is right - a blank is not £0, and £0
is a real answer for pro bono or a placement - but it leaves "£0" doing two jobs: *this work is
free* and *nobody pays me per session*. Everything downstream can only see the number, so a
salaried caseload is indistinguishable from a pro bono one, and both are indistinguishable from a
data-entry mistake.

### 4.5 The tax figure is wrong for anyone with a salary - and the app already holds the salary

This is the only item here that is not a missing feature but a **wrong number confidently
displayed**, and it should be treated differently from the rest.

`ukTax(profit, ty)` takes self-employed profit and nothing else (`index.html`, `function ukTax`).
It applies the **full personal allowance** and the **whole basic-rate band** to that profit. For a
practitioner earning £40,000 in a salaried post with a £15,000 private caseload alongside it, the
real marginal position is 20% from the first pound of profit with the allowance already spent;
GroundWork gives them the allowance a second time and taxes the remainder from the bottom of the
basic-rate band. The estimate comes out thousands of pounds light, in the one direction that
matters - a pot that is too small in January.

And the app is not ignorant of the salary. `S.otherIncome` carries `scope:"personal"` expressly for
*"a second job, tutoring - a different trade"*, and `ledgerBetween` correctly keeps it out of
`total` so it never inflates the SA103 figure. That decision is right for the return and wrong for
the rate band: the money is excluded from the profit **and** from the bands, when it should be
excluded from one and stacked under the other.

Nothing on Tax › Now, Estimate or Pot & payments says the figure assumes this is the reader's only
income. The standing disclaimer (`taxDisclaimBar()`) is about estimates in general, not about this.

### 4.6 Setup and the gradual reveal assume charging

- `stepMoney` asks for *"Usual session fee for a new client"* and a pension contribution. There is
  no way to say "I am not paid per session", so a salaried practitioner's only honest route
  through setup is to leave a field blank and hope.
- `REVEAL_STEPS` offers **Tax and Costs & income together at ten sessions**, to everybody. The
  pairing is well reasoned - an estimate without costs is not worth having - but it fires for a
  practitioner on PAYE who has no return to file, and lands them on §4.5's figure.
- `REVEAL_CORE` includes `money`, so the Money tab is on from day one regardless.
- Receipts are offered at five sessions *and at least one paid*, which never fires for a zero-fee
  practice. That one is already right, by accident of a well-chosen condition.

### 4.7 What already degrades correctly - and should be left alone

Worth recording so a later pass does not "fix" things that are not broken: `derive().roomPaidNA` is
already true for an employer's room (no room record, or £0 on the date), so room fees stay silent;
`validateSession`'s `zerorate` warning only fires when the client *normally* charges, so it does
not nag a zero-fee caseload; the attention feed and the Goals ring both guard on rate; and
`reportHours()`, `mountAccreditation()`, `anaCapacity()`, `anaSlots()`, `anaLoad()` and the whole
Supervision and CPD side never look at money at all.

---

## 5. Recommendations

Four stages. Each is worth shipping alone, each leaves the app better than it found it, and the
project can stop at the end of any of them.

### Stage 1 - Stop asking for money nobody owes

*Small, safe, and it fixes the only genuinely embarrassing behaviour in the review.*

**1a. `client.payer` - a keyed field, absent means today.**

```js
const PAYERS = { client:"The client pays me", org:"An organisation pays me", none:"Nobody pays per session" };
```

Absent = `"client"`, so nothing migrates and no existing figure moves. Same shape as `CPD_KINDS`
and `cancelKind`: an unrecognised stored key falls back to `client` rather than vanishing.

**1b. One predicate, one choke point.** `sessionEarns(s)` - false when the client's payer is
`none`. Every money reader goes through it, the way `isCancelled()`, `notesDone()` and `roomPaidNA`
are each the one place their question is answered. Specifically:

- `derive().overdue` is false for a non-earning session. That alone fixes §4.1 at the source - the
  Unpaid rows, the tab badge, the attention row and the Goals ring all read `overdue` and all
  correct themselves at once. The four existing `rate > 0` guards in §4.1 then become redundant -
  **leave them**, they still answer the separate question of a genuinely free session for a client
  who does pay, and removing them buys nothing.
- Home's Billed / Outstanding tiles, the revenue sparkline and `receiptRows` exclude them.
- `tyNet` / `tyIncome` are untouched, because a zero-fee session already contributes £0 - but route
  them through the predicate anyway so the intent is legible and a future non-zero case cannot leak
  in.

**1c. Money analytics gate on money.** Add a revenue-bearing test to `anaHourlyRate` and `anaFloor`
alongside the session-count one - *"Sessions with a fee. None of yours carry one."* Where **no**
client pays, the Money section of Trends should not render at all rather than render four waiting
cards; `anaSection("money", cx)` is the place, and the existing `empty:true` convention already
means "this card has nothing to say about this practice".

**1d. Setup asks the question once.** One control in `stepMoney`: *"Do your clients pay you
directly?"* - Yes / Some of them / No, I'm paid another way. It sets the default payer for new
clients and, on "No", leaves `tax` and `finances` **off** and takes them out of `REVEAL_STEPS` for
that install. The precedent is `stepCPD` and `settings.reveal`: an answered question beats a
milestone default, and hiding a tab from somebody who has said they do not need it is not the same
as hiding one from somebody who has not been asked.

**1e. The tax caveat, immediately.** Independent of everything else: where the practitioner has
recorded `scope:"personal"` income or answered 1d with anything but "Yes", Tax › Now and Estimate
must say in one line that the figure is worked out on practice profit alone and does not know about
employment income. This is cheap, it is true today, and it is the difference between an incomplete
figure and a misleading one. **Ship it in Stage 1 even if Stage 3 never happens.**

**Schema:** a bump is arguable and I would take it. An older build reading `payer:"none"` puts every
one of those sessions back in the Unpaid list and chases them - it misreads the record, which is the
documented test. It saves no loss back, which is why it is arguable. Note T10 already claims v11.

### Stage 2 - The organisation that pays

*The largest real-world gap, and the one with a paying customer behind it.*

- `settings.payers[]` - `{_id, name, contact, invoiceDays, defaultRate, notes}`. A small list,
  managed beside Rooms, which is the closest existing thing: a named external party with a rate and
  a payment rhythm.
- `client.payerId` where `payer === "org"`. The client keeps their own code and their own clinical
  record; only the bill changes address.
- `receiptHTML` / `docNumber` / `chaseText` address the organisation. **The fourth-argument rule
  holds** - the native shell re-declares `printReceipt(c, rows, label, paidOnly)` with exactly four
  parameters, so the payer must ride on the rows or the `kind`, never as a fifth argument.
- **Batch by payer.** Sessions › Unpaid grouped by who owes rather than by age, and one invoice per
  payer per period. `renderUnpaid`'s tick-many and *Apply date to ticked* already do the settling;
  this is the grouping and the document.
- **Authorised sessions.** An EAP authorises six sessions and then stops. A count on the client -
  `authorised`, with the remaining number on the client card - is a small field that answers a
  question every EAP practitioner currently tracks on paper. Worth doing; worth resisting anything
  more elaborate.

### Stage 3 - An honest number for mixed income

*Only after Stage 1e, and only if the mixed-portfolio user is real.*

- `settings.employmentYears[ty] = {payeIncome, payeTaxPaid}`, via `yearValue()` / `setYearValue()` -
  the exact shape `studentLoanYears` and `taxRegionYears` already use, carry-forward included, and
  it belongs on **Tax › Per year**, which is already defined as "things set per tax year" and is
  already outside the paywall because it holds inputs rather than calculations.
- `ukTax(profit, ty, {employment})` consumes the personal allowance and the bands with employment
  income **first**, then taxes profit on top. **Class 4 NIC stays on profit alone** - it is a
  self-employed charge and stacking it would be a new error replacing an old one.
- Print the working, as this app does everywhere else: *"£40,000 employment income uses your
  allowance and £27,430 of the basic-rate band; your £15,000 profit is taxed from there."* The
  `.acc-work` block and `profitBreakdown`'s `excluded` are the house pattern.
- Student loan and the payments-on-account threshold both get more complicated with two income
  sources. **Do not guess.** Where the app cannot be confident, it should say which part of the
  bill it has not worked out - the tax mask already proves that showing nothing beats showing
  something incomplete.

### Stage 4 - Nothing, probably

The salaried and placement practitioner's reporting needs are **already served** by Practice ›
Reports and `mountAccreditation()`, both of which are payment-blind. T10 adds the per-session
duration, type and medium that a placement form wants. There is no Stage 4 unless a partner course
asks for something specific, and it should not be built speculatively.

---

## 6. What not to do

- **Do not add a practice-wide "I am employed" mode.** §3. It cannot express the commonest career
  shape and it would put a third axis beside `feat()` and `plusLocked()` that answers nearly the
  same question as the per-client field - the exact failure CLAUDE.md warns about with
  "three axes, never collapsed".
- **Do not hide the Money tab on a salaried install.** A salaried practitioner still has business
  costs - supervision, CPD, insurance, professional membership - and some of them are still
  deductible against employment income. Switch off what does not apply; do not remove the tab.
- **Do not let the payer field reach the clinical side.** Who funds the work must never affect
  `derive().complete`, the Incomplete worklist, attendance, or a report's hours. That is the room-fee
  lesson and it is the whole design principle behind this change.
- **Do not model a percentage split with a room.** Model 6 deserves its own small field if it is
  ever wanted; forcing it through `roomRateHistory` would make a rent history mean two things.
- **Do not build an organisation-facing anything.** §2.

---

## 7. If only one thing is done

**§4.1 and §4.5.** One is the app dunning a practitioner for money nobody owes, on a red badge
they cannot clear. The other is a tax estimate that is quietly thousands of pounds light for anyone
with a salary, on a screen that gives no hint it might be. Both are small. Both are, right now,
the app being confidently wrong rather than merely incomplete - which is the bar this codebase
sets for itself everywhere else.
