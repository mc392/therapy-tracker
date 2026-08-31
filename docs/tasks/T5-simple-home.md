# T5 — Slim simple-mode Home; re-tier the gradual reveal

**Model:** Opus · **Depends on:** nothing · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`

## Why
A brand-new user's Home can carry eight cards — attention feed, four KPIs, revenue
sparkline, goal rings, quick add, coming up, longstanding clients, records/medals — even
in "start simple" mode, because gamification/attention/receipts sit in `REVEAL_CORE`.
Day one should answer two questions: who am I seeing next, and who owes me money. The
reveal machinery (`settings.reveal`, `REVEAL_STEPS`, `revealApplySimple`) already exists
and is correctly guarded; this task re-tiers what it covers and gates Home's extras.

## Changes

1. **`REVEAL_CORE`** (~line 6865): from
   `["supervision","money","gamify","attention","receipts"]` to
   `["supervision","money","attention"]`.
   Attention stays core: overdue payments are useful from week one.

2. **`REVEAL_STEPS`** (~line 6870): add two steps, keeping the existing four unchanged:
   - `{keys:["receipts"], when: st=>st.sessions.length>=5 && st.sessions.some(s=>s.paidDate)}`
     — title "Statements for clients", sub: one sentence on printable statements for an
     insurer or the client's own records.
   - `{keys:["gamify"], when: st=>st.sessions.length>=15}` — title "Want a bit of
     celebration?", sub: one sentence, explicitly framed as optional taste ("Streaks,
     goal rings and the occasional confetti when you clear a backlog. Entirely
     cosmetic — plenty of people leave it off.").
   Order within REVEAL_STEPS by threshold. Remember `shown` is keyed on `keys[0]`.

3. **Home card gating** (`VIEWS.home`, ~line 1739):
   - `sparkCard` (revenue trend): render only when `S.sessions.length>=10`. Applies in
     all modes — existing practices exceed this instantly, so nobody loses it.
   - `loyalCard` already self-gates on 6+ sessions per client — leave it.
   - `goalsCard`/`recCard` already gate on `feat("gamify")` — no change needed beyond
     the REVEAL_CORE move.
   - Empty-state hint: keep.

4. **`stepDepth` copy** (~line 6938): the "Start simple" option description currently
   lists what stays out of the way — update it to match the new tiering (tax, costs,
   trends, table, quick-add, receipts, streaks arrive as you go).

5. **`wireAdvancedMode` / "Show everything"** (~line 6959): verify it still turns
   everything on and marks all steps shown — it iterates `FEATURES` and `REVEAL_STEPS`
   generically, so it should need no change; confirm and leave alone.

6. **CLAUDE.md** § Gradual reveal: update the schedule table and REVEAL_CORE list.

## Constraints — the ones this feature was built around
- **Never hide anything from an install that has data.** `revealApplySimple` is only
  called from `stepDepth` on a genuinely fresh install; `normalize()` defaults
  `reveal.mode` to `"all"`. Do not weaken either guard.
- `accreditation` and `peer` stay excluded from the simple preset (stepCPD asks
  directly); do not add them to any step.
- A reveal step's decline must remain as final as an accept (`shown` push either way).
- `revealCheck()` runs after commit, offers at most one step per save — unchanged.

## Verify
- `npm run check`.
- Fresh profile, choose "Start simple": Home shows hint/KPIs/quick-add card (buttons
  only, no quickadd bar)/Coming up — no rings, no medals, no sparkline, no confetti on
  first save. Log sessions past each threshold (fabricate via spreadsheet import or
  repeated adds) and confirm each offer fires once, works, and never re-asks.
- Fresh profile, "Show me everything": Home looks exactly as today (minus sparkline
  until 10 sessions).
- Existing profile with data: nothing disappears; no offers fire (mode is "all").

## Out of scope
- Tax tab restructure (T7a/T7b). Copy rewrites beyond stepDepth (T6). Sound defaults.
