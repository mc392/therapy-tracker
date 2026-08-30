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
  ["function gi(",              "icons for the native settings rows"]
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

if (problems.length) {
  console.error("\nDrift between the web app and the iOS wrapper:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("");
  process.exit(1);
}
console.log(`  no drift — ${SEAMS.length} seams intact, one copy of the app`);
