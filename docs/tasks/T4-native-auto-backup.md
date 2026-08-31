# T4 — Automatic backups on the iOS app

**Model:** Opus · **Depends on:** nothing · **Touches:** `TherapyTracker-web/index.html`
(native block only, plus one settings-card hook), `ios/App/App/Info.plist`,
`scripts/check-drift.mjs` (only if it asserts new names), `CLAUDE.md`, `docs/ios-native.md`

## Why
On desktop Chrome/Edge, encrypted backups auto-save silently via the File System Access
API. On iOS — the platform about to ship — that API doesn't exist, so the only safety net
is a nag banner and a manual share-sheet export. A lost or broken phone loses everything
since the customer last bothered. The native shell already has the Filesystem plugin; the
fix is ~80% plumbing that exists.

## Design
- Every debounced save on native writes a backup file to the app's **Documents**
  directory. Documents is included in the phone's own iCloud/device backup, and (after
  the Info.plist change below) visible to the user in the Files app.
- Payload: if `encReady()` → `encPayload()` (encrypted, filename
  `GroundWork auto-backup.enc.json`); otherwise the plain `exportJSON` payload shape
  (filename `GroundWork auto-backup.json`). Build the plain payload by extracting the
  object construction from `exportJSON` into a small `backupPayload()` helper both use —
  do not duplicate the envelope.
- Rotation: additionally, at most once per day, copy into `auto-backups/GroundWork
  YYYY-MM-DD.json` (same enc/plain rule) and prune that folder to the newest 7.
- This does NOT touch the manual-backup nag: `markBackedUp()` stays tied to explicit
  exports, because an on-device copy doesn't protect a user who has iCloud Backup off.
  The banner detail line may mention it: "(an automatic copy is kept on this iPhone)".

## Changes

1. **index.html, native guard block** (the IIFE at the bottom, `Capacitor.isNativePlatform`):
   - Wrap `window.commit` the way `window.download` is already wrapped: call the
     original, then schedule `nativeAutoBackup()` debounced 2s (mirror `autoEncBackup`'s
     debounce pattern). The wrap must preserve the original's return value (callers check
     `true`/`false`) — `const ok = await _commit(...)` then fire-and-forget the backup.
   - `nativeAutoBackup()`: build payload → `Filesystem.writeFile({path, data,
     directory:"DOCUMENTS", encoding:"utf8"})`; then the once-daily rotation (track last
     rotation date in `localStorage tt_autobk_day`); prune via `readdir` + `deleteFile`.
     Every failure is caught and logged, never toasted — a background backup must not
     interrupt anyone; but persist last success/failure in `localStorage tt_autobk_status`.
   - Add a row to the existing `deviceCard()` ("This iPhone" settings section): status
     line "Automatic backup: last saved <relative time> · kept in GroundWork's folder in
     the Files app, and included in your iPhone's own backup." plus a "Back up now"
     button that runs `nativeAutoBackup()` immediately and repaints.

2. **Extract `backupPayload()`** in the main script (near `exportJSON`, ~line 6075) and
   have `exportJSON` and `encPayload` both use it. Names the native block reaches for
   (`backupPayload`, `encReady`, `encPayload`, `commit`) must be added to the drift check
   if `scripts/check-drift.mjs` works from a name list — read that script and follow its
   convention.

3. **Info.plist** (`ios/App/App/Info.plist`): add `UIFileSharingEnabled` = true and
   `LSSupportsOpeningDocumentsInPlace` = true, so the Documents folder (and therefore the
   auto-backups) is user-visible in the Files app. Note this in docs/ios-native.md.

4. **Docs**: short sections in CLAUDE.md (under the native-shell notes) and
   docs/ios-native.md describing the file locations, rotation and the deliberate
   non-interaction with the manual-backup nag.

## Constraints
- Zero effect on the web build: everything (except the `backupPayload` extraction, which
  is behaviour-neutral) lives behind the native guard.
- Never write plaintext when a passphrase is set — `encReady()` decides, per write.
- The wrap must not change `commit()`'s error semantics: a failed IndexedDB save still
  raises the banner; a failed auto-backup never blocks or masks it.
- `Filesystem` may be absent (plugin not installed in some future build): guard with the
  existing `P("Filesystem")` pattern and no-op cleanly.

## Verify
- `npm run check` (including any drift-list additions).
- Web build in a browser: behaviour identical, no console errors, `backupPayload` used by
  both export paths (compare an exported file before/after — byte-identical shape).
- If a simulator is available (`npx cap sync ios` + Xcode): make a change, wait 2s,
  confirm the file exists in the app's Documents; toggle the settings row; kill/relaunch.
  If no simulator: state clearly in the summary that device verification is pending.

## Out of scope
- Changing backup-nag thresholds or `markBackedUp` semantics. Android. Desktop paths.
