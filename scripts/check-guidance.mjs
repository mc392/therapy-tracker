/* Guidance checks: the info icons, the app map and What's new, in a real browser.
 *
 *   npm run test:guidance
 *
 * WHAT THIS CATCHES
 *   An info dot whose key was never registered opens nothing — no error, no toast, just a dead
 *   tap. A screen that draws an info link without calling wireInfo() has the same failure. Both
 *   are silent and both have happened. So this walks every screen, segment and sub-tab the app
 *   map lists, plus the forms that carry an info dot, and fires every [data-info] it finds,
 *   asserting a sheet opens with real text in it.
 *
 *   It also opens "Where everything is" and clicks every row, and steps through What's new, so
 *   a broken hand-off in either is a failing test rather than a lost reader.
 *
 * commit() is stubbed first: the harness reads and mutates its own in-memory copy of a fixture.
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

/* Runs inside the page, with the fixture already loaded into S. */
async function inPage(profile) {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sheetOpen = () => document.getElementById("sheet").classList.contains("open");
  const sheetText = () => document.getElementById("sheetBody").textContent.replace(/\s+/g, " ").trim();
  const sheetTitle = () => document.getElementById("sheetTitle").textContent.trim();
  const fakeEv = { stopPropagation() {}, preventDefault() {} };

  /* ---- every info dot and link, on every screen the map lists ---- */
  const fired = new Set();
  const fireInfo = (host, where) => {
    host.querySelectorAll("[data-info]").forEach((n) => {
      const k = n.dataset.info;
      const tag = where + " → " + k;
      if (fired.has(tag)) return;
      fired.add(tag);
      ok("info topic registered: " + tag, !!INFO[k]);
      ok("info link wired: " + tag, typeof n.onclick === "function");
      if (!n.onclick) return;
      try { n.onclick(fakeEv); } catch (e) { ok("info opens without throwing: " + tag, false, e.message); return; }
      ok("info sheet has text: " + tag, sheetOpen() && sheetText().length > 40, sheetTitle());
      closeSheet();
    });
  };
  const screens = [];
  APP_MAP.forEach((sec) => {
    if (sec.tab === "settings") { screens.push(["settings", {}]); return; }
    sec.rows.filter((r) => !r[3] || r[3]()).forEach((r) => screens.push([sec.tab, r[0] ? { seg: r[0] } : {}]));
  });
  for (const [tab, opts] of screens) {
    if (tab === "practice" && opts.seg === "trends") {
      for (const seg of ["clients", "money", "time", "you"]) {
        trendSeg = seg; go(tab, opts); await sleep(30); fireInfo(document.getElementById("main"), "practice/trends/" + seg);
      }
      continue;
    }
    if (tab === "practice" && opts.seg === "supervision") {
      for (const st of ["log", "peer", "cpd", "metrics"]) {
        supTab = st; go(tab, opts); await sleep(30); fireInfo(document.getElementById("main"), "practice/supervision/" + st);
      }
      continue;
    }
    go(tab, opts); await sleep(30);
    fireInfo(document.getElementById("main"), tab + (opts.seg ? "/" + opts.seg : ""));
  }
  /* the forms and sheets that carry an info dot of their own */
  const sheets = [
    ["session form", () => sessionForm(S.sessions[0])],
    ["client form", () => clientForm(S.clients[0])],
    ["peer supervision form", () => peerForm(null)],
    ["CPD settings", () => cpdSettingsSheet()],
    ["where everything is", () => appMapSheet()]
  ];
  for (const [name, open] of sheets) {
    try { open(); } catch (e) { ok("opens: " + name, false, e.message); continue; }
    ok("opens: " + name, sheetOpen());
    fireInfo(document.getElementById("sheetBody"), name);
    closeSheet();
  }

  /* ---- the app map: every row is a link that lands somewhere ---- */
  appMapSheet();
  const rowCount = document.querySelectorAll("#sheetBody [data-map]").length;
  ok("app map lists the screens and the jobs", rowCount >= 20, rowCount);
  ok("app map leaves out a switched-off feature",
    !!(() => { S.settings.features.raw = false; appMapSheet();
      const gone = ![...document.querySelectorAll("#sheetBody .li-title")].some((n) => n.textContent === "Table");
      S.settings.features.raw = true; return gone; })());
  for (let i = 0; i < rowCount; i++) {
    appMapSheet();
    const row = document.querySelectorAll("#sheetBody [data-map]")[i];
    const label = row.querySelector(".li-title").textContent;
    try { row.click(); } catch (e) { ok("map row works: " + label, false, e.message); continue; }
    await sleep(20);
    /* a screen row closes the sheet and lands on a tab; a job row may open a form instead */
    ok("map row works: " + label, !sheetOpen() || sheetTitle() !== "Where everything is", sheetTitle());
    if (sheetOpen()) closeSheet();
  }
  ok("a Settings row opens its group", (() => { appMapSheet();
    const r = [...document.querySelectorAll("#sheetBody [data-map]")].find((n) => n.querySelector(".li-title").textContent === "Data & backup");
    r.click(); const d = document.querySelector('.sgrp[data-g="data"]'); return curTab() === "settings" && d && d.open; })());

  /* ---- an empty Home offers the map, and the map opens from it ---- */
  (() => { const keep = S.sessions; S.sessions = []; go("home");
    const link = document.querySelector("#main #hMap");
    ok("empty Home links to the map", !!link);
    if (link) { link.onclick(); ok("the map opens from the empty Home", sheetOpen() && sheetTitle() === "Where everything is"); closeSheet(); }
    S.sessions = keep; go("home"); })();

  /* ---- Getting started: derived from the data, two stored answers, dismissable ---- */
  delete S.settings.start;
  if (profile === "day-one") {
    go("home"); await sleep(20);
    ok("an early practice sees the Getting started card", !!document.getElementById("startCard"));
    const rec = startItems().find((i) => i.k === "records");
    ok("the records question leads and is open", rec && !rec.done && document.querySelector('#startCard [data-start]').dataset.start === "records");

    /* setup's "yes, but not this minute" is a job still outstanding, never an answer: it must not
       tick the row, and it is what sends the reader here to finish it. */
    S.settings.start = { recordsLater: true }; go("home"); await sleep(20);
    const waiting = startItems().find((i) => i.k === "records");
    ok("'I'll bring them in' leaves the records row open", waiting && !waiting.done && waiting.lead === true);
    ok("and the row says to start there", /Start here/.test(document.querySelector('#startCard [data-start="records"]').textContent));
    ok("the tour gains a stop pointing at that row", tourSteps().length === 9 && tourSteps().some((s) => s.sel === '#startCard [data-start="records"]'));
    ok("the tour's intro counts its own stops", /Nine short stops/.test(tourSteps()[0].body));
    S.settings.start = { records: "imported" };
    ok("records actually brought in tick the row and drop the stop",
      startItems().find((i) => i.k === "records").done && tourSteps().length === 8);
    delete S.settings.start; go("home"); await sleep(20);

    document.querySelector('#startCard [data-start="records"]').click(); await sleep(20);
    ok("tapping it opens the records chooser", sheetOpen() && sheetTitle() === "Your existing records", sheetTitle());
    ok("the chooser offers a spreadsheet, a backup and starting fresh",
      !!document.getElementById("rsSheet") && !!document.getElementById("rsBackup") && !!document.getElementById("rsFresh"));
    document.getElementById("rsFresh").click(); await sleep(40);
    ok("'starting fresh' is stored and the row ticks", S.settings.start.records === "fresh" && startItems().find((i) => i.k === "records").done);
    ok("the card redraws with the row done", !!document.querySelector('#startCard .li-title.done'));
    const alt = document.querySelector('#startCard [data-startalt="rooms"]');
    ok("'I only work from home' is offered on the rooms row", !!alt);
    if (alt) { alt.click(); await sleep(40); ok("'home only' is stored and the row ticks", S.settings.start.homeOnly === true && startItems().find((i) => i.k === "rooms").done); }
    ok("a policy nobody touched is not 'chosen'", cancelChosen() === false);
    document.getElementById("startHide").click(); await sleep(40);
    ok("hiding the card sticks", S.settings.start.dismissed === true && !document.getElementById("startCard"));
    delete S.settings.start;
  } else {
    go("home"); await sleep(20);
    ok("an established practice never sees Getting started", !document.getElementById("startCard") && !startVisible(), S.sessions.length);
  }

  /* ---- Still on defaults, in Settings › Your practice ---- */
  (() => { const keep = { cx: S.settings.cancelRulesChosen, rules: S.settings.cancelRules, pay: S.settings.payTo, reg: S.settings.taxRegionYears, sm: S.settings.sessionMins };
    delete S.settings.cancelRulesChosen; S.settings.cancelRules = { window: [{ hoursBefore: 24, chargePct: 100 }], dnaChargePct: 100 };
    S.settings.payTo = ""; S.settings.taxRegionYears = {}; delete S.settings.sessionMins; delete S.settings.fullWeekSessions;
    go("settings"); 
    const card = document.getElementById("decisionsCard");
    ok("the defaults card lists the undecided settings", card && /Cancellation policy/.test(card.textContent) && /like to be paid/.test(card.textContent) && /income tax/.test(card.textContent), card && card.textContent.slice(0, 120));
    S.settings.cancelRulesChosen = true; S.settings.payTo = "Bank transfer"; S.settings.taxRegionYears = { "2026-27": "rUK" }; S.settings.sessionMins = 50;
    go("settings");
    ok("the defaults card disappears once everything is decided", !document.getElementById("decisionsCard"));
    S.settings.cancelRulesChosen = keep.cx; S.settings.cancelRules = keep.rules; S.settings.payTo = keep.pay; S.settings.taxRegionYears = keep.reg; S.settings.sessionMins = keep.sm; })();

  /* ---- Search & help ---- */
  ok("the header has the search-and-help button", !!document.getElementById("helpBtn") && typeof document.getElementById("helpBtn").onclick === "function");
  go("home"); findSheet(); await sleep(80);
  ok("the sheet opens with help rows before anything is typed",
    sheetOpen() && sheetTitle() === "Search & help" && document.querySelectorAll("#findRes [data-find]").length >= 3);
  const q = document.getElementById("findQ");
  const code = S.clients[0] && S.clients[0].code;
  if (code) { q.value = code; q.oninput(); ok("a client code finds the client", /Clients/.test(document.getElementById("findRes").textContent) && document.querySelector("#findRes [data-find]"), code); }
  q.value = "backup"; q.oninput();
  ok("'backup' finds the setting and the screen", /Settings/.test(document.getElementById("findRes").textContent), document.getElementById("findRes").textContent.slice(0, 80));
  q.value = "payments on account"; q.oninput();
  ok("an explanation can be searched for", /Explanations/.test(document.getElementById("findRes").textContent));
  q.value = "zzzz-nothing"; q.oninput();
  ok("no match says so", /Nothing matches/.test(document.getElementById("findRes").textContent));
  q.value = "Backup & restore"; q.oninput(); await sleep(10);
  const hit = [...document.querySelectorAll("#findRes [data-find]")].find((n) => /Backup & restore/.test(n.textContent));
  if (hit) { hit.click(); await sleep(150); ok("a settings hit lands in Settings with its group open", curTab() === "settings" && document.querySelector('.sgrp[data-g="data"]').open); }
  if (sheetOpen()) closeSheet();

  /* ---- the two new attention rows ---- */
  (() => { const keepC = S.clients.map((c) => ({ c, st: c.status })), keepSup = S.supervision, keepCpd = S.cpd, keepF = S.settings.features;
    const c0 = S.clients.find((c) => S.sessions.some((s) => s.client === c.code));
    if (c0) { c0.status = "Finished";
      const ss = S.sessions.filter((s) => s.client === c0.code); const keepDates = ss.map((s) => s.date);
      ss.forEach((s) => { s.date = "2015-01-05"; });
      const items = attentionItems();
      ok("a client past their retention date is raised on Home", items.some((i) => /retention date/.test(i.msg)), items.map((i) => i.msg).join(" | "));
      ss.forEach((s, i) => { s.date = keepDates[i]; }); }
    S.supervision = []; S.cpd = []; S.peerSupervision = [];
    const items2 = attentionItems();
    ok("CPD that has stopped is raised on Home (given enough history)", S.sessions.length < 20 || items2.some((i) => /No CPD/.test(i.msg)), items2.map((i) => i.msg).join(" | "));
    keepC.forEach((k) => { k.c.status = k.st; }); S.supervision = keepSup; S.cpd = keepCpd; S.settings.features = keepF; })();

  /* ---- setup: the records question tells you the options, it never answers for you ---- */
  (() => { const w = { records: null, features: {} }; const host = document.createElement("div");
    stepImport(w).mount(host);
    ok("setup offers two honest answers about previous records",
      host.querySelectorAll("#spRec .palopt").length === 2
      && !!host.querySelector('#spRec .palopt[data-r="later"]') && !!host.querySelector('#spRec .palopt[data-r="fresh"]'));
    ok("it says which kind adds and which replaces", /adds/.test(host.textContent) && /replaces/.test(host.textContent));
    host.querySelector('#spRec .palopt[data-r="later"]').click();
    ok("saying 'I'll bring them in' opens nothing and ticks nothing", w.records === "later" && !sheetOpen());
    host.querySelector('#spRec .palopt[data-r="fresh"]').click();
    ok("choosing 'starting fresh' is remembered for setupSave", w.records === "fresh"); })();
  ok("the restore-a-backup route is still offered in the step", typeof setupRestoreBackup === "function");

  /* ---- What's new and the tour build and run through ---- */
  ok("tour has its eight stops", tourSteps().length === 8);
  showWhatsNew();
  ok("What's new is showing", !!_flow && _flow.steps.length >= 4, _flow && _flow.steps.length);
  let steps = 0;
  while (_flow && steps < 20) { flowNext(); steps++; }
  ok("What's new steps through to the end", !_flow, steps);

  return out;
}

const PROFILES = ["established", "day-one"];
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
    window.commit = async () => true;
    S = normalize(JSON.parse(JSON.stringify(st.state || st)));
    S.settings.onboarded = true;
    S.settings.features = {};                         /* every feature on: this tests wiring, not gating */
    S.settings.taxAck = true;                         /* the Tax tab draws nothing until acknowledged */
    S.settings.coach = { off: true, seen: [] };
    try { tyMemoClear(); applySettings(); } catch (e) {}
    try { if (typeof flowClose === "function") flowClose(); } catch (e) {}
    document.querySelectorAll(".ov").forEach((n) => n.remove());
  }, state);
  const results = await page.evaluate(inPage, name);
  const bad = results.filter((r) => !r.ok);
  if (bad.length || errs.length) {
    failed++;
    console.log(`✗ ${name}`);
    bad.forEach((r) => console.log(`    ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
    [...new Set(errs)].slice(0, 8).forEach((e) => console.log("    " + e));
  } else {
    console.log(`✓ ${name} — ${results.length} checks`);
  }
  await page.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} profile(s) with failures` : "\nEvery guidance check passed on every profile");
process.exit(failed ? 1 : 0);
