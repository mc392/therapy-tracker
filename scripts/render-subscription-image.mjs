/* Renders the App Store Connect subscription image from its HTML source.

   1024x1024, opaque, no rounded corners — Apple masks the corners itself, and a PNG with
   transparency or pre-rounded corners is rejected. Chromium is the renderer because the
   source is the same SVG geometry the app's own launch screen uses, so the mark cannot
   drift from the one shipping in index.html.

   Usage: node scripts/render-subscription-image.mjs [basename]
     basename defaults to subscription-plus-1024 (GroundWork Plus, the middle tier, chrome).
     Pass subscription-pro-1024 for the top tier (gold). Either must exist as <basename>.html
     in TherapyTracker-web/icon-ideas/groundwork/. There is one image per subscription in App
     Store Connect, so both need regenerating whenever the mark or the plate changes. */
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

/* Playwright is not a dependency of this repo — it is only needed to regenerate this one
   image, and adding a ~400MB browser download to `npm ci` for that would be a poor trade.
   Resolve it from wherever it is installed (locally, or globally via NODE_PATH) and say
   plainly what to do if it is nowhere. */
const require_ = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require_("playwright"));
} catch {
  console.error("\n  playwright is not installed. Either:\n" +
                "    npx -y playwright@1 install chromium && npm i -D playwright\n" +
                "  or, if you have it globally:\n" +
                "    NODE_PATH=$(npm root -g) node scripts/render-subscription-image.mjs\n");
  process.exit(1);
}

const basename = process.argv[2] || "subscription-plus-1024";
const SRC = resolve(`TherapyTracker-web/icon-ideas/groundwork/${basename}.html`);
const OUT = resolve(`TherapyTracker-web/icon-ideas/groundwork/${basename}.png`);
if (!existsSync(SRC)) throw new Error(`missing source: ${SRC}`);

/* Playwright's own browser download may not be the one this machine has. Honour an explicit
   CHROMIUM_PATH, then the shared install the container ships with, then let Playwright find its
   own — the same order scripts/check-behaviour.mjs uses. */
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,
});
await page.goto("file://" + SRC, { waitUntil: "networkidle" });
// omitBackground:false keeps it opaque; clip pins it to exactly 1024x1024.
await page.screenshot({ path: OUT, omitBackground: false, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
await browser.close();
console.log(`  wrote ${OUT}`);
