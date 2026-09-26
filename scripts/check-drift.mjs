/* Guards the one property that keeps the PWA and the iOS app the same app:
   TherapyTracker-web/index.html is the only copy of GroundWork in this repo, and the
   native layer *wraps* it rather than reimplementing any of it.

   Drift here would not announce itself. Rename download() and the web app keeps working
   perfectly while the iOS share sheet quietly stops appearing - no error, no failing test,
   just a feature that is gone on one platform. So the seams get asserted explicitly.

   Run with `npm run check:drift`. */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const problems = [];
const fail = (m) => problems.push(m);

/* ---- 1. The web app is where Capacitor thinks it is ---- */
const cfg = JSON.parse(readFileSync("capacitor.config.json", "utf8"));
if (cfg.webDir !== "TherapyTracker-web")
  fail(`capacitor.config.json webDir is "${cfg.webDir}" - it must stay the live web app, not a copy of it`);
if (!existsSync(`${cfg.webDir}/index.html`))
  fail(`${cfg.webDir}/index.html is missing`);

const html = readFileSync("TherapyTracker-web/index.html", "utf8");

/* ---- 2. Every name the native layer reaches for still exists ---- */
const SEAMS = [
  ["function download(",        "the single export choke point the native share sheet wraps"],
  ["function printReceipt(",    "wrapped so receipts become PDFs on iOS"],
  ["function printDoc(",        "the generic print path - wrapped so a Practice > Reports report becomes a PDF on iOS"],
  ["function receiptHTML(",     "must keep returning {html,num} - the native PDF path names both"],  ["function attentionItems(",  "the source of the reminder text"],
  ["VIEWS.settings=",           "wrapped to append the 'This iPhone' settings group"],
  ["function ovToggleRow(",     "reused so the native toggles match the app's own"],
  ["_setGrpOpen",               "the appended settings group folds with the rest using this"],
  ["function el(",              "used to build the native settings card"],
  ["function toast(",           "native paths report back through the app's own toast"],
  ["function gi(",              "icons for the native settings rows"],
  ["async function commit(",    "wrapped so every save also writes an automatic backup to the phone"],
  ["async function backupPayload(", "the one backup envelope - the automatic backup writes this, not its own copy of it"],
  ["function encReady(",        "decides, per write, whether the automatic backup is encrypted"],
  ["async function encPayload(","the encrypted payload the automatic backup writes when a passphrase is set"],
  ["function updateBackupBanner(", "wrapped to say where the copies are going"],
  /* The records folder: the iOS app writes every save into a folder the user picked, and reads
     it back through the app's own restore. Rename either of these and the PWA is perfect while
     an iPhone quietly stops saving into iCloud Drive - the failure this whole check exists for. */
  ["async function importFromText(", "the records folder restores through this - importJSON() minus the file input"],
  ["function markBackedUp(",    "an iCloud records folder answers the manual-backup nag through this"],
  ["function sheetPromise(",    "every question the records folder asks is one of these"],
  ["function encPromptSetup(",  "offered after restoring an encrypted folder file onto a phone with no passphrase"],
  /* GroundWork Plus: the native StoreKit block refreshes the shared entitlement cache by name.
     Rename one of these and the PWA carries on perfectly while purchases stop working on iOS. */
  ["function plusActive(",      "the entitlement gate every locked view asks"],
  ["function plusTier(",        "which tier this device holds - the whole two-tier gate resolves through it"],
  ["const FEATURE_TIER=",       "the feature→tier split; the one place that decides what the subscription buys"],
  ["function taxYearPaid(",     "the tax year gate - Pro plus that year, and the one place both are required together"],
  ["function taxPackThrough(",  "the tax year watermark every masked figure is decided by"],
  ["function taxPackGrant(",    "the only writer of the watermark, and the only thing stopping a purchase being lost"],
  ["const TAX_PACK_KEY=",       "the tax year cache, deliberately separate from tt_plus so a lapse cannot wipe a non-consumable"],
  ["function plusRead(",        "the native StoreKit block reads the cache through this"],
  ["function plusWrite(",       "the native StoreKit block writes the cache through this"],
  ["function plusClear(",       "how a lapsed subscription clears the cache"],
  ["function openPlusSheet(",   "the one paywall; every lock card and the Settings row open it"],
  ["window.GWPlusNative",       "the only seam between shared code and StoreKit - shared code never calls Capacitor directly"],
  ["GW-LICENCE-PUBKEY",         "the marker scripts/issue-licence.mjs --keygen patches the public key into"]
];
for (const [needle, why] of SEAMS)
  if (!html.includes(needle)) fail(`index.html no longer contains \`${needle}\` - ${why}`);

/* ---- 3. The native block is present and still inert on the web ---- */
/* The records folder is JS in the native block plus Swift behind it, and the two halves can
   drift apart without anything failing to build: a method the web layer calls that the plugin
   does not declare simply rejects at runtime, on a phone, silently falling back to the copy in
   the app's own Documents folder. */
const FOLDER_CALLS = ["folderInfo", "folderPick", "folderForget", "folderWrite", "folderRead",
                      "folderList", "folderDelete"];
if (existsSync("ios/App/App/GroundWorkRecordsFolder.swift")) {
  const plugin = readFileSync("ios/App/App/GroundWorkNativePlugin.swift", "utf8");
  for (const m of FOLDER_CALLS) {
    if (!plugin.includes(`CAPPluginMethod(name: "${m}"`))
      fail(`GroundWorkNativePlugin does not declare \`${m}\` - Capacitor would reject the call at runtime, on a phone, with the web layer none the wiser`);
    if (!plugin.includes(`@objc func ${m}(`))
      fail(`GroundWorkNativePlugin declares \`${m}\` but does not implement it`);
    if (!html.includes(`GW.${m}(`))
      fail(`index.html no longer calls \`GW.${m}()\` - the native records folder has a method nothing reaches`);
  }
} else {
  fail("ios/App/App/GroundWorkRecordsFolder.swift is missing - the records folder has no native half");
}

/* The calendar export: an .ics is handed to iOS's own event screen rather than the share sheet,
   and this is the same silent-failure shape again. Drop the Swift method and the web layer's
   guard quietly falls back to the share sheet - which still works, so nothing fails, and the
   feature has simply reverted to the worse behaviour it was built to replace. */
if (existsSync("ios/App/App/GroundWorkNativePlugin.swift")) {
  const plugin = readFileSync("ios/App/App/GroundWorkNativePlugin.swift", "utf8");
  if (!plugin.includes('CAPPluginMethod(name: "openCalendarFile"'))
    fail("GroundWorkNativePlugin does not declare `openCalendarFile` - an .ics would silently go back to the share sheet on iOS, which is the dead end the method exists to replace");
  if (!plugin.includes("@objc func openCalendarFile("))
    fail("GroundWorkNativePlugin declares `openCalendarFile` but does not implement it");
  if (!html.includes("GW.openCalendarFile("))
    fail("index.html no longer calls `GW.openCalendarFile()` - the native calendar screen has a method nothing reaches");
  if (!html.includes("function icsFile("))
    fail("index.html no longer builds an .ics (`icsFile`) - the native calendar screen has nothing to present");
}

/* Writing sessions into the phone's calendar. Two silent failures guarded here, and the second
   one is not silent at all - it is a crash. */
if (existsSync("ios/App/App/GroundWorkNativePlugin.swift")) {
  const plugin = readFileSync("ios/App/App/GroundWorkNativePlugin.swift", "utf8");
  for (const m of ["calendarList", "calendarAdd"]) {
    if (!plugin.includes(`CAPPluginMethod(name: "${m}"`))
      fail(`GroundWorkNativePlugin does not declare \`${m}\` - the calendar write would reject at runtime and iOS would drop back to handing over a file, which is the dead end EventKit replaced`);
    if (!plugin.includes(`@objc func ${m}(`))
      fail(`GroundWorkNativePlugin declares \`${m}\` but does not implement it`);
    if (!html.includes(`GW.${m}(`))
      fail(`index.html no longer calls \`GW.${m}()\` - the native calendar bridge has a method nothing reaches`);
  }
  /* The Settings card asks where access stands; it must never ask FOR it. A permission sheet
     raised by opening a settings page is what App Review Guideline 5.1.1 calls a request with no
     context, and it shipped that way once already. */
  if (!html.includes("ask:false"))
    fail("index.html no longer passes `ask:false` to calendarList - painting the Settings card would raise the calendar permission prompt on a screen nobody asked a calendar question on");
  if (!plugin.includes('call.getBool("ask"'))
    fail("GroundWorkNativePlugin no longer honours the `ask` flag on calendarList - the web layer's `ask:false` would silently prompt anyway");
  if (!plugin.includes("func calendarAuthStatus("))
    fail("GroundWorkNativePlugin no longer has calendarAuthStatus() - reporting access without requesting it is the whole point of that flag");
  if (!plugin.includes("import EventKit"))
    fail("GroundWorkNativePlugin no longer imports EventKit - the calendar methods cannot compile without it");
  if (!html.includes("window.GWCalendarNative"))
    fail("index.html no longer declares `window.GWCalendarNative` - the shared calendar code's only seam to the native writer");
  /* iOS does not fail politely here: asking for calendar access with no usage string in the
     Info.plist terminates the app. Both keys are needed - the deployment target is iOS 15, and
     iOS 17 reads the full-access one instead of the legacy one. */
  const plist = readFileSync("ios/App/App/Info.plist", "utf8");
  /* White clock and battery over the green header - Capacitor reads this key at start-up. Without
     it iOS draws them black, and on iOS 26 adds a pale wash behind them to make black legible. */
  if (!plist.includes("<string>UIStatusBarStyleLightContent</string>"))
    fail("Info.plist no longer sets UIStatusBarStyle to UIStatusBarStyleLightContent - the status bar would draw black over the green header");
  for (const k of ["NSCalendarsFullAccessUsageDescription", "NSCalendarsUsageDescription"])
    if (!plist.includes(k))
      fail(`Info.plist is missing ${k} - iOS terminates the app when calendar access is requested without it`);
}

/* Is the watch app in this build? One switch, in package.json - see section 6. */
const WATCH_ON = JSON.parse(readFileSync("package.json", "utf8")).groundwork?.watchApp === true;

/* Export compliance and the privacy manifests. Neither fails a build - both fail at App Store
   Connect, after the upload: without ITSAppUsesNonExemptEncryption every build sits on "Missing
   Compliance" until somebody answers the questionnaire by hand, and a bundle whose code reads a
   required-reason API (UserDefaults, file dates) with no PrivacyInfo.xcprivacy is flagged
   ITMS-91053. A manifest that is not in the target's Resources phase is not in the bundle. The
   encryption answer is honest because the only cryptography is WebCrypto, which is the operating
   system's own - see docs/app-store-launch-guide.md. */
if (existsSync("ios/App/App/Info.plist")) {
  const plist = readFileSync("ios/App/App/Info.plist", "utf8");
  if (!/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist))
    fail("Info.plist no longer declares ITSAppUsesNonExemptEncryption = NO - every build would stop on Missing Compliance");
}
if (existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  const manifests = [["ios/App/App/PrivacyInfo.xcprivacy", "6D1A0C0E2F00000000000002"]];
  if (WATCH_ON) manifests.push(["ios/App/GroundWorkWatch/PrivacyInfo.xcprivacy", "6D1A0C0E2F00000000000004"]);
  for (const [file, ref] of manifests) {
    if (!existsSync(file)) fail(`${file} is missing - Apple flags a bundle that reads required-reason APIs without one`);
    else if (!pbx.includes(`${ref} /* PrivacyInfo.xcprivacy in Resources */,`))
      fail(`${file} is not in its target's Resources phase - run node scripts/add-privacy-manifest.mjs`);
  }
}

/* Haptics: the same silent-failure shape, at its mildest - drop the Swift method and the iPhone
   simply stops tapping, with nothing anywhere to say so. */
if (existsSync("ios/App/App/GroundWorkNativePlugin.swift")) {
  const plugin = readFileSync("ios/App/App/GroundWorkNativePlugin.swift", "utf8");
  if (!plugin.includes('CAPPluginMethod(name: "haptic"'))
    fail("GroundWorkNativePlugin does not declare `haptic` - every tap the web layer asks for would be rejected, silently, on a phone");
  if (!plugin.includes("@objc func haptic("))
    fail("GroundWorkNativePlugin declares `haptic` but does not implement it");
  if (!html.includes("GW.haptic(") || !html.includes("window.GWHapticsNative"))
    fail("index.html no longer reaches `GW.haptic()` through `window.GWHapticsNative` - the shared haptic() helper's only seam");
  if (!html.includes("function haptic("))
    fail("index.html no longer defines haptic() - the native method has nothing calling it");
}

/* GroundWork Plus / Pro: the same silent-failure shape as the records folder above, and now
   across two products. A method the web layer calls that the plugin does not declare rejects at
   runtime, on a phone, and the paywall just says the subscription is unavailable. */
const PLUS_CALLS = ["plusProducts", "plusStatus", "plusPurchase", "taxPurchase", "plusRestore",
                    "plusRedeem", "plusManage"];
if (existsSync("ios/App/App/GroundWorkNativePlugin.swift")) {
  const plugin = readFileSync("ios/App/App/GroundWorkNativePlugin.swift", "utf8");
  for (const m of PLUS_CALLS) {
    if (!plugin.includes(`CAPPluginMethod(name: "${m}"`))
      fail(`GroundWorkNativePlugin does not declare \`${m}\` - StoreKit would reject the call at runtime and the paywall would report the subscription unavailable`);
    if (!plugin.includes(`@objc func ${m}(`))
      fail(`GroundWorkNativePlugin declares \`${m}\` but does not implement it`);
    if (!html.includes(`GW.${m}(`))
      fail(`index.html no longer calls \`GW.${m}()\` - the native subscription bridge has a method nothing reaches`);
  }
  /* The one that costs real money if it rots: the ORIGINAL product id has always entitled
     everything, so it must keep mapping to the top tier. Re-pointing it at the cheaper one would
     take the tax engine off every existing subscriber, silently, on update. */
  const legacy = plugin.split("\n").find((l) => l.includes("groundwork.plus.annual"));
  if (!legacy) fail("the original subscription product id has gone from GroundWorkNativePlugin - an id can never be reused, and every existing subscriber holds that one");
  else if (!/"pro(\.legacy)?"\s*:/.test(legacy))
    fail("the original product id no longer maps to the `pro` tier - every existing subscriber bought everything, and pointing that id at anything smaller takes features off them on update");
  /* The tax years are sold as non-consumables and the id prefix is what the year is parsed out of
     at both ends. A change to it orphans every purchase already made, silently: the store still
     owns them, and the app stops recognising them. */
  if (!plugin.includes('taxYearPrefix = "uk.co.charlottebloortherapy.groundwork.taxyear."'))
    fail("the tax year product id prefix has changed - every tax year already bought would stop being recognised, and the purchases cannot be re-issued");
  if (!html.includes('TAX_PACK_PREFIX="uk.co.charlottebloortherapy.groundwork.taxyear."'))
    fail("index.html's tax year product id prefix no longer matches the Swift one - the two halves would disagree about what a purchase was for");
}

if (!html.includes("Native iOS shell (Capacitor)"))
  fail("the native iOS block has gone from index.html");
if (!html.includes("CAP.isNativePlatform && CAP.isNativePlatform()"))
  fail("the native block's isNativePlatform() guard is missing - it would now run in the browser too");
if (!html.includes('window.Capacitor.isNativePlatform()')) 
  fail("the service worker registration no longer skips the native shell");

/* ---- 3b. The paywall stayed in the layer it belongs in ----
   docs/monetisation.md §2: the gate lives in views and buttons only. Two ways that can rot,
   both silent - the tax engine would still be correct and the tests would still pass, but a
   lapsed subscriber would lose access to their own records, or a tax test would start failing
   for a reason that has nothing to do with tax. */
const ENGINE_MUST_BE_PURE = [
  "function tyNet(", "function taxLiability(", "function mtdQuarters(",
  "function mtdExport(", "function ledgerBetween(", "function taxForYear(",
  "function taxPot(", "function taxSchedule(", "function taxTimeline(",
  /* ukTax gained employment-income stacking in Sep 2026 and reads settings for it, exactly as it
     already reads the region and the loan plan. It is still called straight from
     tests/tax-tests.js, so it is still held to the same rule. */
  "function ukTax(", "function ukBands("
];
for (const fn of ENGINE_MUST_BE_PURE) {
  const at = html.indexOf(fn);
  if (at < 0) { fail(`index.html no longer contains \`${fn}\` - the drift check cannot see the engine`); continue; }
  // the function body, near enough: up to the next top-level `\nfunction `
  const end = html.indexOf("\nfunction ", at + fn.length);
  const body = html.slice(at, end < 0 ? html.length : end);
  if (body.includes("plusLocked("))
    fail(`${fn} calls plusLocked() - the paywall belongs in the view layer, not the tax engine (tests/tax-tests.js calls this directly)`);
  /* Same rule, second axis. A tax year is bought per year, and putting that test inside the engine
     would mean tests/tax-tests.js started depending on what this device has paid for. The view
     decides whether to CALL the engine; the engine never decides whether to answer. */
  if (body.includes("taxYearPaid(") || body.includes("taxYearLocked("))
    fail(`${fn} calls taxYearPaid()/taxYearLocked() - the tax year gate belongs in the view layer, not the engine`);
}
const DATA_PLANE = ["async function commit(", "async function exportJSON(", "function importJSON(",
  "async function importFromText(",
  /* Who pays for a client's work decides whether the app asks for money at all. A billing state
     reaching into it would mean a lapsed subscriber's salaried caseload turning back into a list
     of debts she does not owe. */
  "function sessionEarns(", "function payerOf("];
for (const fn of DATA_PLANE) {
  const at = html.indexOf(fn);
  if (at < 0) { fail(`index.html no longer contains \`${fn}\``); continue; }
  const end = html.indexOf("\nfunction ", at + fn.length);
  const body = html.slice(at, end < 0 ? html.length : end);
  for (const gate of ["plusLocked(", "taxYearPaid(", "taxYearLocked("])
    if (body.includes(gate))
      fail(`${fn} calls ${gate}) - a paywall must never sit between a therapist and her own records`);
}

/* ---- 4. Nothing has committed a second copy of the app ---- */
let tracked = "";
try { tracked = execSync("git ls-files ios/App/App/public", { encoding: "utf8" }); } catch {}
if (tracked.trim())
  fail("ios/App/App/public is tracked by git - it is a generated copy and will go stale; keep it ignored");

const strays = execSync("git ls-files '*index.html'", { encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => f !== "TherapyTracker-web/index.html");
if (strays.length)
  fail(`a second index.html is committed: ${strays.join(", ")} - there must be exactly one`);

/* ---- 5. The custom plugin is compiled AND registered ----
   Two separate failures, and the second is silent: Capacitor 8 registers only what is
   named in packageClassList, so a plugin that compiles perfectly can still be missing
   from Capacitor.Plugins at runtime, with no error anywhere - the web fallback just
   quietly takes over. That cost an hour once; it is asserted now. */
if (existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  for (const f of ["GroundWorkNativePlugin.swift", "GroundWorkRecordsFolder.swift"])
    if (!pbx.includes(f))
      fail(`${f} is not in the Xcode target - run \`node scripts/add-native-plugin.mjs\``);
}
if (existsSync("ios/App/App/capacitor.config.json")) {
  const gen = JSON.parse(readFileSync("ios/App/App/capacitor.config.json", "utf8"));
  if (!(gen.packageClassList || []).includes("GroundWorkNativePlugin"))
    fail("GroundWorkNativePlugin is not in packageClassList - it will never reach Capacitor.Plugins; run `node scripts/register-native-plugin.mjs`");
}

/* ---- 6. The watch app is in the project, and still points at this app ----
   Two silent failures live here. A regenerated ios/ drops the whole target, and everything
   still builds - you just get an iPhone app with nothing on the wrist. And the watch app's
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

/* iPhone, or iPhone + iPad: package.json "groundwork.ipad" decides, and the project must agree.
   TARGETED_DEVICE_FAMILY 1 is iPhone only; "1,2" adds iPad. Apple NEVER lets a shipped app drop
   iPad support again, so this is the one setting here that cannot be walked back once released -
   which is why it is a written decision and not whatever the Xcode template happened to say.
   iPad was chosen for 1.0 on 26 Sep 2026: the layout is the min-width:900px sidebar design, the
   native share sheet and folder picker already anchor their popovers, and the native block says
   "iPad" on an iPad (npm run test:ipad). Turning it on needs iPad 13" screenshots as well. */
if (existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const IPAD_ON = JSON.parse(readFileSync("package.json", "utf8")).groundwork?.ipad === true;
  const want = IPAD_ON ? "1,2" : "1";
  const fam = [...readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8")
    .matchAll(/TARGETED_DEVICE_FAMILY = "?([\d,]+)"?;/g)].map((m) => m[1]).filter((f) => f !== "4");
  if (!fam.length || fam.some((f) => f !== want))
    fail(`the app targets device family ${fam.join(" / ") || "(none)"} but package.json groundwork.ipad is ${IPAD_ON} - set TARGETED_DEVICE_FAMILY = ${IPAD_ON ? '"1,2"' : "1"}`);
}

/* Held back from 1.0 (package.json "groundwork.watchApp": false): then the target must be ABSENT.
   Shipping it would make App Store Connect demand Apple Watch screenshots, and a watch app nobody
   has tried on a wrist is a rejection risk - so a target that crept back in is the failure. The
   Swift stays, and the checks on it below still run, so it is ready to switch back on. */
if (!WATCH_ON && existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  if (/GroundWorkWatch|Embed Watch Content|watchkitapp/.test(pbx))
    fail("the watch app is in the Xcode project but package.json groundwork.watchApp is false - it would ship; remove the target or switch it on deliberately");
}
if (WATCH_ON && existsSync("ios/App/App.xcodeproj/project.pbxproj")) {
  const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  if (!pbx.includes("GroundWorkWatch")) {
    fail("the watch target is not in the Xcode project - run `node scripts/add-watch-target.mjs`");
  } else {
    for (const f of WATCH_SOURCES)
      if (!pbx.includes(`${f} in Sources`))
        fail(`${f} is not compiled by the watch target - run \`node scripts/add-watch-target.mjs\``);
    if (!pbx.includes("Embed Watch Content"))
      fail("the watch app is not embedded in the iPhone app - it would never reach a wrist");
    if (!pbx.includes("isa = PBXTargetDependency"))
      fail("App does not depend on the watch target - it would be embedded unbuilt");
  }
}

if (existsSync(`${WATCH_DIR}/Info.plist`)) {
  const plist = readFileSync(`${WATCH_DIR}/Info.plist`, "utf8");
  if (!plist.includes("<key>WKApplication</key>"))
    fail("the watch Info.plist has no WKApplication key - watchOS would not treat it as an app");
  if (!plist.includes(`<string>${cfg.appId}</string>`))
    fail(
      `the watch app's WKCompanionAppBundleIdentifier does not match capacitor.config.json's appId (${cfg.appId}) - it would not install`
    );
}

if (problems.length) {
  console.error("\nDrift between the web app and the iOS wrapper:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("");
  process.exit(1);
}
console.log(`  no drift - ${SEAMS.length} seams intact, one copy of the app, ${WATCH_ON ? "watch app wired in" : "watch app held back from the build"}`);
