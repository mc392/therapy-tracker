/* Guards the one property that keeps the PWA and the iOS app the same app:
   TherapyTracker-web/index.html is the only copy of GroundWork in this repo, and the
   native layer *wraps* it rather than reimplementing any of it.

   Drift here would not announce itself. Rename download() and the web app keeps working
   perfectly while the iOS share sheet quietly stops appearing — no error, no failing test,
   just a feature that is gone on one platform. So the seams get asserted explicitly.

   Run with `npm run check:drift`. */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const problems = [];
const fail = (m) => problems.push(m);

/* ---- 1. The web app is where Capacitor thinks it is ---- */
const cfg = JSON.parse(readFileSync("capacitor.config.json", "utf8"));
if (cfg.webDir !== "TherapyTracker-web")
  fail(`capacitor.config.json webDir is "${cfg.webDir}" — it must stay the live web app, not a copy of it`);
if (!existsSync(`${cfg.webDir}/index.html`))
  fail(`${cfg.webDir}/index.html is missing`);

const html = readFileSync("TherapyTracker-web/index.html", "utf8");

/* ---- 2. Every name the native layer reaches for still exists ---- */
const SEAMS = [
  ["function download(",        "the single export choke point the native share sheet wraps"],
  ["function printReceipt(",    "wrapped so receipts become PDFs on iOS"],
  ["function receiptHTML(",     "must keep returning {html,num} — the native PDF path names both"],
  ["function attentionItems(",  "the source of the reminder text"],
  ["VIEWS.settings=",           "wrapped to append the 'This iPhone' settings group"],
  ["function ovToggleRow(",     "reused so the native toggles match the app's own"],
  ["_setGrpOpen",               "the appended settings group folds with the rest using this"],
  ["function el(",              "used to build the native settings card"],
  ["function toast(",           "native paths report back through the app's own toast"],
  ["function gi(",              "icons for the native settings rows"],
  ["async function commit(",    "wrapped so every save also writes an automatic backup to the phone"],
  ["async function backupPayload(", "the one backup envelope — the automatic backup writes this, not its own copy of it"],
  ["function encReady(",        "decides, per write, whether the automatic backup is encrypted"],
  ["async function encPayload(","the encrypted payload the automatic backup writes when a passphrase is set"],
  ["function updateBackupBanner(", "wrapped to add 'an automatic copy is kept on this iPhone' to the nag"],
  /* GroundWork Plus: the native StoreKit block refreshes the shared entitlement cache by name.
     Rename one of these and the PWA carries on perfectly while purchases stop working on iOS. */
  ["function plusActive(",      "the entitlement gate every locked view asks"],
  ["function plusRead(",        "the native StoreKit block reads the cache through this"],
  ["function plusWrite(",       "the native StoreKit block writes the cache through this"],
  ["function plusClear(",       "how a lapsed subscription clears the cache"],
  ["function openPlusSheet(",   "the one paywall; every lock card and the Settings row open it"],
  ["window.GWPlusNative",       "the only seam between shared code and StoreKit — shared code never calls Capacitor directly"],
  ["GW-LICENCE-PUBKEY",         "the marker scripts/issue-licence.mjs --keygen patches the public key into"]
];
for (const [needle, why] of SEAMS)
  if (!html.includes(needle)) fail(`index.html no longer contains \`${needle}\` — ${why}`);

/* ---- 3. The native block is present and still inert on the web ---- */
if (!html.includes("Native iOS shell (Capacitor)"))
  fail("the native iOS block has gone from index.html");
if (!html.includes("CAP.isNativePlatform && CAP.isNativePlatform()"))
  fail("the native block's isNativePlatform() guard is missing — it would now run in the browser too");
if (!html.includes('window.Capacitor.isNativePlatform()')) 
  fail("the service worker registration no longer skips the native shell");

/* ---- 3b. The paywall stayed in the layer it belongs in ----
   docs/monetisation.md §2: the gate lives in views and buttons only. Two ways that can rot,
   both silent — the tax engine would still be correct and the tests would still pass, but a
   lapsed subscriber would lose access to their own records, or a tax test would start failing
   for a reason that has nothing to do with tax. */
const ENGINE_MUST_BE_PURE = [
  "function tyNet(", "function taxLiability(", "function mtdQuarters(",
  "function mtdExport(", "function ledgerBetween("
];
for (const fn of ENGINE_MUST_BE_PURE) {
  const at = html.indexOf(fn);
  if (at < 0) { fail(`index.html no longer contains \`${fn}\` — the drift check cannot see the engine`); continue; }
  // the function body, near enough: up to the next top-level `\nfunction `
  const end = html.indexOf("\nfunction ", at + fn.length);
  if (html.slice(at, end < 0 ? html.length : end).includes("plusLocked("))
    fail(`${fn} calls plusLocked() — the paywall belongs in the view layer, not the tax engine (tests/tax-tests.js calls this directly)`);
}
const DATA_PLANE = ["async function commit(", "async function exportJSON(", "function importJSON("];
for (const fn of DATA_PLANE) {
  const at = html.indexOf(fn);
  if (at < 0) { fail(`index.html no longer contains \`${fn}\``); continue; }
  const end = html.indexOf("\nfunction ", at + fn.length);
  if (html.slice(at, end < 0 ? html.length : end).includes("plusLocked("))
    fail(`${fn} calls plusLocked() — a paywall must never sit between a therapist and her own records`);
}

/* ---- 4. Nothing has committed a second copy of the app ---- */
let tracked = "";
try { tracked = execSync("git ls-files ios/App/App/public", { encoding: "utf8" }); } catch {}
if (tracked.trim())
  fail("ios/App/App/public is tracked by git — it is a generated copy and will go stale; keep it ignored");

const strays = execSync("git ls-files '*index.html'", { encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => f !== "TherapyTracker-web/index.html");
if (strays.length)
  fail(`a second index.html is committed: ${strays.join(", ")} — there must be exactly one`);

/* ---- 5. The custom plugin is compiled AND registered ----
   Two separate failures, and the second is silent: Capacitor 8 registers only what is
   named in packageClassList, so a plugin that compiles perfectly can still be missing
   from Capacitor.Plugins at runtime, with no error anywhere — the web fallback just
   quietly takes over. That cost an hour once; it is asserted now. */
if (existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  if (!pbx.includes("GroundWorkNativePlugin.swift"))
    fail("GroundWorkNativePlugin.swift is not in the Xcode target — run `node scripts/add-native-plugin.mjs`");
}
if (existsSync("ios/App/App/capacitor.config.json")) {
  const gen = JSON.parse(readFileSync("ios/App/App/capacitor.config.json", "utf8"));
  if (!(gen.packageClassList || []).includes("GroundWorkNativePlugin"))
    fail("GroundWorkNativePlugin is not in packageClassList — it will never reach Capacitor.Plugins; run `node scripts/register-native-plugin.mjs`");
}

/* ---- 6. The watch app is in the project, and still points at this app ----
   Two silent failures live here. A regenerated ios/ drops the whole target, and everything
   still builds — you just get an iPhone app with nothing on the wrist. And the watch app's
   companion identifier is a copy of the iOS bundle id: change the appId in
   capacitor.config.json and the watch app stops installing, with the reason buried in a
   device log rather than in a build error. */
const WATCH_DIR = "ios/App/GroundWorkWatch";
const WATCH_SOURCES = [
  "GroundWorkWatchApp.swift",
  "SessionTimer.swift",
  "TimerView.swift",
  "SettingsView.swift"
];
for (const f of [...WATCH_SOURCES, "Info.plist"])
  if (!existsSync(`${WATCH_DIR}/${f}`)) fail(`${WATCH_DIR}/${f} is missing`);

if (existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  if (!pbx.includes("GroundWorkWatch")) {
    fail("the watch target is not in the Xcode project — run `node scripts/add-watch-target.mjs`");
  } else {
    for (const f of WATCH_SOURCES)
      if (!pbx.includes(`${f} in Sources`))
        fail(`${f} is not compiled by the watch target — run \`node scripts/add-watch-target.mjs\``);
    if (!pbx.includes("Embed Watch Content"))
      fail("the watch app is not embedded in the iPhone app — it would never reach a wrist");
    if (!pbx.includes("isa = PBXTargetDependency"))
      fail("App does not depend on the watch target — it would be embedded unbuilt");
  }
}

if (existsSync(`${WATCH_DIR}/Info.plist`)) {
  const plist = readFileSync(`${WATCH_DIR}/Info.plist`, "utf8");
  if (!plist.includes("<key>WKApplication</key>"))
    fail("the watch Info.plist has no WKApplication key — watchOS would not treat it as an app");
  if (!plist.includes(`<string>${cfg.appId}</string>`))
    fail(
      `the watch app's WKCompanionAppBundleIdentifier does not match capacitor.config.json's appId (${cfg.appId}) — it would not install`
    );
}

if (problems.length) {
  console.error("\nDrift between the web app and the iOS wrapper:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("");
  process.exit(1);
}
console.log(`  no drift — ${SEAMS.length} seams intact, one copy of the app, watch app wired in`);
