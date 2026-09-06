/* Runs tests/tax-tests.js the way a person does — pasted into the app's own console — but
 * headlessly, so it can be run before a push instead of remembered.
 *
 *   node scripts/run-tax-tests.mjs
 *
 * The suite itself is unchanged and still works by hand; this only serves the app, loads it in
 * Chromium and evaluates the file. It restores the live state when it finishes, exactly as it
 * does in a real browser, and it never calls commit().
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
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
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png" };

const { srv, port } = await new Promise((res) => {
  const s = createServer((req, rq) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    try {
      const body = readFileSync(join(webDir, p === "/" ? "index.html" : p));
      rq.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
      rq.end(body);
    } catch (e) { rq.writeHead(404); rq.end("no"); }
  });
  s.listen(0, "127.0.0.1", () => res({ srv: s, port: s.address().port }));
});

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ serviceWorkers: "block" });
const page = await ctx.newPage();
const lines = [];
page.on("console", (m) => lines.push(m.text()));
await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
await page.waitForFunction(() => typeof go === "function" && typeof S === "object" && S && Array.isArray(S.sessions), null, { timeout: 30000 });

const src = readFileSync(join(root, "tests", "tax-tests.js"), "utf8");
const res = await page.evaluate((code) => (0, eval)(code), src);

lines.filter((l) => /^FAIL/.test(l)).forEach((l) => console.log(l));
console.log(res.passed + "/" + res.total + " tax tests passed" +
  (res.failures.length ? "\nFAILURES:\n  " + res.failures.join("\n  ") : ""));

await browser.close();
srv.close();
process.exit(res.failures.length ? 1 : 0);
