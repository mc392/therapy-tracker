/* Checks GroundWork's session-schedule prediction against GroundWork Notes'.
 *
 * The two apps have to agree on which dates a client's cadence produces. They are written in
 * different languages, in different repositories, and a disagreement between them shows up as
 * the wrong dates being offered to a counsellor — which nobody would notice for months.
 *
 * The cases below are the same ones asserted in GroundWork Notes'
 * `Tests/NotesVaultCoreTests/SessionScheduleTests.swift`, with the same expected output. If a
 * case is changed here it has to be changed there too, and the spec both implement
 * (`docs/schedule-sync.md`) has to be changed with them.
 *
 * The functions under test are pulled out of index.html itself rather than copied, so this
 * cannot pass against a stale duplicate of code that has since changed.
 *
 *   node scripts/check-schedule-parity.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "TherapyTracker-web", "index.html"), "utf8");

/* The app is one file with no module boundary, so the block under test is lifted out by its
   own markers. Both are asserted, so a rename fails here rather than silently testing nothing. */
function extract(from, to) {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`check-schedule-parity: "${from}" is no longer in index.html — has it been renamed?`);
  const end = source.indexOf(to, start);
  if (end < 0) throw new Error(`check-schedule-parity: "${to}" is no longer in index.html — has it been renamed?`);
  return source.slice(start, end);
}

const prelude = `
  function parseD(x){ if(!x) return null; const d=new Date(x+"T00:00:00"); return isNaN(d)?null:d; }
  function isoD(d){ const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
`;

const { placeOnSchedule } = new Function(
  `${prelude}\n${extract("const SLOT_DAYS=", "function suggestFor")}\nreturn { placeOnSchedule };`
)();

/* GroundWork itself only ever steps forward one session (`nextSessionFor`); the backwards walk
   over everything outstanding lives in the notes app. This is that walk, built on the *app's own*
   placeOnSchedule, so what is being compared is the shared rule rather than a second copy of it. */
function expected(anchorISO, schedule, recordedISO, nowISO, limit = 6) {
  const anchor = new Date(anchorISO);
  const horizon = new Date(nowISO);
  horizon.setHours(24, 0, 0, 0);

  const taken = new Set(recordedISO.map(t => new Date(t).toDateString()));
  const out = [];
  let cursor = new Date(anchor);

  for (let step = 0; step < 400; step++) {
    cursor = addDays(cursor, schedule.cadenceDays);
    let candidate = new Date(placeOnSchedule(cursor, schedule));
    if (schedule.usualTime) {
      const [h, m] = schedule.usualTime.split(":");
      candidate.setHours(+h, +m, 0, 0);
    } else {
      candidate.setHours(anchor.getHours(), anchor.getMinutes(), 0, 0);
    }
    if (candidate <= anchor) continue;
    if (candidate >= horizon) break;
    if (taken.has(candidate.toDateString())) continue;
    out.push(candidate);
  }

  const p = n => String(n).padStart(2, "0");
  return out.reverse().slice(0, limit).map(d => `${isoD(d)} ${p(d.getHours())}:${p(d.getMinutes())}`);
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoD(d) { const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

const WEEKLY_TUE = { cadenceDays: 7, usualDay: "tue", usualTime: "09:30" };

const cases = [
  ["weekly fills in the missed weeks, most recent first",
    () => expected("2026-08-04T09:30", WEEKLY_TUE, [], "2026-08-25T14:00"),
    ["2026-08-25 09:30", "2026-08-18 09:30", "2026-08-11 09:30"]],

  ["today's session is offered even before its usual time",
    () => expected("2026-08-18T09:30", WEEKLY_TUE, [], "2026-08-25T07:00"),
    ["2026-08-25 09:30"]],

  ["nothing is suggested beyond today",
    () => expected("2026-08-18T09:30", { cadenceDays: 7, usualDay: "tue" }, [], "2026-08-20T12:00"),
    []],

  ["fortnightly",
    () => expected("2026-06-02T10:00", { cadenceDays: 14, usualDay: "tue", usualTime: "10:00" }, [], "2026-07-01T12:00"),
    ["2026-06-30 10:00", "2026-06-16 10:00"]],

  ["three-weekly",
    () => expected("2026-06-02T10:00", { cadenceDays: 21, usualDay: "tue", usualTime: "10:00" }, [], "2026-07-01T12:00"),
    ["2026-06-23 10:00"]],

  // The one that matters most: freqDays() maps "Monthly" to a flat 28 days. A calendar month at
  // the Swift end would drift a few days per quarter and neither app would look wrong alone.
  ["monthly is 28 days, not a calendar month",
    () => expected("2026-01-06T10:00", { cadenceDays: 28, usualDay: "tue", usualTime: "10:00" }, [], "2026-04-30T12:00"),
    ["2026-04-28 10:00", "2026-03-31 10:00", "2026-03-03 10:00", "2026-02-03 10:00"]],

  ["a session moved to another day snaps back to the usual one",
    () => expected("2026-08-06T09:30", WEEKLY_TUE, [], "2026-08-19T12:00"),
    ["2026-08-18 09:30", "2026-08-11 09:30"]],

  ["snapping goes to the nearest usual day, skipping an implausibly short gap",
    () => expected("2026-08-07T15:00", { cadenceDays: 7, usualDay: "mon", usualTime: "15:00" }, [], "2026-08-24T12:00"),
    ["2026-08-24 15:00", "2026-08-17 15:00"]],

  // Three days forward is the outer edge of the snap and the case most easily got wrong:
  // it must be kept, not pulled back a week. (Widening the window the other way — accepting
  // a four-day pull — is caught by the Friday/Monday case above.)
  ["a three-day forward snap is kept rather than pulled back a week",
    () => expected("2026-08-03T09:00", { cadenceDays: 7, usualDay: "thu", usualTime: "09:00" }, [], "2026-08-14T12:00"),
    ["2026-08-13 09:00"]],

  ["without a usual day the anchor's own day and time are kept",
    () => expected("2026-08-06T16:45", { cadenceDays: 7 }, [], "2026-08-21T12:00"),
    ["2026-08-20 16:45", "2026-08-13 16:45"]],

  ["a session that already has a note is not suggested",
    () => expected("2026-08-04T09:30", WEEKLY_TUE, ["2026-08-18T09:30"], "2026-08-25T14:00"),
    ["2026-08-25 09:30", "2026-08-11 09:30"]],

  ["a note filed at a slightly different time is still that session",
    () => expected("2026-08-04T09:30", WEEKLY_TUE, ["2026-08-11T09:35", "2026-08-18T08:00"], "2026-08-25T14:00"),
    ["2026-08-25 09:30"]],

  ["the list is capped at six",
    () => expected("2025-01-07T09:00", { cadenceDays: 7, usualDay: "tue", usualTime: "09:00" }, [], "2026-08-25T12:00").length,
    6],

  ["an anchor in the future produces nothing",
    () => expected("2027-01-05T09:00", { cadenceDays: 7, usualDay: "tue" }, [], "2026-08-25T12:00"),
    []]
];

let failed = 0;
for (const [name, run, want] of cases) {
  const got = run();
  if (JSON.stringify(got) === JSON.stringify(want)) continue;
  failed++;
  console.error(`  FAIL  ${name}`);
  console.error(`        got  ${JSON.stringify(got)}`);
  console.error(`        want ${JSON.stringify(want)}`);
}

if (failed) {
  console.error(`\n  ${failed} of ${cases.length} schedule cases disagree with GroundWork Notes.`);
  console.error("  Fix both implementations and docs/schedule-sync.md together — never just one.");
  process.exit(1);
}
console.log(`  schedule prediction matches GroundWork Notes — ${cases.length} cases`);
