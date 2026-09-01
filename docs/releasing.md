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

`testflight.yml` needs an App Store Connect API key. In App Store Connect → Users and
Access → Integrations → App Store Connect API, create a **Team key** with the **App
Manager** role, and download the `.p8` (you get exactly one chance to download it).

Then in GitHub → Settings → Secrets and variables → Actions, add three repository secrets:

| Secret | Where it comes from |
|---|---|
| `APP_STORE_CONNECT_KEY_ID` | the key's Key ID, e.g. `A1B2C3D4E5` |
| `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID shown above the key list (same for every key) |
| `APP_STORE_CONNECT_PRIVATE_KEY` | the entire contents of the `.p8`, including the BEGIN/END lines |

Until those exist the workflow will fail at the upload step, having built successfully —
which is a safe way to find out you forgot.

---

## What still needs a human

- **The watch app's bundle identifier**, on the first archive that includes it.
  `uk.co.charlottebloortherapy.groundwork.watchkitapp` has to exist in the developer
  account. CI archives with `-allowProvisioningUpdates` and an App Store Connect key, which
  is normally enough to create it on the spot — but the first build carrying the watch app
  is the moment to find out it is not, so watch that run rather than assuming it.
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
