# T8 — True up the App Store listing pack and privacy policy

**Model:** Sonnet · **Depends on:** T4 (documents what it shipped) · **Touches:**
`docs/app-store-listing.md`, `TherapyTracker-web/privacy.html`, `TherapyTracker-web/sw.js`
(cache bump ONLY if privacy.html is precached — it isn't; see below)

## Why
Two claims in the drafted listing are wrong or stale, and the listing pack itself
suggests a privacy-policy addition that hasn't been made. Review rejections over listing
accuracy are cheap to avoid.

## Changes

1. **`docs/app-store-listing.md`**:
   - Description bullet "A UK tax estimate that updates as you work, with expenses and
     **mileage**" — there is no mileage feature (only a travel cost category). Reword to
     "…with your business costs counted in."
   - "Encrypted backups you keep yourself" — after T4, extend: automatic on-device
     backups (kept in the app's Files folder and included in the iPhone's own backup),
     plus exportable encrypted backups. Keep it to one bullet.
   - Category is already **Business** — confirmed decision, leave as is. Add a line
     noting the companion app (GroundWork Notes) will also list under Business, so the
     two are consistent.
   - The 4.2 reviewer note gains the auto-backup as a fifth native capability.
   - Remove/reword anything referencing the beta gate if mentioned.

2. **`TherapyTracker-web/privacy.html`** — read it fully first. Add (or strengthen, if
   partially present) a short section making these points in plain language, consistent
   with the page's existing tone:
   - All data lives on the device (IndexedDB/localStorage); the developer operates no
     server and cannot see, recover or delete a user's data.
   - Client information a therapist records may be special-category data under UK GDPR;
     the therapist remains the data controller for their own records; the app is a tool
     under their control.
   - Exports and backups go only where the user sends them.
   - The iOS app's automatic backup stays on the device (Files app / device backup).
   Match the existing HTML structure of the page; do not restyle it.

3. **`terms.html`**: read §4 (tax figures) once and flag — in your summary only, no
   edits unless something is factually wrong — anything inconsistent with the in-app
   TAX_DISCLAIMER wording.

## Constraints
- privacy.html and terms.html are served from GitHub Pages and linked from the native
  app via the hardcoded SITE constant — do not rename or move them.
- sw.js precaches only SHELL + icons/manifest; privacy.html is network-served, so **no
  cache bump** for this task.
- No changes to index.html.

## Verify
- Open privacy.html locally — valid HTML, renders consistently with the rest of the page.
- Re-read the final listing description against the shipped feature set: every bullet
  must be true of the build being submitted.

## Out of scope
- Screenshots (need a device). App Store Connect itself. terms.html rewrites.
