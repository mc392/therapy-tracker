/* Turns the App Store screenshots into promotional ones: a benefit headline on the brand green,
   above the real screen in a phone frame.

   The App Store has no separate slot for promotional artwork - the product page is the
   screenshots (and optional preview videos), and the first three are all that shows in search.
   So the screenshots carry the pitch. Two rules hold it honest:
   - The screen inside the frame is the untouched output of render-store-screenshots.mjs - the
     real app on a synthetic practice. Guideline 2.3.3: screenshots must show the app in use, not
     title art. Captions sit around the app, never over it.
   - A screen that needs a purchase SAYS so on the image (`paid`), the same rule the Description
     follows with its (Pro) markers. A caption that sells tax figures without saying they are
     bought is the one way this page could mislead.

   Run render-store-screenshots.mjs first. Usage:
     node scripts/render-store-promo.mjs
   Output: docs/app-store-screenshots/promo/NN-name.png, 1320x2868, in upload order. */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_("playwright")); }
catch { console.error("\n  playwright is not installed:  npm i --no-save playwright\n"); process.exit(1); }

/* `--size 6.5` reads and writes the 6.5" set (1284x2778) instead of the 6.9" one (1320x2868).
   The layout is always drawn 1320 CSS pixels wide and scaled by the device pixel ratio, so both
   sizes are the same design; only the canvas height differs, by the two phones' own proportions. */
const argv = process.argv.slice(2);
const SIZE = (() => { const i = argv.indexOf("--size"); return i >= 0 ? argv[i + 1] : "6.9"; })();
/* `ipad` is the 13" iPad (2064x2752) - a squarer canvas, so the headline goes on one line and the
   frame is a tablet: wider, gentler corners, and more of the screen shown before the bottom edge. */
const OUTPX = { "6.9": [1320, 2868], "6.5": [1284, 2778], "ipad": [2064, 2752] }[SIZE];
if (!OUTPX) { console.error("\n  --size must be 6.9, 6.5 or ipad\n"); process.exit(1); }
const IPAD = SIZE === "ipad";
const L = IPAD
  ? { top: 120, h1: 100, p: 46, pw: 1120, gap: 90, fw: 1160, pad: 22, r: 64, ir: 44 }
  : { top: 190, h1: 116, p: 48, pw: 1000, gap: 110, fw: 1000, pad: 24, r: 132, ir: 110 };
const CSSW = 1320, DPR = OUTPX[0] / CSSW, CSSH = Math.round(OUTPX[1] / DPR);
const SRC = resolve("docs/app-store-screenshots", SIZE === "6.9" ? "" : SIZE);
const OUT = join(SRC, "promo");

/* Upload order. The first three are what search shows, so they carry the three reasons to
   install: what needs me today, what I will owe, and that nobody else can see my records. */
const PROMOS = [
  { shot: "01-home",      out: "01-today",
    h: "What needs you<br>today",
    s: "Unpaid sessions, notes to write up and room fees - the moment you open the app." },
  { shot: "02-tax",       out: "02-tax",       paid: "Pro + tax year",
    h: "Know what you'll<br>owe HMRC",
    s: "A running UK tax estimate, what to keep back, and when each payment is due." },
  { shot: "06-iphone",    out: "03-private",
    h: "Private<br>by design",
    s: "Face ID lock, no account and no tracking. Your records stay with you." },
  { shot: "03-sessions",  out: "04-week",
    h: "Your week<br>in one list",
    s: "Every session, room and fee - and clients can be known by a code alone." },
  { shot: "04-analytics", out: "05-analytics", paid: "Pro",
    h: "See how your<br>practice is doing",
    s: "Retention, attendance, seasonality - over twenty practice analytics." },
  { shot: "05-money",     out: "06-money",
    h: "Your money,<br>month by month",
    s: "What you billed, what the rooms cost, and what was left." },
];

/* Nunito (SIL Open Font License 1.1 - free to bundle), vendored so a render is identical offline
   and the headless browser, which cannot reach Google Fonts through this network, never quietly
   falls back to Liberation Sans. A rounded face, the nearest free match to the SF Pro Rounded the
   iPhone app itself is set in. */
const FONT = readFileSync(resolve("scripts/assets/nunito-latin.woff2")).toString("base64");

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
/* Hyphen-spaced dashes read as dashes; the captions are typed plainly and set properly here. */
const typeset = (t) => t.replace(/ - /g, " – ").replace(/'/g, "’");

function page(p, imgUrl) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  @font-face{font-family:"Nunito";font-weight:200 1000;font-display:block;
    src:url(data:font/woff2;base64,${FONT}) format("woff2")}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${CSSW}px;height:${CSSH}px;overflow:hidden}
  body{font-family:"Nunito","Liberation Sans",sans-serif;color:#fff;
    /* The launch screen's own greens: --brand to --brand-dark. */
    background:radial-gradient(1200px 900px at 50% -8%, #6E8E80 0%, rgba(110,142,128,0) 70%),
               linear-gradient(180deg,#5C7A6D 0%,#46604F 55%,#3C4F44 100%)}
  .copy{position:absolute;left:100px;right:100px;top:${L.top}px;text-align:center}
  .tag{display:inline-block;margin-bottom:34px;padding:12px 30px;border-radius:999px;
    font-weight:800;font-size:34px;letter-spacing:.02em;color:#3C3212;
    background:linear-gradient(180deg,#F3DFA2,#D9B75E);box-shadow:0 6px 18px rgba(0,0,0,.18)}
  h1{font-weight:800;font-size:${L.h1}px;line-height:1.04;letter-spacing:-.015em;
    text-shadow:0 2px 24px rgba(0,0,0,.12)}
  p{margin:${IPAD ? 30 : 40}px auto 0;max-width:${L.pw}px;font-weight:600;font-size:${L.p}px;line-height:1.32;
    color:rgba(255,255,255,.88)}
  /* The frame: a dark bezel with the screen inset, sized to the screenshot's own 1320:2868. */
  /* On the iPad the headline has no hand-placed break, so let the browser even the lines out
     rather than leave one word stranded ("…you'll owe / HMRC"). */
  ${IPAD ? "h1,p{text-wrap:balance}" : ""}
  .phone{position:absolute;left:50%;top:0;width:${L.fw}px;
    transform:translateX(-50%);padding:${L.pad}px;border-radius:${L.r}px;background:#141816;
    box-shadow:0 0 0 3px #2B322F inset, 0 60px 140px rgba(0,0,0,.40), 0 20px 50px rgba(0,0,0,.25)}
  .phone img{display:block;width:${L.fw - 2 * L.pad}px;height:auto;border-radius:${L.ir}px}
</style></head><body>
  <div class="copy">
    ${p.paid ? `<div class="tag">${esc(p.paid)}</div>` : ""}
    <h1>${IPAD ? typeset(p.h).replace(/<br>/g, " ") : typeset(p.h)}</h1>
    <p>${esc(typeset(p.s))}</p>
  </div>
  <div class="phone"><img src="${imgUrl}" alt=""></div>
</body></html>`;
}

const browser = await chromium.launch({ executablePath: ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome"].find((x) => existsSync(x)) });
const pg = await browser.newPage({ viewport: { width: CSSW, height: CSSH }, deviceScaleFactor: DPR });
mkdirSync(OUT, { recursive: true });

for (const p of PROMOS) {
  const src = join(SRC, `${p.shot}.png`);
  if (!existsSync(src)) { console.error(`  missing ${src} - run render-store-screenshots.mjs first`); process.exit(1); }
  const data = "data:image/png;base64," + readFileSync(src).toString("base64");
  await pg.setContent(page(p, data), { waitUntil: "networkidle" });
  /* document.fonts.check() answers true for a family that was never declared at all, so it
     cannot prove a font loaded - ask for the face itself instead, and refuse to write a fallback. */
  const loaded = await pg.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Nunito" && f.status === "loaded");
  });
  if (!loaded) { console.error("  Nunito did not load - refusing to render", p.out); process.exit(1); }
  /* The phone sits a fixed gap below the words, however many lines they took. */
  await pg.evaluate((GAP) => {
    const bottom = document.querySelector(".copy").getBoundingClientRect().bottom;
    document.querySelector(".phone").style.top = Math.round(bottom + GAP) + "px";
  }, L.gap);
  const file = join(OUT, `${p.out}.png`);
  await pg.screenshot({ path: file, omitBackground: false });
  console.log(`  wrote ${file.replace(resolve(".") + "/", "")}`);
}
await browser.close();
console.log(`\n  ${OUTPX[0]}x${OUTPX[1]} (${IPAD ? 'iPad 13"' : 'iPhone ' + SIZE + '"'}), opaque, in upload order.`);
