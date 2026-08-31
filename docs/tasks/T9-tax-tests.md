# T9 — Test coverage for cancellation charging

**Model:** Sonnet · **Depends on:** nothing · **Touches:** `tests/tax-tests.js` only

## Why
IMPROVEMENTS.md's own highest-value open item: the 118-test suite predates schema v5, so
the `fullRate × cancelPct` path in `derive()` — which feeds revenue, net, SA103 and MTD —
has zero automated coverage. It was verified by hand once; that check belongs in the
suite before a public release.

## Ground rules (from CLAUDE.md § Tax engine tests — read that section first)
- **Expected values are derived from the rule, never copied from the app's output.**
  Work each expected figure out in a comment (e.g. "£80 fee × 50% = £40").
- The suite lives outside `TherapyTracker-web/`, never deploys, never calls `commit()`,
  and restores live state when it finishes — follow its existing harness conventions
  exactly (read the top of the file: how it snapshots/restores `S`, how cases assert).

## Cases to add
1. **Stamped charge wins**: session fee £80 (via `rateHistory`), `cancelCharge:50`,
   `cancelKind:"late"` → `derive().rate === 40`, `fullRate === 80`, `cancelPct === 50`.
2. **Absent stamp = full fee**: same session, no `cancelCharge` → `rate === 80`
   (pre-v5 behaviour preserved).
3. **DNA at 0%**: `cancelKind:"dna"`, `cancelCharge:0` → `rate === 0`; session excluded
   from clinical/attendance counting (`isCancelled` true) but its £0 harmless in totals.
4. **Policy edits don't reach back**: set `settings.cancelRules` to something new, then
   confirm an already-stamped session's `derive().rate` is unchanged.
5. **Policy resolution** (`cancelPolicyPct`): windows `[{hoursBefore:48,chargePct:0},
   {hoursBefore:24,chargePct:50}]` → 72h notice → 0; 30h → 50; 2h → 100 (clears no
   rule); `hrs==null` → 100; `kind:"dna"` → `dnaChargePct`.
6. **Reconciliation with mixed charges** (the high-value one): a fixture year with four
   sessions charged at 100/50/25/0%, one per MTD quarter, plus a couple of paid dates
   spanning quarters. Assert, on BOTH bases (cash and accruals):
   `profitBreakdown` total === sum of the four `mtdQuarters()` === `tyNet(y)`.
   Mirror how the existing reconciliation block builds its profiles.
7. **Receipts include charged missed sessions**: a 50%-charged late cancel appears in
   `receiptRows` output with the reduced amount (so statements match what was billed) —
   only if `receiptRows` is reachable from the test harness without DOM; if it needs the
   DOM, skip and note it in the summary.

## Also
- Add a comment block at the top of the new section noting the TY-anchoring caveat that
  already applies suite-wide (re-anchor after 5 Apr 2027) — do NOT re-anchor anything
  now.

## Verify
- Serve the app, open it, paste the whole updated `tests/tax-tests.js` in the console:
  **all** tests pass (old and new), and the final line confirms live state was restored.
- Deliberately break one new expectation locally to prove the assertion fires, then
  restore it (mention this in your summary; don't commit the broken form).

## Out of scope
- Any change to `TherapyTracker-web/index.html`. Re-anchoring existing tests.
