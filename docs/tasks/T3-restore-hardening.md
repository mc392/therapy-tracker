# T3 — Harden restore-from-backup (freshness comparison + real gate)

**Model:** Opus · **Depends on:** T2 · **Touches:** `TherapyTracker-web/index.html`, `CLAUDE.md`

## Why
Restore (`importJSON`, ~line 6801) replaces the ENTIRE state behind a single `confirm()`.
Anonymise/erase run a full ladder (summary, export-first, acknowledgement, typed phrase,
3-second arm), but the one action that can stamp a stale backup over weeks of newer
entries is one tap. This is the most realistic "customer destroys their own data" path in
the app, especially combined with the documented multi-device last-write-wins behaviour.

## Design: smart friction, not uniform friction
A legitimate restore (new phone, empty app) must stay easy. A dangerous restore (backup
older or smaller than what's on the device) must be hard. Two tiers:

**Tier A — routine restore** (light sheet, one button):
applies when the current device is effectively empty (`S.sessions.length===0 &&
S.clients.length===0`) OR the backup is not older and not smaller (see heuristic).

**Tier B — dangerous restore** (full `dzConfirm` ladder):
applies when EITHER of these is true:
- backup has fewer sessions than the device (`backup.state.sessions.length < S.sessions.length`), or
- the backup's `exportedAt` is older than the device's last change. Use the newest of:
  `localStorage.tt_state_ts` (written by `mirror()`), and the latest audit entry's `ts`
  if `_db` is available. If neither exists, treat as unknown → Tier B only if counts say so.

## Changes

1. In `importJSON`, after `validateImport` succeeds, compute the comparison and replace
   the `confirm(msg)` with a sheet:
   - **Both tiers show**: backup date ("Exported 18 Aug 2026, 14:02" from `exportedAt`;
     "unknown date" if absent), backup counts vs device counts side by side (sessions,
     clients, supervision, rooms — reuse `validateImport`'s `counts`), any `rep.problems`
     lines, and: "Your current data is kept as a restore point (Settings → Undo &
     history)."
   - **Tier A**: title "Restore this backup?", primary button "Restore", ghost Cancel.
     Implement with `sheetPromise` (the existing helper, ~line 6148) — resolves null on
     any dismissal.
   - **Tier B**: use `dzConfirm` (~line 7979) with:
     `lead`: "This backup is OLDER/SMALLER than what is on this device. Restoring
     replaces everything here with the backup's contents." — state the specific facts,
     e.g. "12 days older" / "41 fewer sessions", computed, not generic.
     `destroys`: the concrete deltas ("41 sessions logged after this backup was made",
     etc. — approximate by counts; do not diff record-by-record).
     `keeps`: "A restore point of today's data, until restore points roll over".
     `undoable: true`, `phrase: "RESTORE"`, `verb: "Restore backup"`.
2. Keep the encrypted-backup passphrase prompt (`askPassphrase`) exactly where it is —
   it runs before validation, unchanged.
3. Keep `alert()` for unreadable files (parse failure) — that path has nothing to gate.
4. After a successful restore, keep the existing behaviour verbatim: `normalize`,
   `commit("Restored backup (…)")`, `markBackedUp()`, `applySettings()`, `go("home")`.
5. One-line doc update in CLAUDE.md § Data removal or a new § Restore describing the two
   tiers and the heuristic.

## Constraints
- `validateImport` itself must not change (T-none): it is the schema gate and is correct.
- The restore-point guarantee must remain true: `commit()` snapshots, so do not add an
  extra unconditional snapshot (same reasoning as the spreadsheet import's rule).
- `sheetPromise`/`dzConfirm` resolve null/false when dismissed — ensure every dismissal
  path leaves `e.target.value=""` reset so the same file can be re-picked (this reset
  exists today at the end of `importJSON`; keep it working for the new async shape).
- Works when `_db===null` (fallback mode): the sheet is DOM-only; the "latest audit ts"
  probe must guard on `_db`.

## Verify
- `npm run check`.
- Manual matrix (serve app, use export to produce fixtures):
  1. Empty device + any backup → Tier A, restores.
  2. Device with data + same-or-newer backup with ≥ counts → Tier A.
  3. Device with data + backup with fewer sessions → Tier B, requires typed RESTORE +
     3s arm; cancel leaves device untouched.
  4. Encrypted backup → passphrase prompt then correct tier.
  5. After a Tier B restore, Settings → Restore points contains the pre-restore state.

## Out of scope
- Any merge/two-way sync. Multi-tab rev-stamping (deferred by design).
