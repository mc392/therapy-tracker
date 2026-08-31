# T6 — Copy pass: one-sentence rule per card, label renames

**Model:** Sonnet · **Depends on:** T5 and T7a (run after both) · **Touches:**
`TherapyTracker-web/index.html`, `CLAUDE.md` (only if a documented label changes)

## Why
The writing is good sentence-by-sentence; the overload is volume. Many cards open with
2–4 sentence paragraphs that are read once and scrolled past forever. The app already has
the correct pattern — `infoLink`/`infoDef` sheets ("Find out more ›", ~line 3874, built
exactly for this) — it's just underused outside the Tax tab. Also a handful of labels
assume vocabulary a first-year counsellor may not have.

## The rule
Every card intro: **at most one sentence stating what the figure/control IS**, with any
reasoning, caveats or HMRC background moved to an `infoDef` sheet linked as
"Find out more ›" (or a more specific label). Keep warnings that change behaviour
(`vmsg warn/err`) inline — the rule applies to explanatory prose, not to alerts.

## Label renames (do these first — they're referenced by the copy)
1. Tax segment "MTD" → **"Quarterly (MTD)"** (`segBar` list in `VIEWS.tax`).
2. Tax segment "Allowances" → **"Per year"**, and its lead heading becomes
   "Settings that follow the tax year". (The word "Allowances" was wrong anyway —
   student loan and region aren't allowances.)
3. Money segment "Table" is fine; Sessions segments fine; do not rename tabs.
4. Update the matching `TIPS` copy and any `taxDetailsSheet`/moment-card text that names
   the old segment labels (grep for "MTD" and "Allowances" in user-facing strings).

## Cards to trim (work through this list; skip any T5/T7a already reduced)
For each: keep one sentence, move the rest to a new or existing `infoDef`. Preserve the
meaning exactly — this is relocation, not rewriting the facts.
- `mountCPD` intro (~line 2092) — the 12-month window + what counts moves to a sheet.
- `mountAccreditation` intro (~line 2120) — the Form 3A mechanics move; keep "Totals for
  Form 3A." The `acc-work` breakdown block stays (it's working, not prose).
- Retention card (`retentionCardHTML`, ~line 8125) — keep "How long you keep records
  after a client finishes. Nothing is ever deleted for you."; the BACP/insurer rationale
  moves to a sheet. The Anonymise/Erase explainer under the rows stays (it's a warning).
- Payments due card (~line 3069) — one sentence; the "ticking changes nothing in tax
  figures" point moves to a sheet.
- Business costs / Other income cards (~lines 3109–3126) — one sentence each; the
  practice-vs-separate-trade explanation is already duplicated in the form, so the card
  version can be a sheet.
- Attendance card intro (~line 2660) — the pause/exclusion mechanics move to a sheet.
- Missed sessions card explanatory paragraph (~line 2627) — keep the trend sentence,
  sheet the rest.
- Settings → Backup & restore intro (~line 5064) — keep the first sentence + the
  one-device sentence (added by T2); the .json-vs-CSV and notes-scope detail moves to a
  sheet.
- Settings → Encrypted backup intro (~line 5084) — keep passphrase warning inline
  (bold), sheet the rest.
- Setup wizard: any step `sub` longer than two lines gets tightened to one or two —
  especially `stepRooms`, `stepMoney`, `stepRetention` (read them; do not restructure
  steps).

## Constraints
- Do not touch: TAX_DISCLAIMER (legal, single-sourced), the beta/tax gate machinery,
  `terms.html`/`privacy.html` (T8 owns those), toasts, validation messages.
- `infoDef` keys are permanent once shipped (they're referenced from HTML strings) —
  pick clear kebab keys.
- `wireInfo(...)` must be called on every container that gains an `infoLink` — grep how
  existing views do it and follow.
- Keep British English and the existing voice: plain, specific, no exclamation marks.

## Verify
- `npm run check`.
- Click every new "Find out more ›" on a served copy — every sheet opens with the moved
  content; no dangling `data-info` keys (console clean).
- Visual sweep of each edited card at phone width: no card intro exceeds one sentence
  (two only where the task says so).

## Out of scope
- Restructuring any view. New features. GroundWork Notes (separate repo).
