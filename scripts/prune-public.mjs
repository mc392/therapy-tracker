/* Runs after `cap copy`. Removes files that belong to the web deploy but have no
   business inside a 100MB-limited app bundle. `icon-ideas/` alone is ~6MB of design
   exploration PNGs; the native app reads its icon and splash from the asset catalog.

   This prunes the GENERATED copy at ios/App/App/public only — never TherapyTracker-web,
   which stays the single source of truth. Safe to re-run: the copy is rebuilt every sync. */
import { rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const PUBLIC = resolve("ios/App/App/public");

/* Not shipped natively, and why:
   icon-ideas/  — design sources + preview pages; the app icon/splash come from Assets.xcassets
   sw.js        — service workers do not register on Capacitor's custom scheme, and the
                  bundle is already local, so there is nothing to cache. Registration is
                  skipped on native in index.html; this stops a dead file shipping too. */
const DROP = ["icon-ideas", "sw.js"];

let freed = 0;
for (const rel of DROP) {
  const p = join(PUBLIC, rel);
  try {
    const s = await stat(p);
    freed += s.isDirectory() ? await dirSize(p) : s.size;
    await rm(p, { recursive: true, force: true });
    console.log(`  pruned ${rel}`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

async function dirSize(dir) {
  const { readdir } = await import("node:fs/promises");
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

console.log(`  ${(freed / 1048576).toFixed(1)}MB kept out of the app bundle`);
