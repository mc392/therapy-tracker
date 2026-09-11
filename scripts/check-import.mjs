/* Spreadsheet import checks, in a real browser against the real parser.
 *
 *   npm run test:import
 *
 * WHAT THIS IS
 *   The importer is the switching-cost remover: somebody arriving with three years of history in
 *   Excel either gets it in cleanly on day one or never becomes a user. Every check here is a
 *   shape a real spreadsheet takes — a date cell that carries a time, "10:00 - 11:00" in a Time
 *   column, an "Amount paid" column instead of Y/N, "closed" for a client's status, a workbook
 *   picked instead of a .csv, a sheet with no heading row — and what the importer must make of it.
 *
 * EXPECTATIONS COME FROM THE RULE, NEVER FROM THE FUNCTION
 *   Each expected value is written from the documented behaviour (CLAUDE.md § Spreadsheet
 *   import and the comments beside each parser), not pasted from what the code returned.
 *
 * commit() is stubbed before anything runs: the import writes into an in-memory copy of S.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
const dataDir = join(root, "tests", "test-data");
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

async function inPage() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sheetTitle = () => document.getElementById("sheetTitle").textContent.trim();
  const sheetText = () => document.getElementById("sheetBody").textContent.replace(/\s+/g, " ");

  /* ===== parsers ===== */
  const p1 = impDateParts("07/04/2026 10:00");
  ok("a date with a time attached still parses as the date", p1 && p1.y === 2026 && p1.a === 7 && p1.b === 4 && !p1.iso, JSON.stringify(p1));
  ok("the time attached to a date is recoverable", impTimeInDate("07/04/2026 10:00") === "10:00", impTimeInDate("07/04/2026 10:00"));
  const p2 = impDateParts("2026-04-07T10:30:00");
  ok("an ISO datetime parses as its date", p2 && p2.iso && p2.a === 4 && p2.b === 7, JSON.stringify(p2));
  ok("2026-04-07 stays understood", impDate("2026-04-07", "DMY") === "2026-04-07");
  ok("a time range keeps its start", impTime("10:00 - 11:00") === "10:00", impTime("10:00 - 11:00"));
  ok("a time range written with 'to' keeps its start", impTime("10.30 to 11.20") === "10:30", impTime("10.30 to 11.20"));
  ok("a time with seconds drops them", impTime("10:00:00") === "10:00", impTime("10:00:00"));
  ok("2pm is still 14:00", impTime("2pm") === "14:00");
  ok("an Excel day fraction is still a time", impTime("0.5833") === "14:00", impTime("0.5833"));
  ok("£60 in a paid column means paid", impYN("£60") === "Y", impYN("£60"));
  ok("60.00 in a paid column means paid", impYN("60.00") === "Y");
  ok("0 in a paid column means not paid", impYN("0") === "N");
  ok("a blank paid cell is still unknown", impYN("") === "");
  ok("'yes' is still paid", impYN("yes") === "Y");
  ok("'closed' becomes Finished", impStatus("closed") === "Finished");
  ok("'Current' becomes Ongoing", impStatus("Current") === "Ongoing");
  ok("'on hold' becomes Paused", impStatus("on hold") === "Paused");
  ok("a status the app has not heard of is kept as typed", impStatus("Waiting list") === "Waiting list");
  ok("a blank status is Ongoing", impStatus("") === "Ongoing");
  const g = impGuess(["Name", "Date", "Amount paid", "Fee", "Status"]);
  ok("'Name' is guessed as the client code", g[0] === "client", g[0]);
  ok("'Amount paid' is guessed as the paid column", g[2] === "paidYN", g[2]);
  ok("'Fee' is guessed as the session fee", g[3] === "rate", g[3]);

  /* ===== the plan, from a sheet with no Time column and a datetime cell ===== */
  const before = S.sessions.length, clientsBefore = S.clients.length;
  const tsv = ["Client\tDate\tFee\tAmount paid\tStatus",
    "AB\t07/04/2026 10:00\t60\t60\tclosed",
    "CD\t08/04/2026\t\t\tcurrent"].join("\n");
  const rows = impSplit(tsv);
  ok("the paste splits into three rows", rows.length === 3, rows.length);
  const map = impGuess(rows[0]);
  const plan = impPlan(rows, map, impDateScan(rows.slice(1).map((r) => r[1])).order, { onDupe: "skip" });
  ok("both rows import", plan.recs.length === 2, plan.recs.length);
  const ab = plan.recs.find((r) => r.client === "AB"), cd = plan.recs.find((r) => r.client === "CD");
  ok("the time came from the date cell when there is no Time column", ab && ab.time === "10:00", ab && ab.time);
  ok("a bare amount in Amount paid means paid on the day", ab && ab.paidDate === "2026-04-07", ab && ab.paidDate);
  ok("the row with no amount is not paid", cd && cd.paidDate === "", cd && cd.paidDate);
  ok("'closed' lands the new client as Finished", plan.newClients.get("ab") && plan.newClients.get("ab").status === "Finished");
  ok("'current' lands the new client as Ongoing", plan.newClients.get("cd") && plan.newClients.get("cd").status === "Ongoing");
  ok("the row with no fee and no client rate is counted", plan.noFee === 1 && plan.noFeeClients.has("CD"), plan.noFee);
  ok("the row with a fee is not counted as fee-less", !plan.noFeeClients.has("AB"));

  /* ===== commit, and what it stamps ===== */
  delete settings().start;
  const res = await impCommit(plan);
  ok("the import commits", res.ok && res.n === 2, JSON.stringify(res));
  ok("two sessions were added", S.sessions.length === before + 2);
  ok("two clients were created", S.clients.length === clientsBefore + 2);
  const abRate = S.rateHistory.find((h) => impSame(h.client, "AB"));
  ok("AB's fee became dated history from the epoch", abRate && abRate.effectiveFrom === RATE_EPOCH && +abRate.rate === 60, JSON.stringify(abRate));
  ok("the imported AB session derives the £60 fee", derive(S.sessions.find((s) => s.client === "AB" && s.date === "2026-04-07")).rate === 60);
  ok("the Getting started card's records question is answered by the import", settings().start && settings().start.records === "imported");
  const again = impPlan(rows, map, "DMY", { onDupe: "skip" });
  ok("re-importing the same rows skips both as duplicates", again.recs.length === 0 && again.dupes === 2, again.dupes);

  /* ===== the sheets ===== */
  impOpen(); impTake(tsv); await sleep(20);
  ok("pasting lands on the column-matching sheet", sheetTitle().startsWith("Import"), sheetTitle());
  ok("the date column was found", _imp.map.indexOf("date") >= 0);
  closeSheet();
  impOpen(); impTake("Client\tDate\nXY\t09/04/2026"); await sleep(20); impStagePreview(); await sleep(20);
  ok("the preview warns about a fee-less row for a client with no rate", /1 row has no fee/.test(sheetText()), sheetText().slice(0, 200));
  closeSheet();

  impOpen(); impTake("EF\t07/04/2026\t60\nGH\t08/04/2026\t55"); await sleep(20);
  ok("a sheet with no heading row is told so", /looks like a session, not column headings/.test(sheetText()), sheetText().slice(0, 160));
  closeSheet();

  impOpen(); await sleep(20);
  const inp = document.getElementById("impFile");
  const dt = new DataTransfer(); dt.items.add(new File(["PK"], "sessions.xlsx")); inp.files = dt.files;
  inp.dispatchEvent(new Event("change")); await sleep(20);
  ok("picking a workbook explains how to save it as a .csv", /is a workbook, not a \.csv/.test(sheetText()) && /Save As/.test(sheetText()), sheetText().slice(0, 200));
  closeSheet();

  /* a fresh plan against the now-populated app: CD has no rate, so a fee-less row still warns */
  const tsv2 = "Client\tDate\nCD\t09/04/2026";
  const r2 = impSplit(tsv2), plan2 = impPlan(r2, impGuess(r2[0]), "DMY", { onDupe: "skip" });
  ok("a fee-less row for a client with no rate is counted on a second import too", plan2.noFee === 1, plan2.noFee);
  const tsv3 = "Client\tDate\nAB\t09/04/2026";
  const r3 = impSplit(tsv3), plan3 = impPlan(r3, impGuess(r3[0]), "DMY", { onDupe: "skip" });
  ok("a fee-less row for a client who has a rate is not a warning", plan3.noFee === 0, plan3.noFee);
  return out;
}

let failed = 0;
const file = readdirSync(dataDir).find((f) => f.includes("day-one") && f.endsWith(".json"));
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.normalize === "function" && typeof window.go === "function");
const state = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
await page.evaluate((st) => {
  window.commit = async () => true;
  window.download = () => {};                        /* the template button must not try to save a file */
  S = normalize(JSON.parse(JSON.stringify(st.state || st)));
  S.settings.onboarded = true; S.settings.features = {}; S.settings.coach = { off: true, seen: [] };
  try { tyMemoClear(); applySettings(); } catch (e) {}
  try { if (typeof flowClose === "function") flowClose(); } catch (e) {}
  document.querySelectorAll(".ov").forEach((n) => n.remove());
}, state);
const results = await page.evaluate(inPage);
const bad = results.filter((r) => !r.ok);
if (bad.length || errs.length) {
  failed++;
  console.log("✗ import");
  bad.forEach((r) => console.log(`    ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
  [...new Set(errs)].slice(0, 8).forEach((e) => console.log("    " + e));
} else console.log(`✓ import — ${results.length} checks`);
await page.close(); await browser.close(); srv.close();
console.log(failed ? "\nimport checks failed" : `\n${results.length}/${results.length} import checks passed`);
process.exit(failed ? 1 : 0);
