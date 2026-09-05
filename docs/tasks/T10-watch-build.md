# T10 — Get the watchOS timer to build, then prove it on a wrist

**Model: Opus.** **Run this on the Mac, in Claude Code, with Xcode installed.**
Everything below was written in a cloud container with **no Xcode and no Swift toolchain**,
so the code in this task has never been near a compiler. That is the whole point of the task.

Kickoff prompt:

> Read `docs/tasks/T10-watch-build.md` and work through it. Read CLAUDE.md § The watchOS app
> and `docs/ios-native.md` § The watch app first. Do not do anything the task marks out of
> scope.

---

## What already exists

Branch **`claude/watchos-app-groundwork-ideas-5np0v1`**, two commits, pushed:

- `a6159c6` — `docs/watchos-companion-ideas.md`, the design sketch: what a watch companion
  should and should not be, in four stages. Stages 2–4 are **not** in scope here.
- `f270a2a` — stage 1 built: the timer.

Stage 1 is a SwiftUI watchOS app at `ios/App/GroundWorkWatch/` — four Swift files, an
`Info.plist` and an asset catalog — embedded in the existing Capacitor iPhone app. One
screen: Start, a countdown, Stop, and a settings sheet (length 30–90 min, default 50;
warning tap Off/5/10/15, default 10). It taps the wrist at ten-minutes-left and at time.

**No sync. No complication. No client data.** It holds two integers and a date. Do not add
data flow between the phone and the watch in this task — that is stage 2 and it has its own
design constraints (see the ideas doc).

Read these rather than re-deriving them:

| What | Where |
|---|---|
| Why it is shaped this way, the traps | `docs/ios-native.md` § The watch app |
| Condensed rules | `CLAUDE.md` § The watchOS app (Sep 2026) |
| Stages 2–4, out of scope | `docs/watchos-companion-ideas.md` |
| The Xcode wiring | `scripts/add-watch-target.mjs` |
| What is asserted | `scripts/check-drift.mjs` § 6 |

### The two rules — do not "simplify" these away

Both come from watchOS suspending the app the moment the wrist drops.

1. **The end date is the state; nothing counts down.** Figures derive from `Date()` against
   `endsAt`, and the digits are drawn by `Text(timerInterval:)` / `ProgressView(timerInterval:)`,
   which keep counting with no redraw scheduled. If you find yourself adding a repeating
   `Timer` to update a label, stop — that is the bug this design exists to avoid.
2. **The taps are local notifications scheduled at Start**, not `Timer` callbacks. A `Timer`
   in a suspended app does not fire, and the tap *is* the feature.

The `Timer`s in `armFlips()` are cosmetic (they flip the screen from counting down to
counting up) and are allowed to be late — `refresh()` recomputes from the dates on wake.

`AppDelegate` in `GroundWorkWatchApp.swift` exists only so a notification is presented while
the app is frontmost, which watchOS otherwise suppresses. It plays the haptic itself and
returns `[.banner]`, never `[.sound]`, so there is no second tap to collide with. Do not
"tidy" it into `[.banner, .sound]`.

---

## Step 1 — make it build

```bash
git checkout claude/watchos-app-groundwork-ideas-5np0v1 && git pull
npm ci
npm run ios          # check → sync → open Xcode
```

`npm run sync` is not optional: `ios/App/App/public/` and every app icon are gitignored, so
a fresh clone has no bundled web app and no artwork until it runs. Capacitor 8 uses SwiftPM,
so there is no `.xcworkspace` — it opens `ios/App/App.xcodeproj`. Let package resolution
finish first.

Then build the **App** scheme for any iOS destination. The watch target is a build dependency
of it, so this compiles all four Swift files:

```bash
xcodebuild build -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates
```

Fix what the compiler says. **Prefer the smallest change that keeps the two rules above**;
if a fix would require restructuring around either of them, say so rather than doing it.

### Where the compile is most likely to fail

Listed because these were written blind and are the parts with real uncertainty, roughly
most to least likely:

1. **The target's product type.** `scripts/add-watch-target.mjs` creates the target as the
   library's `watch2_app` type — which is what produces the correct "Embed Watch Content"
   copy phase into `$(CONTENTS_FOLDER_PATH)/Watch` — then rewrites `productType` to
   `com.apple.product-type.application`, because this is a single-target watch app
   (`WKApplication` in the Info.plist, no WatchKit extension bundle). If Xcode objects to
   the target's shape at all, this is the line to look at. Fix it in the **script**, not
   only in the checked-in `project.pbxproj`, or the next `npm run sync` on a regenerated
   `ios/` undoes you.
2. **`ProgressView(timerInterval:countsDown:label:currentValueLabel:)`** in `TimerView.swift`
   with `EmptyView` for both labels — generic inference here is the sort of thing that
   either compiles cleanly or produces an unhelpful error.
3. **`Task { @MainActor [weak self] in`** in `SessionTimer.swift` — attribute before capture
   list. Believed correct; verify rather than assume.
4. **`.foregroundStyle(timer.isWarning ? .orange : .primary)`** — relies on both branches
   inferring as `Color`. If it complains, spell out `Color.primary`.
5. **`.onChange(of: scenePhase) { phase in … }`** — the single-parameter form, deprecated
   from watchOS 10. Expect a warning; only act if it is an error.
6. **`@MainActor` on `SessionTimer` with `@StateObject` in the `App` struct** — fine under
   Swift 5 language mode (`SWIFT_VERSION = 5.0`), potentially noisy if anything raises that.
7. **The watch app icon**: a single 1024 entry with `"platform": "watchos"`. If Xcode wants
   the older per-size set, extend `scripts/install-assets.mjs` (which copies
   `TherapyTracker-web/icon-ideas/groundwork/icon-1024.png` into place) rather than
   committing PNGs — they are gitignored on purpose.

### Signing

`uk.co.charlottebloortherapy.groundwork.watchkitapp` does not exist in the developer account
yet. Automatic signing should register it on the first build. If it errors, retry once before
treating it as real — and if it cannot be created, **stop and report** rather than switching
the project to manual signing.

---

## Step 2 — offer the fast test loop before testing anything

The shortest session is 30 minutes and the earliest warning 15, so one honest test cycle is
half an hour of waiting. **Offer to add a `#if DEBUG` block** putting 1- and 2-minute options
into `SessionTimer.lengths` and a 1-minute warning into `SessionTimer.warnings`, so debug
builds get a fast loop and release builds are byte-for-byte unchanged. Wait for a yes — the
user has been asked twice and not yet answered.

---

## Step 3 — simulator smoke test

`GroundWorkWatch` scheme, a **Watch** simulator destination (not the paired iPhone one).

Confirm: the permission prompt appears on the first Start; both notifications actually
arrive; the countdown reads correctly; Stop cancels the pending ones; the settings sheet
persists a changed length across a relaunch.

Two things the simulator **cannot** tell you, so do not report them as passing: haptics are a
no-op there (banners appear, nothing is felt), and it does not suspend an app the way a
dropped wrist does — which is the thing the entire design is built around.

---

## Step 4 — real hardware, which is the actual test

Build the **App** scheme to a real iPhone paired with a watch. The watch app should install
itself; otherwise iPhone → Watch app → Available Apps → Install.

In order:

1. Start a session, drop your wrist, do not look at the watch for ten minutes. Raise it —
   the countdown must be **correct**, not ten minutes stale. This is rule 1 passing or
   failing.
2. Feel the warning tap. Feeling it, not seeing it, is the pass condition.
3. Repeat with the watch in **Theatre mode** — screen dark, watch silent, taps still
   delivered. That is how it would actually be used in a session, and the settings sheet
   tells the user so.
4. Force-quit the watch app mid-session and relaunch: still running, right time left. That
   is the `UserDefaults` restore path in `SessionTimer.restore()`.
5. Let one run past the end: it should flip to "over by" and count up.
6. Leave one running overnight: `staleOverrun` (2h) should have cleared it, not greeted you
   with "over by 14:22:31".

Then the only question that matters, and the reason stage 1 exists at all: **wear it through
a real fifty-minute session** and decide whether a tap at ten-minutes-left is useful or
intrusive. That answer decides whether stages 2–4 are worth building. Report it back — it is
a judgement, not a test result.

---

## Finishing

- `npm run check` must pass (it asserts the watch target, its four compiled sources, the
  embed phase, the build dependency, and that the watch's `WKCompanionAppBundleIdentifier`
  still matches `capacitor.config.json`'s `appId`).
- Commit fixes to the same branch. If the pbxproj needed changes, the fix belongs in
  `scripts/add-watch-target.mjs` as well — a regenerated `ios/` must come back correct.
- Update `docs/ios-native.md` § The watch app: it currently ends with a "Not built, not run"
  checklist. Replace it with what was actually verified, in the style of the § "Verified in
  the simulator" section above it.
- Do **not** run `npm run release` or push a tag. Getting to TestFlight is a separate
  decision; `docs/releasing.md` covers it, including the note that the first archive carrying
  a second target is where watch provisioning would surface.

## Out of scope

Stage 2 and beyond — `WCSession`, the roster push, captures, complications, dictation. Also:
do not add `settings.sessionMins` to the web app. It was deliberately left out because with
nothing syncing it would be a setting in `index.html` that changes nothing anywhere; the
reasoning is recorded in both `docs/ios-native.md` and the ideas doc.

## Suggested skills

- **`/code-review`** on the branch diff once it compiles — the Swift has had no review by
  anything that understands Swift.
- **`/run`** if you want the iPhone app itself up alongside the watch app.
- **`/security-review`** is *not* needed: this adds no data flow, no network, no storage
  beyond two integers and a date in the watch's own `UserDefaults`.
