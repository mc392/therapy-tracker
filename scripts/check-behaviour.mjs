/* Behaviour checks for the write paths, in a real browser against the whole-practice corpus.
 *
 *   npm run test:behaviour
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *   tests/tax-tests.js checks the tax engine against the HMRC rule. review-test-data.mjs checks
 *   the Trends and Tax ENGINES against whole practices. Neither presses a button. This one does:
 *   it opens the sheets, ticks the boxes and clicks Save, then asserts what ended up in `S`.
 *
 *   That gap is not theoretical. When room-fee settling moved out of the session form (Sep 2026)
 *   the form stopped reading `roomPaid` from a control it no longer renders. Had it gone on
 *   reading it, every save would have silently blanked a settlement — no error, no failing engine
 *   test, no crash. Only pressing Save and looking at the record afterwards catches that.
 *
 * EXPECTATIONS COME FROM THE RULE, NEVER FROM THE FUNCTION
 *   Same discipline as the tax suite. Where a figure is asserted, it is recomputed here from the
 *   documented rule (the split at the session date, the drift as now-minus-then, the gap as fee
 *   written off) and compared. A check written by pasting in what the code returned would have
 *   passed against the very bugs this exists to stop.
 *
 * commit() is stubbed before anything runs: the harness reads and mutates its own in-memory
 * copy of a fixture, and never writes to a database.
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

/* Four profiles, chosen for what each one exercises rather than for coverage's sake:
     winding-down      per-session room fees in volume, every session charged in full
     chaotic-payments  cancellations at 0/50/75/100%, so the fee-erosion gap is non-zero
     online-only       paid in advance — the days-to-payment split has something to split
     established       four years, a fee rise, a room rate rise                              */
const PROFILES = ["winding-down", "chaotic-payments", "online-only", "established"];

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

/* Runs inside the page, with the fixture already loaded into S. */
async function inPage() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const skip = (name, why) => out.push({ name, skip: true, detail: why });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ===== Room fees: raised by the session, settled in Money ===== */
  ok("missingReasons() never asks about the room",
    !S.sessions.some((s) => missingReasons(s).some((m) => /room/i.test(m))));

  const owedNow = S.sessions.filter((s) => derive(s).roomOwed);
  if (!owedNow.length) skip("room-fee checks", "this practice has no per-session room fees");
  else {
    /* A past session that is written up is complete, however its room fee stands. */
    const writtenUp = S.sessions.find((s) => derive(s).roomOwed && derive(s).past && notesDone(s));
    if (writtenUp) ok("an unsettled room fee does not make a session incomplete",
      derive(writtenUp).complete === true);

    /* roomOwed's three states, from the rule: "Y" settled, "n/a" not owed, anything else owed. */
    const t = owedNow[0], keep = { p: t.roomPaid, d: t.roomPaidDate };
    t.roomPaid = "Y";   ok('roomPaid "Y" is not owed',    derive(t).roomOwed === false);
    t.roomPaid = "n/a"; ok('roomPaid "n/a" is not owed',  derive(t).roomOwed === false);
    t.roomPaid = "";    ok("blank means not settled yet", derive(t).roomOwed === true);
    t.roomPaid = "N";   ok('a legacy "N" is still owed',  derive(t).roomOwed === true);
    t.roomPaid = keep.p; t.roomPaidDate = keep.d;

    /* THE ONE THAT MATTERS: the form no longer owns these fields and must not touch them. */
    const s2 = S.sessions.find((x) => derive(x).roomOwed && x.date);
    s2.roomPaid = "Y"; s2.roomPaidDate = "2026-01-15";
    const id = s2._id;
    sessionForm(s2); await sleep(80);
    const save = document.querySelector("#sheetBody #save");
    ok("the session form opens", !!save);
    if (save) { save.click(); await sleep(250); }
    const after = S.sessions.find((x) => x._id === id);
    ok("saving a session preserves roomPaid",     after.roomPaid === "Y", after.roomPaid);
    ok("saving a session preserves roomPaidDate", after.roomPaidDate === "2026-01-15", after.roomPaidDate);
    closeSheet();

    /* The settle sheet writes what the bulk editor always wrote. */
    const loc = roomFeeRows()[0].loc;
    const before = roomFeeRows().filter((r) => r.loc === loc).length;
    roomDueSheet(loc); await sleep(100);
    const boxes = [...document.querySelectorAll("#rdRows input[type=checkbox]")];
    ok("the settle sheet lists the outstanding fees", boxes.length > 0, boxes.length);
    const clearAll = (bs) => bs.forEach((b) => { if (b.checked) { b.checked = false; b.dispatchEvent(new Event("change")); } });
    clearAll(boxes);
    boxes[0].checked = true; boxes[0].dispatchEvent(new Event("change"));
    const paidId = boxes[0].dataset.id;
    document.querySelector("#rdDate").value = "2026-03-04";
    document.querySelector("#rdSave").click(); await sleep(250);
    const paid = S.sessions.find((x) => x._id === paidId);
    ok("Mark paid writes roomPaid=Y",              paid.roomPaid === "Y", paid.roomPaid);
    ok("Mark paid writes the date that was chosen", paid.roomPaidDate === "2026-03-04", paid.roomPaidDate);
    ok("a settled fee leaves the outstanding list", roomFeeRows().filter((r) => r.loc === loc).length === before - 1);
    closeSheet();

    if (roomFeeRows().some((r) => r.loc === loc)) {
      roomDueSheet(loc); await sleep(100);
      const b2 = [...document.querySelectorAll("#rdRows input[type=checkbox]")];
      clearAll(b2);
      b2[0].checked = true; b2[0].dispatchEvent(new Event("change"));
      const naId = b2[0].dataset.id;
      document.querySelector("#rdNA").click(); await sleep(250);
      ok('Not owed writes roomPaid="n/a"', S.sessions.find((x) => x._id === naId).roomPaid === "n/a");
      ok("a written-off fee leaves the list", !roomFeeRows().some((r) => r.s._id === naId));
      closeSheet();
    }
  }

  /* ===== CPD ===== */
  S.cpd = [];
  const base = cpdYearHours();
  cpdForm(null); await sleep(80);
  const f = (q) => document.querySelector("#sheetBody " + q);
  f("#c_date").value = isoD(addDays(today(), -10));
  f("#c_hrs").value = "6"; f("#c_kind").value = "workshop"; f("#c_title").value = "Trauma day";
  f("#cSave").click(); await sleep(250);
  const now = cpdYearHours();
  ok("a CPD entry is saved",                 (S.cpd || []).length === 1);
  ok("its hours reach the total",            now.total === base.total + 6, base.total + " -> " + now.total);
  ok("they land under 'own', not supervision", now.own === 6 && now.sup === base.sup);
  ok("it appears in the composition",        now.parts.some((p) => p.n === CPD_KINDS.workshop.n && p.hrs === 6));
  closeSheet();

  /* Switching supervision off takes the hours out of the TARGET, never out of the record. */
  const withSup = cpdYearHours();
  S.settings.cpdCountSupervision = false;
  const without = cpdYearHours();
  ok("switching supervision off drops exactly its hours from the total",
    without.total === withSup.total - withSup.supCounted,
    withSup.total + " -> " + without.total + " (supervision " + withSup.supCounted + ")");
  ok("the supervision hours are still recorded", without.sup === withSup.sup);
  ok("the excluded hours are reported",          without.excluded === withSup.sup);
  ok("anaCPD's pace follows the same switch",    anaCPD().countsSup === false);
  S.settings.cpdCountSupervision = true;

  /* ===== Days to payment: up-front payments never enter the waiting figure ===== */
  const gaps = S.sessions.map((s) => ({ s, dt: parseD(s.date) }))
    .filter((x) => x.dt && x.dt <= today() && x.s.paidDate && parseD(x.s.paidDate))
    .map((x) => Math.round((parseD(x.s.paidDate) - x.dt) / 86400000));
  const d = anaDaysToPay();
  if (!d.ready) skip("days-to-payment checks", d.need);
  else {
    const late = gaps.filter((g) => g > 0), up = gaps.filter((g) => g <= 0);
    ok("every dated payment is counted", d.n === gaps.length, d.n + " vs " + gaps.length);
    ok("the split is at the session date",
      d.nUpfront === up.length && d.nLate === late.length,
      d.nUpfront + "/" + d.nLate + " vs " + up.length + "/" + late.length);
    ok("the wait is the median of the genuine waits alone",
      late.length ? d.avg === Math.round(anaMedian(late)) : d.avg === null, d.avg);
    ok("over-30-day waits exclude up-front payments", d.over30 === late.filter((g) => g > 30).length);
    ok("the up-front percentage matches the rows",
      d.upfrontPct === Math.round(up.length / gaps.length * 100), d.upfrontPct);
  }

  /* ===== Fee erosion: the gap is written-off fee, and nothing else can be in it ===== */
  const fe = anaFeeErosion();
  if (!fe.ready) skip("fee-erosion checks", fe.need);
  else {
    ok("gap x sessions reconciles to the pounds written off",
      Math.abs(Math.round(fe.gap * fe.sessions) - fe.lost) <= fe.sessions,
      Math.round(fe.gap * fe.sessions) + " vs " + fe.lost);
    ok("only missed sessions sit behind the gap", fe.missedCharged <= fe.missed);
    ok("a session that went ahead earns at least the booked average", fe.att >= fe.eff, fe.att + " vs " + fe.eff);
    ok("no gap means nothing was written off", fe.gap > 0 || fe.lost === 0);
  }

  /* ===== Who pays late: drift, not debt ===== */
  const lp = anaLatePayers();
  if (!lp.ready) skip("late-payer checks", lp.need);
  else {
    const trended = lp.rows.filter((r) => r.drift != null);
    ok("clients with enough history get a trend", trended.length > 0, trended.length);
    ok("nobody below the minimum gets one",       trended.every((r) => r.n >= lp.minPays));
    ok("drift is the later half minus the earlier", trended.every((r) => r.drift === r.now - r.then));
    ok("the list is ordered by drift, worst first",
      trended.every((r, i) => i === 0 || trended[i - 1].drift >= r.drift));
    ok("owing money does not push a client to the top",
      trended.every((r) => r.owed === 0) || lp.rows[0].drift == null ||
      lp.rows.every((r) => r.drift == null || lp.rows[0].drift >= r.drift));
  }
  return out;
}

let failed = 0;
for (const name of PROFILES) {
  const file = readdirSync(dataDir).find((f) => f.includes(name) && f.endsWith(".json"));
  if (!file) { console.log(`✗ ${name} — fixture not found`); failed++; continue; }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.normalize === "function" && typeof window.go === "function");
  const state = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
  await page.evaluate((st) => {
    window.commit = async () => true;                 /* reads and in-memory edits only */
    /* `S` is a top-level `let` — it lives in the global LEXICAL scope, so assigning window.S
       would create a second copy that nothing reads. Assign the bare name. */
    S = normalize(JSON.parse(JSON.stringify(st.state || st)));
    S.settings.onboarded = true;
    S.settings.features = {};                         /* every feature on: this tests code, not gating */
    S.settings.coach = { off: true, seen: [] };       /* a tip overlay would swallow the clicks */
    try { tyMemoClear(); applySettings(); } catch (e) {}
    try { if (typeof flowClose === "function") flowClose(); } catch (e) {}
    document.querySelectorAll(".ov").forEach((n) => n.remove());
  }, state);

  const results = await page.evaluate(inPage);
  const bad = results.filter((r) => !r.ok && !r.skip);
  const skipped = results.filter((r) => r.skip);
  if (bad.length || errs.length) {
    failed++;
    console.log(`✗ ${name}`);
    bad.forEach((r) => console.log(`    ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
    [...new Set(errs)].slice(0, 5).forEach((e) => console.log("    " + e));
  } else {
    console.log(`✓ ${name} — ${results.length - skipped.length} checks` +
      (skipped.length ? ` (${skipped.length} n/a: ${skipped.map((s) => s.detail).join("; ")})` : ""));
  }
  await page.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} profile(s) with failures` : "\nEvery behaviour check passed on every profile");
process.exit(failed ? 1 : 0);
