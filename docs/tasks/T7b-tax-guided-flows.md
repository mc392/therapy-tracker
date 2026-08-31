# T7b — Guided flows for the infrequent tax jobs

**Model:** Opus · **Depends on:** T7a · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`

## Why
The jobs a therapist does once or twice a year — entering HMRC's figures after filing,
and the April carry-forward review — are exactly the ones forgotten between uses. Today
they live as editable fields scattered across Pot & payments and Allowances; a returning
user has to rediscover the vocabulary each time. Each becomes a short wizard on the
existing `flowStart` overlay (the machinery setup and What's-new already use), launched
from T7a's seasonal moment cards and from a standing entry point.

## Flow 1 — "After you file" (I've filed my return / got my tax calculation)

**Entry points:** the `file-<TY>` moment card (replace T7a's `// T7b` marker), plus a
button on Pot & payments near the existing HMRC-figures card ("Walk me through it ›").

**Steps** (each step = one question, `flowStart` step objects with `mount`/`validate`):
1. **Which year?** Default to the most recent ENDED tax year without an `actual`
   (`taxYearRec(y).liability == null`); offer a simple year picker of `taxPlanYears()`
   restricted to ended years. Explain in one line where the SA302 / "tax calculation"
   is found (HMRC online account → Self Assessment → tax calculation).
2. **The bill.** One number input: "Total tax HMRC calculated for <y>". Prefill nothing;
   show the app's own estimate beside it for comparison ("The app estimated <£est>").
   Writes nothing yet.
3. **Instalments (optional).** "Did HMRC set payments on account towards <nextTY>?" —
   two states: skip, or one number ("each instalment"). One line on where these show.
4. **Confirm.** Summary of what will change, in plain terms: "Every figure switches to
   HMRC's <£X> for <y>; the estimate (<£est>) is kept alongside. Next payments become
   <recomputed from taxSchedule>." On finish: write via `taxYearRecW(y)` —
   `liability`, `liabilityAt=isoD(today())`, `filed=true`, and `poaSet`/`poaSetAt` if
   given — exactly the fields the Pot & payments editors already write (read
   `drawPayments`, ~line 4353, and reuse its write shapes verbatim); one
   `commit("Entered HMRC's figures for <y>")`; land on `go("tax",{seg:"now"})` with a
   toast.

Do NOT include the SA303 claim-to-reduce in this flow — it stays where it is (an expert
control on Pot & payments); the flow may mention it in a footnote line.

## Flow 2 — "New tax year review" (April)

**Entry points:** the `new-year-<TY>` moment card; plus a "Review for <TY> ›" link at the
top of the Allowances segment during 6 Apr – 31 May.

**Steps** — each shows the CARRIED value and asks confirm-or-change (carry-forward means
a no-op review must be four taps of "That's right"):
1. **Where you pay income tax.** `taxRegionFor(newTY)` with its inherited/own status
   (`yearValue` returns `inherited`/`from`). Confirm keeps carry-forward (write
   nothing); change calls `setYearValue("taxRegionYears",newTY,…,"taxRegion")`.
2. **Student loan.** Same pattern via `studentLoanPlanKey(newTY)` /
   `setYearValue("studentLoanYears",…,"studentLoan")`, options from `SL_PLANS`. The
   one-line reason: "the year you finish repaying, set it to None from that year — the
   years you were repaying keep their figures."
3. **Use of home.** Show what's in force via `uohForYear(newTY)` (method + monthly
   figure). Confirm = nothing written (inheritance already handles it). "Update the
   figures" = call `uohCopyFrom(prevSource,newTY)` (~line 3450) then deep-link to
   Allowances for the edits, resuming nothing — the flow ends there by design.
4. **Pot buffer.** Show `taxPotCfg().bufferPct` with the existing buffer guidance one
   tap away (`infoLink("potbuffer",…)` content); confirm or set a new value into
   `settings.taxPot.bufferPct`.
5. **Done.** Summary of anything changed; single `commit("New tax year review <TY>")`
   only if something changed (steps must stage into a local object, not write as they
   go — mirror how `startSetup` stages into `w` and saves once).

## Shared requirements
- Both flows run on `flowStart` with `onSkip` allowed (skipping is always safe: staged
  changes are discarded).
- Both must be re-runnable and idempotent: running Flow 1 twice for the same year just
  re-edits the same record; Flow 2 with nothing changed writes nothing.
- Every explanatory sentence ≤ 1 line where possible; deeper reasoning goes through
  existing `INFO` sheets (`infoDef`/`infoLink`) — add new `infoDef` entries rather than
  paragraphs in steps.
- Flows never run on top of each other or setup (`_flow` guard already enforces this).
- CLAUDE.md: new short section "Tax moments & guided flows" documenting entry points,
  staged-write rule, and the taxMoments ids.

## Constraints
- No new persistence shapes beyond what T7a added (`settings.taxMoments`). All writes go
  through the existing per-year machinery (`taxYearRecW`, `setYearValue`, `uohCopyFrom`,
  `taxPot`).
- The raw editors on Pot & payments and Allowances stay fully functional — flows are a
  guided path to the same fields, not a replacement.
- Tax tests must pass untouched (no engine change). If a flow needs a helper that feels
  like maths, stop — it exists already.

## Verify
- `npm run check`; paste `tests/tax-tests.js` — all pass.
- Flow 1: enter a liability for last year → "Now" shows "HMRC's assessed figure";
  Pot & payments shows the same via its existing card; clear it there → estimate returns.
- Flow 2 with nothing changed: zero new audit entries. With a loan-plan change: exactly
  one commit; earlier years' figures unchanged (spot-check the by-year table).
- Skipping either flow mid-way changes nothing.

## Out of scope
- MTD submission (permanently out — offline app). Payment-recording flows (the tick list
  on Pot & payments is already the right shape). Copy pass elsewhere (T6).
