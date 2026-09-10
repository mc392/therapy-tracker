/* The two-tier gate, in a real browser.
 *
 *   npm run test:tiers
 *
 * WHY THIS EXISTS
 *   Every failure in an entitlement gate is silent and lands on a paying customer. The two that
 *   would actually happen here:
 *
 *     1. An entitlement written before tiers existed reads as the SMALLER tier, and everybody who
 *        already pays loses the tax engine on the morning they update. There is no migration to
 *        get wrong — the default is the migration — so the only thing that can protect it is a
 *        test that asserts the default.
 *     2. A feature quietly changes rung. A one-word edit to FEATURE_TIER sells the tax engine at
 *        the cheaper price, or puts Business analytics behind the dearer one, and nothing else in
 *        the repo would notice.
 *
 * EXPECTATIONS COME FROM THE DOCUMENTED SPLIT, NEVER FROM THE FUNCTION
 *   The matrix below is written out from docs/monetisation.md §3 — Plus is everything except the
 *   tax bundle, Pro is everything — and compared against what plusLocked() actually does. A test
 *   that read FEATURE_TIER and then asserted plusLocked agreed with it would assert nothing.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("This needs Playwright, which is not a dependency of this repo on purpose.\n" +
    "  npm i --no-save playwright\nthen run this again.");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "TherapyTracker-web");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const srv = createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split("?")[0]);
  const f = join(webDir, p === "/" ? "index.html" : p);
  if (!f.startsWith(webDir) || !existsSync(f)) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { "content-type": MIME[extname(f)] || "text/plain" });
  rs.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.plusLocked === "function" && typeof window.go === "function");

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.commit = async () => true;

  /* Hold a tier (or nothing) on this device, with the gate forced on. */
  const hold = (o) => {
    try {
      localStorage.setItem("tt_plus_gate", "on");
      if (o) localStorage.setItem("tt_plus", JSON.stringify(o));
      else localStorage.removeItem("tt_plus");
    } catch (e) {}
  };
  const soon = new Date(Date.now() + 200 * 864e5).toISOString();

  /* ---- 1. the matrix, written out from the documented split ---- */
  const TAX_BUNDLE = ["tax", "finances", "mtd"];      // Pro only — UK machinery, sold as one
  const INSIGHTS   = ["trends", "accreditation", "notesSync"];  // Plus and above
  const CASES = [
    ["nothing held", null,                             { tax: true,  insights: true }],
    ["Plus held",    { active: true, tier: "plus", expiresAt: soon }, { tax: true,  insights: false }],
    ["Pro held",     { active: true, tier: "pro",  expiresAt: soon }, { tax: false, insights: false }]
  ];
  for (const [label, cache, want] of CASES) {
    hold(cache);
    ok(label + ": the tax bundle is " + (want.tax ? "locked" : "open"),
      TAX_BUNDLE.every((k) => plusLocked(k) === want.tax),
      TAX_BUNDLE.map((k) => k + "=" + plusLocked(k)).join(","));
    ok(label + ": analytics, accreditation and sync are " + (want.insights ? "locked" : "open"),
      INSIGHTS.every((k) => plusLocked(k) === want.insights),
      INSIGHTS.map((k) => k + "=" + plusLocked(k)).join(","));
  }

  /* ---- 2. THE ONE THAT PROTECTS EXISTING SUBSCRIBERS ---- */
  hold({ active: true, expiresAt: soon, source: "storekit" });   // exactly what the old build wrote
  ok("an entitlement with no tier on it is the TOP tier",
    plusTier() === "pro" && TAX_BUNDLE.every((k) => !plusLocked(k)), plusTier());
  hold({ active: true, source: "licence", kind: "founding" });    // a comp, no expiry, no tier
  ok("a granted licence with no tier is the top tier too", plusTier() === "pro", plusTier());
  hold({ active: true, tier: "platinum", expiresAt: soon });
  ok("a tier nobody recognises fails OPEN, not shut", plusTier() === "pro", plusTier());

  /* ---- 3. expiry, and the grace that covers a renewal not yet seen ---- */
  const daysOut = (n) => new Date(Date.now() + n * 864e5).toISOString();
  hold({ active: true, tier: "plus", expiresAt: daysOut(-3) });
  ok("a subscription 3 days past its date is still live (inside the 7-day grace)",
    plusTier() === "plus", plusTier());
  hold({ active: true, tier: "plus", expiresAt: daysOut(-30) });
  ok("a subscription 30 days past its date is gone", plusTier() === null, plusTier());
  hold({ active: true, tier: "pro", expiresAt: "not a date at all" });
  ok("an unreadable date fails OPEN", plusTier() === "pro", plusTier());
  hold({ active: false, tier: "pro" });
  ok("active:false is not a subscription", plusTier() === null, plusTier());

  /* ---- 4. nothing outside the table is ever locked ---- */
  hold(null);
  ok("a key that is not gated is never locked",
    !plusLocked("receipts") && !plusLocked("gamify") && !plusLocked("supervision") && !plusLocked("palettes"));

  /* ---- 5. the lock a reader actually sees names and wears the right tier ---- */
  S = normalize({ clients: [], sessions: [], rooms: [],
    settings: { onboarded: true, taxAck: true, features: {}, coach: { off: true, seen: [] } } });
  applySettings();
  hold(null);
  go("tax"); await sleep(300);
  const taxLock = document.querySelector("#main .card.plusgate");
  ok("the Tax lock renders", !!taxLock);
  ok("…in the top tier's colour", !!(taxLock && taxLock.classList.contains("tier-pro")),
    taxLock && taxLock.className);
  ok("…and names the top tier", /GroundWork Pro/.test(taxLock ? taxLock.textContent : ""));

  pracTab = "trends"; trendSeg = "clients"; go("practice"); await sleep(400);
  const peek = document.querySelector("#main .card.plusgate.peek");
  ok("the Business analytics peek renders", !!peek);
  ok("…in the middle tier's colour", !!(peek && peek.classList.contains("tier-plus")), peek && peek.className);
  ok("…and names the middle tier", /GroundWork Plus/.test(peek ? peek.textContent : ""));
  ok("…and the retention funnel is still there, unlocked",
    !!document.querySelector("#main .funnel .fbar"));

  /* Holding Plus opens that screen without touching the tax lock. */
  hold({ active: true, tier: "plus", expiresAt: soon });
  go("practice"); await sleep(400);
  ok("holding Plus, Business analytics is no longer a lock card",
    !document.querySelector("#main .card.plusgate.peek"));
  go("tax"); await sleep(300);
  ok("holding Plus, Tax is still a lock card", !!document.querySelector("#main .card.plusgate.tier-pro"));

  /* ---- 6. the paywall offers both rungs, and lights the one that was asked for ---- */
  hold(null);
  openPlusSheet("tax"); await sleep(200);
  const cards = [...document.querySelectorAll("#sheetBody .tiercard")];
  ok("the sheet offers both rungs", cards.length === 2, cards.length);
  ok("…cheapest first", cards[0] && cards[0].classList.contains("tier-plus"));
  ok("…and the one that unlocks Tax is the lit one",
    !!(cards[1] && cards[1].classList.contains("needed")) && !cards[0].classList.contains("needed"));
  closeSheet(); await sleep(80);
  openPlusSheet("trends"); await sleep(200);
  const cards2 = [...document.querySelectorAll("#sheetBody .tiercard")];
  ok("opened from an analytics lock, the middle rung is the lit one",
    !!(cards2[0] && cards2[0].classList.contains("needed")) && !cards2[1].classList.contains("needed"));
  closeSheet(); await sleep(80);

  /* Somebody on Plus is shown the upgrade, and only the upgrade. */
  hold({ active: true, tier: "plus", expiresAt: soon });
  openPlusSheet("settings"); await sleep(200);
  const upCards = [...document.querySelectorAll("#sheetBody .tiercard")];
  ok("holding Plus, the sheet offers exactly one thing: Pro",
    upCards.length === 1 && upCards[0].classList.contains("tier-pro"), upCards.length);
  ok("…and says which subscription they are on",
    /GroundWork Plus/.test(document.querySelector("#sheetBody").textContent));
  closeSheet(); await sleep(80);
  hold({ active: true, tier: "pro", expiresAt: soon });
  openPlusSheet("settings"); await sleep(200);
  ok("holding Pro, there is nothing left to sell",
    !document.querySelector("#sheetBody .tiercard"));
  closeSheet(); await sleep(80);

  /* ---- 7. the launch screen wears the tier that is actually held ---- */
  hold({ active: true, tier: "plus", expiresAt: soon }); applyPlusChrome();
  ok("the splash marks Plus", document.documentElement.getAttribute("data-plus") === "plus");
  hold({ active: true, tier: "pro", expiresAt: soon }); applyPlusChrome();
  ok("the splash marks Pro", document.documentElement.getAttribute("data-plus") === "pro");
  hold(null); applyPlusChrome();
  ok("no subscription, no mark", document.documentElement.getAttribute("data-plus") === null);

  /* ---- 8. the gate is still incapable of unlocking anything ---- */
  try { localStorage.removeItem("tt_plus"); localStorage.setItem("tt_plus_gate", "off"); } catch (e) {}
  ok("tt_plus_gate can only switch the gate ON",
    plusGateOn() === false && !plusLocked("tax") && plusTier() === null);
  try { localStorage.setItem("tt_plus_gate", "on"); } catch (e) {}
  return out;
});

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 5).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`${results.length}/${results.length} tier checks passed`);
else console.log(`\n${bad.length} failed of ${results.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
