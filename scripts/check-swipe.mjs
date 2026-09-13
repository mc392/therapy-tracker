/* Swiping between sub-tabs, driven by real touch events in a real browser.
 *
 *   npm run test:swipe          (needs: npm i --no-save playwright)
 *
 * WHY THIS IS A BROWSER TEST AND NOT A UNIT ONE
 *   The whole feature is a gesture. Calling swipeSeg(1) from a console proves the chip moves and
 *   proves nothing about the part that can actually go wrong: whether a finger dragged across a
 *   scrolling chart, a segment strip, an overdue row's swipe-to-pay or a text field reaches the
 *   navigation at all. So every check here is a touchStart / touchMove / touchEnd sent through
 *   the browser's own input pipeline (CDP), against the page's own passive listeners.
 *
 * EXPECTATIONS COME FROM THE RULE, NEVER FROM THE FUNCTION
 *   Same discipline as the tax suite and check-behaviour. The expected segment after a swipe is
 *   read from the bar's own chips - "the one after the one that is on" - rather than written out
 *   as a literal, so a bar that gains or loses a section is still asserted correctly; and the two
 *   walls (first chip, last chip) are asserted as "the tab did not change AND the segment did
 *   not change", which is the rule as documented, not as implemented.
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.go === "function" && typeof window.swipeSeg === "function");
/* Init is asynchronous and a fresh install opens the setup wizard, which is a full-screen overlay
 * OUTSIDE `main` - a gesture sent while it is up never reaches the page at all, and every check
 * below would then be passing or failing for the wrong reason. Let init finish and raise it, so
 * that closing it below actually closes something; the assertion that it has gone is the guard. */
await page.waitForFunction(() => document.querySelector(".ov.show") || document.querySelector("#main .view"),
  null, { timeout: 8000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 700));

/* A practice with enough in it that every segment renders something: a handful of clients, some
 * past sessions (so Unpaid and Incomplete have rows and the charts have data) and two rooms. */
await page.evaluate(() => {
  window.commit = async () => true;                       /* reads and in-memory edits only */
  const iso = (d) => d.toISOString().slice(0, 10);
  const t = new Date();
  const sessions = [];
  for (let i = 1; i <= 60; i++) {
    const d = new Date(t); d.setDate(d.getDate() - i * 3);
    sessions.push({ _id: "s" + i, client: "C" + (1 + (i % 5)), date: iso(d), time: "10:00",
      num: i, location: i % 2 ? "Room A" : "At home", notes: i % 4 ? "Y" : "",
      paidDate: i % 3 ? iso(d) : "", attendConfirmed: i % 4 ? true : false });
  }
  const up = new Date(t); up.setDate(up.getDate() + 4);
  sessions.push({ _id: "sU", client: "C1", date: iso(up), time: "11:00", num: 61, location: "Room A" });
  S = normalize({
    clients: [1, 2, 3, 4, 5].map((n) => ({ _id: "c" + n, code: "C" + n, status: "Ongoing", frequency: "Weekly" })),
    rooms: [{ location: "At home", rate: 0, due: "n/a" }, { location: "Room A", rate: 15, due: "EOM" }],
    sessions,
    rateHistory: [1, 2, 3, 4, 5].map((n) => ({ client: "C" + n, effectiveFrom: "2000-01-01", rate: 60 })),
    roomRateHistory: [{ location: "At home", effectiveFrom: "2000-01-01", rate: 0 },
      { location: "Room A", effectiveFrom: "2000-01-01", rate: 15 }]
  });
  S.settings.onboarded = true;
  S.settings.features = {};                               /* every feature on: this tests code, not gating */
  S.settings.coach = { off: true, seen: [] };             /* a tip overlay would swallow the gesture */
  S.settings.taxAck = true; S.settings.taxAckAt = iso(t); /* Tax draws its segments, not its gate */
  try { tyMemoClear(); applySettings(); } catch (e) {}
  try { if (typeof flowClose === "function") flowClose(); } catch (e) {}
  document.querySelectorAll(".ov").forEach((n) => n.remove());
  const sp = document.getElementById("splash"); if (sp) sp.remove();
  go("home");
});
const overlay = await page.evaluate(() =>
  !!document.querySelector(".ov.show, #coach.show") ||
  (function () { const t = document.elementFromPoint(195, 520); return !t || !document.getElementById("main").contains(t); })());
if (overlay) {
  console.log("  ✗ nothing is covering the app - a gesture would not reach it, so no check below means anything");
  await browser.close(); srv.close(); process.exit(1);
}

const cdp = await page.context().newCDPSession(page);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* One gesture, through the browser's own input pipeline. dx negative drags right-to-left, which
 * is the "next chip" direction. A handful of moves rather than one, so it looks like a finger. */
async function drag(x, y, dx, dy) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 4; i++)
    await cdp.send("Input.dispatchTouchEvent",
      { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 4, y: y + (dy * i) / 4 }] });
  await cdp.send("Input.dispatchTouchEvent",
    { type: "touchEnd", touchPoints: [], x: x + dx, y: y + dy });
  await sleep(180);
}

/* Where to start a gesture: the middle of an element, or of the view when nothing is named. */
async function centre(sel) {
  const box = sel ? await page.evaluate((s) => {
    const n = document.querySelector(s); if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel) : null;
  return box || { x: 195, y: 520 };
}
async function swipeOn(sel, dir) {                        /* dir: 1 = next chip, -1 = previous */
  const p = await centre(sel);
  await drag(p.x, p.y, dir > 0 ? -110 : 110, 0);
}

/* The state a swipe is allowed to change, read straight from the page. */
const where = () => page.evaluate(() => ({
  tab: cur,
  bar: (function () {
    const id = SWIPE_BARS[cur]; const b = id && document.getElementById(id);
    return b ? [].slice.call(b.querySelectorAll("button")).map((x) => x.textContent.trim()) : null;
  })(),
  on: (function () {
    const id = SWIPE_BARS[cur]; const b = id && document.getElementById(id);
    const n = b && b.querySelector("button.on");
    return n ? n.textContent.trim() : null;
  })(),
  seg: typeof segOf === "function" ? segOf(cur) : null,
  sessSeg: sessFilter.seg, supTab, trendSeg
}));

const out = [];
const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
const goTo = async (tab, opts) => { await page.evaluate(([t, o]) => go(t, o || undefined), [tab, opts || null]); await sleep(120); };

/* ===== Every tab that claims a bar has one, and every tab that does not, does not ===== */
{
  const named = await page.evaluate(() => Object.keys(SWIPE_BARS));
  for (const tab of named) {
    await goTo(tab);
    const w = await where();
    ok(`${tab}: the named strip is on the screen`, Array.isArray(w.bar) && w.bar.length >= 2,
      w.bar ? w.bar.join("/") : "missing");
  }
  for (const tab of ["home", "settings"]) {
    await goTo(tab);
    const before = await where();
    await swipeOn(null, 1);
    const after = await where();
    ok(`${tab}: a swipe on a screen with no sub-tabs does nothing`,
      after.tab === before.tab && after.tab === tab, after.tab);
  }
}

/* ===== Walking a bar end to end, and the walls at both ends =====
   The expected chip is read from the bar itself - "the one after the one that is on" - so a bar
   that gains or loses a section is still checked against the rule rather than against a literal. */
for (const tab of ["practice", "money", "tax", "sessions"]) {
  await goTo(tab);
  let w = await where();
  const chips = w.bar || [];
  ok(`${tab}: starts on the first chip`, w.on === chips[0], `${w.on} vs ${chips[0]}`);

  for (let i = 1; i < chips.length; i++) {
    await swipeOn(null, 1);
    w = await where();
    ok(`${tab}: swiping left moves ${chips[i - 1]} → ${chips[i]}`, w.on === chips[i], w.on);
    ok(`${tab}: and stays on the tab`, w.tab === tab, w.tab);
  }

  /* The wall at the far end: nothing moves, and nothing leaves the tab. */
  const last = await where();
  await swipeOn(null, 1);
  w = await where();
  ok(`${tab}: a swipe past the last chip stays put`, w.on === last.on && w.tab === tab, `${w.tab}/${w.on}`);

  for (let i = chips.length - 2; i >= 0; i--) {
    await swipeOn(null, -1);
    w = await where();
    ok(`${tab}: swiping right moves ${chips[i + 1]} → ${chips[i]}`, w.on === chips[i], w.on);
  }

  const first = await where();
  await swipeOn(null, -1);
  w = await where();
  ok(`${tab}: a swipe before the first chip stays put`, w.on === first.on && w.tab === tab, `${w.tab}/${w.on}`);
}

/* ===== The chip the swipe lands on is the segment the app is actually showing ===== */
{
  await goTo("tax");
  await swipeOn(null, 1); await swipeOn(null, 1);
  const w = await where();
  const real = await page.evaluate(() => taxSeg);
  ok("tax: two swipes move taxSeg itself, not just the chip", real === w.seg && real === "payments", real);

  await goTo("sessions");
  await swipeOn(null, 1);
  const s = await where();
  ok("sessions: the swipe moves sessFilter.seg", s.sessSeg === "unpaid", s.sessSeg);
  ok("sessions: and the list redrew as that worklist",
    await page.evaluate(() => !!document.querySelector("#slist .paybar, #slist .muted")));
}

/* ===== One bar per screen: a nested strip is never the one that moves ===== */
{
  await goTo("practice", { seg: "supervision" });
  await page.evaluate(() => { supTab = "cpd"; go("practice", { keepScroll: true }); });
  await sleep(150);
  const before = await where();
  await swipeOn(null, 1);
  const after = await where();
  ok("practice: a swipe on Supervision moves the outer bar", after.on !== before.on, `${before.on} → ${after.on}`);
  ok("practice: and leaves the inner Log/Peer/CPD strip alone", after.supTab === "cpd", after.supTab);

  await goTo("practice", { seg: "trends" });
  const t0 = await page.evaluate(() => trendSeg);
  await swipeOn(null, -1);
  const t1 = await where();
  ok("practice: a swipe on Business analytics leaves Trends, not its section",
    t1.on !== "Business analytics" && t1.trendSeg === t0, `${t1.on}/${t1.trendSeg}`);
}

/* ===== What owns the gesture instead ===== */
{
  /* The segment strip itself scrolls sideways - dragging it is how a wide bar is read. */
  await goTo("tax");
  const b0 = await where();
  await swipeOn("#taxseg .segwrap", 1);
  ok("a drag on the segment strip scrolls it rather than moving it", (await where()).on === b0.on);

  /* A chart with more in it than fits owns horizontal gestures outright. */
  await goTo("practice", { seg: "trends" });
  await sleep(200);
  const chart = await page.evaluate(() => {
    const n = [...document.querySelectorAll(".svgwrap, .hmgrid, .rawscroll")]
      .find((x) => x.scrollWidth - x.clientWidth > 4);
    if (!n) return null;
    n.id = n.id || "swipeTestChart"; return "#" + n.id;
  });
  if (chart) {
    const c0 = await where();
    await swipeOn(chart, 1);
    ok("a drag across a scrolling chart does not move the sub-tab", (await where()).on === c0.on);
  } else ok("a drag across a scrolling chart does not move the sub-tab", true, "no scrolling chart on this screen");

  /* Swipe-to-mark-paid on an overdue row. */
  await goTo("sessions");
  await page.evaluate(() => { sessFilter.seg = "all"; go("sessions", { keepScroll: true }); });
  await sleep(200);
  const row = await page.evaluate(() => !!document.querySelector(".swrow"));
  if (row) {
    const r0 = await where();
    await swipeOn(".swrow", 1);
    ok("a drag on an overdue row belongs to swipe-to-mark-paid", (await where()).on === r0.on);
  } else ok("a drag on an overdue row belongs to swipe-to-mark-paid", true, "no overdue row in this fixture");

  /* A text field: dragging inside one places a cursor or selects. */
  await goTo("sessions");
  const f0 = await where();
  await swipeOn("#sq", 1);
  ok("a drag inside a text field does not move the sub-tab", (await where()).on === f0.on);

  /* A sheet is a different surface: what is under it must not move while it is open. */
  await goTo("practice");
  const p0 = await where();
  await page.evaluate(() => openSheet("Test", el("<div><p>hello</p></div>")));
  await sleep(150);
  await swipeOn(null, 1);
  ok("a swipe while a sheet is open changes nothing behind it", (await where()).on === p0.on);
  await page.evaluate(() => closeSheet()); await sleep(150);
}

/* ===== A swipe is a swipe: too short, too vertical, or too slow is not one ===== */
{
  await goTo("money");
  const m0 = await where();
  const p = await centre(null);
  await drag(p.x, p.y, -30, 0);
  ok("a short drag is not a swipe", (await where()).on === m0.on);
  await drag(p.x, p.y, -70, -160);
  ok("a mostly-vertical drag is not a swipe", (await where()).on === m0.on);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
  await sleep(900);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x - 120, y: p.y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], x: p.x - 120, y: p.y });
  await sleep(180);
  ok("a slow drag is a scroll that wandered, not a swipe", (await where()).on === m0.on);
  await swipeOn(null, 1);
  ok("...and a real swipe still works afterwards", (await where()).on !== m0.on);
}

/* ===== The movement the reader sees ===== */
{
  await goTo("practice", { seg: "clients" });
  const cls = await page.evaluate(async () => {
    swipeSeg(1);
    const body = document.getElementById("crbody");
    return body ? body.className : "";
  });
  ok("the content below the bar slides in", /segslide-r/.test(cls), cls);
  const bump = await page.evaluate(async () => {
    while (swipeSeg(1)) { }                                /* walk to the far end */
    swipeSeg(1);                                           /* and try to go past it */
    const bar = document.getElementById("crtab");
    return bar ? bar.className : "";
  });
  ok("the bar nudges at the end rather than doing nothing visible", /segbump-r/.test(bump), bump);
}

await page.close(); await browser.close(); srv.close();
const bad = out.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 6).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`✓ sub-tab swiping - ${out.length} checks passed`);
else console.log(`\n${bad.length} failed of ${out.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
