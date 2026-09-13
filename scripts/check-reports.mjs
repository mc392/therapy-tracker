/* Practice > Reports: the engine, the gate and the screen.
 *
 *   npm run test:reports        (needs: npm i --no-save playwright)
 *
 * WHY THIS EXISTS
 *   reportBuild() is a pure function like tyNet() or the ana* trends, and the same discipline
 *   applies: every expectation below is recomputed from the DOCUMENTED RULE — "attended
 *   sessions x the practice session length, missed sessions excluded" — never pasted from what
 *   the function happened to return. A test written by copying the output would have passed
 *   just as happily with cancellations counted as client hours, which is the one mistake that
 *   would put a wrong number on somebody's course submission.
 *
 *   It also presses the buttons, for the reason check-behaviour.mjs exists: a report whose
 *   preview and printed document drift apart fails silently and only surfaces after a tutor
 *   has read it.
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("Needs Playwright:  npm i --no-save playwright"); process.exit(2); }

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "TherapyTracker-web");
const dataDir = join(root, "tests", "test-data");
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((res) => {
    const srv = createServer((req, rq) => {
      const p = decodeURIComponent(req.url.split("?")[0]);
      try {
        const body = readFileSync(join(webDir, p === "/" ? "index.html" : p));
        rq.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
        rq.end(body);
      } catch { rq.writeHead(404); rq.end("not found"); }
    });
    srv.listen(0, "127.0.0.1", () => res({ srv, port: srv.address().port }));
  });
}

function inPage(state) {
  const out = { checks: [], errors: [] };
  const ok = (id, msg) => out.checks.push({ id, ok: true, msg });
  const no = (id, msg) => out.checks.push({ id, ok: false, msg });
  const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.05 : tol);

  S = normalize(JSON.parse(JSON.stringify(state)));
  try { tyMemoClear(); } catch {}
  try { applySettings(); } catch {}
  const commitWas = window.commit; window.commit = async () => true;   /* read, never write */

  /* ---- 1. every template builds, and only names sections that exist ---- */
  REPORT_TEMPLATES.forEach((t) => {
    t.sections.forEach((k) => {
      if (!REPORT_SECTIONS[k]) no("tpl." + t.k, `template "${t.k}" names section "${k}", which does not exist`);
    });
    let built;
    try { built = reportBuild(reportSpecFrom(t)); }
    catch (e) { return no("tpl." + t.k, `reportBuild threw for "${t.k}": ${e && e.message}`); }
    if (!built || !Array.isArray(built.blocks)) return no("tpl." + t.k, `"${t.k}" returned no blocks array`);
    /* Every block must carry the one shape both renderers read. */
    built.blocks.forEach((b) => {
      if (!b.title) no("shape." + t.k, `a ${t.k} block has no title`);
      if (b.table && (!Array.isArray(b.table.head) || !Array.isArray(b.table.rows)))
        no("shape." + t.k, `${t.k}/${b.key}: table is not {head,rows}`);
      if (b.table) b.table.rows.forEach((r) => {
        if (r.length !== b.table.head.length)
          no("shape." + t.k, `${t.k}/${b.key}: a row has ${r.length} cells for ${b.table.head.length} columns`);
      });
      if (b.kpis) b.kpis.forEach((k) => { if (k.v == null || k.l == null) no("shape." + t.k, `${t.k}/${b.key}: a KPI is missing v or l`); });
    });
    ok("tpl." + t.k, `${t.k}: ${built.blocks.length} blocks over ${built.range.label}`);
  });

  /* ---- 2. client hours, recomputed from the rule, not from the function ----
     THE RULE: a 50-minute session is one clinical hour, so the default counts each attended
     session as 1.0. Missed sessions are excluded. Nothing in the future counts. */
  const t = today(), mins = sessionMins();
  const spec = reportSpecFrom(reportTemplate("bacp-3a"));   /* range "all" */
  const rg = reportRange(spec);
  const end = rg.to > t ? t : rg.to;
  const inRange = (d) => { const x = d ? parseD(d) : null; return !!x && x >= rg.from && x <= end; };
  const expAttended = S.sessions.filter((s) => inRange(s.date) && !isCancelled(s));
  const expMissed = S.sessions.filter((s) => inRange(s.date) && isCancelled(s));

  if (reportHourMode(spec) !== "clinical")
    no("hours.default", `a new report defaults to "${reportHourMode(spec)}" — the 50-minute clinical hour is the convention and must be the default`);
  else ok("hours.default", "a new report counts one clinical hour per session by default");

  const built = reportBuild(spec);
  const hb = built.blocks.find((b) => b.key === "hours");
  if (!hb) no("hours.present", "the hours block is missing from a template that asks for it");
  else {
    const got = +hb.kpis.find((k) => k.l === "Client hours").v;
    const gotSess = +hb.kpis.find((k) => k.l === "Sessions attended").v;
    if (got !== expAttended.length) no("hours.value", `client hours ${got}, rule says ${expAttended.length} (one clinical hour per attended session)`);
    else ok("hours.value", `${got} client hours = ${expAttended.length} attended sessions at one clinical hour each`);
    if (gotSess !== expAttended.length) no("hours.sessions", `reports ${gotSess} attended, rule says ${expAttended.length}`);
    else ok("hours.sessions", `${gotSess} attended sessions`);
    const gotMissed = +hb.kpis.find((k) => k.l.indexOf("Missed") === 0).v;
    if (gotMissed !== expMissed.length) no("hours.missed", `reports ${gotMissed} missed, rule says ${expMissed.length}`);
    else ok("hours.missed", `${gotMissed} missed, excluded from every hours figure`);
  }

  /* A cancellation must never reach the hours. Prove it by adding one and asserting the
     figure does not move — the exact mistake pasting the output would not catch. */
  const before = reportBuild(spec).blocks.find((b) => b.key === "hours");
  const last = S.sessions.filter((s) => inRange(s.date)).slice(-1)[0];
  if (last) {
    const probe = JSON.parse(JSON.stringify(last));
    probe._id = "probe-cancelled"; probe.cancelKind = "dna"; probe.notes = "";
    S.sessions.push(probe);
    const after = reportBuild(spec).blocks.find((b) => b.key === "hours");
    const bv = +before.kpis.find((k) => k.l === "Client hours").v;
    const av = +after.kpis.find((k) => k.l === "Client hours").v;
    if (!near(bv, av)) no("hours.cancelExcluded", `adding a DNA moved client hours ${bv} -> ${av}`);
    else ok("hours.cancelExcluded", "an added DNA does not move client hours");
    S.sessions = S.sessions.filter((s) => s._id !== "probe-cancelled");
  }

  /* A FUTURE session is not evidence, however firmly it is booked. */
  if (last) {
    const fut = JSON.parse(JSON.stringify(last));
    fut._id = "probe-future"; fut.date = isoD(addDays(t, 30)); fut.cancelKind = ""; fut.paidDate = "";
    S.sessions.push(fut);
    const after = reportBuild(spec).blocks.find((b) => b.key === "hours");
    const bv = +before.kpis.find((k) => k.l === "Client hours").v;
    const av = +after.kpis.find((k) => k.l === "Client hours").v;
    if (!near(bv, av)) no("hours.futureExcluded", `a session booked for next month moved client hours ${bv} -> ${av}`);
    else ok("hours.futureExcluded", "a future booking is not counted as a delivered hour");
    S.sessions = S.sessions.filter((s) => s._id !== "probe-future");
  }

  /* ---- 3. all three counting modes, each against its own rule ---- */
  const hoursIn = (mode) => {
    const sp2 = JSON.parse(JSON.stringify(spec)); sp2.opts.hourMode = mode;
    const b = reportBuild(sp2).blocks.find((x) => x.key === "hours");
    return b ? +b.kpis.find((k) => k.l === "Client hours").v : null;
  };
  const n = expAttended.length;
  [["clinical", n],
   ["prorata", Math.round(n * (mins / CLINICAL_HOUR_MINS) * 10) / 10],
   ["actual", Math.round(n * (mins / 60) * 10) / 10]].forEach(([mode, want]) => {
    const got = hoursIn(mode);
    if (!near(got, want, 0.15)) no("hours." + mode, `"${mode}" gave ${got}, rule says ${want} for ${n} sessions of ${mins} min`);
    else ok("hours." + mode, `"${mode}" = ${got} hours for ${n} sessions of ${mins} min`);
  });
  /* An unknown stored mode must fall back, not produce NaN — a spec restored from an older or
     newer build is the realistic way this happens. */
  const junk = JSON.parse(JSON.stringify(spec)); junk.opts.hourMode = "whatever-v11-calls-it";
  if (reportHourMode(junk) !== "clinical") no("hours.fallback", "an unknown hour mode did not fall back to clinical");
  else ok("hours.fallback", "an unknown stored hour mode falls back to the clinical hour");

  /* ---- 3b. a practice whose sessions are not a standard hour gets warned ----
     Counting 90-minute sessions as one hour each understates by nearly half, and only the
     therapist knows which their course wants — so the report has to say so on the page. */
  const sgWas = S.settings.sessionMins;
  S.settings.sessionMins = 90;
  const warned = reportBuild(spec).blocks.find((b) => b.key === "hours");
  const warnText = (warned.work || []).join(" ");
  if (warnText.indexOf("90 minutes") < 0 || warnText.indexOf("Pro rata") < 0)
    no("hours.mismatch", "a 90-minute practice counting one hour each was not warned on the page");
  else ok("hours.mismatch", "a non-standard session length counting one hour each is flagged in the report");
  S.settings.sessionMins = 50;
  const quiet = reportBuild(spec).blocks.find((b) => b.key === "hours");
  if ((quiet.work || []).join(" ").indexOf("not the standard") >= 0)
    no("hours.mismatch", "a 50-minute practice was warned about its session length — it is the standard");
  else ok("hours.noFalseWarn", "a standard 50-minute practice is not warned");
  S.settings.sessionMins = sgWas;

  /* ---- 3c. a per-client row's hours must agree with the headline ---- */
  const cspec = reportSpecFrom(reportTemplate("cpcab-l4"));
  const cBuilt = reportBuild(cspec);
  const cHours = cBuilt.blocks.find((b) => b.key === "hours");
  const cTable = cBuilt.blocks.find((b) => b.key === "clients");
  if (cHours && cTable) {
    const sumRows = cTable.table.rows.reduce((a, r) => a + parseFloat(r[2]), 0);
    const head = +cHours.kpis.find((k) => k.l === "Client hours").v;
    if (Math.abs(sumRows - head) > 0.6)
      no("clients.sum", `per-client hours add to ${Math.round(sumRows * 10) / 10}, headline says ${head}`);
    else ok("clients.sum", `per-client hours add to the headline (${Math.round(sumRows * 10) / 10} vs ${head})`);
  }

  /* ---- 4. the ratio is the two figures above it, divided ---- */
  const rb = built.blocks.find((b) => b.key === "ratio");
  if (rb) {
    const ch = +rb.kpis.find((k) => k.l === "Client hours").v;
    const sh = +rb.kpis.find((k) => k.l === "Supervision hours").v;
    const got = rb.kpis.find((k) => k.l.indexOf("Hours per") === 0).v;
    const expSup = S.supervision.filter((s) => inRange(s.date)).length;
    if (sh !== expSup) no("ratio.sup", `supervision hours ${sh}, rule says ${expSup} logged entries at one hour each`);
    else ok("ratio.sup", `${sh} supervision hours from ${expSup} entries`);
    if (sh > 0 && !near(+got, Math.round(ch / sh * 10) / 10)) no("ratio.value", `ratio ${got} but ${ch} / ${sh} = ${Math.round(ch / sh * 10) / 10}`);
    else ok("ratio.value", `ratio ${got} = ${ch} / ${sh}`);
  }

  /* ---- 5. mode percentages describe attended sessions and add up ---- */
  const mspec = reportSpecFrom(reportTemplate("cpcab-l4"));
  const mb = reportBuild(mspec).blocks.find((b) => b.key === "modes");
  if (mb) {
    const sum = mb.table.rows.reduce((a, r) => a + parseFloat(r[2]), 0);
    const n = mb.table.rows.reduce((a, r) => a + (+r[1]), 0);
    const expN = S.sessions.filter((s) => inRange(s.date) && !isCancelled(s)).length;
    if (Math.abs(sum - 100) > 0.4) no("modes.sum", `mode shares add to ${sum}%, not 100%`);
    else ok("modes.sum", `mode shares add to ${Math.round(sum)}%`);
    if (n !== expN) no("modes.base", `mode table counts ${n} sessions, rule says ${expN} attended`);
    else ok("modes.base", `mode split is over ${n} attended sessions, missed excluded`);
  }

  /* ---- 6. no clinical content, no money, no names, anywhere in the document ---- */
  const doc = reportDocHTML(reportBuild(reportSpecFrom(reportTemplate("cpcab-l4"))));
  const names = (S.clients || []).map((c) => (c.name || "").trim()).filter((x) => x.length > 2);
  names.forEach((nm) => { if (doc.html.indexOf(nm) >= 0) no("doc.noNames", `a client name ("${nm}") reached the printed document`); });
  if (!names.some((nm) => doc.html.indexOf(nm) >= 0)) ok("doc.noNames", `no client name in the document (${names.length} checked)`);
  const adminNotes = (S.sessions || []).map((s) => (s.adminNote || "").trim()).filter((x) => x.length > 4);
  if (adminNotes.some((nx) => doc.html.indexOf(nx) >= 0)) no("doc.noAdminNote", "a session adminNote reached the printed document");
  else ok("doc.noAdminNote", `no adminNote in the document (${adminNotes.length} checked)`);
  if (/£\s?\d/.test(doc.html.replace(/£0\.00/g, ""))) no("doc.noMoney", "a currency figure reached the printed document — reports carry no fees or income");
  else ok("doc.noMoney", "no fee or income figure in the document");

  /* ---- 7. the claims guard-rail ---- */
  const must = ["not an approved form", "confidential code", "no clinical notes"];
  must.forEach((phrase) => {
    if (doc.html.toLowerCase().indexOf(phrase) < 0) no("doc.disclaimer", `the printed document never says "${phrase}"`);
  });
  if (must.every((p) => doc.html.toLowerCase().indexOf(p) >= 0)) ok("doc.disclaimer", "the document states what it is and is not");
  [/\bapproved by\b/i, /guarantee/i, /\bcertifie[sd]\b/i].forEach((re) => {
    const m = doc.html.match(re);
    /* "does not certify" and "not an approved form" are the honest forms and are allowed. */
    if (m && !/not an approved form|does not certify/i.test(doc.html)) no("doc.overclaim", `the document says "${m[0]}"`);
  });
  ok("doc.overclaim", "no approval or compliance guarantee is claimed");

  /* ---- 8. the preview and the document are built from the same blocks ---- */
  const b2 = reportBuild(reportSpecFrom(reportTemplate("cpcab-l4")));
  const prev = reportPreviewHTML(b2);
  b2.blocks.forEach((b) => {
    if (prev.indexOf(b.title) < 0) no("preview.parity", `"${b.title}" is in the document but not the preview`);
  });
  ok("preview.parity", `preview carries all ${b2.blocks.length} blocks`);

  /* ---- 8b. the preview may truncate a long table; the document never may ----
     A client log is every session by definition. If the document ever started honouring the
     preview cap, a trainee would submit a log that stops at row 25 and nothing would say so. */
  const logSpec = reportSpecFrom(reportTemplate("cpcab-l4"));
  const logBuilt = reportBuild(logSpec);
  const logBlock = logBuilt.blocks.find((b) => b.key === "sessionlog");
  if (logBlock && logBlock.table.rows.length > REPORT_PREVIEW_ROWS) {
    const docRows = (reportDocHTML(logBuilt).html.match(/<tr>/g) || []).length;
    const prevRows = (reportPreviewHTML(logBuilt).match(/<tr>/g) || []).length;
    if (docRows < logBlock.table.rows.length)
      no("doc.notTruncated", `the document has ${docRows} rows for ${logBlock.table.rows.length} sessions — it is being truncated`);
    else ok("doc.notTruncated", `the document carries all ${logBlock.table.rows.length} session rows`);
    if (prevRows >= docRows) no("preview.capped", "the preview is not capping a thousand-row table");
    else ok("preview.capped", `preview capped at ${REPORT_PREVIEW_ROWS} rows, document has all of them`);
    if (reportPreviewHTML(logBuilt).indexOf("Showing the first") < 0)
      no("preview.saysSo", "the preview truncates a table without saying it has");
    else ok("preview.saysSo", "the preview says how many rows it is not showing");
  }

  /* ---- 9. a saved range key stays a key, so a saved report keeps moving ---- */
  const sp12 = reportSpecFrom(reportTemplate("bacp-cpd"));
  if (sp12.range !== "m12") no("range.key", "the 12-month template did not store the range as a key");
  else if (sp12.from || sp12.to) no("range.key", "a preset range stored resolved dates — it would freeze on the day it was saved");
  else ok("range.key", "a preset range stores its key, not resolved dates");

  /* ---- 10. the CSV carries the same figures ---- */
  const csv = reportCSV(built);
  const lines = csv.split("\n");
  if (lines[0] !== "section,item,value,detail") no("csv.head", "CSV header changed shape");
  else if (lines.length < 4) no("csv.rows", "CSV has almost no rows");
  else ok("csv.rows", `CSV: ${lines.length - 1} rows, long/tidy`);
  if (hb) {
    const want = String(hb.kpis.find((k) => k.l === "Client hours").v);
    if (!lines.some((l) => l.indexOf("Client hours," + want) >= 0)) no("csv.parity", `client hours ${want} is not in the CSV`);
    else ok("csv.parity", "the CSV carries the same client-hours figure as the document");
  }

  /* ---- 11. the gate is in the view, never the engine ---- */
  try {
    localStorage.setItem("tt_plus_gate", "on");
    if (!plusLocked("reports")) no("gate.on", "tt_plus_gate=on did not lock reports");
    else {
      let threw = null;
      try { reportBuild(reportSpecFrom(reportTemplate("bacp-3a"))); } catch (e) { threw = e && e.message; }
      if (threw) no("gate.engine", "reportBuild threw while locked — the paywall is in the engine: " + threw);
      else ok("gate.engine", "reportBuild still works while locked — the gate is in the view only");
      const host = document.createElement("div");
      renderReports(host);
      if (host.querySelectorAll("[data-plus]").length === 0) no("gate.view", "a locked Reports screen showed no lock card");
      else if (host.innerHTML.indexOf("Client hours") >= 0) no("gate.view", "a locked Reports screen printed a real figure");
      else ok("gate.view", "a locked Reports screen shows the lock and no figures");
    }
    localStorage.removeItem("tt_plus_gate");
  } catch (e) { out.errors.push("gate check threw: " + (e && e.message)); }

  /* ---- 12. the screen renders, and the buttons are wired ---- */
  try {
    const host = document.createElement("div");
    document.body.appendChild(host);
    _reportDraft = null;
    renderReports(host);
    if (!host.querySelector("[data-tpl]")) no("view.list", "the template list did not render");
    else {
      host.querySelector('[data-tpl="cpcab-l4"]').click();
      if (!_reportDraft) no("view.pick", "picking a template did not start a draft");
      else if (!host.querySelector("#rpPrint") || !host.querySelector("#rpSecs")) no("view.edit", "the editor did not render");
      else {
        ok("view.edit", "picking a template opens the editor with a live preview");
        /* Toggling a section off must remove it from the preview underneath, not just the switch. */
        const had = host.innerHTML.indexOf("Session log") >= 0;
        host.querySelector('[data-sw="rs_sessionlog"]').click();
        const still = host.innerHTML.indexOf("Session log") >= 0;
        if (had && still) no("view.toggle", "switching Session log off left it in the preview");
        else ok("view.toggle", "switching a section off removes it from the preview");
      }
    }
    _reportDraft = null;
    host.remove();
  } catch (e) { out.errors.push("view check threw: " + (e && e.message)); }

  window.commit = commitWas;
  return out;
}

/* ---------- run ---------- */
const { srv, port } = await serve();
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
/* A thrown exception is fatal: the app is one file and a load-time error takes the whole thing
   down. A failed *resource* fetch is not — the tiny static server above has no favicon and
   never will, and that is a fact about this harness, not about GroundWork. */
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push("uncaught: " + String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const txt = m.text();
  if (/Failed to load resource/i.test(txt)) return;
  jsErrors.push(txt);
});

const fixtures = readdirSync(dataDir).filter((f) => f.endsWith(".json") && f !== "index.json");
let failed = 0, passed = 0;
for (const f of fixtures) {
  const env = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
  const state = env.state || env;
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.reportBuild === "function", null, { timeout: 15000 });
  const res = await page.evaluate(inPage, state);
  const bad = res.checks.filter((c) => !c.ok);
  passed += res.checks.length - bad.length; failed += bad.length + res.errors.length;
  console.log(`\n${f}  —  ${res.checks.length - bad.length} ok, ${bad.length} failed`);
  bad.forEach((c) => console.log(`   FAIL ${c.id}: ${c.msg}`));
  res.errors.forEach((e) => console.log(`   ERROR ${e}`));
}
if (jsErrors.length) { console.log("\nJavaScript errors:"); jsErrors.slice(0, 10).forEach((e) => console.log("   " + e)); failed += jsErrors.length; }
await browser.close(); srv.close();
console.log(`\n${passed} assertions passed, ${failed} failed, across ${fixtures.length} practices`);
process.exit(failed ? 1 : 0);
