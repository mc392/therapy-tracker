# Launching GroundWork and GroundWork Notes — the step-by-step

*Written to be followed after testing is finished. Everything before this point is done:
the rebrand, the Capacitor wrapper, the five native features, the artwork, the Apple
Developer enrolment, both App Store Connect records, and the live privacy and terms pages.
What is left is the release mechanics.*

Read `docs/releasing.md` alongside this — it explains **why** the steps are what they are.
This file is the order to do them in.

---

## Before anything: the one idea that catches everyone

**Pushing to GitHub updates the website, not the iPhone app.**

The web app deploys to GitHub Pages on every push to `main`, in about 20 seconds. The iOS
app bundles a *copy* of that web app, and the copy only changes when you deliberately cut a
build. So you can fix something, push it, watch it go live on the website, and TestFlight
will still be showing the old version — indefinitely, until you run `npm run release`.

If a tester reports a bug you already fixed, this is almost always why.

---

## Phase 0 — one-time setup (do once, then never again)

These are the things that will fail your first build if they are missing. Doing them now
costs ten minutes; discovering them mid-release costs an evening.

### 0.1 Decide who uploads the build

Two options, and you only need one:

| | GitHub Actions (`testflight.yml`) | Your own Mac, in Xcode |
|---|---|---|
| Setup cost | three GitHub secrets, below | none |
| Per-build effort | `npm run release` then `git push --tags` | `npm run release`, `npm run open`, click through Xcode |
| Needs a Mac? | No | Yes |

**Do not run both, and do not run Actions and Xcode Cloud both.** Two pipelines uploading
at the same time race for the same build number, and Apple rejects the loser with an error
message that reads like a code-signing fault, which sends you debugging the wrong thing.

### 0.2 If you chose GitHub Actions: create the API key

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**.
2. Create a **Team key** with the **App Manager** role.
3. Download the `.p8` file. **You get exactly one download.** If you lose it, revoke the key
   and make a new one; there is no way to re-download.
4. Note the **Key ID** (next to the key, like `A1B2C3D4E5`) and the **Issuer ID** (shown
   above the list of keys — it is the same for every key you ever make).

Then in GitHub → the repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, add these three:

| Secret name | What to paste |
|---|---|
| `APP_STORE_CONNECT_KEY_ID` | the Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | the **entire** contents of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

Until these exist the workflow builds successfully and then fails at the upload step. That
is a safe way to find out you forgot, but better to not forget.

### 0.3 Answer export compliance

The first upload asks whether the app uses encryption. GroundWork encrypts backups with
WebCrypto, which is standard, published cryptography, so the honest answer is the
**exemption for standard encryption** — you are not writing your own cipher and you are not
shipping to a restricted country. Answer it once in App Store Connect and it is remembered
for every later build.

Do this for **both** apps if Notes also encrypts anything.

---

## Phase 1 — cut a TestFlight build of GroundWork

This is roadmap step 9, and it is the only remaining step that is genuinely blocking:
Face ID, notification delivery, AirPrint and the automatic backups have only ever run in
the simulator.

1. **Finish and commit your work.** The release script refuses to run on a dirty working
   tree, deliberately — a build you cannot later identify is worse than no build.

   ```bash
   git status          # must be clean
   ```

2. **Cut the build.**

   ```bash
   npm run release
   ```

   For the very first public version, set the marketing version explicitly:

   ```bash
   npm run release -- --version 1.0
   ```

   The script, in this order: refuses a dirty tree → runs `npm run check` (syntax, native
   shell drift, schedule parity with Notes) → bumps the build number → optionally sets the
   version → runs `npm run sync` so the bundled copy of the web app matches what you just
   wrote → commits the bump → creates a tag like `ios-v1.0-b7` → prints it.

   It deliberately does **not** push. The last step before other people see a build is yours.

3. **Push, which is what actually triggers the build.**

   ```bash
   git push && git push --tags
   ```

   The tag is the trigger. A plain `git push` with no tag does nothing to TestFlight.

4. **Watch it.** GitHub → Actions → the `testflight.yml` run. It takes 10–15 minutes, then
   Apple processes the build for a few minutes more before it appears in App Store Connect
   → your app → TestFlight.

   *Building on your own Mac instead:* `npm run release`, then `npm run open`, then in Xcode
   choose **Any iOS Device** as the destination → **Product** → **Archive** → **Distribute
   App** → **TestFlight & App Store**. Same result, no secrets needed.

5. **Add yourself as an internal tester** (App Store Connect → TestFlight → Internal
   Testing) and install via the TestFlight app on the phone.

6. **Write the tester note.** One thing must be said out loud:

   > Your data does not carry across from the web app. The native app is a different origin,
   > so its database starts empty. Export a `.json` backup from the web app first, then
   > restore it here.

---

## Phase 2 — test on the real phone (not the simulator)

These five are specifically the things a simulator cannot prove. Tick them off on hardware.

- [ ] **Face ID** with a real enrolment: enable the lock, background the app, come back —
      it should be locked; check the app switcher shows a blank card, not your records;
      check the grace period behaves (a quick flick away should not demand your face).
- [ ] **Notifications actually firing at 09:00.** Opt in, leave it overnight, see whether
      the reminder arrives — and whether its text matches the live Attention feed.
- [ ] **AirPrint to a real printer.** Generate a receipt, share sheet → Print.
- [ ] **The share sheet's iPad popover anchor**, if an iPad is in scope. On iPad a share
      sheet must point at something; a missing anchor crashes.
- [ ] **Automatic backups**, which are the least-tested feature in the app — they have not
      been verified even in the simulator. Log a session, wait a few seconds, then open the
      **Files** app → **On My iPhone** → **GroundWork** and confirm you can see
      `GroundWork auto-backup.json`. Come back the next day and confirm a dated copy has
      appeared in `auto-backups/`. Then set a passphrase and confirm the file switches to
      `.enc.json` and the plain one is gone.

Also worth doing once, because it is the path every real user takes: **export a backup from
the web app and restore it into the native app**, and check your session count, client
count and tax figures match on both.

Anything you fix here means going back to Phase 1 and cutting another build. That is
normal — expect two or three rounds.

---

## Phase 3 — screenshots

**Never from real client records.** Set up a fresh install with demo data, or restore a
sanitised backup.

- Required size: **6.9" iPhone, 1320 × 2868**. One set is enough; App Store Connect scales
  it down for the smaller size classes.
- Capture on an **iPhone 17 Pro Max simulator** — easier to get pixel-exact than a real
  device, and screenshots are the one thing the simulator is perfectly good for.
- In the simulator, **⌘S** saves a screenshot to the Desktop.

The five, in this order (the order matters — most people only look at the first two):

1. **Home** — the Attention feed with a couple of items showing, plus the money tiles.
2. **Sessions** — the list with paid and unpaid states both visible.
3. **Tax** — the "Now" view. This is the thing that replaces a spreadsheet.
4. **Settings › This iPhone** — Face ID lock and reminders. *This one is your Guideline 4.2
   evidence*, so do not drop it to save time.
5. **A receipt PDF in the share sheet** — the native output, again 4.2 evidence.

---

## Phase 4 — fill in the App Store Connect record

Everything to paste is already drafted in **`docs/app-store-listing.md`**: name, subtitle,
category, age rating, support and privacy URLs, the description, the promotional text, the
keywords and the "What's New" line. Work through that file field by field.

Two fields deserve care because they are the two that get apps rejected:

**The privacy nutrition label.** Answer **"No"** to "Do you or your third-party partners
collect data from this app?" The label then reads **Data Not Collected**, which is both
true and the strongest trust signal on the page. It stops being true the moment anyone adds
an analytics or crash-reporting SDK — Firebase, Sentry, anything. Don't.

**The reviewer notes**, which is where you pre-empt Guideline 4.2 ("this is just a wrapped
website"). Paste the paragraph from `docs/app-store-listing.md` § "The 4.2 answer" — it
lists five things the app does that a browser tab cannot, two of which (`<a download>` and
`window.print()`) are actually broken in a web view, so the native version is not a
convenience, it is the only version where those buttons work.

Also give the reviewer a demo account note saying **no account is needed** — there is no
login, and the app opens straight into usable state. Reviewers reject apps they cannot get
into, and an app with no sign-in confuses the form.

Last read-through before you submit: **`terms.html` section 4, on tax figures.** It is the
paragraph most likely to draw a reviewer question — the app gives estimates, not advice, and
it cannot file for you. It needs to be as plain as the App Store description is.

---

## Phase 5 — submit GroundWork

1. In App Store Connect, attach the build you tested (not a newer untested one).
2. Choose **Manually release this version** rather than automatic. When it is approved you
   want to pick the moment, not find out from a customer.
3. Submit for review.
4. Expect **24–48 hours**, and expect at least one round of feedback on a first submission.
   The two common ones are the privacy label and the 4.2 check — you have already answered
   both, so if it comes back, the reply is usually pointing the reviewer at the answer that
   is already in the notes rather than changing anything.

---

## Phase 6 — GroundWork Notes

Notes is a **separate app in a separate repo**: its own App Store Connect record (already
created, also under Business), its own version numbers, and its own tags (`notes-v*`, where
this app uses `ios-v*`). They share a brand, not a release train — **do not try to keep the
two version numbers in step**, it only creates confusion later about which build has what.

What this repo records about Notes, which you should verify in its own repo before relying
on it:

- It is a **real SwiftUI app**, not a web wrapper, so **Guideline 4.2 does not apply to it
  at all** — no reviewer note needed on that front.
- It is **part-configured for Xcode Cloud** rather than GitHub Actions. If you finish that
  route, it needs a `ci_scripts/ci_post_clone.sh` that installs dependencies before the
  build, because a fresh clone does not contain everything the build needs.
- It implements the same session-schedule prediction rule as this app
  (`SessionPrediction` there, `clientSchedule`/`placeOnSchedule` here). The shared
  specification is `docs/schedule-sync.md` **in the Notes repo**, and
  `npm run check` here asserts the two agree on the same 14 cases. If that check ever
  fails, three things must change together: this app, the Notes app, and the spec.

The steps for Notes are otherwise the same shape as Phases 1–5 above:

1. Cut a build with whatever its release command is, tagged `notes-v*`.
2. TestFlight on the real phone. Its own risk list is different from this app's — it has no
   Face ID lock or backup writer to prove, but it does have whatever its notes storage and
   its schedule import do.
3. **Test the two apps together**, which is the one thing neither app can test alone: use
   Settings › Data & backup › **GroundWork Notes** in this app to write
   `groundwork-schedules.json`, hand it to Notes, and confirm Notes offers the same
   sessions this app predicts. Remember what that file deliberately contains — client
   codes, status, cadence, usual day and time, first session date, and **no names, no fees,
   nothing clinical** — and that nothing comes back the other way.
4. Screenshots from demo data, same rules.
5. Its own listing copy and its own privacy label. If Notes also stores everything
   on-device with no backend, it gets the same **Data Not Collected** answer — but check
   that separately rather than assuming, because it is a different codebase.
6. Submit.

**Order:** submit GroundWork first and let it clear review before you submit Notes. If
review pushes back on something about the brand, the privacy wording or the family
positioning, you would rather fix it once than twice. The two listings should read as one
family — both Business, consistent tone — not as a clinical tool paired with an admin tool.

---

## Phase 7 — after approval

- **Release manually** when you are ready.
- The website and the app are now two audiences. A push to `main` still updates the website
  in 20 seconds; the app users only get changes when you cut a build. Get into the habit of
  cutting one every so often, or the two drift months apart.
- **Promotional text** (the 170-character line) can be edited any time **without a review**.
  The description and screenshots cannot — those need a new version. Use promotional text
  for anything you expect to change.
- Keep the privacy answer honest. Adding any analytics or crash SDK means going back and
  re-answering the questionnaire before the next release.

---

## Worth doing in parallel: Google Play

Google Play has no equivalent of Guideline 4.2 and accepts PWAs directly, wrapped as a
Trusted Web Activity via PWABuilder or Bubblewrap. The developer account is **$25 once**,
not annually. Because the web app already exists and already passes the PWA bar, that route
is realistically days rather than weeks, and it does not block or interact with any of the
iOS work above.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Upload rejected: duplicate build number | Apple refuses to see the same build number twice, ever | `npm run release` again — bumping it is the first thing the script does |
| Workflow builds fine, fails at upload | The three App Store Connect secrets are missing or wrong | Phase 0.2. The private key must include the BEGIN/END lines |
| An error that reads like a signing fault | Two pipelines uploaded at once and raced for a build number | Pick one pipeline. Never run Actions and Xcode Cloud together |
| TestFlight does not have a fix you pushed | Pushing updates the website, not the app | Cut a build. This is the trap at the top of this file |
| `npm run check` fails after a rename | The native layer wraps `download()`, `printReceipt()` and `VIEWS.settings` by name | Restore the name, or update the native block — a rename breaks iOS silently while the web app carries on working |
| Schedule parity check fails | This app and Notes now predict different sessions | Fix **both** apps and the spec, never just one |
| No app icon or launch image in a fresh clone | The asset PNGs are gitignored and regenerated | `npm run sync` before building |
