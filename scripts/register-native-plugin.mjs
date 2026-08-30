/* Registers the app-local Swift plugin with the Capacitor bridge.

   Capacitor 8 does NOT discover plugins by scanning the ObjC runtime — CapacitorBridge
   .registerPlugins() reads `packageClassList` out of the *generated* ios/App/App/
   capacitor.config.json and calls NSClassFromString on each entry. The CLI builds that
   list from npm dependencies only, so a plugin living in the app target is compiled,
   linked, and never registered: Capacitor.Plugins.GroundWorkNative is simply undefined
   and every call silently takes the web fallback.

   `cap sync` rewrites that file every time, so this re-appends after it. */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "ios/App/App/capacitor.config.json";
const CLASS = "GroundWorkNativePlugin";   // the name given to @objc(...) in the Swift source

const cfg = JSON.parse(readFileSync(FILE, "utf8"));
cfg.packageClassList = cfg.packageClassList || [];

if (cfg.packageClassList.includes(CLASS)) {
  console.log(`  ${CLASS} already registered`);
} else {
  cfg.packageClassList.push(CLASS);
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`  registered ${CLASS} with the Capacitor bridge`);
}
