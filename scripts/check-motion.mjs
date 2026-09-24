#!/usr/bin/env node
/* The motion and touch layer (Sep 2026), in a real browser, WITH the motion switched on.
 *
 *   npm i --no-save playwright   # deliberately not a dependency - see check-behaviour.mjs
 *   npm run test:motion
 *
 * Every other harness runs under automation, and under automation motionOK() says no: the view
 * transition, the lingering close of a sheet and the page stepping back behind it are exactly the
 * parts of the motion that would make a synchronous step asynchronous, and those suites read the
 * DOM straight after a click. That is right for them and it means nothing else here ever runs the
 * animated paths. This one hides navigator.webdriver before the app loads, so it does.
 *
 * What it asserts is the contract, not the look: the tab pill ends up on the active tab, a sheet
 * still closes SYNCHRONOUSLY as far as every caller can tell, the page never grows a sideways
 * scroll mid-animation, the header's condensing never moves the page under the reader's thumb,
 * a finished card cascade leaves nothing behind that would kill a press-scale, Reduce Motion
 * turns the script-driven motion off, and haptics reach the native seam. Plus two static checks
 * on the stylesheet: every font size is on the scale and every curve is a token.
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
const html = readFileSync(join(webDir, "index.html"), "utf8");
const results = [];
const ok = (name, cond, detail) => results.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });

/* ---- static: the scale and the curves ---- */
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const tokenEnd = css.indexOf("--stack-scale");
const body = css.slice(tokenEnd);
const literalSizes = [...body.matchAll(/font-size:([\d.]+)px/g)].map((m) => +m[1]);
/* display sizes (emoji, the splash) and the 9px chart labels are allowed to stay literal */
const offScale = literalSizes.filter((v) => v !== 9 && v < 23);
ok("every text size in the stylesheet is on the type scale", offScale.length === 0, offScale.join(","));
ok("no half-pixel font sizes anywhere in the file", !/font-size:\d+\.5px/.test(html),
  (html.match(/font-size:\d+\.5px/g) || []).slice(0, 5).join(","));
const curves = [...body.matchAll(/cubic-bezier\([^)]*\)/g)].map((m) => m[0]);
ok("every animation curve outside the tokens is a named --ease-* token", curves.length === 0, curves.join(" "));

/* ---- the browser ---- */
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
const fixture = join(root, "tests", "test-data", "groundwork-testdata-established.json");
if (!existsSync(fixture)) { console.error(`Missing ${fixture} - run \`npm run testdata\` first.`); process.exit(2); }
const state = JSON.parse(readFileSync(fixture, "utf8"));

const browser = await chromium.launch({ executablePath: CHROME });
async function openApp(opts) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true,
    reducedMotion: opts && opts.reduce ? "reduce" : "no-preference" });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
  /* the whole point of this harness: look like a person's browser, not a driven one */
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.go === "function" && typeof window.motionOK === "function");
  await page.evaluate((st0) => {
    window.commit = async () => true; window.celebrate = () => {};
    try { Sfx.on = false; } catch (e) {}
    const st = st0 && st0.state ? st0.state : st0;
    normalize(st); S = st; settings().onboarded = true; try { applySettings(); } catch (e) {}
    try { const f = document.querySelector(".ov"); if (f) f.style.display = "none"; } catch (e) {}
    const sp = document.getElementById("splash"); if (sp) sp.remove();
    window.__hap = []; window.GWHapticsNative = (k) => window.__hap.push(k);
    go("home");
  }, state);
  await page.waitForTimeout(1600);
  return { page, errs };
}

/* ---- motion on ---- */
{
  const { page, errs } = await openApp();
  ok("motionOK() is true for a person's browser with motion allowed", await page.evaluate(() => motionOK()));

  const pill0 = await page.evaluate(() => {
    const n = document.getElementById("tabs"), on = n.querySelector("button.on");
    return { has: n.classList.contains("haspill"), x: parseFloat(n.style.getPropertyValue("--pill-x")), want: on.offsetLeft };
  });
  ok("the tab pill is placed under the active tab on first render", pill0.has && pill0.x === pill0.want, JSON.stringify(pill0));

  /* tap Money on the tab bar and sample every frame for a sideways scroll */
  await page.evaluate(() => {
    window.__over = 0; window.__vt = false; window.__stag = 0;
    const t0 = performance.now();
    (function tick() {
      const se = document.scrollingElement;
      if (se.scrollWidth > se.clientWidth) window.__over++;
      if (document.documentElement.classList.contains("vt-fwd")) window.__vt = true;
      window.__stag = Math.max(window.__stag, document.querySelectorAll(".stagger").length);
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
    })();
  });
  await page.tap('#tabs button[data-tab="money"]');
  await page.waitForTimeout(1700);
  const nav = await page.evaluate(() => {
    const n = document.getElementById("tabs"), on = n.querySelector("button.on");
    return { cur, over: window.__over, vt: window.__vt, stag: window.__stag,
      left: document.querySelectorAll(".stagger").length,
      x: parseFloat(n.style.getPropertyValue("--pill-x")), want: on.offsetLeft,
      w: parseFloat(n.style.getPropertyValue("--pill-w")), ww: on.offsetWidth,
      vtLeft: document.documentElement.classList.contains("vt-fwd") || document.documentElement.classList.contains("vt-back"),
      hap: window.__hap.slice() };
  });
  ok("a tab-bar tap lands on the tab", nav.cur === "money", nav.cur);
  ok("…through a view transition, moving forward", nav.vt, "startViewTransition " + (await page.evaluate(() => typeof document.startViewTransition)));
  ok("…which cleans its direction class up afterwards", !nav.vtLeft);
  ok("the pill ends exactly under the new tab", nav.x === nav.want && nav.w === nav.ww, JSON.stringify(nav));
  ok("the page never scrolls sideways during the change", nav.over === 0, nav.over + " frames");
  ok("cards cascade in on a new screen", nav.stag > 0, nav.stag);
  ok("…and the cascade leaves no class behind to outrank a press-scale", nav.left === 0, nav.left);
  ok("changing tab asks for a selection tap", nav.hap.includes("select"), nav.hap.join(","));

  /* a keepScroll redraw must not replay anything */
  const quiet = await page.evaluate(() => { go("money", { keepScroll: true });
    const v = main().firstElementChild;
    return { quiet: v.classList.contains("quiet"), stag: document.querySelectorAll(".stagger").length }; });
  ok("a redraw of the same screen arrives quietly, with no cascade", quiet.quiet && quiet.stag === 0, JSON.stringify(quiet));

  /* the header condenses without moving the page */
  const hdr = await page.evaluate(async () => {
    go("home"); await new Promise((r) => setTimeout(r, 600));
    const m = main(), top0 = m.getBoundingClientRect().top + scrollY;
    const h1 = document.querySelector("header.top h1");
    const t0 = getComputedStyle(h1).transform;
    scrollTo(0, 300); await new Promise((r) => setTimeout(r, 120));
    const top1 = m.getBoundingClientRect().top + scrollY, t1 = getComputedStyle(h1).transform;
    const supported = CSS.supports("animation-timeline", "scroll()");
    scrollTo(0, 0);
    return { top0, top1, t0, t1, supported };
  });
  if (hdr.supported) {
    ok("the header title shrinks as the page scrolls", hdr.t1 !== hdr.t0 && hdr.t1 !== "none", hdr.t0 + " → " + hdr.t1);
    ok("…and the content below it never moves (padding handed back as margin)", Math.abs(hdr.top0 - hdr.top1) < 0.5, hdr.top0 + " vs " + hdr.top1);
  } else ok("scroll-driven header skipped - this browser has no scroll timelines", true);

  /* sheets: synchronous for callers, animated for people */
  const sh = await page.evaluate(async () => {
    const out = {};
    const el = document.createElement("div"); el.innerHTML = "<p>hello</p>";
    openSheet("Test", el);
    out.up = document.documentElement.classList.contains("sheet-up");
    await new Promise((r) => setTimeout(r, 650));
    out.stepped = getComputedStyle(main()).transform;
    closeSheet();
    const s = document.getElementById("sheet");
    out.openAfterClose = s.classList.contains("open");
    out.closing = s.classList.contains("closing");
    out.upAfter = document.documentElement.classList.contains("sheet-up");
    await new Promise((r) => setTimeout(r, 700));
    out.closingLater = s.classList.contains("closing");
    out.hidden = getComputedStyle(s).display === "none";
    out.back = getComputedStyle(main()).transform;
    /* close -> reopen straight away: the ghost must give way to the new sheet */
    openSheet("A", document.createElement("div")); closeSheet(); openSheet("B", document.createElement("div"));
    out.reopen = s.classList.contains("open") && !s.classList.contains("closing");
    closeSheet(); await new Promise((r) => setTimeout(r, 400));
    /* closing a sheet that is not open plays nothing */
    closeSheet(); out.noGhost = !s.classList.contains("closing");
    return out;
  });
  ok("opening a sheet steps the page back", sh.up && sh.stepped !== "none", sh.stepped);
  ok("closeSheet() still removes .open synchronously", !sh.openAfterClose);
  ok("…while an inert ghost slides away", sh.closing);
  ok("…and the page comes forward again", !sh.upAfter);
  ok("the ghost is gone once it has played, and the sheet is hidden", !sh.closingLater && sh.hidden);
  ok("…with the page back at full size", sh.back === "none", sh.back);
  ok("close then reopen at once shows the new sheet, not the ghost", sh.reopen);
  ok("closing a sheet that was never open plays nothing", sh.noGhost);

  /* checkboxes: drawn, sized, and still checkboxes */
  const cb = await page.evaluate(() => {
    const wrap = document.createElement("div"); wrap.className = "dzpick";
    wrap.innerHTML = '<label><input type="checkbox" id="__cb"> x</label>';
    main().appendChild(wrap);
    const i = document.getElementById("__cb");
    const w0 = i.getBoundingClientRect().width;
    window.__hap = []; i.click();
    const cs = getComputedStyle(i);
    const r = { w0, checked: i.checked, img: cs.backgroundImage, hap: window.__hap.slice() };
    wrap.remove(); return r;
  });
  ok("a checkbox inside a width:auto container is still 18px", Math.round(cb.w0) === 18, cb.w0);
  ok("a ticked box draws its tick", cb.checked && /url\(/.test(cb.img) && /gradient/.test(cb.img), cb.img.slice(0, 80));
  ok("ticking a box asks for a light tap", cb.hap.includes("light"), cb.hap.join(","));

  const sw = await page.evaluate(() => {
    go("settings"); window.__hap = [];
    const b = document.querySelector(".sw:not([disabled])"); if (!b) return null;
    b.dispatchEvent(new MouseEvent("click", { bubbles: true })); b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return window.__hap.slice();
  });
  if (sw) ok("flipping a switch asks for a light tap", sw.includes("light"), sw.join(","));

  ok("no page errors with motion on", errs.length === 0, errs.join(" | "));
  await page.close();
}

/* ---- Reduce Motion: the script-driven motion stands down ---- */
{
  const { page, errs } = await openApp({ reduce: true });
  const r = await page.evaluate(async () => {
    const out = { ok: motionOK() };
    const el = document.createElement("div");
    openSheet("T", el); out.up = document.documentElement.classList.contains("sheet-up");
    closeSheet(); out.closing = document.getElementById("sheet").classList.contains("closing");
    out.tabs = document.querySelectorAll("#tabs button").length;
    return out;
  });
  ok("Reduce Motion: motionOK() is false", r.ok === false);
  ok("Reduce Motion: the page does not step back behind a sheet", !r.up);
  ok("Reduce Motion: a sheet closes with no lingering ghost", !r.closing);
  await page.tap('#tabs button[data-tab="sessions"]');
  const after = await page.evaluate(() => ({ cur, st: document.querySelectorAll(".stagger").length }));
  ok("Reduce Motion: a tab tap changes screen at once, with no cascade", after.cur === "sessions" && after.st === 0, JSON.stringify(after));
  ok("no page errors with Reduce Motion", errs.length === 0, errs.join(" | "));
  await page.close();
}

await browser.close(); srv.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log((r.ok ? "  ✓ " : "  ✗ ") + r.name + (r.ok || !r.detail ? "" : "  — " + r.detail));
console.log(failed.length ? `\n${failed.length} of ${results.length} motion checks FAILED` : `\n${results.length}/${results.length} motion checks passed`);
process.exit(failed.length ? 1 : 0);
