/* Parses every inline <script> in index.html. The app is one 600KB file with no build
   step, so a syntax error ships straight to the phone and the browser — this is the
   cheapest guard there is. Parse only: nothing is executed. */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("TherapyTracker-web/index.html", "utf8");
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];

if (!blocks.length) {
  console.error("No inline scripts found — did index.html move?");
  process.exit(1);
}

let bad = 0;
for (const [i, m] of blocks.entries()) {
  const line = html.slice(0, m.index).split("\n").length;
  try {
    new vm.Script(m[1], { filename: `index.html:<script ${i + 1}>` });
  } catch (e) {
    bad++;
    console.error(`  script #${i + 1} (line ${line}): ${e.message}`);
  }
}

console.log(bad ? `  ${bad} script block(s) failed to parse` : `  ${blocks.length} script blocks parse cleanly`);
process.exit(bad ? 1 : 0);
