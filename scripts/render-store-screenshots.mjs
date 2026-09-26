/* Renders the App Store listing screenshots from the real app, on demo data.

   Apple needs one set at the 6.9" iPhone size (1320x2868) and scales it down for every smaller
   class. These are the SHIPPING screens - the real index.html, a synthetic practice from
   tests/test-data/, and a fake phone so the native-only parts (Settings › This iPhone, Face ID)
   render exactly as they do in the iOS app. Nothing is mocked up.

   Three rules, each the reason this is a script rather than somebody's afternoon in a simulator:
   - NEVER real records. The practice is `established` from tests/test-data - four years, 26
     clients, known to the app only by code. Its practice name is cleared so the header shows the
     GroundWork brand rather than a real business.
   - The clock is pinned to the fixtures' own anchor date (tests/test-data/index.json), so
     "coming up" and "unpaid" hold what they held when the data was generated rather than
     whatever has aged out since. setFixedTime, not install: install freezes timers too, and the
     app's own splash and animations run on them.
   - The data is TIDIED, not invented: sessions more than ten days old are marked written up,
    attended-as-recorded and room-fee settled, which is what a practice that uses the app looks
    like. The fixture deliberately leaves hundreds undone to exercise the worklists, and a
    store page opening on "91 sessions incomplete" advertises a chore, not a tool.
  - Nothing is gated: every paid screen shows as a subscriber sees it. The listing's Description
     marks which features are paid, which is what Guideline 2.3.2 asks for.

   Usage:  node scripts/render-store-screenshots.mjs [--size 6.9|6.5] [--dark] [--only home,tax]
   Output: docs/app-store-screenshots/NN-name.png (outside TherapyTracker-web/, so it never
   deploys to Pages or lands in the iOS bundle). */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname, join, normalize } from "node:path";

const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_("playwright")); }
catch {
  console.error("\n  playwright is not installed:  npm i --no-save playwright\n");
  process.exit(1);
}

const argv = process.argv.slice(2);
const DARK = argv.includes("--dark");
const ONLY = (() => { const i = argv.indexOf("--only"); return i >= 0 ? argv[i + 1].split(",") : null; })();
const ROOT = resolve("TherapyTracker-web");
/* Two iPhone slots. App Store Connect needs ONE of them, and which one its page offers first
   varies - so both can be made. 6.9" is the default; `--size 6.5` makes the other set, into its
   own folder so the two can never be mixed in one upload. */
const SIZES = {
  "6.9": { w: 440, h: 956, dir: "" },     // 1320x2868 - iPhone 16/17 Pro Max
  "6.5": { w: 428, h: 926, dir: "6.5" },  // 1284x2778 - iPhone 14 Plus / 13 Pro Max
};
const SIZE = (() => { const i = argv.indexOf("--size"); return i >= 0 ? argv[i + 1] : "6.9"; })();
if (!SIZES[SIZE]) { console.error(`\n  --size must be ${Object.keys(SIZES).join(" or ")}\n`); process.exit(1); }
const DIM = SIZES[SIZE];
const OUTDIR = resolve("docs/app-store-screenshots", DIM.dir);
const FIXTURE = resolve("tests/test-data/groundwork-testdata-established.json");
const ANCHOR = JSON.parse(readFileSync(resolve("tests/test-data/index.json"), "utf8")).anchor;

/* The order is the order on the store page. The first two are all most people ever see, so they
   carry the two strongest answers: what needs you today, and what you will owe HMRC. */
const SHOTS = [
  { name: "01-home",      go: ["home"] },
  { name: "02-tax",       go: ["tax", { seg: "now" }] },
  { name: "03-sessions",  go: ["sessions"], pre: () => { sessFilter.seg = "upcoming"; } },
  { name: "04-analytics", go: ["practice", { seg: "trends" }] },
  { name: "05-money",     go: ["money", { seg: "overview" }], scrollTo: "Revenue & net income" },
  { name: "06-iphone",    go: ["settings"], open: "device" },
];

const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
               ".json":"application/json", ".png":"image/png", ".webmanifest":"application/manifest+json" };
const server = createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

/* A phone that says yes: Face ID present, notifications allowed, calendar granted. Serialised
   into the page before index.html runs, the same way scripts/check-records-folder.mjs does it. */
function fakePhone() {
  const docs = {};
  const GroundWorkNative = {
    biometricAvailable: async () => ({ available: true, biometry: "faceId" }),   // the spelling GroundWorkNativePlugin.swift sends
    authenticate: async () => ({ success: true }),
    sharePDF: async () => ({ shared: true }),
    /* A subscriber who owns this tax year: the store page shows the app as it is once bought. */
    plusStatus: async () => ({ active: true, tier: "pro", taxThrough: "2026-27" }),
    plusProduct: async () => ({ found: false }),
    plusPurchase: async () => ({ active: false }), plusRestore: async () => ({ active: false }),
    plusRedeem: async () => {}, plusManage: async () => {},
    folderInfo: async () => ({ set: false }),
    folderPick: async () => ({ picked: false, cancelled: true }),
    folderForget: async () => ({ set: false }),
    folderWrite: async () => ({ ok: false }), folderRead: async () => ({ found: false }),
    folderList: async () => ({ files: [] }), folderDelete: async () => ({ ok: true }),
    calendarList: async () => ({ granted: true, status: "granted", defaultId: "cal-work",
      calendars: [{ id: "cal-work", title: "Practice", source: "iCloud" }] }),
    calendarAdd: async () => ({ granted: true, calendar: "Practice", results: [] }),
    openCalendarFile: async () => ({ shown: true }),
    haptic: async () => {}
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      GroundWorkNative,
      Filesystem: {
        writeFile: async ({ path, data }) => { docs[path] = data; return { uri: "file:///docs/" + path }; },
        deleteFile: async ({ path }) => { delete docs[path]; return {}; },
        readdir: async () => ({ files: [] })
      },
      Share: { share: async () => ({}) },
      SplashScreen: { hide: async () => {} },
      LocalNotifications: {
        checkPermissions: async () => ({ display: "granted" }),
        requestPermissions: async () => ({ display: "granted" }),
        getPending: async () => ({ notifications: [] }),
        cancel: async () => {}, schedule: async () => {}
      },
      App: { addListener: () => ({ remove() {} }) }
    }
  };
}

const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
/* --lang, not just the context locale: Chromium draws date pickers in its own UI language. */
const browser = await chromium.launch({ executablePath: CHROME, args: ["--lang=en-GB"] });
/* At dsf 3: 440x956 is 1320x2868 (6.9"), 428x926 is 1284x2778 (6.5"). */
const ctx = await browser.newContext({ viewport: { width: DIM.w, height: DIM.h }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, locale: "en-GB", timezoneId: "Europe/London", colorScheme: DARK ? "dark" : "light" });
await ctx.clock.setFixedTime(new Date(`${ANCHOR}T09:40:00`));
await ctx.addInitScript(fakePhone);
await ctx.addInitScript((dark) => {
  localStorage.setItem("tt_theme", dark ? "dark" : "light");
  localStorage.setItem("tt_sound", "off");
  localStorage.setItem("tt_folder_asked", "1");      // no "pick a folder" offer over the shot
  localStorage.setItem("tt_lock", "1");              // the lock shows as on - the 4.2 evidence
  localStorage.setItem("tt_notify", "1");
  localStorage.removeItem("tt_plus_gate");
  localStorage.setItem("tt_plus", JSON.stringify({ active: true, tier: "pro", source: "storekit" }));
  localStorage.setItem("tt_taxpack", JSON.stringify({ through: "2026-27", source: "storekit", ids: [] }));
}, DARK);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("  page error:", e.message));

await page.goto(URL_, { waitUntil: "load" });
await page.waitForFunction(() => typeof S !== "undefined" && S && Array.isArray(S.sessions), null, { timeout: 20000 });

/* Top-level `let`s live in the global LEXICAL scope - assign the bare name, never window.S. */
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
await page.evaluate((state) => {
  try { flowClose(); } catch (e) {}
  window.commit = async () => true;                  // read-only: nothing here is saved
  S = normalize(JSON.parse(JSON.stringify(state)));
  /* A neutral name: blank would fall back to "GroundWork" and print the brand twice. */
  S.settings.practiceName = "My Practice";
  S.settings.practiceTagline = "";
  S.settings.onboarded = true;
  S.settings.coach = Object.assign({}, S.settings.coach, { off: true });
  S.settings.start = Object.assign({}, S.settings.start, { dismissed: true });
  S.settings.homePins = ["projection", "dtp"];
  const cutoff = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  for (const s of S.sessions) {
    if (s.date >= cutoff) continue;
    if (!notesDone(s)) s.notes = "Y";
    s.attendConfirmed = true;
    if (s.roomPaid !== "Y" && s.roomPaid !== "n/a") { s.roomPaid = "Y"; s.roomPaidDate = s.roomPaidDate || s.date; }
  }
  try { localStorage.setItem("tt_whatsnew", String(WHATS_NEW)); } catch (e) {}
  try { applySettings(); } catch (e) {}
}, fixture.state);
await page.waitForTimeout(2500);                     // let the splash finish on its own clock

await mkdir(OUTDIR, { recursive: true });
const suffix = DARK ? "-dark" : "";
for (const shot of SHOTS) {
  if (ONLY && !ONLY.some((o) => shot.name.includes(o))) continue;
  await page.evaluate(({ args, open, pre, scrollTo }) => {
    try { closeSheet(); } catch (e) {}
    if (pre) (0, eval)(`(${pre})`)();
    go(...args);
    if (open) {
      const d = document.querySelector(`details[data-g="${open}"]`);
      if (d) { d.open = true; d.scrollIntoView({ block: "start" }); window.scrollBy(0, -64); }
    } else if (scrollTo) {
      /* Frame the shot on a card by its heading, clear of the sticky header. */
      const h = [...document.querySelectorAll("#main h2, #main h3, #main .ch, #main .card *")]
        .find((e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === scrollTo.toLowerCase());
      const card = h && (h.closest(".card") || h);
      if (card) { card.scrollIntoView({ block: "start" }); window.scrollBy(0, -64); }
    } else window.scrollTo(0, 0);
  }, { args: shot.go, open: shot.open || null, pre: shot.pre ? String(shot.pre) : null,
       scrollTo: shot.scrollTo || null });
  await page.waitForTimeout(1600);                   // charts grow in with a keyframe animation
  const file = join(OUTDIR, `${shot.name}${suffix}.png`);
  await page.screenshot({ path: file });
  console.log(`  wrote ${file.replace(resolve(".") + "/", "")}`);
}

await browser.close();
server.close();
console.log(`\n  ${DIM.w * 3}x${DIM.h * 3} (iPhone ${SIZE}") - demo practice, clock pinned to ${ANCHOR}. Upload in this order.`);
