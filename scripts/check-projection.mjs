/* Where this year lands — the year-end projection, in a real browser.
 *
 *   npm run test:projection
 *
 * WHY THIS EXISTS
 *   The card puts three different answers to "what will this year come to" on one screen, and
 *   every way it can be wrong is a wrong number rather than a broken page:
 *
 *     1. **A run rate that disagrees with Tax › Estimate.** The whole reason the run-rate basis
 *        is a flat elapsed/yearDays scale, rather than the smarter thing, is that it has to BE
 *        the figure taxForYear() projects its bill from. Two screens quoting two year-ends is the
 *        failure this card exists to avoid, and nothing would throw.
 *     2. **A seasonal weight that is really a flat one.** A month index read by the wrong key, or
 *        a part-month counted whole, gives a number that still looks like a projection.
 *     3. **A window that is not the window it claims.** "Last 12 months" that quietly includes the
 *        month in progress reads low every single time, and reads lowest on the 1st.
 *     4. **A chart whose bars do not add up to the headline.** The bars are what makes the two
 *        run rates comparable; if the estimated part is distributed on the wrong weights the
 *        picture argues with the figure above it.
 *
 * EXPECTATIONS COME FROM THE RULE, NOT FROM THE FUNCTION
 *   Every expected figure here is re-derived — the seasonal share by walking the tax year A DAY
 *   AT A TIME against anaSeasonality()'s own indices, where the code walks it a month at a time;
 *   the run rate from tyIncome/tyNet and the tax year's own bounds; the trailing window by
 *   summing sessions on the basis in force. A test that read the answer back out of
 *   anaProjection() would assert nothing at all.
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

const fx = (n) => join(root, "tests", "test-data", `groundwork-testdata-${n}.json`);
for (const n of ["established", "day-one", "online-only"])
  if (!existsSync(fx(n))) { console.error(`Missing ${fx(n)} — run \`npm run testdata\` first.`); process.exit(2); }
const states = {
  established: JSON.parse(readFileSync(fx("established"), "utf8")),
  dayOne: JSON.parse(readFileSync(fx("day-one"), "utf8")),
  online: JSON.parse(readFileSync(fx("online-only"), "utf8")),
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.go === "function" && typeof window.anaProjection === "function");

const results = await page.evaluate(async (env) => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Read-only: nothing here may reach the device's database. */
  window.commit = async () => true;
  window.celebrate = () => {};
  try { Sfx.on = false; } catch (e) {}
  const load = (raw) => { const st = raw && raw.state ? raw.state : raw; normalize(st); S = st; tyMemoClear();
    try { applySettings(); } catch (e) {} };
  const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1 : tol);
  const DAY = 86400000;

  load(env.established);

  /* ---- 1. the run rate IS the tax engine's projection ---- */
  {
    const ty = curTaxYear(), b = tyBounds(ty), t = today();
    /* Re-derived from the rule: a tax year runs 6 April to 5 April, and "how far through" is
       whole days elapsed over whole days in it. */
    const yearDays = Math.round((b.end - b.start) / DAY) + 1;
    const elapsed = Math.min(yearDays, Math.max(1, Math.round((t - b.start) / DAY) + 1));
    const frac = elapsed / yearDays;
    const p = anaProjection();
    ok("a tax year is 365 or 366 days, 6 April to 5 April", yearDays === 365 || yearDays === 366, yearDays);
    ok("the projection reports the year it is projecting", p.ty === ty, p.ty);
    ok("…and how far through it we are", p.elapsed === elapsed && p.yearDays === yearDays, p.elapsed + "/" + p.yearDays);
    ok("run-rate revenue is this year's income scaled by the year gone",
      near(p.modes.annual.income, Math.round(tyIncome(ty, true) / frac)), p.modes.annual.income);
    ok("run-rate profit is this year's net scaled the same way",
      near(p.modes.annual.net, Math.round(tyNet(ty, true) / frac)), p.modes.annual.net);
    /* THE INVARIANT THIS CARD EXISTS FOR. */
    const tf = taxForYear(ty);
    ok("…and that profit is exactly what Tax › Estimate projects its bill from",
      near(p.modes.annual.net, Math.round(tf.projAnnual), 1), p.modes.annual.net + " vs " + Math.round(tf.projAnnual));
    ok("the to-date figures are tyIncome/tyNet themselves, not a second count",
      p.td.income === tyIncome(ty, true) && p.td.net === tyNet(ty, true));
  }

  /* ---- 2. the seasonal weight, re-derived A DAY AT A TIME ----
     The code walks the tax year month by month and pro-rates the two April stubs. Walking it a
     day at a time is a genuinely different derivation of the same rule: each day is worth its own
     month's index divided by that month's length, and a month with no history is worth an
     average month rather than nothing. */
  {
    const ty = curTaxYear(), b = tyBounds(ty), t = today();
    const seas = anaSeasonality();
    ok("the established practice has enough history to be seasonal", seas.ready, seas.need);
    const idx = {}; seas.months.forEach((x) => { idx[x.m] = x.idx; });
    const walk = (from, to) => {
      let w = 0;
      for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const len = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        w += (idx[d.getMonth()] == null ? 100 : idx[d.getMonth()]) / len;
      }
      return w;
    };
    const share = walk(b.start, t < b.end ? t : b.end) / walk(b.start, b.end);
    const p = anaProjection();
    ok("the seasonal share of the year is the seasonal weight, not the calendar one",
      near(p.modes.seasonal.share, share, 0.005), p.modes.seasonal.share + " vs " + share);
    ok("…and it is genuinely different from the flat one",
      Math.abs(p.modes.seasonal.share - p.frac) > 0.001, p.modes.seasonal.share + " vs " + p.frac);
    ok("seasonal revenue is this year's income over that share",
      near(p.modes.seasonal.income, Math.round(tyIncome(ty, true) / share), 200), p.modes.seasonal.income);
    ok("seasonal profit is this year's net over that share",
      near(p.modes.seasonal.net, Math.round(tyNet(ty, true) / share), 200), p.modes.seasonal.net);
    /* A weight is a share of a year, so it can never leave the unit interval. */
    ok("…and the share stays a share", p.modes.seasonal.share > 0 && p.modes.seasonal.share <= 1);
  }

  /* ---- 3. trailing twelve months is COMPLETE months, and is not a forecast ---- */
  {
    const t = today(), p = anaProjection(), m = p.modes.ttm;
    const from = new Date(t.getFullYear(), t.getMonth() - 12, 1);
    const to = new Date(t.getFullYear(), t.getMonth(), 0);            /* last day of last month */
    ok("the trailing window starts twelve months back, on the 1st",
      +m.from === +from, m.from + " vs " + from);
    ok("…and ends at the end of LAST month, never mid-month",
      +m.to === +to && m.to.getDate() === new Date(m.to.getFullYear(), m.to.getMonth() + 1, 0).getDate(),
      m.to + " vs " + to);
    ok("…which is the month in progress excluded", m.to < new Date(t.getFullYear(), t.getMonth(), 1));
    /* Re-derived: revenue over that window is every session's fee counted on the basis in force,
       plus other income from the ledger. Nothing is scaled — this one is a fact. */
    const cash = taxBasis() === "cash";
    let fees = 0, room = 0;
    S.sessions.forEach((s) => {
      const when = cash ? (s.paidDate || null) : s.date; if (cash && !when) return;
      const dd = parseD(when); if (!dd || dd < from || dd > to) return;
      const d = derive(s); fees += (d.rate || 0); room += (d.roomRate || 0);
    });
    let sup = 0;
    [...(S.supervision || []), ...(S.peerSupervision || [])].forEach((r) => {
      const dd = parseD(r.date); if (dd && dd >= from && dd <= to) sup += (+r.cost || 0);
    });
    const led = ledgerBetween(from, to, {});
    ok("trailing revenue is fees plus other income over that window",
      near(m.income, Math.round(fees + led.otherIncome)), m.income);
    ok("trailing profit takes rooms, supervision and the ledger off it",
      near(m.net, Math.round(fees - room - sup + led.total)), m.net);
    ok("…and profit never exceeds revenue", m.net <= m.income, m.net + " / " + m.income);
  }

  /* ---- 4. the chart adds up to the headline it sits under ---- */
  {
    const p = anaProjection(), b = tyBounds(p.ty), t = today();
    const cash = taxBasis() === "cash";
    /* A tax year starts and ends in April, so it is thirteen slices read left to right — the
       closing one is the five days of the following April and carries its own year. */
    ok("the year is charted in the order it happens, April to April", p.modes.annual.rows.length === 13,
      p.modes.annual.rows.length);
    ok("…running April to March and closing on a second April",
      p.modes.annual.rows.map((r) => r.l).join(" ") === "Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar Apr",
      p.modes.annual.rows.map((r) => r.l).join(" "));
    /* Re-derived: the solid part of the bars is client fees counted in this tax year to date. */
    let fees = 0;
    S.sessions.forEach((s) => {
      const when = cash ? (s.paidDate || null) : s.date; if (cash && !when) return;
      const dd = parseD(when); if (!dd || dd > t || dd < b.start || dd > b.end) return;
      fees += (derive(s).rate || 0);
    });
    const solid = p.modes.annual.rows.reduce((a, r) => a + r.actual, 0);
    ok("the solid bars are the client fees already logged this tax year", near(solid, Math.round(fees), 12), solid + " vs " + Math.round(fees));
    /* And the whole bar is those fees scaled by the basis's own share of the year. */
    for (const k of ["annual", "seasonal"]) {
      const m = p.modes[k];
      const total = m.rows.reduce((a, r) => a + r.actual + r.est, 0);
      ok(`the ${k} bars total the fees scaled by that basis`, near(total, Math.round(fees / m.share), 30),
        total + " vs " + Math.round(fees / m.share));
    }
    /* The two bases must SPLIT the remainder differently — that difference is the whole card. */
    const aEst = p.modes.annual.rows.map((r) => r.est), sEst = p.modes.seasonal.rows.map((r) => r.est);
    ok("…and the two bases spread what is left over the year differently",
      aEst.some((v, i) => Math.abs(v - sEst[i]) > 1), aEst.join(",") + " | " + sEst.join(","));
    /* Nothing is estimated for a month that has already finished, and every month still to come
       carries something — a projection with a gap in the middle of it is not a projection. */
    const done = Math.max(0, Math.floor(p.frac * 12) - 1);
    ok("no month that has already been is given an estimate",
      p.modes.annual.rows.slice(0, done).every((r) => r.est === 0),
      p.modes.annual.rows.map((r) => r.est).join(","));
    ok("…and every month still to come carries part of it",
      p.modes.annual.rows.slice(-3).every((r) => r.est > 0),
      p.modes.annual.rows.slice(-3).map((r) => r.est).join(","));
    ok("…including the five closing days of the year, at five days' worth",
      p.modes.annual.rows[12].est > 0 && p.modes.annual.rows[12].est < p.modes.annual.rows[11].est,
      p.modes.annual.rows[12].est + " vs " + p.modes.annual.rows[11].est);
    ok("trailing twelve months is charted as fact, with nothing estimated",
      p.modes.ttm.rows.length === 12 && p.modes.ttm.rows.every((r) => r.est === 0));
  }

  /* ---- 5. a practice with no history says so rather than inventing one ---- */
  {
    load(env.dayOne);
    const p = anaProjection();
    const notReady = Object.keys(p.modes).filter((k) => !p.modes[k].ready);
    ok("day one: the bases that cannot answer say what they are waiting for",
      notReady.length > 0 && notReady.every((k) => typeof p.modes[k].need === "string" && p.modes[k].need.length > 20),
      notReady.join(","));
    ok("…seasonality is one of them — two years is two years", !p.modes.seasonal.ready, p.modes.seasonal.need);
    ok("…and no unready basis carries a figure",
      notReady.every((k) => p.modes[k].income === undefined && p.modes[k].net === undefined));
    const html = acProjection(anaCtx(), "projection").html;
    const n = document.createElement("div"); n.innerHTML = html;
    ok("…and the card renders a sentence, never an empty chart", n.textContent.trim().length > 40 && !n.querySelector("svg rect"));
  }

  /* ---- 6. paid-up-front practice: the basis is honoured ---- */
  {
    load(env.online);
    const ty = curTaxYear(), p = anaProjection();
    ok("a practice paid in advance still projects on its own tax basis",
      p.basisName === taxBasis(), p.basisName);
    ok("…from the same to-date figures the tax screens use",
      p.td.income === tyIncome(ty, true) && p.td.net === tyNet(ty, true));
  }

  /* ---- 7. the card, the toggle, and the link from Home ---- */
  {
    load(env.established);
    settings().features = settings().features || {}; settings().features.trends = true;
    try { localStorage.removeItem("tt_plus_gate"); } catch (e) {}
    pracTab = "trends"; trendSeg = "money"; projBasis = "annual";
    go("practice", { seg: "trends" }); await sleep(200);
    const card = document.querySelector("#anaProjCard");
    ok("the card is on Business analytics › Money, with an id to land on", !!card);
    const panes = card ? card.querySelectorAll("[data-ppane]") : [];
    ok("…all three bases are rendered, not built on demand", panes.length === 3, panes.length);
    ok("…with exactly one of them showing",
      [...panes].filter((x) => !x.hidden).length === 1 &&
      card.querySelector('[data-ppane="annual"]').hidden === false);
    const before = document.querySelector("main").innerHTML.length;
    card.querySelector('[data-pbasis="seasonal"]').click(); await sleep(60);
    ok("tapping a basis shows that pane instead",
      card.querySelector('[data-ppane="seasonal"]').hidden === false &&
      card.querySelector('[data-ppane="annual"]').hidden === true);
    ok("…and remembers the choice", projBasis === "seasonal");
    ok("…without redrawing the screen under the reader",
      document.querySelector("#anaProjCard") === card && document.querySelector("main").innerHTML.length !== 0 && before > 0);
    ok("…and the button says which is on",
      card.querySelector('[data-pbasis="seasonal"]').getAttribute("aria-pressed") === "true" &&
      card.querySelector('[data-pbasis="annual"]').getAttribute("aria-pressed") === "false");

    /* Home: the tile and the line under it both lead here. */
    go("home"); await sleep(250);
    const tile = document.querySelector("#kBilled"), line = document.querySelector("#projLine");
    ok("Home's 'billed this tax year' tile leads somewhere", !!tile && tile.classList.contains("clk"));
    ok("…and says so with a chevron", tile && /›/.test(tile.querySelector(".l").textContent));
    ok("Home carries the projection in one line under the four figures", !!line);
    ok("…naming the basis the reader chose", line && /seasonal/i.test(line.textContent), line && line.textContent);
    ok("…and both revenue and profit before tax", line && (line.textContent.match(/£/g) || []).length >= 2);
    ok("…with only the tail of it underlined as a link",
      !!line.querySelector("#kProj") && line.querySelector("#kProj").textContent.length < 30,
      line.querySelector("#kProj") && line.querySelector("#kProj").textContent);
    /* The trailing basis is a look backwards. Worded as a projection of THIS year it asserts the
       one thing the card exists to let the reader check. */
    projBasis = "ttm"; go("home"); await sleep(250);
    const ttmLine = document.querySelector("#projLine");
    ok("…and the trailing basis never claims to be this year",
      ttmLine && !new RegExp(curTaxYear() + " lands").test(ttmLine.textContent) && /just gone/.test(ttmLine.textContent),
      ttmLine && ttmLine.textContent);
    projBasis = "seasonal"; go("home"); await sleep(250);
    tile.click(); await sleep(300);
    ok("tapping it opens Business analytics on the card itself",
      pracTab === "trends" && trendSeg === "money" && !!document.querySelector("#anaProjCard"));

    /* The headline strip above the sections is navigation: the money tile leads with where the
       year lands, because that is the money question people open this section for. */
    trendSeg = "clients"; pracTab = "trends";
    go("practice", { seg: "trends" }); await sleep(250);
    const money = [...document.querySelectorAll(".trtile")].find((b) => b.dataset.jump === "money");
    ok("the money headline tile leads with the projected year", !!money && /projected/.test(money.textContent),
      money && money.textContent);
    ok("…carrying a real figure from this practice, not a placeholder",
      money && /£\d/.test(money.textContent), money && money.textContent);
    trendSeg = "money";

    /* The gate: this is a Business analytics card, so the free tier must not be shown the line. */
    go("home"); await sleep(150);
    settings().features.trends = false; tyMemoClear();
    go("home"); await sleep(200);
    ok("with Business analytics switched off Home shows no projection line", !document.querySelector("#kProj"));
    ok("…and the tile goes back to being a plain figure", !document.querySelector("#kBilled"));
    settings().features.trends = true;
  }

  /* ---- 8. Money is the actuals tab, and borrows the one projection ----
     The rule: Money says what happened, Business analytics says where it is going, and there is
     exactly ONE year-end figure in the app. Two screens projecting one practice by two methods is
     the drift this split exists to end, so the tile must carry anaProjection()'s own number. */
  {
    load(env.established);
    settings().features = settings().features || {}; settings().features.trends = true;
    try { localStorage.removeItem("tt_plus_gate"); } catch (e) {}
    moneySeg = "overview"; projBasis = "annual";
    go("money", { seg: "overview" }); await sleep(250);
    const tile = document.querySelector("#mProj");
    const p = anaProjection(), k = projActive(p);
    ok("Money's glance card carries a projection tile", !!tile);
    ok("…showing the SAME figure Business analytics shows, not one of its own",
      tile && tile.querySelector(".v").textContent.trim() === gbp(p.modes[k].income),
      tile && tile.querySelector(".v").textContent);
    ok("…named for the year it projects", tile && tile.textContent.indexOf(curTaxYear()) >= 0, tile && tile.textContent);
    ok("…and unblurred for someone who can open it", tile && !tile.querySelector(".blurfig"));
    /* Money must no longer work out a month projection of its own. */
    const fc = incomeForecast();
    ok("Money's own month projection is gone", fc.proj === undefined && fc.delta === undefined,
      JSON.stringify(Object.keys(fc)));
    /* …and what replaced the comparison it fed is like-for-like: the same span of last month. */
    {
      const t = today(), der = S.sessions.map((s) => ({ s, d: derive(s) }));
      const ms = new Date(t.getFullYear(), t.getMonth(), 1);
      const lms = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const lme = new Date(t.getFullYear(), t.getMonth(), 0);
      const lmTo = new Date(lms.getFullYear(), lms.getMonth(), Math.min(t.getDate(), lme.getDate()));
      const sumIn = (a, b) => Math.round(der.filter((x) => { const d = parseD(x.s.date); return d && d >= a && d <= b; })
        .reduce((acc, x) => acc + (x.d.rate || 0), 0));
      ok("…comparing the same span of last month, not the whole of it",
        fc.mtdLast === sumIn(lms, lmTo), fc.mtdLast + " vs " + sumIn(lms, lmTo));
      ok("…ending on the same day of the month, clamped to a short one",
        lmTo.getDate() === Math.min(t.getDate(), lme.getDate()) && lmTo <= lme,
        lmTo + " / today " + t.getDate());
      ok("…as a percentage against month-to-date",
        fc.deltaTD === (fc.mtdLast > 0 ? Math.round((sumIn(ms, t) - fc.mtdLast) / fc.mtdLast * 100) : null),
        fc.deltaTD);
    }
    /* A month the therapist took off is not a collapse, and a bare dash reads as a fault. */
    {
      const dt = [...document.querySelectorAll(".card .kpis .kpi")]
        .find((n) => /point last month|Nothing billed/.test(n.textContent));
      ok("the like-for-like comparison is on the card", !!dt, dt && dt.textContent);
      ok("…and when there is nothing to compare against it says so, not just a dash",
        dt && (fc.deltaTD == null
          ? /Nothing billed by this point last month/.test(dt.textContent) && !/\(£0\)/.test(dt.textContent)
          : /vs this point last month/.test(dt.textContent)),
        dt && dt.textContent);
    }
    /* Tapping through. */
    tile.click(); await sleep(300);
    ok("tapping the tile opens Business analytics on the card that owns the figure",
      pracTab === "trends" && trendSeg === "money" && !!document.querySelector("#anaProjCard"));

    /* ---- locked: her own figure, blurred, with the way in beside it ---- */
    try { localStorage.setItem("tt_plus_gate", "on"); localStorage.removeItem("tt_plus"); } catch (e) {}
    go("money", { seg: "overview" }); await sleep(250);
    const lt = document.querySelector("#mProj");
    ok("behind the gate the tile is still there", !!lt);
    const fig = lt && lt.querySelector(".blurfig");
    ok("…with the figure blurred rather than replaced or invented", !!fig);
    ok("…and it really is her own figure", fig && fig.textContent.trim() === gbp(p.modes[k].income), fig && fig.textContent);
    ok("…actually blurred, not just class-named",
      fig && /blur\(/.test(getComputedStyle(fig).filter), fig && getComputedStyle(fig).filter);
    ok("…hidden from a screen reader, which would otherwise read out what is being withheld",
      fig && fig.getAttribute("aria-hidden") === "true");
    ok("…while the tile itself says plainly what it is",
      lt && /Plus/.test(lt.getAttribute("aria-label") || ""), lt && lt.getAttribute("aria-label"));
    ok("…wearing the tier it is sold at, not the dearer one",
      lt && lt.classList.contains("tier-plus") && !!lt.querySelector(".tiertag"), lt && lt.className);
    ok("…and reachable from the keyboard, being a div playing a button",
      lt && lt.getAttribute("role") === "button" && lt.getAttribute("tabindex") === "0");
    const foot = document.querySelector("#mProjMore");
    ok("…with the tease naming where to look", !!foot && /behind this/i.test(foot.textContent), foot && foot.textContent);
    foot.click(); await sleep(300);
    ok("…which lands on Business analytics' sneak peek, not on a wall",
      pracTab === "trends" && !!document.querySelector(".peekrow") && !document.querySelector("#anaProjCard"));
    ok("…where the money row keeps the promise the blurred tile made",
      [...document.querySelectorAll(".peekrow")].some((r) => /where this year lands/i.test(r.textContent)));

    /* ---- switched off: a preference, not a purchase, so nothing is being sold ---- */
    try { localStorage.removeItem("tt_plus_gate"); } catch (e) {}
    settings().features.trends = false; tyMemoClear();
    go("money", { seg: "overview" }); await sleep(250);
    ok("switched off, Money offers no projection tile at all", !document.querySelector("#mProj"));
    ok("…and no upgrade tease either — there is nothing to sell", !document.querySelector("#mProjMore"));
    ok("…but the glance card still shows four figures",
      document.querySelectorAll(".card .kpis .kpi").length >= 4,
      document.querySelectorAll(".card .kpis .kpi").length);
    settings().features.trends = true;
  }
  return out;
}, states);

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 5).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`${results.length}/${results.length} projection checks passed`);
else console.log(`\n${bad.length} failed of ${results.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
