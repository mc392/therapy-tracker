/* Adds the app-local Swift plugin to the Xcode target.

   `npx cap add ios` regenerates ios/ from Capacitor's template, which knows nothing about
   our own source files. This is idempotent, so it is safe to re-run after a regeneration
   and safe to leave wired into `npm run sync`. */
import xcode from "xcode";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = "GroundWorkNativePlugin.swift";
const PROJ = resolve("ios/App/App.xcodeproj/project.pbxproj");

const proj = xcode.project(PROJ);
proj.parseSync();

const present = Object.values(proj.pbxFileReferenceSection()).some(
  (r) => r && typeof r === "object" && String(r.path).includes(FILE)
);

if (present) {
  console.log(`  ${FILE} already in the target`);
} else {
  // Capacitor's template names this group by path, not by name.
  const groupKey = proj.findPBXGroupKey({ path: "App" });
  if (!groupKey) throw new Error("Could not find the App group in the Xcode project");
  proj.addSourceFile(FILE, {}, groupKey);
  writeFileSync(PROJ, proj.writeSync());
  console.log(`  added ${FILE} to the App target`);
}
