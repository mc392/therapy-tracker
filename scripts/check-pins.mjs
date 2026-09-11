/* Pinning an analytic to the home screen, in a real browser.
 *
 *   npm run test:pins
 *
 * WHY THIS EXISTS
 *   The feature is a registry (ANA_CARDS) plus two screens that both draw from it, and every way
 *   it can break is quiet:
 *
 *     1. **A card drawn in one place and not the other.** The whole promise is that the pinned
 *        card IS the Trends card — same builder, same figures. A builder that only works when the
 *        rest of its section has already been built (a shared local left behind in the refactor)
 *        renders perfectly on Trends and throws, or renders empty, on Home.
 *     2. **A pin key that does not match its card.** The key is what settings.homePins stores, so
 *        a card whose pin button toggles a different registry entry pins the wrong analytic — and
 *        the reader sees the button light up on the card they tapped.
 *     3. **Home's own rows wired by the wrong selector.** "Coming up" renders .list-item[data-id]
 *        where the id is a SESSION; the pinned cards render the same shape where it is a CLIENT.
 *        One querySelectorAll over the whole view and every upcoming session opens somebody's
 *        client record. Nothing would throw.
 *
 * EXPECTATIONS COME FROM THE RULE, NOT FROM THE FUNCTIONS
 *   The cap, the storage location, the repair-on-read and "the pinned card is the same card" are
 *   all asserted against what CLAUDE.md and the code comments say they are — never by reading the
 *   value back out of the thing under test. The equality check compares Home's rendering of a
 *   card with Trends' rendering of the same card; if both were wrong in the same way it would
 *   pass, which is why the section text is separately asserted to be non-trivial.
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

/* A practice with enough history that every analytic has something to say. */
const fixture = join(root, "tests", "test-data", "groundwork-testdata-established.json");
if (!existsSync(fixture)) {
  console.error(`Missing ${fixture} — run \`npm run testdata\` first.`);
  process.exit(2);
}
const state = JSON.parse(readFileSync(fixture, "utf8"));

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.go === "function" && typeof window.homePins === "function");

const results = await page.evaluate(async (env) => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Read-only: nothing here may reach the device's database. */
  window.commit = async () => true;
  window.celebrate = () => {};
  try { Sfx.on = false; } catch (e) {}

  const st = env.state && env.state.state ? env.state.state : env.state;
  normalize(st); S = st; try { applySettings(); } catch (e) {}
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  /* ---- 1. the registry ---- */
  ok("every analytic has a unique, permanent key",
    new Set(ANA_CARDS.map((x) => x.k)).size === ANA_CARDS.length, ANA_CARDS.length);
  ok("every analytic names a section that exists on Trends",
    ANA_CARDS.every((x) => TREND_SEGS.some((s) => s[0] === x.seg)));
  ok("every analytic has a builder and a name for the picker",
    ANA_CARDS.every((x) => typeof x.b === "function" && x.n && x.d));

  /* ---- 2. storage: settings, not localStorage, and repaired on read ----
     The rule is homeOrder()'s: a key this build has never heard of is dropped rather than
     migrated, so an old backup can never put a card on Home that does not exist. */
  setHomePins([]);
  ok("nothing pinned stores nothing at all", settings().homePins === undefined);
  settings().homePins = ["floor", "a-card-that-never-existed", "cpd"];
  ok("a key this build does not have is dropped on read",
    homePins().join("|") === "floor|cpd", homePins().join("|"));
  setHomePins(["floor", "cpd"]);
  const envelope = await backupPayload();
  ok("pins live in settings, so they travel in a backup",
    envelope && envelope.state && envelope.state.settings &&
    (envelope.state.settings.homePins || []).join("|") === "floor|cpd",
    envelope && envelope.state && envelope.state.settings && JSON.stringify(envelope.state.settings.homePins));
  ok("…and never in localStorage",
    !Object.keys(localStorage).some((k) => /pin/i.test(k)), Object.keys(localStorage).filter((k) => /pin/i.test(k)).join(","));

  /* ---- 3. the cap ---- */
  const many = ANA_CARDS.slice(0, ANA_PIN_MAX + 3).map((x) => x.k);
  setHomePins(many);
  ok(`no more than ${ANA_PIN_MAX} can be pinned`, homePins().length === ANA_PIN_MAX, homePins().length);
  setHomePins(["floor", "cpd", "capacity", "sources"]);
  const refused = await homePinToggle("slots");
  ok("a fifth is refused rather than silently swapped in",
    refused === null && homePins().length === ANA_PIN_MAX && homePins().indexOf("slots") < 0);
  ok("…and unpinning one makes room again",
    (await homePinToggle("sources")) === false && homePins().indexOf("sources") < 0);

  /* ---- 4. the pinned card is the SAME card ----
     Build every analytic twice — once through the Trends section path, once through the pin
     path — and compare the text. A card that only renders correctly when the rest of its
     section has been built alongside it fails here and nowhere else. */
  let mismatched = [], threw = [], trivial = [];
  for (const def of ANA_CARDS) {
    setHomePins([def.k]);
    let home = "", trends = "";
    try {
      const hb = homePinsBlock();
      const h = document.createElement("div"); h.innerHTML = hb.html || "";
      /* drop the block's own lead-in row — it is not part of the card */
      const lead = h.querySelector(".pinlead"); if (lead) lead.remove();
      home = norm(h.textContent);
      const cx = anaCtx();
      const t = document.createElement("div"); t.innerHTML = (def.b(cx, def.k) || {}).html || "";
      trends = norm(t.textContent);
    } catch (e) { threw.push(def.k + ": " + e.message); continue; }
    if (home !== trends) mismatched.push(def.k);
    if (home.length < 20) trivial.push(def.k + "(" + home.length + ")");
  }
  ok("no analytic throws when it is built on its own", !threw.length, threw.join(" · "));
  ok("every pinned card renders exactly what Trends renders", !mismatched.length, mismatched.join(", "));
  ok("…and none of them renders an empty card", !trivial.length, trivial.join(", "));

  /* ---- 5. the pin button says what it does ---- */
  setHomePins(["floor"]);
  const card = document.createElement("div");
  card.innerHTML = acFloor(anaCtx(), "floor").html;
  const btn = card.querySelector("[data-pin]");
  ok("a card carries its own pin button", !!btn);
  ok("…keyed to itself, not to another card", btn && btn.dataset.pin === "floor", btn && btn.dataset.pin);
  ok("…shown as on while it is pinned", btn && btn.classList.contains("on") && btn.getAttribute("aria-pressed") === "true");
  setHomePins([]);
  const card2 = document.createElement("div");
  card2.innerHTML = acFloor(anaCtx(), "floor").html;
  ok("…and as off when it is not", !card2.querySelector("[data-pin]").classList.contains("on"));

  /* ---- 6. Home ---- */
  setHomePins([]);
  go("home"); await sleep(120);
  ok("with nothing pinned Home offers the empty invitation", !!document.querySelector("#pinPrompt"));
  ok("…and no pinned cards with it", !document.querySelector("#homePins .card:not(.pinempty)"));
  const promptStyle = getComputedStyle(document.querySelector("#pinPrompt"));
  ok("…drawn as a dotted outline, not a filled card", /dashed/.test(promptStyle.borderTopStyle + promptStyle.borderStyle), promptStyle.borderTopStyle);

  setHomePins(["drifting", "floor"]);
  go("home"); await sleep(150);
  const host = document.querySelector("#homePins");
  ok("pinned analytics appear on Home", !!host && !document.querySelector("#pinPrompt"));
  ok("…both of them", host && host.querySelectorAll(".card").length >= 2,
    host && host.querySelectorAll(".card").length);
  ok("…in the registry's own order", host && norm(host.textContent).indexOf("Drifting away") < norm(host.textContent).indexOf("Your floor"));
  ok("the block is one of the home blocks the reader can move",
    HOME_CARDS.some((x) => x.k === "pins") && homeOrder().indexOf("pins") >= 0);

  /* The selector trap: "Coming up" rows are sessions, pinned rows are clients. If one pass over
     the whole view had wired them together, a session row would carry a client's onclick. */
  const upRow = document.querySelector("#up .list-item[data-id]");
  ok("an upcoming session is still a session, not a client",
    !upRow || !!S.sessions.find((s) => s._id === upRow.dataset.id), upRow && upRow.dataset.id);
  const pinRow = document.querySelector("#homePins .list-item[data-id]");
  ok("a row inside a pinned card is a client",
    !pinRow || !!S.clients.find((c) => c._id === pinRow.dataset.id), pinRow && pinRow.dataset.id);

  /* ---- 7. an analytic that has nothing to say ----
     Review status and Long-term clients are dropped from Trends when there is nobody in them.
     A card the reader PINNED must not vanish the same way — the space where a chosen figure used
     to be reads as a fault. */
  const emptyState = JSON.parse(JSON.stringify(st));
  emptyState.clients = []; emptyState.sessions = [];
  const keep = S; S = emptyState;
  const rv = acReview(anaCtx(), "review"), lt = acLongterm(anaCtx(), "longterm");
  ok("Review status with nobody to review is flagged empty, not blank", rv.empty && norm(rv.html).length > 20);
  ok("Long-term clients with nobody past twenty is flagged empty, not blank", lt.empty && norm(lt.html).length > 20);
  S = keep;

  /* ---- 8. the gate ---- */
  const sg = settings(); sg.features = sg.features || {};
  sg.features.trends = false;
  ok("with Business analytics switched off nothing is pinnable", !anaPinnable() && pinBtn("floor") === "");
  setHomePins(["floor"]);
  ok("…and Home draws no pinned block", homePinsBlock().html === "");
  delete sg.features.trends;
  try { localStorage.setItem("tt_plus_gate", "on"); localStorage.setItem("tt_plus", JSON.stringify({ active: false })); } catch (e) {}
  ok("behind the paywall nothing is pinnable either",
    !plusLocked("trends") || (!anaPinnable() && homePinsBlock().html === ""));
  try { localStorage.removeItem("tt_plus"); localStorage.removeItem("tt_plus_gate"); } catch (e) {}

  /* ---- 9. the picker ---- */
  setHomePins([]);
  homePinSheet(); await sleep(200);
  const rows = [...document.querySelectorAll("#sheetBody [data-pk]")];
  ok("the picker offers every analytic", rows.length === ANA_CARDS.length, rows.length);
  rows[0].click(); rows[1].click(); await sleep(60);
  ok("picking is staged, not written", homePins().length === 0);
  document.querySelector("#sheetBody #pkSave").click(); await sleep(220);
  ok("…and applied on Done", homePins().length === 2, homePins().join("|"));
  setHomePins([]);
  return out;
}, { state });

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 5).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`${results.length}/${results.length} pin checks passed`);
else console.log(`\n${bad.length} failed of ${results.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
