/* The entitlement gate, in a real browser: one subscription, and tax bought by the tax year.
 *
 *   npm run test:tiers
 *
 * WHY THIS EXISTS
 *   Every failure in an entitlement gate is silent and lands on a paying customer. Four that
 *   would actually happen here:
 *
 *     1. An entitlement written by an older build reads as nothing, and everybody who already
 *        pays loses their features on the morning they update. There is no migration to get
 *        wrong - the default is the migration - so the only thing that can protect it is a test
 *        that asserts the default.
 *     2. A tax year purchase stops being recognised. Non-consumables cannot be re-issued, so the
 *        watermark going backwards, or a restore overwriting it with something smaller, is money
 *        taken for something the reader then does not have.
 *     3. The mask stops being a mask. If somebody reimplements it as a blur of a computed figure
 *        - which is what Money does, and what this deliberately does not - the number is sitting
 *        in the page for anyone to read, and "needs the tax year to calculate this" becomes false.
 *     4. Pro starts looking like it includes tax. That is the mis-selling risk the whole design
 *        carries, so the copy that states the exclusion is asserted here, not left to review.
 *
 * EXPECTATIONS COME FROM THE DOCUMENTED SPLIT, NEVER FROM THE FUNCTION
 *   The matrix below is written out from docs/monetisation.md §3 - Pro is analytics,
 *   accreditation, Notes sync and Costs & income; tax is a year at a time on top of Pro - and
 *   compared against what plusLocked() and taxYearPaid() actually do. A test that read
 *   FEATURE_TIER and then asserted plusLocked agreed with it would assert nothing.
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

  /* Hold a subscription and/or a tax year watermark, with the gate forced on. */
  const hold = (sub, taxThrough) => {
    try {
      localStorage.setItem("tt_plus_gate", "on");
      if (sub) localStorage.setItem("tt_plus", JSON.stringify(sub));
      else localStorage.removeItem("tt_plus");
      if (taxThrough) localStorage.setItem("tt_taxpack", JSON.stringify({ through: taxThrough, source: "storekit" }));
      else localStorage.removeItem("tt_taxpack");
    } catch (e) {}
  };
  const soon = new Date(Date.now() + 200 * 864e5).toISOString();
  const PRO = { active: true, tier: "pro", expiresAt: soon };

  /* ---- 1. the subscription matrix, written out from the documented split ---- */
  const SUBSCRIPTION = ["trends", "accreditation", "notesSync", "finances", "reports"];
  const NOT_SUBSCRIPTION = ["tax", "mtd"];   // bought by the tax year, never by plusLocked
  hold(null);
  ok("nothing held: everything in the subscription is locked",
    SUBSCRIPTION.every((k) => plusLocked(k)), SUBSCRIPTION.map((k) => k + "=" + plusLocked(k)).join(","));
  ok("nothing held: tax and mtd are NOT subscription-locked - they are a different axis",
    NOT_SUBSCRIPTION.every((k) => !plusLocked(k)), NOT_SUBSCRIPTION.map((k) => k + "=" + plusLocked(k)).join(","));
  hold(PRO);
  ok("Pro held: everything in the subscription is open",
    SUBSCRIPTION.every((k) => !plusLocked(k)), SUBSCRIPTION.map((k) => k + "=" + plusLocked(k)).join(","));

  /* ---- 2. the tax year matrix: Pro is the floor, the year is the year ---- */
  const TY = "2026-27", PREV = "2025-26", NEXT = "2027-28";
  hold(PRO, null);
  ok("Pro but no tax year: every year is locked",
    taxYearLocked(TY) && taxYearLocked(PREV) && taxYearLocked(NEXT));
  ok("…and the reason given is the year, not the subscription", taxLockReason(TY) === "year");
  hold(null, TY);
  ok("a tax year but no Pro: still locked - Pro is a prerequisite", taxYearLocked(TY));
  ok("…and the reason given is the subscription", taxLockReason(TY) === "sub");
  hold(null, null);
  ok("neither held: the reason names both", taxLockReason(TY) === "both");
  hold(PRO, TY);
  ok("Pro and 2026-27: that year is open", taxYearPaid(TY));
  ok("…and EVERY EARLIER YEAR with it", taxYearPaid(PREV) && taxYearPaid("2019-20"));
  ok("…and the year after is not", taxYearLocked(NEXT));
  ok("…and nothing is left locked to report", taxLockReason(TY) === null);
  hold(PRO, PREV);
  ok("owning only last year leaves this year masked", taxYearLocked(TY) && taxYearPaid(PREV));

  /* ---- 3. THE WATERMARK ONLY EVER GOES UP ----
     A non-consumable cannot be re-issued, so a partial restore or a slow sync writing a smaller
     value would take a purchase away with no way to give it back. */
  hold(PRO, "2026-27");
  taxPackGrant("2024-25", "storekit");
  ok("a grant for an EARLIER year never lowers the watermark", taxPackThrough() === "2026-27", taxPackThrough());
  taxPackGrant("2027-28", "storekit");
  ok("a grant for a later year raises it", taxPackThrough() === "2027-28", taxPackThrough());
  taxPackGrant("not a year", "storekit");
  ok("something that is not a tax year is ignored, not written", taxPackThrough() === "2027-28", taxPackThrough());
  hold(PRO, null);
  taxPackGrant("2025-26", "legacy");
  ok("the legacy grant writes a watermark where there was none", taxPackThrough() === "2025-26", taxPackThrough());

  /* ---- 4. THE ONE THAT PROTECTS EXISTING SUBSCRIBERS ---- */
  hold({ active: true, expiresAt: soon, source: "storekit" });   // what the first build wrote
  ok("an entitlement with no tier on it is still the subscription",
    plusTier() === "pro" && SUBSCRIPTION.every((k) => !plusLocked(k)), plusTier());
  hold({ active: true, tier: "plus", expiresAt: soon });          // the withdrawn middle rung
  ok("an entitlement on the withdrawn Plus rung reads as Pro", plusTier() === "pro", plusTier());
  hold({ active: true, source: "licence", kind: "founding" });    // a comp, no expiry, no tier
  ok("a granted licence with no tier is the subscription too", plusTier() === "pro", plusTier());
  hold({ active: true, tier: "platinum", expiresAt: soon });
  ok("a tier nobody recognises fails OPEN, not shut", plusTier() === "pro", plusTier());

  /* ---- 5. expiry, and the grace that covers a renewal not yet seen ---- */
  const daysOut = (n) => new Date(Date.now() + n * 864e5).toISOString();
  hold({ active: true, tier: "pro", expiresAt: daysOut(-3) });
  ok("a subscription 3 days past its date is still live (inside the 7-day grace)",
    plusTier() === "pro", plusTier());
  hold({ active: true, tier: "pro", expiresAt: daysOut(-30) });
  ok("a subscription 30 days past its date is gone", plusTier() === null, plusTier());
  hold({ active: true, tier: "pro", expiresAt: "not a date at all" });
  ok("an unreadable date fails OPEN", plusTier() === "pro", plusTier());
  hold({ active: false, tier: "pro" });
  ok("active:false is not a subscription", plusTier() === null, plusTier());
  /* A lapse must not take the tax years with it - they are a separate purchase and a separate key. */
  hold({ active: true, tier: "pro", expiresAt: soon }, "2026-27");
  plusClear();
  ok("clearing a lapsed subscription leaves the tax years owned", taxPackThrough() === "2026-27", taxPackThrough());
  ok("…though they are masked again until it is renewed", taxYearLocked("2026-27"));

  /* ---- 6. nothing outside the table is ever locked ---- */
  hold(null);
  ok("a key that is not gated is never locked",
    !plusLocked("receipts") && !plusLocked("gamify") && !plusLocked("supervision") && !plusLocked("palettes"));

  /* ---- 7. the Tax tab OPENS, and what a locked figure looks like ---- */
  S = normalize({ clients: [], sessions: [], rooms: [],
    settings: { onboarded: true, taxAck: true, features: {}, coach: { off: true, seen: [] } } });
  applySettings();
  hold(null, null);
  taxSeg = "now"; go("tax"); await sleep(350);
  ok("the Tax tab is not a lock card any more",
    !document.querySelector("#main .card.plusgate [data-plus]"));
  const masks = [...document.querySelectorAll("#main .taxmask")];
  ok("its figures are masked", masks.length >= 3, masks.length);
  ok("…in gold, like everything else that costs money",
    masks.every((m) => m.classList.contains("tier-pro")));
  ok("…each one opening the tax year it needs, not the subscription sheet",
    masks.every((m) => m.dataset.taxpack && /^\d{4}-\d{2}$/.test(m.dataset.taxpack)));
  ok("…and announcing itself to a screen reader rather than hiding",
    masks.every((m) => /Locked/.test(m.getAttribute("aria-label") || "") && !m.hasAttribute("aria-hidden")));
  /* THE MASK IS NOT A BLUR. Nothing was computed, so no figure may appear anywhere in the tab -
     if somebody reimplements this as .blurfig the number is in the page and this fails. */
  const taxText = document.querySelector("#main").textContent;
  ok("NO tax figure is rendered at all for a locked year",
    !/£\s?\d/.test(taxText.replace(/£0\b/g, "")), (taxText.match(/£\s?[\d,]+/g) || []).slice(0, 4).join(" "));
  ok("…and .blurfig is not what is doing it", !document.querySelector("#main .blurfig"));
  /* The reader's own settings are never behind the mask. */
  taxSeg = "allowances"; go("tax"); await sleep(300);
  ok("Per year - the reader's own settings - is untouched by the gate",
    !document.querySelector("#main .taxmask"));

  /* Owning the year opens it. */
  hold(PRO, "2026-27");
  taxSeg = "now"; go("tax"); await sleep(350);
  ok("with Pro and the year, Tax > Now draws real figures",
    !document.querySelector("#main .taxmask") && /£/.test(document.querySelector("#main").textContent));

  /* ---- 8. Business analytics: a peek, in gold ---- */
  hold(null, null);
  pracTab = "trends"; trendSeg = "clients"; go("practice"); await sleep(450);
  const peek = document.querySelector("#main .card.plusgate.peek");
  ok("the Business analytics peek renders", !!peek);
  ok("…in gold", !!(peek && peek.classList.contains("tier-pro")), peek && peek.className);
  ok("…and names the subscription", /GroundWork Pro/.test(peek ? peek.textContent : ""));
  ok("…and the retention funnel is still there, unlocked",
    !!document.querySelector("#main .funnel .fbar"));
  hold(PRO);
  go("practice"); await sleep(450);
  ok("holding Pro, Business analytics is no longer a lock card",
    !document.querySelector("#main .card.plusgate.peek"));

  /* ---- 9. THE MIS-SELLING GUARD ----
     Pro must never be sold on a promise it does not keep, so the exclusion has to be ON the sheet
     where the money is asked for - not in a FAQ, and not merely absent. */
  hold(null, null);
  openPlusSheet("trends"); await sleep(250);
  const sheet = document.querySelector("#sheetBody");
  ok("the subscription sheet offers exactly one thing",
    document.querySelectorAll("#sheetBody .tiercard").length === 1);
  ok("…and says in as many words that it does not do tax",
    /does\s*<?b?>?\s*not\s*<?\/?b?>?\s*work out your tax/i.test(sheet.innerHTML.replace(/\s+/g, " ")),
    sheet.textContent.slice(0, 160));
  ok("…and offers the way to the tax years from there", !!document.querySelector("#plTaxMore"));
  ok("…and never names a withdrawn tier", !/GroundWork Plus/.test(sheet.textContent));
  closeSheet(); await sleep(80);

  /* ---- 10. the tax year sheet is two steps, in order ----
     A store has to be stubbed for this section: off-native plusNative() is null and the sheet
     says "sold in the iPhone app" instead of rendering a Buy button at all, so the state that
     actually matters - a purchase blocked on its prerequisite - would never be reached. This is
     the ONLY mock here and it stubs the store, nothing else; every sheet drawn around it is the
     shipping code. */
  window.GWPlusNative = {
    products: async () => ({ found: true, pro: { price: "£1.99", period: "month" },
                             years: { "2026-27": { price: "£24.99", period: "" } } }),
    purchase: async () => ({ ok: false, cancelled: true }),
    taxPurchase: async () => ({ ok: false, cancelled: true }),
    restore: async () => ({ ok: false }), redeem: () => {}, manage: () => {}
  };
  openTaxPackSheet("2026-27"); await sleep(400);
  const steps = [...document.querySelectorAll("#sheetBody .tstep")];
  ok("the tax year sheet shows both steps", steps.length === 2, steps.length);
  ok("…Pro first", /GroundWork Pro/.test(steps[0] ? steps[0].textContent : ""));
  ok("…neither ticked while nothing is held", steps.every((st) => !st.classList.contains("done")));
  ok("…and it says it is a one-off, not a subscription",
    /one-off/i.test(document.querySelector("#sheetBody").textContent));
  ok("…and that earlier years come with it",
    /every earlier tax year/i.test(document.querySelector("#sheetBody").textContent));
  /* Pro is a prerequisite, so Buy cannot be live without it - and it has to LOOK dead as well as
     be dead. A disabled .btn carried no styling at all until Sep 2026, so this checks the
     rendered opacity rather than only the attribute, and that the reason is on screen beside it
     rather than left for the reader to guess at. */
  {
    const buy = document.querySelector("#sheetBody [data-buyty]");
    ok("without Pro the Buy button is disabled", !!(buy && buy.disabled));
    ok("…and visibly so, not just in the DOM",
      !!buy && parseFloat(getComputedStyle(buy).opacity) < 0.8,
      buy && getComputedStyle(buy).opacity);
    ok("…and the sheet says why rather than leaving a dead control",
      /subscribe to groundwork pro first/i.test(document.querySelector("#sheetBody").textContent));
  }
  closeSheet(); await sleep(80);
  hold(PRO, null);
  openTaxPackSheet("2026-27"); await sleep(400);
  const steps2 = [...document.querySelectorAll("#sheetBody .tstep")];
  ok("holding Pro, step 1 is ticked and step 2 is not",
    steps2[0].classList.contains("done") && !steps2[1].classList.contains("done"));
  {
    const buy2 = document.querySelector("#sheetBody [data-buyty]");
    ok("…and Buy is live now the prerequisite is met", !!(buy2 && !buy2.disabled));
  }
  closeSheet(); await sleep(80);

  /* ---- 11. the launch screen ---- */
  hold(PRO); applyPlusChrome();
  ok("the splash marks Pro", document.documentElement.getAttribute("data-plus") === "pro");
  hold({ active: true, tier: "plus", expiresAt: soon }); applyPlusChrome();
  ok("a withdrawn-tier entitlement still marks Pro rather than nothing",
    document.documentElement.getAttribute("data-plus") === "pro");
  hold(null); applyPlusChrome();
  ok("no subscription, no mark", document.documentElement.getAttribute("data-plus") === null);

  /* ---- 12. the gate is still incapable of unlocking anything ---- */
  try { localStorage.removeItem("tt_plus"); localStorage.removeItem("tt_taxpack");
        localStorage.setItem("tt_plus_gate", "off"); } catch (e) {}
  ok("tt_plus_gate can only switch the gate ON",
    plusGateOn() === false && !plusLocked("trends") && plusTier() === null);
  ok("…and with the gate off no tax year is locked either",
    taxYearPaid("2026-27") && taxYearPaid("2030-31"));
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
