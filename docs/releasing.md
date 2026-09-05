# Releasing GroundWork — the two tracks, and how to keep them level

**The thing to internalise: pushing to GitHub updates the website, not the iPhone app.**

A change to `TherapyTracker-web/index.html` travels down two completely separate roads:

| | Web / PWA | iOS app (TestFlight → App Store) |
|---|---|---|
| Trigger | any push to `main` | a version tag, or a manual run |
| Mechanism | `.github/workflows/deploy.yml` → GitHub Pages | `.github/workflows/testflight.yml` → App Store Connect |
| Time | ~20 seconds | ~10–15 minutes, plus Apple's processing |
| Who sees it | anyone on the live URL, on next open | TestFlight testers, once the build finishes processing |

The web app is *served* from `TherapyTracker-web/`. The iOS app **bundles a copy** of it at
`ios/App/App/public/`, rebuilt by `npm run sync` and gitignored. So an iPhone build only
contains the web changes that existed at the moment someone last ran a sync **and made a
new build**. Nothing about pushing to GitHub does either.

This is the trap: you fix something, push, confirm it live on the website, and reasonably
assume TestFlight has it. It does not, and it will not until you cut a build.

---

## The normal loop (most days)

Work, commit, push. The website updates itself. Do nothing else.

TestFlight goes stale in the meantime, and that is fine — testers are testing a *release
candidate*, not your working tree.

## Cutting an iOS build (when testers should see the changes)

One command, then one push:

```bash
npm run release
```

`scripts/release-ios.mjs` does the things that are easy to forget, in the order that
matters:

1. refuses to run on a dirty working tree (a build you cannot identify later is worse
   than no build);
2. runs `npm run check` — syntax, native-shell drift, schedule parity;
3. bumps `CURRENT_PROJECT_VERSION` (the build number). **Apple rejects a duplicate build
   number outright**, and it is the single most common upload failure;
4. optionally sets `MARKETING_VERSION` with `--version 1.1`;
5. runs `npm run sync`, so the bundled copy of the web app matches what you just wrote;
6. commits the version bump and tells you the tag to push.

Then:

```bash
git push && git push --tags
```

The tag (`ios-v1.0-b7`) is what triggers `testflight.yml`. It builds, signs, uploads, and
the build appears in App Store Connect a few minutes later.

**To build from your own Mac instead** (no secrets needed, and the fallback when the
workflow misbehaves): run `npm run release`, then `npm run open`, then in Xcode choose
*Any iOS Device* → Product → Archive → Distribute App → TestFlight & App Store.

---

## If you would rather use Xcode Cloud

Apple's own CI is the alternative to the workflow above, and GroundWork Notes is already
part-configured for it. It signs without you storing an API key, at the cost of living in
Apple's UI rather than in a diff. **Do not run both**: two pipelines uploading at once
means two builds racing for one build number, and Apple rejects the loser with an error
that reads like a signing fault.

If you go that way here, delete `.github/workflows/testflight.yml` and keep `npm run
release` — the build-number bump and the sync are still exactly what Xcode Cloud needs to
find in the commit it builds. Note it would need a `ci_scripts/ci_post_clone.sh` that runs
`npm ci && npm run sync`, for the same reason Notes needs one: the bundled web app is
gitignored, so a fresh clone has nothing to build.

## One-time setup for the automated upload

`testflight.yml` needs an App Store Connect API key.

1. App Store Connect → **Users and Access** → **Integrations** (older accounts label this
   tab **Keys**) → **App Store Connect API** → **Team Keys**. A *team* key, not an
   individual one.
2. **+** → name it something like `GitHub Actions TestFlight`.
3. Access: **Admin**. **Not App Manager**, which this document said until a real build
   proved otherwise: App Manager can upload a build, but it cannot create the *iOS
   Distribution certificate* that the export step needs, and CI has no certificate of its
   own the way your Mac's Keychain does. The failure is `exportArchive Cloud signing
   permission error` alongside `No signing certificate "iOS Distribution" found`, ten
   minutes in, after a perfectly good archive.
4. **Download API Key** → `AuthKey_<KEYID>.p8`. **One download, ever.** Keep it outside the
   repo; if it is lost, revoke the key and make another.

Off that page you need three values. Add them in GitHub → the repository's **Settings** →
**Secrets and variables** → **Actions** → **New repository secret** — the *Secrets* tab,
not *Variables*, and repository secrets, not environment ones, because the job declares no
environment and would not see those:

| Secret | Where it comes from |
|---|---|
| `APP_STORE_CONNECT_KEY_ID` | the key's Key ID, e.g. `A1B2C3D4E5` |
| `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID shown above the key list (same for every key) |
| `APP_STORE_CONNECT_PRIVATE_KEY` | the entire contents of the `.p8`, including the BEGIN/END lines |

For the third, `cat ~/Downloads/AuthKey_*.p8 | pbcopy` is the least error-prone route —
the `-----BEGIN`/`-----END` lines are part of the key, and it takes no quotes around it.

Missing secrets fail in the first seconds rather than wasting a runner: the workflow checks
`KEY_ID` and `PRIVATE_KEY` itself and stops. **It does not check `ISSUER_ID`**, so forget
that one and the run sails past and dies at the archive instead.

## One-time setup for the signing certificate

Every runner starts with an empty keychain, so without this, `-allowProvisioningUpdates`
quietly **mints a brand-new certificate on every single run** instead of reusing one — and
Apple caps how many can exist at once. Enough runs and archiving fails outright with
`Choose a certificate to revoke. Your account has reached the maximum number of
certificates.` Importing the same certificate every run avoids that entirely.

This part needs a Mac with Xcode, once:

1. Open **Keychain Access** (Spotlight → type it → Enter).
2. Menu bar → **Keychain Access** → **Certificate Assistant** → **Request a Certificate
   from a Certificate Authority…**. Fill in your email and name, leave "Saved to disk"
   selected, and save the `.certSigningRequest` file somewhere you can find it (e.g. the
   Desktop).
3. Go to **developer.apple.com/account** → **Certificates, Identifiers & Profiles** →
   **Certificates** → **+**.
4. Choose **Apple Development** (this is what the archive step actually asks for — the
   error names "iOS App Development" profiles specifically), then Continue.
5. Upload the `.certSigningRequest` file from step 2, then Continue, then **Download** the
   resulting `.cer` file.
6. Double-click the downloaded `.cer` file — it adds the certificate to Keychain Access,
   paired with the private key your request in step 2 created (that pairing only exists on
   this Mac, which is why steps 2–3 must happen in that order and on the same machine).
7. In Keychain Access, find the new certificate under the **login** keychain →
   **My Certificates**. Click the disclosure triangle next to it to confirm a private key
   sits underneath it — no key, and the export in the next step will fail silently useless.
8. Right-click the certificate (not just the key) → **Export "Apple Development: …"…**.
   Save it as `ios_signing.p12` somewhere temporary, and set an export password when
   prompted — anything memorable, you'll need it once more in step 10.
9. Convert the file to text so it can go into a GitHub secret:
   ```bash
   base64 -i ~/Desktop/ios_signing.p12 | pbcopy
   ```
   This copies the result straight to your clipboard.
10. In GitHub → this repository's **Settings** → **Secrets and variables** → **Actions** →
    **New repository secret**, add two secrets:

    | Secret | Value |
    |---|---|
    | `IOS_SIGNING_CERTIFICATE_P12` | paste the clipboard from step 9 |
    | `IOS_SIGNING_CERTIFICATE_PASSWORD` | the export password you set in step 8 |
11. Delete `ios_signing.p12` from your Desktop (or wherever you saved it) — the secret in
    GitHub is now the only copy that needs to exist, and the private key stays here.

The certificate is valid for a year. When it expires, `-allowProvisioningUpdates` will
start failing to sign again — repeat steps 1–11 with a fresh certificate; there's no
renewal flow, since a `.p12` export can't be renewed in place.

## What the runner has to match

Two versions in `testflight.yml` are not decoration, and both were found the hard way on
the first runs this pipeline ever had:

- **`node-version` must satisfy the Capacitor CLI's `engines`** — 22 or above for Capacitor
  8. Below it, `npm ci` merely warns and the sync step dies with `[fatal] The Capacitor CLI
  requires NodeJS >=22.0.0`. That step is the one that rebuilds the bundled copy of the web
  app, so a build that skips it is precisely the stale bundle this pipeline exists to
  prevent.
- **`runs-on` must carry an Xcode that clears two separate floors.**

  *Capacitor's*, or it will not compile: `macos-14` gives Xcode 15.4, which cannot build
  Capacitor 8's Swift runtime. That failure does not say so — it reads as an API mismatch
  (`CAPPluginCall has no member 'reject'`, `PluginConfig has no member 'getString'`,
  `incorrect argument label (have 'fromHex:', expected 'argb:')`) and sends you hunting for
  a plugin version that is not actually wrong. The tell is `ion-ios-filesystem` failing in
  the same run: it touches none of that API, so only the toolchain explains both.

  *Apple's*, or it will not upload — and this one is higher, moves on Apple's schedule
  rather than ours, and is only enforced at the very last step, after ten minutes of
  perfectly good archiving:

  > Validation failed (409) SDK version issue. This app was built with the iOS 18.5 SDK.
  > All iOS and iPadOS apps must be built with the iOS 26 SDK or later, included in Xcode
  > 26 or later, in order to be uploaded to App Store Connect or submitted for
  > distribution.

  That is what retired `macos-15` here. **When a build that has always worked suddenly
  fails at the upload step with a 409, this is the first thing to check** — Apple raises
  the floor roughly annually, and nothing in this repo changes when they do. The job
  selects the newest Xcode on the image and prints it, along with the iOS SDKs available,
  before doing anything else.

---

## What still needs a human

- **The watch app's bundle identifier**, on the first archive that includes it.
  `uk.co.charlottebloortherapy.groundwork.watchkitapp` has to exist in the developer
  account. CI archives with `-allowProvisioningUpdates` and an App Store Connect key, which
  is normally enough to create it on the spot — but the first build carrying the watch app
  is the moment to find out it is not, so watch that run rather than assuming it. It was
  not: the export step reported `No profiles for
  'uk.co.charlottebloortherapy.groundwork.watchkitapp' were found`. That run's key was only
  App Manager, so it may simply have lacked the permission to register one; if an Admin key
  still cannot, add the identifier by hand at developer.apple.com → Certificates,
  Identifiers & Profiles → Identifiers → **+** → App IDs → App.
  The build number needs no attention: the archive step passes `CURRENT_PROJECT_VERSION`
  on the command line, which applies to every target at once, and `npm run release` bumps
  both targets by regex. A watch app whose build number differs from its host is rejected
  at upload.
- **Export compliance.** First upload asks whether the app uses encryption. GroundWork
  encrypts backups with WebCrypto, which is standard cryptography, so the honest answer
  is the exemption for standard encryption — answer it in App Store Connect once and it
  is remembered for later builds.
- **Screenshots**, from demo data, never from real records.
- **Submitting for review** — deliberately not automated. A build reaching TestFlight
  should never be able to reach the public without you deciding it should.

## Keeping the two apps' versions apart

GroundWork and GroundWork Notes are separate apps with separate records, separate version
numbers and separate tags (`ios-v*` here, `notes-v*` there). They share a brand, not a
release train — do not try to keep the numbers in step.
