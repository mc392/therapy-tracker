/* Cut an iOS release candidate.
 *
 * The web app deploys itself on every push; the iPhone app does not, because it bundles a
 * COPY of the web app that only changes when someone runs a sync and makes a build. This
 * script is that ritual, in the order that matters, so the two ways of getting it wrong —
 * shipping a bundle that predates your changes, and reusing a build number Apple has
 * already seen — are both impossible rather than merely unlikely.
 *
 *   npm run release                 bump the build number, sync, commit, print the tag
 *   npm run release -- --version 1.1   also set the marketing version
 *   npm run release -- --dry-run    say what would happen, change nothing
 *
 * Deliberately does NOT push or tag on your behalf: the last step before other people see
 * a build should be a decision, not a side effect.
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PBXPROJ = resolve("ios/App/App.xcodeproj/project.pbxproj");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const versionArg = (() => {
  const i = args.indexOf("--version");
  return i >= 0 ? args[i + 1] : null;
})();

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
const capture = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { encoding: "utf8" }).trim();

function fail(message, remedy) {
  console.error(`\n  ✗ ${message}`);
  if (remedy) console.error(`    ${remedy}`);
  process.exit(1);
}

/* 1 — a build you cannot identify later is worse than no build at all. */
const dirty = capture("git", ["status", "--porcelain"]);
if (dirty && !dryRun) {
  fail(
    "The working tree has uncommitted changes.",
    "Commit or stash them first — a TestFlight build has to correspond to a commit."
  );
}

/* 2 — the same checks the repo runs everywhere else. Cheap, and catches a renamed
   function that would break a native feature while the web app carries on working. */
console.log("\n  Checking…");
if (!dryRun) run("npm", ["run", "check"]);

/* 3 — the build number. Apple refuses a duplicate outright, and it is the most common
   upload failure by a wide margin. Read the highest value present rather than assuming
   both build configurations agree, then set both. */
const pbx = await readFile(PBXPROJ, "utf8");

const buildNumbers = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) =>
  Number(m[1])
);
if (!buildNumbers.length) fail("No CURRENT_PROJECT_VERSION found in the Xcode project.");
const nextBuild = Math.max(...buildNumbers) + 1;

const marketingVersions = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) =>
  m[1].trim()
);
const currentVersion = marketingVersions[0] ?? "1.0";
const nextVersion = versionArg ?? currentVersion;

if (versionArg && !/^\d+(\.\d+){1,2}$/.test(versionArg)) {
  fail(`"${versionArg}" is not a version number.`, "Use 1.1 or 1.1.2.");
}

let updated = pbx.replace(
  /CURRENT_PROJECT_VERSION = \d+;/g,
  `CURRENT_PROJECT_VERSION = ${nextBuild};`
);
if (versionArg) {
  updated = updated.replace(
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${nextVersion};`
  );
}

const tag = `ios-v${nextVersion}-b${nextBuild}`;

console.log(`\n  Version   ${currentVersion} → ${nextVersion}`);
console.log(`  Build     ${Math.max(...buildNumbers)} → ${nextBuild}`);
console.log(`  Tag       ${tag}`);

if (dryRun) {
  console.log("\n  --dry-run: nothing was changed.\n");
  process.exit(0);
}

await writeFile(PBXPROJ, updated);

/* 4 — rebuild the bundled copy of the web app. Without this the archive would ship
   whatever the last sync left behind, which is the failure this whole script exists to
   make impossible. */
console.log("\n  Syncing the web app into the iOS bundle…");
run("npm", ["run", "sync"]);

/* 5 — commit the bump, so the tag names a commit that actually describes the build. */
run("git", ["add", "ios/App/App.xcodeproj/project.pbxproj"]);
run("git", ["commit", "-m", `Cut iOS build ${nextBuild} (version ${nextVersion})`]);
run("git", ["tag", tag]);

console.log(`
  Done. Nothing has left this machine yet.

  To build it on GitHub and send it to TestFlight:
      git push && git push --tags

  To build it here instead:
      npm run open      then Any iOS Device → Product → Archive
`);
