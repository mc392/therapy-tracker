/* Renders the GroundWork Plus / Pro paywall at App Store screenshot size, from the real app.

   WHY THIS EXISTS — the catch-22:
   App Store Connect wants a review screenshot before a subscription can leave Missing
   Metadata, and StoreKit cannot fetch a product that is still in Missing Metadata. So on a
   TestFlight build the paywall can only ever say "Subscription unavailable right now", which
   is the one thing you must not put in front of a reviewer.

   This breaks it without a Mac: it loads the actual index.html, forces the gate on, stubs the
   StoreKit bridge with a price, opens the real openPlusSheet(), and screenshots it at iPhone
   6.9" size. Nothing is mocked but the store — the layout, copy and buttons are the shipping
   ones.

   THE PRICES ARE PLACEHOLDERS. Both subscriptions are on one sheet, so both need one: pass
   --price (Pro) and --price-plus (Plus) to match what you set in App Store Connect, and replace
   this image with a genuine device screenshot before submitting for review.

   `--reason` picks which lock the sheet is opened from, because that decides which rung is lit:
   a tax lock leads with Pro (the default, and the one App Review will be looking at), `trends`
   leads with Plus.

   Usage:
     node scripts/render-paywall-screenshot.mjs [--price "£39.99"] [--price-plus "£19.99"]
                                               [--period year] [--reason tax] [--dark]
*/
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname, join, normalize } from "node:path";

const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_("playwright")); }
catch {
  console.error("\n  playwright is not installed. Either:\n" +
                "    npx -y playwright@1 install chromium && npm i -D playwright\n" +
                "  or, if you have it globally:\n" +
                "    NODE_PATH=$(npm root -g) node scripts/render-paywall-screenshot.mjs\n");
  process.exit(1);
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const PRICE = opt("price", "£39.99");
const PRICE_PLUS = opt("price-plus", "£19.99");
const PERIOD = opt("period", "year");
const REASON = opt("reason", "tax");
const DARK = argv.includes("--dark");
const ROOT = resolve("TherapyTracker-web");
const OUT = resolve(`TherapyTracker-web/icon-ideas/groundwork/paywall-review-screenshot${DARK ? "-dark" : ""}.png`);

/* A dependency-free static server. file:// would be simpler but the app is origin-sensitive:
   IndexedDB and localStorage both behave differently there, and loadState() would not run. */
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
               ".json":"application/json", ".png":"image/png", ".webmanifest":"application/manifest+json" };
const server = createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

/* Same browser-resolution order as the other render scripts: an explicit CHROMIUM_PATH, then
   the shared install the container ships with, then Playwright's own. */
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
const browser = await chromium.launch({ executablePath: CHROME });
/* 440x956 at dsf 3 = 1320x2868, Apple's 6.9" iPhone screenshot size. */
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });

await page.goto(URL_, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.evaluate((dark) => {
  try { flowClose(); settings().onboarded = true; } catch {}
  localStorage.setItem("tt_plus_gate", "on");          // gate ON only — it cannot unlock
  localStorage.setItem("tt_theme", dark ? "dark" : "light");
}, DARK);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.evaluate(() => { try { flowClose(); settings().onboarded = true; } catch {} });

/* The only mock: a store that answers, one entry per rung. Everything the sheet then draws is
   the shipping code. */
await page.evaluate(({ price, pricePlus, period }) => {
  window.GWPlusNative = {
    products: async () => ({ found: true,
      plus: { price: pricePlus, period, title: "GroundWork Plus" },
      pro:  { price,            period, title: "GroundWork Pro" } }),
    purchase: async () => ({ ok: false, cancelled: true }),
    restore:  async () => ({ ok: false }),
    redeem: () => {}, manage: () => {}
  };
}, { price: PRICE, pricePlus: PRICE_PLUS, period: PERIOD });
await page.evaluate((reason) => { go(reason === "trends" ? "practice" : "tax"); }, REASON);
await page.waitForTimeout(400);
await page.evaluate((reason) => openPlusSheet(reason), REASON);
await page.waitForTimeout(900);                        // let the sheet settle and the price land

/* Both rungs have to have taken a price: a sheet with one real figure and one "…" is exactly
   what this script exists to stop reaching a reviewer. */
const priced = (await page.textContent("#plPrice-pro")) + " / " + (await page.textContent("#plPrice-plus"));
if ((priced.match(/\d/g) || []).length < 2) {
  console.error(`\n  A tier never took a price (reads "${priced}").`);
  console.error("  The stub did not reach openPlusSheet — check plusNative()/GWPlusNative.\n");
  await browser.close(); server.close(); process.exit(1);
}
await page.screenshot({ path: OUT, omitBackground: false });
await browser.close();
server.close();
console.log(`  wrote ${OUT}`);
console.log(`  1320x2868 (iPhone 6.9") · opened from a ${REASON} lock · prices read "${priced.trim()}"`);
console.log(`  The prices are PLACEHOLDERS — re-run with --price/--price-plus once App Store Connect is set,`);
console.log(`  and replace this with a real device screenshot before submitting for review.`);
