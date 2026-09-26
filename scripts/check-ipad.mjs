/* The app on an iPad: the device wording, and the layout width the iPad is given.

   Since 1.0 runs on iPad, the native block swaps "iPhone" for "iPad" in on-screen text when it is
   running on one (see "An iPad says iPad" in index.html). This drives the real index.html with a
   fake Capacitor three ways and asserts the rule from the outside:
     - native, iPad (iPadOS reports a Mac user agent with touch points): no "iPhone" anywhere in
       the rendered text - including text drawn AFTER load, which is what the observer is for -
       and "This iPad" where "This iPhone" was;
     - native, iPhone: the wording is untouched;
     - the web build on an iPad: untouched, because the rule lives in the native block.
   Also asserts an iPad 13" in portrait gets the sidebar (desktop) layout - the screenshots and App
   Review both see that one.

   Usage: npm run test:ipad   (needs `npm i --no-save playwright`) */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname, join, normalize } from "node:path";

const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_("playwright")); }
catch { console.error("\n  playwright is not installed:  npm i --no-save playwright\n"); process.exit(1); }

const ROOT = resolve("TherapyTracker-web");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

const UA = {
  ipad:   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

function fakeNative() {
  const ok = async () => ({});
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      GroundWorkNative: {
        biometricAvailable: async () => ({ available: true, biometry: "faceId" }),
        authenticate: async () => ({ success: true }), sharePDF: ok,
        plusStatus: async () => ({ active: false }), plusProduct: async () => ({ found: false }),
        folderInfo: async () => ({ set: false }), folderList: async () => ({ files: [] }),
        calendarList: async () => ({ granted: false, status: "notDetermined", calendars: [] }),
        haptic: ok,
      },
      Filesystem: { writeFile: async () => ({ uri: "" }), deleteFile: ok, readdir: async () => ({ files: [] }) },
      Share: { share: ok }, SplashScreen: { hide: ok },
      LocalNotifications: { checkPermissions: async () => ({ display: "denied" }), requestPermissions: async () => ({ display: "denied" }),
        getPending: async () => ({ notifications: [] }), cancel: ok, schedule: ok },
      App: { addListener: () => ({ remove() {} }) },
    },
  };
}

const results = [];
const check = (cond, msg, extra) => results.push({ ok: !!cond, msg, extra });

async function open(browser, { ua, touch, native, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, userAgent: ua, hasTouch: true });
  await ctx.addInitScript((t) => {
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => t });
    try { localStorage.setItem("tt_folder_asked", "1"); } catch (e) {}
  }, touch);
  if (native) await ctx.addInitScript(fakeNative);
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "load" });
  await page.waitForFunction(() => typeof S !== "undefined" && S && Array.isArray(S.sessions), null, { timeout: 20000 });
  await page.evaluate(() => {
    try { flowClose(); } catch (e) {}
    S.settings.onboarded = true;
    S.settings.coach = Object.assign({}, S.settings.coach, { off: true });
    try { localStorage.setItem("tt_whatsnew", String(WHATS_NEW)); } catch (e) {}
    go("settings");
    document.querySelectorAll("details.sgrp").forEach((d) => { d.open = true; });
  });
  await page.waitForTimeout(600);
  return { ctx, page };
}

/* Rendered text only: innerText skips <script>/<style> and anything display:none. */
const visibleText = (page) => page.evaluate(() => document.body.innerText);

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
  .find((x) => existsSync(x));
const browser = await chromium.launch({ executablePath: CHROME });

/* 1. Native on an iPad. */
{
  const { ctx, page } = await open(browser, { ua: UA.ipad, touch: 5, native: true, width: 1032, height: 1376 });
  const dev = await page.evaluate(() => document.documentElement.getAttribute("data-device"));
  check(dev === "ipad", "an iPad (Mac user agent + touch) is recognised as an iPad", dev);
  const text = await visibleText(page);
  const left = (text.match(/.{0,40}iPhone(?!\/iPad).{0,20}/g) || []);
  check(left.length === 0, "no \"iPhone\" left in the rendered Settings text on an iPad", left.slice(0, 5));
  check(/This iPad/.test(text), "the device group reads \"This iPad\"");
  /* Text drawn after load - a sheet, a toast, a redraw - is what the observer exists for. */
  const later = await page.evaluate(async () => {
    const d = document.createElement("div"); d.id = "__late"; d.textContent = "Copy on this iPhone";
    d.setAttribute("aria-label", "This iPhone"); document.body.appendChild(d);
    await new Promise((r) => setTimeout(r, 50));
    const t = document.getElementById("__late");
    t.firstChild.nodeValue = "Saved on this iPhone";          // a later edit to the same node
    await new Promise((r) => setTimeout(r, 50));
    return { text: t.textContent, label: t.getAttribute("aria-label") };
  });
  check(later.text === "Saved on this iPad", "text added and edited after load is reworded", later.text);
  check(later.label === "This iPad", "an aria-label added after load is reworded", later.label);
  const phrase = await page.evaluate(async () => {
    const d = document.createElement("div"); d.textContent = "on iPhone/iPad"; document.body.appendChild(d);
    await new Promise((r) => setTimeout(r, 50)); return d.textContent;
  });
  check(phrase === "on iPhone/iPad", "\"iPhone/iPad\" is left as it is", phrase);
  const sidebar = await page.evaluate(() => getComputedStyle(document.querySelector("nav.tabs")).borderRadius);
  check(sidebar === "0px", "an iPad 13\" in portrait gets the sidebar layout, not the floating phone bar", sidebar);
  await ctx.close();
}

/* 2. Native on an iPhone: untouched. */
{
  const { ctx, page } = await open(browser, { ua: UA.iphone, touch: 5, native: true, width: 440, height: 956 });
  const dev = await page.evaluate(() => document.documentElement.getAttribute("data-device"));
  check(dev === null, "an iPhone is not taken for an iPad", dev);
  check(/This iPhone/.test(await visibleText(page)), "on an iPhone the group still reads \"This iPhone\"");
  await ctx.close();
}

/* 3. The web build on an iPad: the rule lives in the native block, so nothing changes. */
{
  const { ctx, page } = await open(browser, { ua: UA.ipad, touch: 5, native: false, width: 1032, height: 1376 });
  const dev = await page.evaluate(() => document.documentElement.getAttribute("data-device"));
  check(dev === null, "the web build on an iPad is left alone", dev);
  const kept = await page.evaluate(async () => {
    const d = document.createElement("div"); d.textContent = "the iPhone app"; document.body.appendChild(d);
    await new Promise((r) => setTimeout(r, 50)); return d.textContent;
  });
  check(kept === "the iPhone app", "web copy that names the iPhone app is not reworded", kept);
  await ctx.close();
}

await browser.close();
server.close();

const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.msg}${r.ok ? "" : "  → " + JSON.stringify(r.extra)}`);
console.log(`\n${results.length - bad.length}/${results.length} iPad checks passed`);
process.exit(bad.length ? 1 : 0);
