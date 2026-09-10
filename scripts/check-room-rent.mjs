/* Room rent: the rhythm, the date range, and the gate it is no longer behind.
 *
 *   npm run test:rent
 *
 * WHY THIS EXISTS
 *   A rent step is the only cost in the app that generates charges on its own for years without
 *   anyone looking at it, so a mistake here is silent and expensive: a rent charged monthly when
 *   the therapist pays weekly understates a year by a factor of four, and one that never stops
 *   keeps billing a room she gave up. Neither shows up as an error anywhere.
 *
 *   Three properties are asserted, and all three are rules from CLAUDE.md rather than readings
 *   taken off the functions:
 *     1. An AMOUNT change never moves the day a charge lands on — that is what stops a
 *        correction shifting historical rent between tax years.
 *     2. A step with no `freq` and no `endDate` behaves exactly as it did before either field
 *        existed: monthly, from the first step's own day, for ever. Every rent ever entered is
 *        that shape, so this is the compatibility test.
 *     3. What a room costs is outside the Plus gate. Setting a room up for free and then being
 *        unable to see what it owes was the half-feature this replaced.
 *
 * Expectations are computed here from those rules (52 weeks in a year, the 15th is the 15th),
 * never pasted from what the app returned.
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
await page.waitForFunction(() => typeof window.normalize === "function" && typeof window.go === "function");

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.commit = async () => true;                      /* reads and in-memory edits only */
  const setup = (rent, room) => {
    S = normalize({
      clients: [], sessions: [], rooms: [Object.assign({ _id: "r1", location: "Kingston", rate: 0, billing: "monthly", due: "EOM" }, room || {})],
      roomRentHistory: (rent || []).map((h, i) => Object.assign({ _id: "h" + i, location: "Kingston" }, h)),
      settings: { onboarded: true, taxBasis: "accruals", features: {}, coach: { off: true, seen: [] } }
    });
    tyMemoClear();
  };
  const occ = (from, to) => roomRentOccurrences(parseD(from), parseD(to)).map((o) => ({ d: isoD(o.date), a: o.amount, due: isoD(o.due) }));

  /* ---- 1. a legacy step: monthly, on the day the rent started, for ever ---- */
  setup([{ effectiveFrom: "2026-01-15", amount: 500 }]);
  let o = occ("2026-01-01", "2026-06-30");
  const wantDates = ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15"];
  ok("a step with no freq is monthly, on its own day", JSON.stringify(o.map((x) => x.d)) === JSON.stringify(wantDates), o.map((x) => x.d).join(","));
  ok("every legacy charge is the amount entered", o.every((x) => x.a === 500));

  /* ---- 2. an amount change mid-cycle corrects the money, never the day ---- */
  setup([{ effectiveFrom: "2026-01-15", amount: 500 }, { effectiveFrom: "2026-03-20", amount: 600 }]);
  o = occ("2026-01-01", "2026-06-30");
  ok("a mid-cycle rise does not move the charge day", JSON.stringify(o.map((x) => x.d)) === JSON.stringify(wantDates), o.map((x) => x.d).join(","));
  ok("charges before the rise keep the old rent", o.slice(0, 3).every((x) => x.a === 500), o.slice(0, 3).map((x) => x.a).join(","));
  ok("charges after the rise carry the new one", o.slice(3).every((x) => x.a === 600), o.slice(3).map((x) => x.a).join(","));

  /* ---- 3. a weekly rent is charged weekly, and pays when it is charged ---- */
  setup([{ effectiveFrom: "2026-09-07", amount: 150, freq: "weekly" }]);
  o = occ("2026-09-01", "2026-09-30");
  ok("a weekly rent lands every 7 days", JSON.stringify(o.map((x) => x.d)) === JSON.stringify(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]), o.map((x) => x.d).join(","));
  ok("four weekly charges in that month total 4× the rent", o.reduce((a, x) => a + x.a, 0) === 600, o.reduce((a, x) => a + x.a, 0));
  ok("a rent whose rhythm was chosen is due on the day it is charged", o.every((x) => x.due === x.d));

  /* ---- 4. the other rhythms, from the same rule ---- */
  setup([{ effectiveFrom: "2026-01-05", amount: 900, freq: "quarterly" }]);
  ok("quarterly means four charges a year", occ("2026-01-01", "2026-12-31").length === 4);
  setup([{ effectiveFrom: "2026-01-05", amount: 200, freq: "fortnightly" }]);
  ok("fortnightly means every 14 days", occ("2026-01-01", "2026-02-28").map((x) => x.d).join(",") === "2026-01-05,2026-01-19,2026-02-02,2026-02-16");
  setup([{ effectiveFrom: "2026-01-05", amount: 5000, freq: "annually" }]);
  ok("annually means once a year", occ("2026-01-01", "2027-12-31").length === 2);

  /* ---- 5. an end date stops it, and nothing after it is charged ---- */
  setup([{ effectiveFrom: "2026-01-15", amount: 500, freq: "monthly", endDate: "2026-03-31" }]);
  o = occ("2026-01-01", "2026-12-31");
  ok("a rent with an end date stops there", JSON.stringify(o.map((x) => x.d)) === JSON.stringify(["2026-01-15", "2026-02-15", "2026-03-15"]), o.map((x) => x.d).join(","));
  ok("effRoomRent is 0 once the rent has ended", effRoomRent("Kingston", "2026-05-01") === 0, effRoomRent("Kingston", "2026-05-01"));
  ok("effRoomRent still answers for a date inside the range", effRoomRent("Kingston", "2026-02-01") === 500);
  ok("rentSummary reports it as ended", rentSummary("Kingston", "2026-05-01").ended === true);

  /* ---- 6. a change of RHYTHM re-anchors; a change of amount does not ---- */
  setup([{ effectiveFrom: "2026-01-01", amount: 400, freq: "monthly" },
         { effectiveFrom: "2026-06-15", amount: 100, freq: "weekly" }]);
  o = occ("2026-01-01", "2026-07-31");
  const monthlyPart = o.filter((x) => x.d < "2026-06-15");
  ok("the monthly regime runs up to the switch", JSON.stringify(monthlyPart.map((x) => x.d)) ===
    JSON.stringify(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]), monthlyPart.map((x) => x.d).join(","));
  ok("no monthly charge survives the switch", !o.some((x) => x.d === "2026-07-01"));
  ok("the weekly regime starts on the day it was said to", o.some((x) => x.d === "2026-06-15") && o.some((x) => x.d === "2026-06-22"));
  ok("every charge after the switch is the new rent", o.filter((x) => x.d >= "2026-06-15").every((x) => x.a === 100));

  /* ---- 7. a legacy step still reads the room's own payment schedule ---- */
  setup([{ effectiveFrom: "2026-01-15", amount: 500 }], { pay: { freq: "monthly", day: "last" } });
  o = occ("2026-01-01", "2026-02-28");
  ok("a legacy charge accrues on its own day", o[0].d === "2026-01-15", o[0].d);
  ok("…and is due when the room's schedule says", o[0].due === "2026-01-31", o[0].due);

  /* ---- 8. the ledger counts what the rhythm actually charges ---- */
  setup([{ effectiveFrom: "2025-01-06", amount: 150, freq: "weekly" }]);
  const led = ledgerBetween(parseD("2026-04-06"), parseD("2027-04-05"), {});
  /* Counted from the rule, not assumed: the rent falls on the anchor's weekday, 6 Apr 2026 IS
     that weekday, and the tax year runs to 5 Apr 2027 — so the window holds one charge on day 0
     and one every 7 days after it. That comes to 53, not 52, which is the real-world fact a
     weekly tenant meets roughly every seventh year and a hard-coded 52 would quietly lose. */
  const weeks = Math.floor((parseD("2027-04-05") - parseD("2026-04-06")) / (7 * 864e5)) + 1;
  ok("a weekly rent reaches the ledger once a week, every week in the year",
    led.roomRent === weeks * 150, led.roomRent + " for " + weeks + " weeks");
  setup([{ effectiveFrom: "2025-01-06", amount: 650, freq: "monthly" }]);
  ok("a monthly rent reaches it 12 times", ledgerBetween(parseD("2026-04-06"), parseD("2027-04-05"), {}).roomRent === 12 * 650);

  /* ---- 9. the monthly-equivalent reading aid, from the rule ---- */
  ok("weekly × 52 ÷ 12 is the monthly equivalent", Math.round(rentPerMonth(150, "weekly")) === Math.round(150 * 52 / 12));
  ok("quarterly ÷ 3 is the monthly equivalent", rentPerMonth(900, "quarterly") === 300);
  ok("a rent with no freq is read as monthly", rentPerMonth(500, undefined) === 500);

  /* ---- 10. the room form writes exactly what it showed ---- */
  setup([]);
  S.rooms = [];
  roomForm(null); await sleep(80);
  const seg = document.querySelector("#sheetBody #r_bill");
  ok("the new-room form offers a rent", !!seg && !!seg.querySelector('[data-b="monthly"]'));
  seg.querySelector('[data-b="monthly"]').click(); await sleep(40);
  document.querySelector("#sheetBody #r_loc").value = "Peckham";
  document.querySelector("#sheetBody #r_rate").value = "175";
  const fsel = document.querySelector("#sheetBody #r_freq");
  ok("the rent asks how often it is charged", !!fsel);
  fsel.value = "weekly"; fsel.dispatchEvent(new Event("change"));
  const fromI = document.querySelector("#sheetBody #r_from");
  ok("the rent asks when it starts", !!fromI);
  fromI.value = "2026-06-01"; fromI.dispatchEvent(new Event("change"));
  document.querySelector("#sheetBody #rSave").click(); await sleep(250);
  const step = (S.roomRentHistory || []).find((h) => h.location === "Peckham");
  ok("saving writes one rent step", !!step);
  ok("…with the amount that was typed", step && step.amount === 175, step && step.amount);
  ok("…with the rhythm that was chosen", step && step.freq === "weekly", step && step.freq);
  ok("…starting on the date that was chosen", step && step.effectiveFrom === "2026-06-01", step && step.effectiveFrom);
  const rm2 = S.rooms.find((r) => r.location === "Peckham");
  ok("the room's payment schedule is kept in step with the rent",
    rm2 && rm2.pay && rm2.pay.freq === "weekly", rm2 && JSON.stringify(rm2.pay));
  ok("a room on a rent charges nothing per session", rm2 && rm2.rate === 0);
  closeSheet(); await sleep(60);

  /* ---- 11. the rent sheet: an end date on the arrangement already there ---- */
  setup([{ effectiveFrom: "2026-01-15", amount: 500, freq: "monthly" }]);
  const beforeSteps = S.roomRentHistory.length;
  roomRentSheet("Kingston"); await sleep(80);
  const endI = document.querySelector("#sheetBody #rnE");
  ok("the rent sheet offers an end date", !!endI);
  endI.value = "2026-08-31"; endI.dispatchEvent(new Event("change"));
  document.querySelector("#sheetBody #rnS").click(); await sleep(250);
  ok("ending a rent corrects the step rather than stacking another",
    S.roomRentHistory.length === beforeSteps, S.roomRentHistory.length);
  ok("the end date is stored", S.roomRentHistory[0].endDate === "2026-08-31", S.roomRentHistory[0].endDate);
  ok("nothing is charged after it", !occ("2026-09-01", "2027-12-31").length);
  closeSheet(); await sleep(60);

  /* ---- 12. what a room costs is NOT behind the Plus gate ---- */
  setup([{ effectiveFrom: isoD(addDays(today(), -40)), amount: 500, freq: "monthly" }]);
  try { localStorage.setItem("tt_plus_gate", "on"); } catch (e) {}
  try { localStorage.removeItem("tt_plus"); } catch (e) {}
  ok("the gate is on for this check", plusLocked("finances") === true);
  moneySeg = "costs";
  go("money"); await sleep(250);
  const card = document.querySelector("#roomRentCard");
  ok("the room rent card renders behind a locked ledger", !!card);
  ok("…and its charges can still be ticked off", !!(card && card.querySelector("[data-pay]")));
  ok("the ledger itself is still locked", !!document.querySelector('[data-plus="finances"]'));
  try { localStorage.removeItem("tt_plus_gate"); } catch (e) {}

  return out;
});

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 5).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`${results.length}/${results.length} room-rent checks passed`);
else console.log(`\n${bad.length} failed of ${results.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
