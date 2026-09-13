/* Renders a GroundWork purchase sheet at App Store screenshot size, from the real app.

   WHY THIS EXISTS - the catch-22:
   App Store Connect wants a review screenshot before a product can leave Missing Metadata, and
   StoreKit cannot fetch a product that is still in Missing Metadata. So on a TestFlight build
   the sheet can only ever say "Unavailable", which is the one thing you must not put in front
   of a reviewer.

   This breaks it without a Mac: it loads the actual index.html, forces the gate on, stubs the
   StoreKit bridge with a price, opens the real openPlusSheet() / openTaxPackSheet(), and
   screenshots it at iPhone 6.9" size. Nothing is mocked but the store - the layout, copy and
   buttons are the shipping ones.

   TWO SHEETS, BECAUSE THERE ARE TWO KINDS OF PRODUCT and each needs its own review screenshot:
   the monthly subscription is offered on the Pro sheet, and a UK tax year - a non-consumable,
   which lives in a different section of App Store Connect - is offered on its own. `--sheet`
   picks which, and `--sheet both` writes both files in one run.

   THE PRICES ARE PLACEHOLDERS. Pass --price and --price-year to match what you set in App Store
   Connect, and replace these with genuine device screenshots before submitting for review.

   `--reason` picks which lock the subscription sheet is opened from, which only changes the
   heading ("Business analytics is part of GroundWork Pro"). It must be a key the subscription
   actually gates - trends, finances, accreditation, notesSync - or `settings` for the plain
   heading. `tax` is NOT one: tax is bought by the year and never opens this sheet.

   Usage:
     node scripts/render-paywall-screenshot.mjs [--price "£1.99"] [--period month]
                                               [--price-year "£24.99"] [--year 2026-27]
                                               [--sheet pro|tax|both] [--reason trends] [--dark]
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
const PRICE = opt("price", "£1.99");
const PERIOD = opt("period", "month");
const PRICE_YEAR = opt("price-year", "£24.99");
const YEAR = opt("year", null);                 // null = whatever tax year the app is in
const SHEET = opt("sheet", "pro");              // pro | tax | both
const REASON = opt("reason", "trends");
const DARK = argv.includes("--dark");
const ROOT = resolve("TherapyTracker-web");
const suffix = DARK ? "-dark" : "";
const OUT = {
  pro: resolve(`TherapyTracker-web/icon-ideas/groundwork/paywall-review-screenshot${suffix}.png`),
  tax: resolve(`TherapyTracker-web/icon-ideas/groundwork/taxyear-review-screenshot${suffix}.png`)
};
if (!["pro", "tax", "both"].includes(SHEET)) {
  console.error(`\n  --sheet must be pro, tax or both (got "${SHEET}").\n`); process.exit(1);
}
/* Fail loudly rather than render a sheet with the wrong heading: `tax` was a valid reason under
   the two-tier build and is the one somebody is most likely to reach for out of habit. */
if (["tax", "mtd"].includes(REASON)) {
  console.error(`\n  --reason ${REASON} is not a subscription lock any more: tax is bought by the`);
  console.error("  tax year, not by the subscription. Use --sheet tax for that product's sheet,");
  console.error("  or --reason trends|finances|accreditation|notesSync|settings for this one.\n");
  process.exit(1);
}

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
  localStorage.setItem("tt_plus_gate", "on");          // gate ON only - it cannot unlock
  localStorage.removeItem("tt_plus");                  // nothing held: both sheets show the offer
  localStorage.removeItem("tt_taxpack");
  localStorage.setItem("tt_theme", dark ? "dark" : "light");
}, DARK);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.evaluate(() => { try { flowClose(); settings().onboarded = true; } catch {} });

/* The tax year the app would actually put on sale, unless one was named. The sheet keys its
   price element by this string, so the stub and the assertion have to agree with it. */
const ty = YEAR || await page.evaluate(() => taxPackOnSale());

/* The only mock: a store that answers. `years` is keyed by tax year, matching what the native
   plusProducts() returns. Everything the sheets then draw is the shipping code. */
await page.evaluate(({ price, priceYear, period, ty }) => {
  window.GWPlusNative = {
    products: async () => ({ found: true,
      pro:   { price, period, title: "GroundWork Pro" },
      years: { [ty]: { price: priceYear, period: "", title: "UK tax year " + ty } } }),
    purchase:    async () => ({ ok: false, cancelled: true }),
    taxPurchase: async () => ({ ok: false, cancelled: true }),
    restore:     async () => ({ ok: false }),
    redeem: () => {}, manage: () => {}
  };
}, { price: PRICE, priceYear: PRICE_YEAR, period: PERIOD, ty });

const shoot = async (which) => {
  await page.evaluate(() => { try { closeSheet(); } catch {} });
  await page.waitForTimeout(250);
  if (which === "pro") {
    await page.evaluate(() => go("practice"));
    await page.waitForTimeout(400);
    await page.evaluate((reason) => openPlusSheet(reason), REASON);
  } else {
    await page.evaluate(() => go("tax"));
    await page.waitForTimeout(400);
    await page.evaluate((t) => openTaxPackSheet(t), ty);
  }
  await page.waitForTimeout(900);                      // let the sheet settle and the price land

  /* The price has to have landed: a sheet reading "…" or "Unavailable" is exactly what this
     script exists to stop reaching a reviewer. The element is keyed by tier for the
     subscription and by tax year for the package, so the selector differs. */
  const sel = which === "pro" ? "#plPrice-pro" : `[id="plPrice-${ty}"]`;
  const read = (await page.textContent(sel).catch(() => null)) || "";
  if (!/\d/.test(read)) {
    console.error(`\n  The ${which} sheet never took a price (reads "${read.trim() || "nothing"}").`);
    console.error("  The stub did not reach the sheet - check plusNative()/GWPlusNative.\n");
    await browser.close(); server.close(); process.exit(1);
  }
  await page.screenshot({ path: OUT[which], omitBackground: false });
  console.log(`  wrote ${OUT[which]}`);
  console.log(`    1320x2868 (iPhone 6.9") · price reads "${read.trim()}"` +
              (which === "pro" ? ` · opened from a ${REASON} lock` : ` · tax year ${ty}`));
};

if (SHEET === "pro" || SHEET === "both") await shoot("pro");
if (SHEET === "tax" || SHEET === "both") await shoot("tax");

await browser.close();
server.close();
console.log(`  The prices are PLACEHOLDERS - re-run with --price/--price-year once App Store`);
console.log(`  Connect is set, and replace these with real device screenshots before review.`);
