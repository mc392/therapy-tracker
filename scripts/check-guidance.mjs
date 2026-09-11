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
