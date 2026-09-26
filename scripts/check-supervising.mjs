/* Supervising others, and how long a session ran.
 *
 *   npm run test:supervising
 *
 * WHY THIS EXISTS
 *   A practitioner who also supervises keeps supervisees as client records marked `kind:
 *   "supervisee"`, so the money, the diary and the documents work for them unchanged. The danger is
 *   entirely on the CLINICAL side, and every failure there is silent: nothing throws when a
 *   supervision session given is counted as a clinical hour. It simply flatters the 1:6 ratio - in
 *   the direction that hides a compliance problem - and inflates the hours on a report somebody
 *   submits to a course.
 *
 *   Five properties, all rules rather than readings taken off the functions:
 *     1. `kind` absent means a client, `mins` absent means the usual length. Every record written
 *        before v12 is that shape, so nothing may move for them.
 *     2. A supervisee's sessions are NEVER clinical: not in Form 3A, the ratio, a report, the
 *        Clients section of Business analytics, the roster sent to GroundWork Notes, or the
 *        "clients discussed" chips of the supervision you receive.
 *     3. They are still WORK and still MONEY: billed, owed, chased, diarised at their own length.
 *     4. A session's own length wins, then a supervisee's usual length, then the practice setting.
 *        A clinical client's record can never change a clinical hours figure.
 *     5. The forms write only what they rendered. A blank length stores nothing, never 50.
 *
 * Expected values are derived here from those rules, never pasted from what the app returned.
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
page.on("dialog", (d) => d.accept());
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.normalize === "function" && typeof window.go === "function");

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const near = (name, got, want, tol) => ok(name + " (want " + want + ")", Math.abs(got - want) <= (tol == null ? 0.005 : tol), got);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (q) => document.querySelector(q);
  const txt = (q) => ($(q) ? $(q).textContent : "");

  window.commit = async () => true;                      /* reads and in-memory edits only */
  window.celebrate = () => {}; window.celebrateNewClient = () => {};

  /* Two clients seen weekly and one supervisee seen fortnightly, every session in the past and
     unpaid. Times differ so no save trips the time-clash rule. SUP's record carries a usual length
     of 90 minutes; AAA's record carries one too, which must be IGNORED because AAA is a client. */
  const CLIENT_N = 20, SUP_N = 10, SUP_MINS = 90;
  const build = (features) => {
    const t = today(), sessions = [];
    const add = (code, i, gapDays, time) => sessions.push({ _id: code + "_" + i, client: code, num: i + 1,
      date: isoD(addDays(t, -14 - i * gapDays)), time, mode: "In-person", location: "At home", room: "-",
      notes: "Y", attendConfirmed: true, paidDate: "", roomPaid: "", invoice: "" });
    for (let i = 0; i < CLIENT_N; i++) { add("AAA", i, 7, "10:00"); add("BBB", i, 7, "11:00"); }
    for (let i = 0; i < SUP_N; i++) add("SUP", i, 14, "14:00");
    S = normalize({
      clients: [
        { _id: "cA", code: "AAA", status: "Ongoing", frequency: "Weekly", rate: 60, mins: 120, source: "Directory" },
        { _id: "cB", code: "BBB", status: "Ongoing", frequency: "Weekly", rate: 60, source: "Directory" },
        { _id: "cS", code: "SUP", status: "Ongoing", frequency: "Every 2 weeks", rate: 80, kind: "supervisee", mins: SUP_MINS, source: "BACP register" }
      ],
      sessions, rooms: [{ _id: "r1", location: "At home", rate: 0, billing: "session", due: "n/a" }],
      rateHistory: [["AAA", 60], ["BBB", 60], ["SUP", 80]].map((r, i) => ({ _id: "rh" + i, client: r[0], effectiveFrom: "2000-01-01", rate: r[1] })),
      supervision: [0, 1, 2, 3].map((i) => ({ _id: "sv" + i, date: isoD(addDays(t, -20 - i * 30)), supervisor: "Jo", count: 1, cost: 60, clients: ["AAA"] })),
      settings: { onboarded: true, taxAck: true, taxBasis: "accruals", features: Object.assign({ accreditation: true }, features || {}),
        coach: { off: true, seen: [] } }
    });
    tyMemoClear();
  };

  /* ============ 1. absent means a client, at the usual length ============ */
  ok("a record with no kind is a client", kindOf({ code: "X" }) === "client");
  ok("an unrecognised kind falls back to client", kindOf({ kind: "boss" }) === "client");
  ok("a session with no client record is clinical", sessionClinical({ client: "NOBODY" }) === true);
  build();
  ok("normalize does not write a kind onto a client", S.clients[0].kind === undefined && S.clients[1].kind === undefined);
  ok("normalize does not write a length onto a session", S.sessions.every((s) => s.mins === undefined));
  ok("supervising is switched ON for data that already holds a supervisee", S.settings.features.supervising === true);
  { const fresh = normalize({ clients: [{ code: "Q", rate: 1 }], sessions: [], settings: {} });
    ok("…and OFF for a practice without one - it is asked for, not offered", fresh.settings.features.supervising === false); }
  { const kept = normalize({ clients: [], sessions: [], settings: { features: { supervising: true } } });
    ok("…and an explicit choice is never overwritten", kept.settings.features.supervising === true); }

  /* ============ 2. the length ladder ============ */
  const aaa = S.clients[0], sup = S.clients[2];
  ok("a client session is the practice length", sessionLen({ client: "AAA" }) === sessionMins(), sessionLen({ client: "AAA" }));
  ok("…even though AAA's record carries a usual length - clinical hours move only by session", sessionLen({ client: "AAA" }, aaa) === 50);
  ok("a supervisee session is their usual length", sessionLen({ client: "SUP" }) === SUP_MINS);
  ok("a length on the session beats both", sessionLen({ client: "SUP", mins: 75 }) === 75 && sessionLen({ client: "AAA", mins: 75 }) === 75);
  ok("a zero or junk length on the session is ignored", sessionLen({ client: "AAA", mins: 0 }) === 50 && sessionLen({ client: "AAA", mins: "x" }) === 50);
  const dS = derive(S.sessions.find((s) => s.client === "SUP")), dA = derive(S.sessions.find((s) => s.client === "AAA"));
  ok("derive: a supervisee session is not clinical", dS.clinical === false);
  ok("derive: a client session is clinical", dA.clinical === true);
  ok("derive: the supervisee session still earns", dS.earns === true && dS.rate === 80);
  ok("derive: and carries its own length", dS.mins === SUP_MINS && dA.mins === 50, dS.mins + "/" + dA.mins);
  { const s = S.sessions.find((x) => x.client === "SUP"), e = sessionEndsAt(s);
    const start = parseD(s.date); start.setHours(14, 0, 0, 0);
    ok("a supervisee session ends at its own length, not the practice's", (e - start) / 60000 === SUP_MINS, (e - start) / 60000); }

  /* ============ 3. never clinical ============ */
  const cs = clinicalStats();
  ok("Form 3A counts client sessions only", cs.logged === 2 * CLIENT_N, cs.logged);
  ok("…and says how many sessions of supervision given it left out", cs.given === SUP_N, cs.given);
  { const host = document.createElement("div"); mountAccreditation(host);
    const kpi = [...host.querySelectorAll(".kpi")].find((k) => /Clinical hrs/.test(k.textContent));
    ok("the accreditation card's clinical figure is client work alone", kpi && kpi.querySelector(".v").textContent === String(2 * CLIENT_N),
      kpi && kpi.querySelector(".v").textContent);
    ok("…and the working-out line names what was left out", /supervision you gave are not clinical hours/.test(host.textContent)); }
  const spec = (mode, sections) => ({ _id: "t", name: "t", template: "bacp-trainee", range: "all", from: "", to: "",
    sections: sections || ["hours", "clients", "sessionlog"], opts: { hourMode: mode } });
  let rep = reportBuild(spec("clinical"));
  const blk = (r, re) => (r.blocks || []).find((b) => re.test(b.title || ""));
  ok("a report counts client hours only", /\b40\b/.test(JSON.stringify(blk(rep, /hours/i).kpis[0])), JSON.stringify(blk(rep, /hours/i).kpis[0]));
  ok("…and SUP appears in no report table", !/SUP/.test(JSON.stringify(rep.blocks)));
  { const cx = anaCtx();
    ok("Business analytics › Clients: SUP is not in the client pool", !cx.withSess.some((x) => x.c.code === "SUP"));
    ok("…nor in attendance", !cx.att().some((x) => x.c.code === "SUP")); }
  const src = anaSources();
  ok("Where clients come from ignores supervisees", !JSON.stringify(src).includes("BACP register"),
    JSON.stringify(src).slice(0, 120));
  { /* Make SUP drift: nothing since 60 days ago, well past 1.5x a fortnight. */
    S.sessions.filter((s) => s.client === "SUP").forEach((s, i) => { s.date = isoD(addDays(today(), -60 - i * 14)); });
    tyMemoClear();
    const dr = anaDrifting();
    ok("Drifting away never lists a supervisee", !dr.rows.concat(dr.review).some((r) => r.c.code === "SUP"));
    build(); }
  { const cad = anaSupervisionCadence();
    const tot = cad.ready ? cad.quarters.reduce((a, q) => a + q.clinical, 0) : -1;
    near("the supervision cadence's clinical hours are client work only", tot, 2 * CLIENT_N * 50 / 60, 0.3); }
  { const r = scheduleRoster();
    ok("the roster sent to GroundWork Notes carries no supervisee", !r.payload.clients.some((c) => c.code === "SUP") &&
      r.payload.clients.some((c) => c.code === "AAA"), r.payload.clients.map((c) => c.code).join(",")); }
  { supervisionForm(null); await sleep(30);
    const chips = [...document.querySelectorAll("#s_clients .tgl[data-code]")].map((b) => b.dataset.code);
    ok("the supervision you receive offers clients to discuss, not your own supervisees", chips.includes("AAA") && !chips.includes("SUP"), chips.join(","));
    closeSheet(); await sleep(20);
    /* An entry that ticked a code later marked a supervisee must keep it on save, not lose it. */
    S.supervision[0].clients = ["AAA", "SUP"];
    supervisionForm(S.supervision[0]); await sleep(30);
    $("#sSave").click(); await sleep(40);
    ok("…and a code already ticked on an entry survives a save", S.supervision[0].clients.includes("SUP") && S.supervision[0].clients.includes("AAA"),
      S.supervision[0].clients.join(",")); }
  { go("home"); await sleep(60);
    const card = [...document.querySelectorAll("#main .card")].find((c) => /Longstanding clients/.test(c.textContent));
    ok("Longstanding clients on Home lists clients only", !card || !/SUP/.test(card.textContent), card ? card.textContent.slice(0, 80) : "no card"); }

  /* ============ 4. still work, still money ============ */
  { const der = derivedSessions();
    const owed = der.filter((x) => x.d.overdue);
    ok("unpaid supervision is owed like any fee", owed.filter((x) => x.s.client === "SUP").length === SUP_N, owed.length);
    near("…and Outstanding is every unpaid fee", owed.reduce((a, x) => a + x.d.rate, 0), 2 * CLIENT_N * 60 + SUP_N * 80);
    const hr = anaHourlyRate();
    if (hr.ready) near("the hourly rate counts supervision given as hours worked", hr.clinicalH, (2 * CLIENT_N * 50 + SUP_N * SUP_MINS) / 60, 0.06); }
  ok("the session picker puts supervisees in their own group", /<optgroup label="Supervisees"><option value="SUP"/.test(clientSelectHTML("")));
  { const ev = icsEvent(S.sessions.find((s) => s.client === "SUP"), "20260913T090000Z", 1);
    ok("a supervisee's calendar entry runs their usual length", /DTEND:\d{8}T153000/.test(ev), (ev.match(/DTEND:[^\r]+/) || [""])[0]); }
  { const old = { _id: "cO", code: "OLD", status: "Finished", frequency: "Monthly", rate: 80, kind: "supervisee" };
    S.clients.push(old); S.sessions.push({ _id: "old1", client: "OLD", date: isoD(addDays(today(), -365 * 9)), time: "09:00", notes: "Y", attendConfirmed: true });
    const rr = retentionRows().find((r) => r.code === "OLD");
    ok("a finished supervisee still comes up for retention review - their records are personal data too", !!rr);
    ok("…and the row says it is a supervisee", rr && rr.supervisee === true);
    build(); }

  /* ============ 5. per-session length in a report ============ */
  build();
  const a0 = S.sessions.find((s) => s.client === "AAA"); a0.mins = 100; tyMemoClear();
  const clientMins = (2 * CLIENT_N - 1) * 50 + 100;
  near("pro rata counts a recorded 100 minutes as 2 clinical hours",
    blk(reportBuild(spec("prorata", ["hours"])), /hours/i).kpis[0].v, Math.round(clientMins / 50 * 10) / 10, 0.05);
  near("actual time counts it as 100 minutes", blk(reportBuild(spec("actual", ["hours"])), /hours/i).kpis[0].v,
    Math.round(clientMins / 60 * 10) / 10, 0.05);
  { const r = reportBuild(spec("prorata", ["clients"]));
    const row = blk(r, /by client/i).table.rows.find((x) => x[0] === "AAA");
    near("a per-client row is the sum of its own sessions", +row[2], Math.round(((CLIENT_N - 1) * 50 + 100) / 50 * 10) / 10, 0.05); }
  { const b = blk(reportBuild(spec("clinical", ["hours"])), /hours/i);
    ok("one-per-session mode still counts it as one hour", b.kpis[0].v === 2 * CLIENT_N, b.kpis[0].v);
    ok("…and warns that a session is not a standard hour", /not the standard/.test(JSON.stringify(b.work)));
    ok("…and says which sessions carry their own length", /1 of 40 sessions carries its own recorded length/.test(b.note || ""), b.note); }
  delete a0.mins; tyMemoClear();
  { const b = blk(reportBuild(spec("clinical", ["hours"])), /hours/i);
    ok("with no lengths recorded nothing is warned about", !/not the standard/.test(JSON.stringify(b.work))); }

  /* ============ 6. the forms write only what they rendered ============ */
  build({ supervising: false });
  const target = S.sessions.find((s) => s.client === "AAA");
  const saveSession = async () => { $("#save").click(); await sleep(40); if ($("#save") && /anyway/i.test($("#save").textContent)) { $("#save").click(); await sleep(40); } };
  sessionForm(target); await sleep(30);
  ok("with supervising off, a session with no length shows no Length box", !$("#f_mins"));
  await saveSession();
  ok("…and saving it writes no length", target.mins === undefined, target.mins);
  target.mins = 70;
  sessionForm(target); await sleep(30);
  ok("a session that already carries a length always shows it", $("#f_mins") && $("#f_mins").value === "70");
  closeSheet(); await sleep(20); delete target.mins;
  S.settings.features.supervising = true;
  sessionForm(target); await sleep(30);
  ok("with supervising on, the Length box is there", !!$("#f_mins"));
  ok("…blank, with the usual length as its placeholder", $("#f_mins").value === "" && $("#f_mins").placeholder === "50");
  await saveSession();
  ok("a blank Length stores nothing, never 50", target.mins === undefined, target.mins);
  sessionForm(target); await sleep(30); $("#f_mins").value = "90"; await saveSession();
  ok("a typed Length is stored as a number", target.mins === 90, target.mins);
  sessionForm(target); await sleep(30); $("#f_mins").value = ""; await saveSession();
  ok("clearing it removes it from the record", !("mins" in target), JSON.stringify(target.mins));
  sessionForm(target); await sleep(30); $("#f_mins").value = "2000"; $("#save").click(); await sleep(40);
  ok("an impossible length is refused", target.mins === undefined && /between 5 and 600/.test(txt("#vbanner")), txt("#vbanner"));
  closeSheet(); await sleep(20);
  { sessionForm(null, { presetClient: "SUP" }); await sleep(30);
    ok("a new supervisee session offers their usual length as the placeholder", $("#f_mins") && $("#f_mins").placeholder === String(SUP_MINS),
      $("#f_mins") && $("#f_mins").placeholder);
    closeSheet(); await sleep(20); }

  build({ supervising: false });
  clientForm(S.clients[0]); await sleep(30);
  ok("with supervising off, a client form asks nothing about kind", !$("#c_kind"));
  $("#cSave").click(); await sleep(40);
  ok("…and saving it writes no kind", S.clients[0].kind === undefined);
  clientForm(S.clients[2]); await sleep(30);
  ok("a supervisee's own form always shows what it is, flag or no flag", $("#c_kind") && $("#c_kind").value === "supervisee");
  closeSheet(); await sleep(20);
  S.settings.features.supervising = true;
  clientForm(null, { kind: "supervisee" }); await sleep(30);
  ok("Add supervisee opens the form already set to a supervisee", $("#c_kind").value === "supervisee" && !$("#c_minsWrap").hidden);
  ok("…with the code labelled for what it is", /Supervisee code/.test(txt("#c_codeLab")));
  $("#c_code").value = "NEW"; $("#c_rate").value = "70"; $("#c_mins").value = "60";
  $("#cSave").click(); await sleep(40);
  const nw = S.clients.find((c) => c.code === "NEW");
  ok("a new supervisee is saved as one, with their usual length", nw && nw.kind === "supervisee" && nw.mins === 60, JSON.stringify(nw && { k: nw.kind, m: nw.mins }));
  clientForm(S.clients.find((c) => c.code === "AAA")); await sleep(30);
  ok("a client's form hides the usual-length box", $("#c_minsWrap").hidden === true);
  $("#c_kind").value = "supervisee"; $("#c_kind").onchange(); $("#cSave").click(); await sleep(40);
  ok("a client can be re-marked as a supervisee", S.clients.find((c) => c.code === "AAA").kind === "supervisee");
  clientForm(S.clients.find((c) => c.code === "AAA")); await sleep(30);
  $("#c_kind").value = "client"; $("#c_kind").onchange(); $("#cSave").click(); await sleep(40);
  ok("…and back, which removes the field rather than storing the default", !("kind" in S.clients.find((c) => c.code === "AAA")));

  /* ============ 7. the Supervising tab ============ */
  build({ supervising: true });
  supTab = "giving"; go("practice", { seg: "supervision" }); await sleep(60);
  ok("Supervision gains a Supervising tab", !!$('#suptab button[data-st="giving"]'));
  ok("it lists the supervisee and no client", /SUP/.test(txt("#supbody")) && !/AAA/.test(txt("#supbody")));
  { const k = [...document.querySelectorAll("#supbody .kpi")].find((x) => /Supervision given/.test(x.textContent));
    ok("hours given are the supervisee's sessions at their own length", k && k.querySelector(".v").textContent === hrsLabel(SUP_N * SUP_MINS / 60),
      k && k.querySelector(".v").textContent); }
  S.settings.features.supervising = false;
  go("practice", { seg: "supervision" }); await sleep(60);
  ok("switched off, the tab goes and the screen falls back to the log", !$('#suptab button[data-st="giving"]') && supTab === "log");

  /* ============ 8. setup and the schema ============ */
  const sf = FEATURES.find((f) => f.k === "supervising");
  ok("Supervising others is a feature that depends on Supervision", sf && sf.dep === "supervision");
  { const w = { features: {} }; revealApplySimple(w);
    ok("the simple preset does not decide it - setup asks", w.features.supervising === undefined); }
  ok("the schema version is 12", SCHEMA_VERSION === 12, SCHEMA_VERSION);
  /* validateImport takes the STATE, whose version lives in meta - not the backup envelope. */
  ok("a backup newer than this build is refused", validateImport({ clients: [], sessions: [], meta: { schemaVersion: 13 } }).ok === false);
  ok("a v11 backup still restores here", validateImport({ clients: [], sessions: [], meta: { schemaVersion: 11 } }).ok === true);

  return out;
});

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 5).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`${results.length}/${results.length} supervising checks passed`);
else console.log(`\n${bad.length} failed of ${results.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
