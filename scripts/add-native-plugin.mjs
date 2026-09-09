/* Adds the app-local Swift sources to the Xcode target.

   `npx cap add ios` regenerates ios/ from Capacitor's template, which knows nothing about
   our own source files. This is idempotent, so it is safe to re-run after a regeneration
   and safe to leave wired into `npm run sync`.

   A file missing from here fails loudly at build time — but only once someone builds, which
   is why `npm run check:drift` asserts the same list. */
import xcode from "xcode";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = ["GroundWorkNativePlugin.swift", "GroundWorkRecordsFolder.swift"];
const PROJ = resolve("ios/App/App.xcodeproj/project.pbxproj");

const proj = xcode.project(PROJ);
proj.parseSync();

let changed = false;
for (const file of FILES) {
  const present = Object.values(proj.pbxFileReferenceSection()).some(
    (r) => r && typeof r === "object" && String(r.path).includes(file)
  );
  if (present) {
    console.log(`  ${file} already in the target`);
    continue;
  }
  // Capacitor's template names this group by path, not by name.
  const groupKey = proj.findPBXGroupKey({ path: "App" });
  if (!groupKey) throw new Error("Could not find the App group in the Xcode project");
  proj.addSourceFile(file, {}, groupKey);
  changed = true;
  console.log(`  added ${file} to the App target`);
}
if (changed) writeFileSync(PROJ, proj.writeSync());
