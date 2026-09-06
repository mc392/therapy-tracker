/* Runs the Trends and Tax engines over every fixture in tests/test-data/ and reports.
 *
 *   node scripts/review-test-data.mjs [outDir]
 *
 * WHAT THIS IS
 *   tests/tax-tests.js checks the tax engine against the HMRC rule on small, purpose-built
 *   states. This checks both engines against WHOLE PRACTICES — four years of sessions, a fee
 *   rise, unpaid work, cancellations at four different charge percentages — and asserts the
 *   invariants that only appear at that size:
 *     · the four MTD quarters must add up to the year (that is how the missing per-session room
 *       fee in the SA103 boxes was found);
 *     · profitBreakdown must agree with tyNet, on both bases;
 *     · every ana* function must either be ready or say what is missing, and never throw;
 *     · every Trends and Tax screen must actually render — no crash screen, no console error.
 *
 * HOW IT RUNS THE APP
 *   The real index.html, in a real browser, served over http. Nothing is extracted or copied, so
 *   this cannot pass against a stale duplicate of code that has since changed. commit() is stubbed
 *   out before anything runs: the harness reads, it never writes.
 *
 * DATE-DEPENDENT, like the fixtures
 *   The fixtures are generated around an anchor date (see scripts/make-test-data.mjs) and the
 *   windows the engines use — last 12 months, last 26 weeks, this tax year — are relative to the
 *   real today. Regenerate the fixtures when the anchor drifts, or the readiness gates start
 *   reporting on data that has aged out.
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
/* Playwright is deliberately NOT a dependency of this project: `npm ci` runs on the release
   workflow, and `playwright` downloads a browser on install. Install it when you want to run
   this, and nowhere else:  npm i --no-save playwright  */
let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) {
  console.error("This needs Playwright, which is not a dependency of this repo on purpose.\n" +
    "  npm i --no-save playwright\n" +
    "then run this again. Set CHROMIUM_PATH if your Chromium lives somewhere unusual.");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "TherapyTracker-web");
const dataDir = join(root, "tests", "test-data");
const outDir = process.argv[2] || join(root, ".test-data-review");

/* Playwright's own bundled Chromium may not be the one installed in this environment. */
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((res) => {
    const srv = createServer((req, rq) => {
      const p = decodeURIComponent(req.url.split("?")[0]);
      const file = join(webDir, p === "/" ? "index.html" : p);
      try {
        const body = readFileSync(file);
        rq.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
        rq.end(body);
      } catch (e) { rq.writeHead(404); rq.end("not found"); }
    });
    srv.listen(0, "127.0.0.1", () => res({ srv, port: srv.address().port }));
  });
}

/* ---------- what gets run inside the page ----------
   One function, serialised into the browser. It receives the fixture state and returns a plain
   object; everything it touches is the app's own code. */
function inPage(state) {
  const out = { errors: [], checks: [], trends: {}, tax: {}, render: {} };
  const fail = (id, msg, detail) => out.checks.push({ id, ok: false, msg, detail: detail == null ? null : detail });
  const pass = (id, msg) => out.checks.push({ id, ok: true, msg });
  const num = (n) => (typeof n === "number" && isFinite(n)) ? Math.round(n * 100) / 100 : n;

  /* Load the fixture exactly as a restore would: normalize() does the migrations and defaults. */
  /* `S` is a top-level `let`, so it lives in the global LEXICAL scope, not on window —
     assigning window.S would create a second, unread copy. */
  S = normalize(JSON.parse(JSON.stringify(state)));
  try { tyMemoClear(); } catch (e) {}
  try { applySettings(); } catch (e) {}

  /* ===== Trends ===== */
  const ANAS = ["anaSeasonality", "anaFloor", "anaHourlyRate", "anaCapacity", "anaSlots",
    "anaWeeksWorked", "anaCohorts", "anaEpisodes", "anaDrifting", "anaSources", "anaDaysToPay",
    "anaLatePayers", "anaCostRatio", "anaFeeErosion", "anaSupervisionCadence", "anaLoad", "anaCPD"];
  ANAS.forEach((k) => {
    let r;
    try { r = window[k](); }
    catch (e) { out.errors.push(k + " threw: " + (e && e.message)); out.trends[k] = { threw: String(e && e.message) }; return; }
    if (!r || typeof r !== "object") { fail(k + ".shape", k + " returned " + String(r)); return; }
    if (!r.ready && !r.need) fail(k + ".need", k + " is not ready but does not say what is missing");
    out.trends[k] = r;
  });

  /* Every ana* result is serialised through JSON, and Dates inside them survive as ISO strings. */
  out.trends = JSON.parse(JSON.stringify(out.trends));

  /* --- trends invariants, each stated as the rule it comes from --- */
  const der = S.sessions.map((s) => ({ s, d: derive(s), dt: parseD(s.date) })).filter((x) => x.dt);
  const t = today();

  /* --- the drifting list, computed from its own stated rule ---
     "Anyone still marked as current whose gap has run past 1.5x their own usual interval and who
     has nothing in the diary." Building the expected set here rather than counting smells means a
     row that should not be there, and a row that should, both fail. */
  const attendedBy = {}, allBy = {};
  der.forEach((x) => {
    const k = (x.s.client || "").toLowerCase(); if (!k) return;
    (allBy[k] = allBy[k] || []).push(x);
    if (x.dt <= t && !isCancelled(x.s)) (attendedBy[k] = attendedBy[k] || []).push(x);
  });
  const lastAttended = (k) => (attendedBy[k] || []).reduce((m, x) => (!m || x.dt > m) ? x.dt : m, null);
  const expectDrift = S.clients.filter((c) => {
    const k = (c.code || "").toLowerCase();
    if (!k || clientCategory(c.status) === "Finished") return false;
    const last = lastAttended(k); if (!last) return false;
    if ((allBy[k] || []).some((x) => x.dt > t)) return false;        /* something is booked */
    return (t - last) / 86400000 > freqDays(c) * 1.5;
  }).map((c) => c.code).sort();
  const drift = out.trends.anaDrifting;
  if (drift && drift.rows) {
    const got = drift.rows.map((r) => r.c.code).sort();
    out.trends._driftExpected = expectDrift.length;
    if (got.join("|") !== expectDrift.join("|"))
      fail("drift.rows", "drifting list is " + got.length + " clients, the rule gives " + expectDrift.length,
        { extra: got.filter((c) => expectDrift.indexOf(c) < 0).slice(0, 6),
          missing: expectDrift.filter((c) => got.indexOf(c) < 0).slice(0, 6) });
    else pass("drift.rows", expectDrift.length + " drifting client(s), matching the rule");
  }

  /* --- episode length, likewise ---
     "Only FINISHED work counts": a client whose status says finished, OR who has been gone for
     three of their own intervals. A client discharged last week is the first without being the
     second, and that is the case the count has to include. */
  const expectEps = S.clients.filter((c) => {
    const k = (c.code || "").toLowerCase();
    if (!k || !(attendedBy[k] || []).length) return false;
    const last = lastAttended(k);
    return clientCategory(c.status) === "Finished" || (t - last) / 86400000 >= 3 * freqDays(c);
  }).length;
  const eps = out.trends.anaEpisodes;
  if (eps) {
    out.trends._episodesExpected = expectEps;
    if (eps.ready && eps.n !== expectEps)
      fail("episodes.n", "episode count is " + eps.n + ", the rule gives " + expectEps);
    else if (eps.ready) pass("episodes.n", eps.n + " completed episodes, matching the rule");
    else if (expectEps >= 4) fail("episodes.ready", "episodes says it needs four completed pieces of work but there are " + expectEps);
  }

  /* --- cost ratio: it must count what tyNet counts ---
     The card answers "what share of turnover does the practice cost to run", so its costs are the
     ones tyNet takes off: the finance ledger (which already has use of home folded in), monthly
     room rent, per-session room fees, and supervision. Derived here from the same rule rather
     than from the function under test. */
  const cr = out.trends.anaCostRatio;
  if (cr && cr.ready) {
    const from = addYears(t, -1);
    const led = ledgerBetween(from, t, { toDate: true });
    const inW = (d) => { const x = d ? parseD(d) : null; return x && x > from && x <= t; };
    const rooms = der.filter((x) => x.dt > from && x.dt <= t).reduce((a, x) => a + (x.d.roomRate || 0), 0);
    const sup = (S.supervision || []).concat(S.peerSupervision || [])
      .reduce((a, v) => a + (inW(v.date) ? (+v.cost || 0) : 0), 0);
    const expect = Math.round(led.expenses + led.roomRent + rooms + sup);
    out.trends._costsExpected = expect;
    if (Math.abs(cr.now.costs - expect) > 1)
      fail("costratio.total", "cost-ratio card says " + cr.now.costs + " of costs; the components tyNet subtracts come to " + expect,
        { ledgerExpenses: Math.round(led.expenses), useOfHomeInside: Math.round(led.useOfHome),
          monthlyRent: Math.round(led.roomRent), perSessionRooms: Math.round(rooms), supervision: Math.round(sup) });
    else pass("costratio.total", "costs of " + expect + " match what tyNet subtracts");
    const catSum = Math.round(cr.byCat.reduce((a, c) => a + c.amt, 0));
    /* Only recurring rows can straddle the window edge differently from the ledger; a pound or
       two of rounding is expected, a category quietly missing from the headline is not. */
    if (Math.abs(catSum - cr.now.costs) > Math.max(5, cr.now.costs * 0.02))
      fail("costratio.bycat", "the itemised categories add to " + catSum + " but the headline cost is " + cr.now.costs);
    else pass("costratio.bycat", "itemised categories add up to the headline");
  }

  /* ===== Tax ===== */
  const basis = taxBasis();
  const years = taxPlanYears();
  out.tax.basis = basis;
  out.tax.years = {};
  const money = (n) => Math.round((n || 0) * 100) / 100;

  years.forEach((y) => {
    const rec = {};
    try {
      const b = tyBounds(y);
      rec.net = tyNet(y, false);
      rec.netToDate = tyNet(y, true);
      rec.income = tyIncome(y, false);
      const L = taxLiability(y);
      rec.liability = { total: money(L.total), src: L.src, status: L.status, estimate: money(L.estimate), poa: money(L.poa) };
      rec.calc = { pa: money(L.calc.pa), incomeTax: money(L.calc.incomeTax), c4: money(L.calc.n1 + L.calc.n2),
        class2: money(L.calc.class2), sl: money(L.calc.sl), slPlan: L.calc.slPlan, region: L.calc.region,
        penGross: money(L.calc.penGross), total: money(L.calc.total) };
      const sc = taxSchedule(y);
      rec.schedule = { jan: isoD(sc.jan.date), janTotal: money(sc.jan.total), balancing: money(sc.jan.balancing),
        jul: isoD(sc.jul.date), julTotal: money(sc.jul.total), poaIn: money(sc.poaIn.each), poaInSrc: sc.poaIn.src,
        poaOut: money(sc.poaOut.each), poaOutSrc: sc.poaOut.src };
      const bd = profitBreakdown(b.start, b.end);
      rec.breakdown = { income: money(bd.income), costs: money(bd.costs.total), net: money(bd.net),
        sessions: bd.sessions.n, unpaid: money(bd.excluded.unpaid.total), personal: money(bd.excluded.personal.total),
        boxes: bd.costs.boxes.map((x) => ({ box: x.box, total: money(x.total) })) };
      const qs = mtdQuarters(y).map((q) => { const p = mtdPeriod(q); return { n: q.n, turnover: money(p.turnover), other: money(p.other), exp: money(p.expTotal), net: money(p.net) }; });
      rec.mtd = qs;
      const qSum = qs.reduce((a, q) => a + q.net, 0);
      rec.mtdSum = money(qSum);

      /* The reconciliation that matters: the four quarters, the breakdown and the year figure are
         three different walks over the same money and must agree. */
      if (Math.abs(qSum - rec.net) > 1) fail("mtd." + y, "MTD quarters (" + money(qSum) + ") do not reconcile to tyNet (" + rec.net + ") for " + y);
      if (Math.abs(bd.net - rec.net) > 1) fail("breakdown." + y, "profitBreakdown net (" + money(bd.net) + ") does not reconcile to tyNet (" + rec.net + ") for " + y);
      /* 31 January FOLLOWING the end of the tax year, and 31 July after that. */
      const sy = parseInt(y.slice(0, 4));
      if (isoD(sc.jan.date) !== (sy + 2) + "-01-31") fail("sched." + y, "January date is " + isoD(sc.jan.date) + ", expected " + (sy + 2) + "-01-31");
      if (isoD(sc.jul.date) !== (sy + 2) + "-07-31") fail("sched." + y, "July date is " + isoD(sc.jul.date) + ", expected " + (sy + 2) + "-07-31");
      /* Class 2 and student loan never form part of a payment on account. */
      if (L.src !== "actual" && Math.abs(L.poa - Math.max(0, L.calc.total - L.calc.class2 - L.calc.sl)) > 0.01)
        fail("poa." + y, "payments-on-account base for " + y + " includes Class 2 or student loan");
    } catch (e) {
      rec.threw = String(e && e.message);
      out.errors.push("tax " + y + " threw: " + (e && e.message));
    }
    out.tax.years[y] = rec;
  });

  try {
    const pot = taxPot();
    out.tax.pot = { ty: pot.ty, status: pot.status, earned: money(pot.earned), projected: money(pot.projected),
      projInc: money(pot.projInc), rate: Math.round(pot.rate * 1000) / 10, committed: money(pot.committed),
      floor: money(pot.floor), buffer: money(pot.buffer), target: money(pot.target),
      balance: pot.balance, byNext: money(pot.byNext), yearEnd: money(pot.yearEnd),
      next: pot.next ? { due: isoD(pot.next.due), total: money(pot.next.total), state: pot.next.state } : null };
    if (pot.projInc > 0 && pot.projected > 0 && pot.rate <= 0) fail("pot.rate", "set-aside rate is 0% while projected tax is " + money(pot.projected));
    if (pot.rate < 0 || pot.rate > 0.6) fail("pot.rate", "set-aside rate out of range: " + pot.rate);
  } catch (e) { out.errors.push("taxPot threw: " + (e && e.message)); }

  try {
    out.tax.timeline = taxTimeline().map((r) => ({ due: r.iso, total: money(r.total), state: r.state,
      outstanding: money(r.outstanding), parts: r.parts.map((p) => p.kind + " " + p.ty + " " + money(p.amount)) }));
    out.tax.timeline.forEach((r) => {
      if (r.state === "paid" && r.outstanding !== 0) fail("timeline.paid", r.due + " is marked paid but still outstanding");
      if (r.state === "unknown" && r.outstanding !== 0) fail("timeline.unknown", r.due + " is unknown but counted as outstanding");
    });
    const np = nextTaxPayment();
    out.tax.next = np ? { due: isoD(np.when), amount: money(np.amount), what: np.what } : null;
  } catch (e) { out.errors.push("taxTimeline threw: " + (e && e.message)); }

  try { out.tax.moments = taxMoments().map((m) => ({ id: m.id, title: m.title || m.h || null })); }
  catch (e) { out.errors.push("taxMoments threw: " + (e && e.message)); }

  /* Cross-basis reconciliation: whichever basis the practice is on, the OTHER one has to hold
     together too — a therapist can elect accruals at any time and every figure moves with them. */
  try {
    const other = basis === "cash" ? "accruals" : "cash";
    settings().taxBasis = other;
    tyMemoClear();
    out.tax.otherBasis = { basis: other, years: {} };
    years.forEach((y) => {
      const n = tyNet(y, false);
      const qSum = mtdQuarters(y).reduce((a, q) => a + mtdPeriod(q).net, 0);
      const bd = profitBreakdown(tyBounds(y).start, tyBounds(y).end);
      out.tax.otherBasis.years[y] = { net: n, mtdSum: money(qSum), breakdown: money(bd.net) };
      if (Math.abs(qSum - n) > 1) fail("mtd." + other + "." + y, "on the " + other + " basis the MTD quarters (" + money(qSum) + ") do not reconcile to tyNet (" + n + ") for " + y);
      if (Math.abs(bd.net - n) > 1) fail("breakdown." + other + "." + y, "on the " + other + " basis profitBreakdown (" + money(bd.net) + ") does not reconcile to tyNet (" + n + ") for " + y);
    });
    settings().taxBasis = basis;
    tyMemoClear();
  } catch (e) { out.errors.push("cross-basis threw: " + (e && e.message)); }

  /* ===== Session-level rules the two engines both rest on ===== */
  let naWithFee = 0, incompleteForNothing = 0;
  der.forEach((x) => {
    if (x.d.roomPaidNA && x.d.roomRate > 0 && roomFor(x.s.location) && roomBilling(roomFor(x.s.location)) !== "monthly") naWithFee++;
    if (!x.d.complete && notesDone(x.s) && x.d.roomPaidNA) incompleteForNothing++;
  });
  if (naWithFee) fail("room.na", naWithFee + " session(s) treated as having no room fee while a dated per-session fee applies");
  if (incompleteForNothing) fail("room.incomplete", incompleteForNothing + " session(s) incomplete despite notes done and no room fee to settle");

  out.summary = {
    clients: S.clients.length, sessions: S.sessions.length,
    finished: S.clients.filter((c) => clientCategory(c.status) === "Finished").length,
    active: activeClientCount(),
    basis, years,
    firstSession: S.sessions.map((s) => s.date).sort()[0] || null,
    practice: practiceName(),
  };

  /* ===== Do the screens actually draw? ===== */
  const screens = [
    ["home", null], ["sessions", null], ["practice", "clients"], ["practice", "trends"],
    ["practice", "rooms"], ["practice", "supervision"],
    ["money", "overview"], ["money", "costs"], ["money", "table"],
    ["tax", "now"], ["tax", "estimate"], ["tax", "payments"], ["tax", "allowances"], ["tax", "mtd"],
    ["settings", null],
  ];
  const trendSections = ["clients", "money", "time", "you"];
  screens.forEach(([tab, seg]) => {
    const key = tab + (seg ? "/" + seg : "");
    try {
      go(tab, seg ? { seg } : undefined);
      const m = document.getElementById("main");
      const crashed = /This screen couldn.t be shown/.test(m.textContent || "");
      out.render[key] = { crashed, chars: (m.textContent || "").length };
      if (crashed) fail("render." + key, "crash screen on " + key, (m.textContent || "").slice(0, 400));
    } catch (e) {
      out.render[key] = { threw: String(e && e.message) };
      fail("render." + key, "go(" + key + ") threw: " + (e && e.message));
    }
  });
  /* The Tax tab draws nothing until the disclaimer is acknowledged, so a fixture without
     `settings.taxAck` is testing the gate, not the figures. Recorded so a screen that looks empty
     in the output is explained rather than mysterious. */
  out.render._taxGate = !taxAcked();
  if (!taxAcked() && !/About the tax figures/.test(document.getElementById("main").textContent || "")) {
    /* only meaningful if the tab is on at all */
    if (feat("tax")) fail("tax.gate", "tax disclaimer not acknowledged but the gate did not appear");
  }

  /* Trends has four sections behind its own segment bar, built only when opened. */
  trendSections.forEach((sec) => {
    try {
      trendSeg = sec;   /* also a top-level let */
      go("practice", { seg: "trends" });
      const m = document.getElementById("main");
      const crashed = /This screen couldn.t be shown/.test(m.textContent || "");
      out.render["trends:" + sec] = { crashed, chars: (m.textContent || "").length,
        waiting: (m.innerHTML.match(/anaWaiting|Waiting for/g) || []).length };
      if (crashed) fail("render.trends." + sec, "crash screen on Trends › " + sec);
    } catch (e) {
      out.render["trends:" + sec] = { threw: String(e && e.message) };
      fail("render.trends." + sec, "Trends › " + sec + " threw: " + (e && e.message));
    }
  });

  return out;
}

/* ---------- driver ---------- */
const { srv, port } = await serve();
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
await page.waitForFunction(() => typeof go === "function" && typeof S === "object" && S && Array.isArray(S.sessions), null, { timeout: 30000 });
/* Read-only from here: nothing this harness does may write to the device. */
await page.evaluate(() => {
  window.commit = async () => true;   /* a function declaration, so this really does replace it */
  window.celebrate = () => {};
  try { Sfx.on = false; } catch (e) {}
  try { Confetti.burst = () => {}; } catch (e) {}
  window.__errs = [];
});

const files = readdirSync(dataDir).filter((f) => /^groundwork-testdata-.*\.json$/.test(f)).sort();
mkdirSync(outDir, { recursive: true });

const all = [];
for (const f of files) {
  const env = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
  const name = (env.testData && env.testData.profile) || f;
  consoleErrors.length = 0;
  /* Per-device settings this profile assumes. They are deliberately not in the backup — a pension
     contribution changes every tax figure and lives in localStorage, so a restore drops it. */
  await page.evaluate((d) => {
    try { ["tt_pension", "tt_default_rate"].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
    if (d) { try { Object.keys(d).forEach((k) => localStorage.setItem(k, d[k])); } catch (e) {} }
  }, (env.testData && env.testData.device) || null);
  const res = await page.evaluate(inPage, env.state);
  res.profile = name;
  res.file = f;
  res.consoleErrors = consoleErrors.slice(0, 40);
  writeFileSync(join(outDir, name + ".json"), JSON.stringify(res, null, 1));
  all.push(res);

  const bad = res.checks.filter((c) => !c.ok);
  console.log("\n=== " + name + " ===");
  console.log("  " + res.summary.sessions + " sessions · " + res.summary.clients + " clients · " +
    res.summary.basis + " basis · years " + res.summary.years.join(", "));
  Object.keys(res.tax.years).forEach((y) => {
    const r = res.tax.years[y];
    if (r.threw) { console.log("  " + y + "  THREW " + r.threw); return; }
    console.log("  " + y + "  net " + String(r.net).padStart(8) + "  tax " + String(r.liability.total).padStart(9) +
      " (" + r.liability.src + ")  jan " + r.schedule.jan + " " + r.schedule.janTotal);
  });
  const notReady = Object.keys(res.trends).filter((k) => res.trends[k] && res.trends[k].ready === false);
  console.log("  trends not ready: " + (notReady.length ? notReady.join(", ") : "none"));
  if (res.errors.length) console.log("  ERRORS: " + res.errors.join(" | "));
  if (res.consoleErrors.length) console.log("  CONSOLE: " + res.consoleErrors.slice(0, 5).join(" | "));
  bad.forEach((c) => console.log("  ✗ " + c.id + ": " + c.msg + (c.detail ? "  " + JSON.stringify(c.detail) : "")));
  if (!bad.length && !res.errors.length) console.log("  ✓ all invariants hold");
}

/* ---------- seasonal sweep ----------
   taxMoments() is pure and returns the prompts live TODAY — which, for most of the year, is none
   of them. Reviewing the Tax section on one date therefore says nothing about the part of it that
   only appears in January. The browser clock is moved to five dates that between them fall inside
   every window (file, jan-pay, jul-pay, new-year, mtd-q) and the ids are recorded. */
const SWEEP = ["2027-01-15", "2026-04-20", "2026-07-10", "2026-10-20", "2027-02-20"];
const sweep = {};
try {
  const p2 = await ctx.newPage();
  await p2.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
  await p2.waitForFunction(() => typeof go === "function" && typeof S === "object" && S && Array.isArray(S.sessions), null, { timeout: 30000 });
  await p2.evaluate(() => { window.commit = async () => true; });
  for (const f of files) {
    const env = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
    const name = (env.testData && env.testData.profile) || f;
    sweep[name] = {};
    for (const when of SWEEP) {
      await p2.clock.setFixedTime(new Date(when + "T10:00:00"));
      const got = await p2.evaluate((state) => {
        S = normalize(JSON.parse(JSON.stringify(state)));
        tyMemoClear();
        try {
          return { today: isoD(today()), ty: curTaxYear(),
            moments: taxMoments().map((m) => ({ id: m.id, title: m.title })),
            next: (function () { const n = nextTaxPayment(); return n ? isoD(n.when) + " " + Math.round(n.amount) : null; })(),
            potTarget: Math.round(taxPot().target) };
        } catch (e) { return { threw: String(e && e.message) }; }
      }, env.state);
      sweep[name][when] = got;
    }
  }
  await p2.close();
} catch (e) { console.log("seasonal sweep failed: " + e.message); }
writeFileSync(join(outDir, "_moments.json"), JSON.stringify(sweep, null, 1));
console.log("\nSeasonal prompts (taxMoments) by date:");
Object.keys(sweep).forEach((n) => {
  const line = SWEEP.map((d) => d + ": " + ((sweep[n][d] && sweep[n][d].moments) || []).map((m) => m.id).join("+") || d + ": —").join("  |  ");
  console.log("  " + n.padEnd(18) + line);
});

writeFileSync(join(outDir, "_all.json"), JSON.stringify(all, null, 1));
const failed = all.reduce((a, r) => a + r.checks.filter((c) => !c.ok).length + r.errors.length, 0);
console.log("\n" + files.length + " profiles · " + failed + " failed check(s) · full output in " + outDir);

await browser.close();
srv.close();
process.exit(failed ? 1 : 0);
