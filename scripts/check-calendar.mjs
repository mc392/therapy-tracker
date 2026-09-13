/* Checks the calendar (.ics) export against the format's own rules.
 *
 * A calendar file is read by somebody else's software - Apple Calendar, Google Calendar,
 * Outlook - and the way it fails is not a crash here. It is an event that lands an hour out,
 * a room name that arrives cut in half, or a re-export that quietly becomes a second copy of
 * an appointment the therapist already has. None of that shows up in the app.
 *
 * Expectations below are derived from RFC 5545 and from the rules written at the top of the
 * calendar-export block in index.html - never pasted back from what the functions returned.
 * Two of these (the DST case and the octet-counting fold) fail against the obvious naive
 * implementation, which is how they were verified.
 *
 * The functions under test are pulled out of index.html itself, so this cannot pass against a
 * stale copy of code that has since changed.
 *
 *   node scripts/check-calendar.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "TherapyTracker-web", "index.html"), "utf8");

const FROM = "const ICS_UID_DOMAIN=";
const TO = 'infoDef("calendar-export"';
const start = source.indexOf(FROM);
if (start < 0) throw new Error(`check-calendar: "${FROM}" is no longer in index.html - has it been renamed?`);
const end = source.indexOf(TO, start);
if (end < 0) throw new Error(`check-calendar: "${TO}" is no longer in index.html - has it been renamed?`);

/* Everything the block reaches for that lives elsewhere in the app. `download` and `toast` are
   captured rather than performed, so the two entry points can be driven end to end. */
const prelude = `
  let _mins=50, _dl=null, _toast="", _err=0;
  let S={sessions:[]};
  function sessionMins(){return _mins;}
  function isCancelled(s){return !!s._cancelled;}
  function uid(){return "fallbackid";}
  function toast(m){_toast=String(m);}
  const Sfx={error(){_err++;}};
  function download(name,text,type){_dl={name,text,type};}
  function isoD(d){const p=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());}
`;
const api = new Function(`${prelude}\n${source.slice(start, end)}
  return { icsEsc, icsFold, icsFloating, icsSeq, icsEvent, icsFile, icsFileName,
           icsSessionsBetween, calAddSession, calAddRange, icsTitle,
           setMins:m=>{_mins=m;}, setSessions:x=>{S.sessions=x;},
           dl:()=>_dl, toastText:()=>_toast, errs:()=>_err };`)();

let pass = 0, fail = 0;
const ok = (what, cond, detail) => {
  if (cond) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${what}${detail === undefined ? "" : `  (${detail})`}`);
};
const bytes = s => Buffer.byteLength(s, "utf8");

/* ---- escaping (RFC 5545 s3.3.11): exactly backslash, semicolon, comma and newline ---- */
ok("a backslash is escaped", api.icsEsc("a\\b") === "a\\\\b", api.icsEsc("a\\b"));
ok("a semicolon is escaped", api.icsEsc("a;b") === "a\\;b", api.icsEsc("a;b"));
ok("a comma is escaped", api.icsEsc("Room 2, rear") === "Room 2\\, rear", api.icsEsc("Room 2, rear"));
ok("a newline becomes the two-character \\n", api.icsEsc("a\nb") === "a\\nb", JSON.stringify(api.icsEsc("a\nb")));
ok("a colon is NOT escaped", api.icsEsc("a:b") === "a:b");
ok("null is an empty string, not 'null'", api.icsEsc(null) === "");

/* ---- folding (s3.1): 75 OCTETS per line, continued with CRLF + one space ---- */
const longAscii = "LOCATION:" + "x".repeat(300);
const foldedAscii = api.icsFold(longAscii);
const linesA = foldedAscii.split("\r\n");
ok("a long line is folded into several", linesA.length > 1, linesA.length);
ok("no folded line exceeds 75 octets", linesA.every(l => bytes(l) <= 75), linesA.map(bytes).join(","));
ok("every continuation line starts with one space", linesA.slice(1).every(l => l.startsWith(" ")));
ok("unfolding restores the original", foldedAscii.split("\r\n ").join("") === longAscii);

/* The reason this counts bytes and not characters: 60 two-byte characters is 120 octets, which
   a character-counting fold would emit as a single over-long line. */
const longUtf = "LOCATION:" + "é".repeat(60);
const foldedUtf = api.icsFold(longUtf);
const linesU = foldedUtf.split("\r\n");
ok("a multi-byte line is folded on octets, not characters", linesU.length > 1, linesU.length);
ok("no multi-byte folded line exceeds 75 octets", linesU.every(l => bytes(l) <= 75), linesU.map(bytes).join(","));
ok("a multi-byte character is never split across the fold", foldedUtf.split("\r\n ").join("") === longUtf);
ok("a short line is left alone", api.icsFold("SUMMARY:MC392") === "SUMMARY:MC392");

/* ---- floating local time: no trailing Z, no TZID, and pure wall-clock arithmetic ---- */
ok("a start time is floating, not UTC", api.icsFloating("2026-09-15", "10:00", 0) === "20260915T100000",
   api.icsFloating("2026-09-15", "10:00", 0));
ok("50 minutes is added to the wall clock", api.icsFloating("2026-09-15", "10:00", 50) === "20260915T105000",
   api.icsFloating("2026-09-15", "10:00", 50));
ok("a session running past midnight rolls the date", api.icsFloating("2026-09-15", "23:40", 50) === "20260916T003000",
   api.icsFloating("2026-09-15", "23:40", 50));
ok("a session running past month end rolls the month", api.icsFloating("2026-09-30", "23:40", 50) === "20261001T003000",
   api.icsFloating("2026-09-30", "23:40", 50));
/* 29 March 2026 is the morning the UK clocks go forward. Doing this arithmetic on a local Date
   would return 02:20 on a machine set to London - a 50-minute session recorded as 110 minutes. */
ok("a daylight-saving morning still adds exactly 50 minutes",
   api.icsFloating("2026-03-29", "00:30", 50) === "20260329T012000", api.icsFloating("2026-03-29", "00:30", 50));
ok("a missing date yields nothing at all", api.icsFloating("", "10:00", 0) === null);
ok("a malformed date yields nothing at all", api.icsFloating("not-a-date", "10:00", 0) === null);
ok("a missing time is treated as midnight", api.icsFloating("2026-09-15", "", 0) === "20260915T000000");

/* ---- SEQUENCE: must rise, and must stay inside the format's 32-bit integer ---- */
const seq = api.icsSeq();
const seqByRule = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 60000);
ok("SEQUENCE is minutes since 2020, per the documented rule", Math.abs(seq - seqByRule) <= 1, `${seq} vs ${seqByRule}`);
ok("SEQUENCE is a whole number", Number.isInteger(seq));
ok("SEQUENCE fits a 32-bit integer", seq > 0 && seq < 2147483647, seq);

/* ---- one event ---- */
const s1 = { _id: "abc123", client: "MC392", date: "2026-09-15", time: "10:00",
             location: "The Practice Room", num: "14", adminNote: "invoice goes to her employer" };
const ev = api.icsEvent(s1, "20260913T090000Z", 1234);
const evLines = ev.split("\r\n");
const has = (f, txt) => evLines.some(l => l === `${f}:${txt}`);
ok("the event opens and closes", evLines[0] === "BEGIN:VEVENT" && evLines[evLines.length - 1] === "END:VEVENT");
ok("UID is derived from the session's own id", has("UID", "abc123@groundwork.app"), evLines.find(l => l.startsWith("UID")));
ok("DTSTART is the session's time", has("DTSTART", "20260915T100000"));
ok("DTEND is DTSTART plus the session length", has("DTEND", "20260915T105000"));
ok("SUMMARY is the client code alone", has("SUMMARY", "MC392"));
ok("LOCATION carries the room", has("LOCATION", "The Practice Room"));
ok("the event shows as busy", has("TRANSP", "OPAQUE"));
/* The whole point of the thin event: none of this may reach somebody else's server. */
ok("no DESCRIPTION field at all", !/DESCRIPTION/.test(ev));
ok("the admin note does not leak", !/employer/.test(ev));
ok("the session number does not leak", !/\bnum\b|SUMMARY:.*14/.test(ev));
ok("a session with no date produces no event", api.icsEvent({ _id: "x", client: "AB1", date: "" }, "Z", 0) === "");
/* The session length is a setting, so the end time has to follow it. */
api.setMins(90);
ok("DTEND follows the session-length setting",
   api.icsEvent(s1, "Z", 0).split("\r\n").some(l => l === "DTEND:20260915T113000"));
api.setMins(50);

/* The update mechanism: the same session must always produce the same UID, and two sessions
   must never share one. */
ok("the same session exports the same UID twice",
   api.icsEvent(s1, "A", 1).match(/UID:.*/)[0] === api.icsEvent(s1, "B", 2).match(/UID:.*/)[0]);
ok("a different session gets a different UID",
   api.icsEvent(s1, "A", 1).match(/UID:.*/)[0] !== api.icsEvent({ ...s1, _id: "zzz" }, "A", 1).match(/UID:.*/)[0]);

/* ---- the whole file ---- */
const file = api.icsFile([s1, { ...s1, _id: "def456", date: "2026-09-16" }]);
ok("the file is CRLF throughout", !/[^\r]\n/.test(file));
ok("the file ends with a newline", file.endsWith("\r\n"));
const fl = file.split("\r\n");
ok("VCALENDAR opens first", fl[0] === "BEGIN:VCALENDAR");
ok("VCALENDAR closes last", fl.filter(Boolean).pop() === "END:VCALENDAR");
ok("the version is declared", fl.includes("VERSION:2.0"));
ok("a PRODID is declared", fl.some(l => l.startsWith("PRODID:")));
ok("both events are present",
   fl.filter(l => l === "BEGIN:VEVENT").length === 2 && fl.filter(l => l === "END:VEVENT").length === 2);
ok("an empty list still produces a valid empty calendar",
   api.icsFile([]).split("\r\n").filter(Boolean).join("|") ===
   "BEGIN:VCALENDAR|VERSION:2.0|PRODID:-//GroundWork//Practice diary//EN|CALSCALE:GREGORIAN|METHOD:PUBLISH|END:VCALENDAR");
ok("every event in one file shares one DTSTAMP", new Set(fl.filter(l => l.startsWith("DTSTAMP:"))).size === 1);

/* ---- filenames ---- */
ok("a filename is prefixed and lowercased", api.icsFileName("Session-MC392-2026-09-15") === "groundwork-session-mc392-2026-09-15.ics");
ok("unsafe characters are collapsed", api.icsFileName("a/b\\c:d  e") === "groundwork-a-b-c-d-e.ics", api.icsFileName("a/b\\c:d  e"));
ok("no leading or trailing separator", api.icsFileName("--x--") === "groundwork-x.ics", api.icsFileName("--x--"));

/* ---- the range filter ---- */
const sess = [
  { _id: "1", client: "AA1", date: "2026-09-12", time: "09:00" },              // before the window
  { _id: "2", client: "BB2", date: "2026-09-13", time: "14:00" },              // first day, later
  { _id: "3", client: "CC3", date: "2026-09-13", time: "09:00" },              // first day, earlier
  { _id: "4", client: "DD4", date: "2026-09-16", time: "10:00", _cancelled: true },
  { _id: "5", client: "EE5", date: "2026-09-19", time: "10:00" },              // last day
  { _id: "6", client: "FF6", date: "2026-09-20", time: "10:00" },              // after the window
  { _id: "7", client: "GG7", date: "", time: "10:00" }                         // no date at all
];
api.setSessions(sess);
const got = api.icsSessionsBetween("2026-09-13", "2026-09-19").map(s => s._id);
ok("the window includes both end days and excludes either side", got.join(",") === "3,2,5", got.join(","));
ok("a cancelled session is left out", !got.includes("4"));
ok("a session with no date is left out", !got.includes("7"));
ok("rows come out in date then time order", got.join(",") === "3,2,5", got.join(","));

/* ---- the two entry points, driven end to end ---- */
api.calAddRange("2026-09-13", "2026-09-19", "in the next 7 days");
ok("a range downloads an .ics", api.dl() && api.dl().name.endsWith(".ics"), api.dl() && api.dl().name);
ok("the range filename carries both dates", api.dl().name === "groundwork-sessions-2026-09-13-to-2026-09-19.ics", api.dl().name);
ok("the media type is text/calendar", api.dl().type === "text/calendar", api.dl().type);
ok("the range file holds exactly the three sessions",
   api.dl().text.split("\r\n").filter(l => l === "BEGIN:VEVENT").length === 3);
ok("the range toast counts them", /^3 sessions/.test(api.toastText()), api.toastText());

const errsBefore = api.errs();
api.calAddRange("2030-01-01", "2030-01-07", "in the next 7 days");
ok("an empty window says so rather than downloading an empty file", api.toastText() === "No sessions in the next 7 days", api.toastText());
ok("an empty window is a sounded error", api.errs() === errsBefore + 1);

api.calAddSession(s1);
ok("one session downloads under its own name", api.dl().name === "groundwork-session-mc392-2026-09-15.ics", api.dl().name);
ok("one session yields exactly one event",
   api.dl().text.split("\r\n").filter(l => l === "BEGIN:VEVENT").length === 1);
const errsBefore2 = api.errs();
api.calAddSession({ _id: "q", client: "AA1", date: "" });
ok("a session with no date is refused", api.errs() === errsBefore2 + 1 && /needs a date/.test(api.toastText()), api.toastText());

/* ---- the title, which is the privacy surface ---- */
ok("the title is the code", api.icsTitle({ client: "MC392" }) === "MC392");
ok("a blank code still gives a usable title", api.icsTitle({ client: "" }) === "Session");
ok("a blank code does not say 'undefined'", api.icsTitle({}) === "Session");

console.log(`\n  calendar export: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
