# T2 — Remove the beta gate; relocate its warnings

**Model:** Sonnet · **Depends on:** T1 · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`

## Why
Apple Guideline 2.2: betas don't belong on the App Store — the forced "I understand this
is beta software" screen is close to an auto-rejection, and it's the wrong first
impression for a records product. But it currently carries the app's ONLY warning that
two open tabs/devices silently overwrite each other. The gate goes; the warnings move to
permanent homes.

## Changes

1. **Stop showing the gate.** In the init IIFE (~line 8277–8302), the chain is:
   `if(!settings().betaAck) showBetaGate(afterGates) else afterGates()`. Replace with a
   plain `setTimeout(afterGates,120)`. Keep the overlay-queue comment intact — setup and
   What's-new still share `#ovRoot`.

2. **Remove `showBetaGate`** (~line 7378) entirely. Leave `settings().betaAck` alone in
   any state that has it (nothing needs to read it any more; do NOT add code to delete
   it — backups carrying it must keep restoring cleanly).

3. **Relocate warning #1 — "one device at a time".** Add a point to `stepBackup(w)`
   (~line 7256, the setup step "How your data is kept safe") using its existing
   `ovPoints` style. Wording:
   - Title: "One device at a time"
   - Body: "GroundWork doesn't merge changes made in two places at once — whichever
     saves last wins. Do your day-to-day logging on one device, and use backups to move
     your data when you switch."
   Read the step first and match its structure; add, don't restructure.

4. **Relocate warning #2 — "keep independent backups".** Verify `stepBackup` already
   says this (it should); strengthen only if it's missing.

5. **Settings copy**: in the Backup & restore card intro (VIEWS.settings, ~line 5064),
   append one sentence: "GroundWork works on one device at a time — restore a backup to
   move your records, don't run two copies side by side."

6. **CLAUDE.md**: update any section describing the beta gate / gate chain.

## Constraints
- `showTaxGate` and the tax disclaimer machinery are separate and must be untouched.
- The `flowStart`/`#ovRoot` overlay code stays — setup and What's-new still use it.
- Existing installs must not see setup or What's-new re-fire because of this change
  (the `afterGates` logic itself must not change).

## Verify
- `npm run check`.
- Fresh profile: first launch goes straight to setup (no beta screen); the backup step
  carries the one-device point.
- Existing profile (open the app normally with data): no gate, no setup, no regression.

## Out of scope
- The restore flow itself (T3 adds the freshness warning there — don't pre-build it).
