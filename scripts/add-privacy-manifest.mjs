/* Adds each target's PrivacyInfo.xcprivacy to its Copy Bundle Resources phase.

   Apple requires a privacy manifest in any bundle whose own code calls a "required reason" API
   (UserDefaults, file timestamps, …) - missing one is flagged ITMS-91053 at upload and can stop a
   submission. The iPhone app needs one for GroundWorkRecordsFolder.swift and the watch app for
   SessionTimer.swift. A manifest file that is not in a Resources phase is not in the bundle, and
   nothing at build time says so - which is why `npm run check:drift` asserts the wiring too.

   Idempotent, like add-native-plugin.mjs, and wired into `npm run sync` after the watch target
   exists. Plain text edits rather than the `xcode` package: its addResourceFile() insists on a
   top-level "Resources" group this project does not have.

   The object ids are fixed so a re-run can recognise its own work. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJ = resolve("ios/App/App.xcodeproj/project.pbxproj");

// target name → where the file sits, and the group that lists it
const TARGETS = [
  { target: "App",             group: "App",             path: "PrivacyInfo.xcprivacy",
    file: "ios/App/App/PrivacyInfo.xcprivacy",
    ref: "6D1A0C0E2F00000000000001", build: "6D1A0C0E2F00000000000002" },
  { target: "GroundWorkWatch", group: "GroundWorkWatch", path: "GroundWorkWatch/PrivacyInfo.xcprivacy",
    file: "ios/App/GroundWorkWatch/PrivacyInfo.xcprivacy",
    ref: "6D1A0C0E2F00000000000003", build: "6D1A0C0E2F00000000000004" },
];

/* The watch manifest is wired only while the watch app is in the build (package.json
   "groundwork.watchApp"). Without its target there is no Resources phase to put it in. */
const WATCH_ON = JSON.parse(readFileSync(resolve("package.json"), "utf8")).groundwork?.watchApp === true;
if (!WATCH_ON) TARGETS.splice(TARGETS.findIndex((t) => t.target === "GroundWorkWatch"), 1);

let src = readFileSync(PROJ, "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function insertAfter(anchorRe, text, what) {
  const m = src.match(anchorRe);
  if (!m) throw new Error(`add-privacy-manifest: could not find ${what}`);
  const at = m.index + m[0].length;
  src = src.slice(0, at) + text + src.slice(at);
}

let changed = false;
for (const t of TARGETS) {
  if (!existsSync(resolve(t.file))) throw new Error(`add-privacy-manifest: ${t.file} is missing`);
  if (src.includes(t.ref)) { console.log(`  PrivacyInfo.xcprivacy already in ${t.target}`); continue; }

  // The Resources phase that belongs to THIS target, read from the target's own buildPhases.
  // add-watch-target.mjs writes the watch target's comment with quotes, hence the "?.
  const targetRe = new RegExp(`/\\* "?${esc(t.target)}"? \\*/ = \\{\\s*isa = PBXNativeTarget;[\\s\\S]*?buildPhases = \\(([\\s\\S]*?)\\);`);
  const tm = src.match(targetRe);
  if (!tm) throw new Error(`add-privacy-manifest: no native target named ${t.target}`);
  const phase = (tm[1].match(/([0-9A-F]{24}) \/\* Resources \*\//) || [])[1];
  if (!phase) throw new Error(`add-privacy-manifest: ${t.target} has no Resources phase`);

  insertAfter(/\/\* Begin PBXBuildFile section \*\/\n/,
    `\t\t${t.build} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${t.ref} /* PrivacyInfo.xcprivacy */; };\n`,
    "the PBXBuildFile section");
  insertAfter(/\/\* Begin PBXFileReference section \*\/\n/,
    `\t\t${t.ref} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = "${t.path}"; sourceTree = "<group>"; };\n`,
    "the PBXFileReference section");
  insertAfter(new RegExp(`/\\* ${esc(t.group)} \\*/ = \\{\\s*isa = PBXGroup;\\s*children = \\(\\n`),
    `\t\t\t\t${t.ref} /* PrivacyInfo.xcprivacy */,\n`,
    `the ${t.group} group`);
  insertAfter(new RegExp(`${phase} /\\* Resources \\*/ = \\{\\s*isa = PBXResourcesBuildPhase;[\\s\\S]*?files = \\(\\n`),
    `\t\t\t\t${t.build} /* PrivacyInfo.xcprivacy in Resources */,\n`,
    `the ${t.target} Resources phase`);

  changed = true;
  console.log(`  added PrivacyInfo.xcprivacy to ${t.target}`);
}
if (changed) writeFileSync(PROJ, src);
