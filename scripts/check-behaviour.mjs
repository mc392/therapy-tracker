/* Behaviour checks for the write paths, in a real browser against the whole-practice corpus.
 *
 *   npm run test:behaviour
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *   tests/tax-tests.js checks the tax engine against the HMRC rule. review-test-data.mjs checks
 *   the Trends and Tax ENGINES against whole practices. Neither presses a button. This one does:
 *   it opens the sheets, ticks the boxes and clicks Save, then asserts what ended up in `S`.
 *
 *   That gap is not theoretical. When room-fee settling moved out of the session form (Sep 2026)
 *   the form stopped reading `roomPaid` from a control it no longer renders. Had it gone on
 *   reading it, every save would have silently blanked a settlement - no error, no failing engine
 *   test, no crash. Only pressing Save and looking at the record afterwards catches that.
 *
 * EXPECTATIONS COME FROM THE RULE, NEVER FROM THE FUNCTION
 *   Same discipline as the tax suite. Where a figure is asserted, it is recomputed here from the
 *   documented rule (the split at the session date, the drift as now-minus-then, the gap as fee
 *   written off) and compared. A check written by pasting in what the code returned would have
 *   passed against the very bugs this exists to stop.
 *
 * commit() is stubbed before anything runs: the harness reads and mutates its own in-memory
 * copy of a fixture, and never writes to a database.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
const dataDir = join(root, "tests", "test-data");

/* Four profiles, chosen for what each one exercises rather than for coverage's sake:
     winding-down      per-session room fees in volume, every session charged in full
     chaotic-payments  cancellations at 0/50/75/100%, so the fee-erosion gap is non-zero
     online-only       paid in advance - the days-to-payment split has something to split
     established       four years, a fee rise, a room rate rise                              */
const PROFILES = ["winding-down", "chaotic-payments", "online-only", "established"];

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

/* Runs inside the page, with the fixture already loaded into S. */
async function inPage() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const skip = (name, why) => out.push({ name, skip: true, detail: why });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ===== Room fees: raised by the session, settled in Money ===== */
  ok("missingReasons() never asks about the room",
    !S.sessions.some((s) => missingReasons(s).some((m) => /room/i.test(m))));

  const owedNow = S.sessions.filter((s) => derive(s).roomOwed);
  if (!owedNow.length) skip("room-fee checks", "this practice has no per-session room fees");
  else {
    /* A past session that is written up is complete, however its room fee stands. */
    const writtenUp = S.sessions.find((s) => derive(s).roomOwed && derive(s).past && notesDone(s));
    if (writtenUp) ok("an unsettled room fee does not make a session incomplete",
      derive(writtenUp).complete === true);

    /* roomOwed's three states, from the rule: "Y" settled, "n/a" not owed, anything else owed. */
    const t = owedNow[0], keep = { p: t.roomPaid, d: t.roomPaidDate };
    t.roomPaid = "Y";   ok('roomPaid "Y" is not owed',    derive(t).roomOwed === false);
    t.roomPaid = "n/a"; ok('roomPaid "n/a" is not owed',  derive(t).roomOwed === false);
    t.roomPaid = "";    ok("blank means not settled yet", derive(t).roomOwed === true);
    t.roomPaid = "N";   ok('a legacy "N" is still owed',  derive(t).roomOwed === true);
    t.roomPaid = keep.p; t.roomPaidDate = keep.d;

    /* THE ONE THAT MATTERS: the form no longer owns these fields and must not touch them. */
    const s2 = S.sessions.find((x) => derive(x).roomOwed && x.date);
    s2.roomPaid = "Y"; s2.roomPaidDate = "2026-01-15";
    const id = s2._id;
    sessionForm(s2); await sleep(80);
    const save = document.querySelector("#sheetBody #save");
    ok("the session form opens", !!save);
    if (save) { save.click(); await sleep(250); }
    const after = S.sessions.find((x) => x._id === id);
    ok("saving a session preserves roomPaid",     after.roomPaid === "Y", after.roomPaid);
    ok("saving a session preserves roomPaidDate", after.roomPaidDate === "2026-01-15", after.roomPaidDate);
    closeSheet();

    /* The settle sheet writes what the bulk editor always wrote. */
    const loc = roomFeeRows()[0].loc;
    const before = roomFeeRows().filter((r) => r.loc === loc).length;
    roomDueSheet(loc); await sleep(100);
    const boxes = [...document.querySelectorAll("#rdRows input[type=checkbox]")];
    ok("the settle sheet lists the outstanding fees", boxes.length > 0, boxes.length);
    const clearAll = (bs) => bs.forEach((b) => { if (b.checked) { b.checked = false; b.dispatchEvent(new Event("change")); } });
    clearAll(boxes);
    boxes[0].checked = true; boxes[0].dispatchEvent(new Event("change"));
    const paidId = boxes[0].dataset.id;
    document.querySelector("#rdDate").value = "2026-03-04";
    document.querySelector("#rdSave").click(); await sleep(250);
    const paid = S.sessions.find((x) => x._id === paidId);
    ok("Mark paid writes roomPaid=Y",              paid.roomPaid === "Y", paid.roomPaid);
    ok("Mark paid writes the date that was chosen", paid.roomPaidDate === "2026-03-04", paid.roomPaidDate);
    ok("a settled fee leaves the outstanding list", roomFeeRows().filter((r) => r.loc === loc).length === before - 1);
    closeSheet();

    if (roomFeeRows().some((r) => r.loc === loc)) {
      roomDueSheet(loc); await sleep(100);
      const b2 = [...document.querySelectorAll("#rdRows input[type=checkbox]")];
      clearAll(b2);
      b2[0].checked = true; b2[0].dispatchEvent(new Event("change"));
      const naId = b2[0].dataset.id;
      document.querySelector("#rdNA").click(); await sleep(250);
      ok('Not owed writes roomPaid="n/a"', S.sessions.find((x) => x._id === naId).roomPaid === "n/a");
      ok("a written-off fee leaves the list", !roomFeeRows().some((r) => r.s._id === naId));
      closeSheet();
    }
  }

  /* ===== "Did it go ahead?": always on screen, optional, and Incomplete is its deadline =====
     Blank stopped meaning "attended" in Sep 2026 and became a genuine unanswered state. Three
     things have to hold together or the field is a trap: the control is rendered even for a
     session that has not happened, a save leaves a blank blank, and a blank on a session that
     HAS happened lands on the Incomplete worklist. Expectations come from the rule - the clock
     is the session's own start plus sessionMins(), recomputed here, never read back. */
  {
    /* validateSession raises WARNINGS on some fixtures (a session for a client marked Finished,
       say) and the form answers the first click by arming "Save anyway". That is the real
       behaviour and the test has to live with it rather than around it: click, and click again
       if the button is still asking. */
    const saveForm = async () => {
      const b = document.querySelector("#sheetBody #save");
      if (!b) return;
      b.click(); await sleep(200);
      const b2 = document.querySelector("#sheetBody #save");
      if (b2 && /anyway/i.test(b2.textContent)) { b2.click(); await sleep(250); }
    };
    const rule = (s) => {                                    /* derive().ended, from the rule */
      const d = parseD(s.date); if (!d) return false;
      const tm = String(s.time || "").match(/^(\d{1,2}):(\d{2})/);
      if (!tm) return d < today();
      const dt = new Date(d); dt.setHours(+tm[1], +tm[2], 0, 0);
      return new Date(dt.getTime() + sessionMins() * 60000) <= new Date();
    };
    ok("derive().ended matches the start-plus-length rule on every session",
      !S.sessions.some((s) => derive(s).ended !== rule(s)),
      S.sessions.filter((s) => derive(s).ended !== rule(s)).length + " disagree");

    /* A future session. There was no control here at all until Sep 2026. */
    const fut = { _id: "att_future_" + Date.now(), client: S.sessions[0].client, num: "",
      date: isoD(addDays(today(), 14)), time: "10:00", mode: "In-person",
      location: S.sessions[0].location, room: "-", invoice: "", paidDate: "", receipt: "",
      notes: "", roomPaid: "", roomPaidDate: "", lateCancel: false };
    S.sessions.push(fut);
    sessionForm(fut); await sleep(80);
    const sel = document.querySelector("#sheetBody #f_attend");
    ok("a future session is still asked whether it went ahead", !!sel && sel.offsetParent !== null);
    ok("the blank is offered as a value of its own", !!sel && sel.options[0].value === "");
    ok("and it is not labelled attended", !!sel && !/attend/i.test(sel.options[0].text));
    ok("attended is an answer of its own",
      !!sel && [...sel.options].some((o) => o.value === "attended"));
    if (sel) {
      /* Cancelling next Thursday: the reason the control had to come out of hiding. */
      sel.value = "late"; sel.dispatchEvent(new Event("change")); await sleep(40);
      ok("choosing a cancellation reveals the charge", 
        document.querySelector("#sheetBody #f_cxWrap").style.display !== "none");
      ok("a cancellation dated ahead is no longer warned about",
        !validateSession({ ...fut, cancelKind: "late", lateCancel: true })
          .warnings.some((w) => w.code === "dnafuture"));
      ok("but a DNA dated ahead still is",
        validateSession({ ...fut, cancelKind: "dna" }).warnings.some((w) => w.code === "dnafuture"));
      await saveForm();
      const saved = S.sessions.find((x) => x._id === fut._id);
      ok("a future cancellation is recorded", saved.cancelKind === "late" && saved.lateCancel === true);
      ok("and counts as answered", attendConfirmed(saved) === true);
    }
    closeSheet();

    /* Blank must survive a save - the old form stamped the flag from the date alone. */
    sessionForm(S.sessions.find((x) => x._id === fut._id)); await sleep(80);
    const s2 = document.querySelector("#sheetBody #f_attend");
    if (s2) { s2.value = ""; s2.dispatchEvent(new Event("change")); await sleep(40);
      await saveForm(); }
    const blanked = S.sessions.find((x) => x._id === fut._id);
    ok("saving with the blank chosen leaves it unanswered", attendConfirmed(blanked) === false);
    ok("and clears the cancellation with it",
      !blanked.cancelKind && blanked.lateCancel === false && !blanked.cancelledAt && blanked.cancelCharge == null);
    closeSheet();

    /* The same session, moved into the past: a blank answer is now outstanding. */
    blanked.date = isoD(addDays(today(), -2)); blanked.notes = "Y";
    ok("a blank answer on a session that has happened is incomplete",
      derive(blanked).complete === false && missingReasons(blanked).includes("attendance"));
    ok("and it reaches the Incomplete worklist",
      incompleteRows().some((x) => x.s._id === blanked._id));
    ok("a session still to come never does, however blank",
      !incompleteRows().some((x) => !derive(x.s).ended));

    /* The worklist answers it in full - all three kinds, not just "attended" - and Notes done
       must not answer it at all. */
    sessFilter.seg = "incomplete"; sessFilter.q = ""; sessFilter.view = "list";
    const openList = async () => { go("sessions"); await sleep(150);
      return document.querySelector('.irow[data-id="' + blanked._id + '"]'); };
    const chip = (row, v) => row && row.querySelector('.tgl[data-k="att"][data-v="' + v + '"]');
    let row = await openList();
    ok("the worklist offers all three answers", !!row &&
      ["attended", "late", "dna"].every((v) => !!chip(row, v)));
    ok("and no notes tick on a session already written up",
      !!row && !row.querySelector('.tgl[data-k="notes"]'));

    /* One answer, not three ticks: picking a second clears the first. */
    if (row) {
      chip(row, "late").click(); await sleep(40);
      chip(row, "dna").click(); await sleep(40);
      ok("the three chips are mutually exclusive",
        !chip(row, "late").classList.contains("on") && chip(row, "dna").classList.contains("on"));
      ok("a missed session says on the row what it will be charged",
        /charged \d+% of/.test(row.querySelector(".attnote").textContent),
        row.querySelector(".attnote").textContent);
      chip(row, "dna").click(); await sleep(40);          /* tapping the chosen one un-answers it */
      ok("choosing the chosen one puts the row back to unanswered",
        !chip(row, "dna").classList.contains("on") &&
        /Save \(0\)/.test(document.querySelector("#saveInc").textContent));
    }

    /* DNA: the kind, the flag and the policy's charge, recomputed here from the rule. */
    if (row) {
      const wantPct = cancelPolicyPct("dna", null);       /* no notice recorded -> policy's DNA % */
      chip(row, "dna").click(); await sleep(40);
      document.querySelector("#saveInc").click(); await sleep(300);
      const dna = S.sessions.find((x) => x._id === blanked._id);
      ok("DNA is recorded from the worklist", dna.cancelKind === "dna" && attendConfirmed(dna) === true);
      ok("a DNA is not a late cancellation", dna.lateCancel === false);
      ok("and it is charged at the policy, not silently at nothing",
        dna.cancelCharge === wantPct, `${dna.cancelCharge} vs ${wantPct}`);
      ok("isCancelled() picks it up", isCancelled(dna) === true);
      ok("and the session leaves the worklist", derive(dna).complete === true);
    }

    /* Attended, over the top of that DNA: the same clearing the session form does. */
    {
      const s3 = S.sessions.find((x) => x._id === blanked._id);
      s3.attendConfirmed = false;
      row = await openList();
      if (row) { chip(row, "attended").click(); await sleep(40);
        document.querySelector("#saveInc").click(); await sleep(300); }
      const att = S.sessions.find((x) => x._id === blanked._id);
      ok("Attended clears the cancellation it replaces",
        !att.cancelKind && att.lateCancel === false && att.cancelCharge == null && !att.cancelledAt);
      ok("and counts as answered", attendConfirmed(att) === true);
      ok("so the session is worth its full fee again",
        derive(att).rate === derive(att).fullRate, `${derive(att).rate} vs ${derive(att).fullRate}`);
    }

    /* A charge already on the record is never overwritten by the policy. */
    {
      const s4 = S.sessions.find((x) => x._id === blanked._id);
      s4.attendConfirmed = false; s4.cancelCharge = 25;
      row = await openList();
      if (row) { chip(row, "late").click(); await sleep(40);
        document.querySelector("#saveInc").click(); await sleep(300); }
      const kept = S.sessions.find((x) => x._id === blanked._id);
      ok("an existing charge survives being answered here", kept.cancelCharge === 25, kept.cancelCharge);
    }

    /* A notes-only tick must leave attendance exactly as it found it. */
    const probe = S.sessions.find((x) => x._id === blanked._id);
    probe.notes = ""; probe.attendConfirmed = false;
    probe.cancelKind = null; probe.lateCancel = false; probe.cancelCharge = null;
    row = await openList();
    if (row && row.querySelector('.tgl[data-k="notes"]')) {
      row.querySelector('.tgl[data-k="notes"]').click(); await sleep(40);
      document.querySelector("#saveInc").click(); await sleep(300);
      const after2 = S.sessions.find((x) => x._id === probe._id);
      ok("Notes done writes the notes tick", notesDone(after2) === true);
      ok("Notes done does NOT answer attendance on the therapist's behalf",
        attendConfirmed(after2) === false);
    }

    /* Bulk is "all attended" and nothing else - there is no sweep that writes off every fee. */
    ok("the only bulk answer is Attended",
      !!document.querySelector("#allAtt") &&
      !document.querySelector("#allLate") && !document.querySelector("#allDna"));

    S.sessions = S.sessions.filter((x) => x._id !== fut._id);
    sessFilter.seg = "upcoming";
  }

  /* ===== CPD ===== */
  S.cpd = [];
  const base = cpdYearHours();
  cpdForm(null); await sleep(80);
  const f = (q) => document.querySelector("#sheetBody " + q);
  f("#c_date").value = isoD(addDays(today(), -10));
  f("#c_hrs").value = "6"; f("#c_kind").value = "workshop"; f("#c_title").value = "Trauma day";
  f("#cSave").click(); await sleep(250);
  const now = cpdYearHours();
  ok("a CPD entry is saved",                 (S.cpd || []).length === 1);
  ok("its hours reach the total",            now.total === base.total + 6, base.total + " -> " + now.total);
  ok("they land under 'own', not supervision", now.own === 6 && now.sup === base.sup);
  ok("it appears in the composition",        now.parts.some((p) => p.n === CPD_KINDS.workshop.n && p.hrs === 6));
  closeSheet();

  /* Switching supervision off takes the hours out of the TARGET, never out of the record. */
  const withSup = cpdYearHours();
  S.settings.cpdCountSupervision = false;
  const without = cpdYearHours();
  ok("switching supervision off drops exactly its hours from the total",
    without.total === withSup.total - withSup.supCounted,
    withSup.total + " -> " + without.total + " (supervision " + withSup.supCounted + ")");
  ok("the supervision hours are still recorded", without.sup === withSup.sup);
  ok("the excluded hours are reported",          without.excluded === withSup.sup);
  ok("anaCPD's pace follows the same switch",    anaCPD().countsSup === false);
  S.settings.cpdCountSupervision = true;

  /* ===== Days to payment: up-front payments never enter the waiting figure ===== */
  const gaps = S.sessions.map((s) => ({ s, dt: parseD(s.date) }))
    .filter((x) => x.dt && x.dt <= today() && x.s.paidDate && parseD(x.s.paidDate))
    .map((x) => Math.round((parseD(x.s.paidDate) - x.dt) / 86400000));
  const d = anaDaysToPay();
  if (!d.ready) skip("days-to-payment checks", d.need);
  else {
    const late = gaps.filter((g) => g > 0), up = gaps.filter((g) => g <= 0);
    ok("every dated payment is counted", d.n === gaps.length, d.n + " vs " + gaps.length);
    ok("the split is at the session date",
      d.nUpfront === up.length && d.nLate === late.length,
      d.nUpfront + "/" + d.nLate + " vs " + up.length + "/" + late.length);
    ok("the wait is the median of the genuine waits alone",
      late.length ? d.avg === Math.round(anaMedian(late)) : d.avg === null, d.avg);
    ok("over-30-day waits exclude up-front payments", d.over30 === late.filter((g) => g > 30).length);
    ok("the up-front percentage matches the rows",
      d.upfrontPct === Math.round(up.length / gaps.length * 100), d.upfrontPct);
  }

  /* ===== Fee erosion: the gap is written-off fee, and nothing else can be in it ===== */
  const fe = anaFeeErosion();
  if (!fe.ready) skip("fee-erosion checks", fe.need);
  else {
    ok("gap x sessions reconciles to the pounds written off",
      Math.abs(Math.round(fe.gap * fe.sessions) - fe.lost) <= fe.sessions,
      Math.round(fe.gap * fe.sessions) + " vs " + fe.lost);
    ok("only missed sessions sit behind the gap", fe.missedCharged <= fe.missed);
    ok("a session that went ahead earns at least the booked average", fe.att >= fe.eff, fe.att + " vs " + fe.eff);
    ok("no gap means nothing was written off", fe.gap > 0 || fe.lost === 0);
  }

  /* ===== Who pays late: drift, not debt - current clients lead, ex-clients trail ===== */
  const lp = anaLatePayers();
  if (!lp.ready) skip("late-payer checks", lp.need);
  else {
    /* "Trended" is the business question - current clients with enough history for a trend - so
       it is recomputed from the raw per-row fields (drift, current), not lifted from lp.trended. */
    const trended = lp.rows.filter((r) => r.drift != null && r.current);
    ok("clients with enough history get a trend", trended.length > 0, trended.length);
    ok("nobody below the minimum gets one",       trended.every((r) => r.n >= lp.minPays));
    ok("drift is the later half minus the earlier", trended.every((r) => r.drift === r.now - r.then));
    ok("current clients lead the list, then drift worst first",
      lp.rows.every((r, i) => {
        if (i === 0) return true;
        const prev = lp.rows[i - 1];
        if (prev.current !== r.current) return prev.current === true;
        const pd = prev.drift == null ? -Infinity : prev.drift, rd = r.drift == null ? -Infinity : r.drift;
        return pd >= rd;
      }));
    const currentRows = lp.rows.filter((r) => r.current);
    ok("owing money does not push a client to the top",
      currentRows.every((r) => r.owed === 0) || currentRows[0].drift == null ||
      currentRows.every((r) => r.drift == null || currentRows[0].drift >= r.drift));
  }

  /* ===== Calendar export: the buttons, and what comes out of them =====
     scripts/check-calendar.mjs proves the .ics itself is well formed. This is the other half -
     that the controls exist, are wired, and hand the file the real download() would have taken.
     The two halves matter separately: a perfect .ics builder nothing calls ships nothing. */
  {
    const realDownload = window.download;
    let grabbed = null;
    window.download = (name, text, type) => { grabbed = { name, text, type }; };
    const events = (t) => (t || "").split("\r\n").filter((l) => l === "BEGIN:VEVENT").length;

    /* -- one session, from its own form -- */
    const live = S.sessions.find((s) => s.date && !isCancelled(s));
    if (!live) skip("calendar: single session", "this practice has no uncancelled dated session");
    else {
      grabbed = null;
      sessionForm(live); await sleep(80);
      const btn = document.querySelector("#sheetBody #f_ics");
      ok("the session form offers Add to my calendar", !!btn);
      if (btn) {
        btn.click(); await sleep(60);
        ok("it produces an .ics", !!grabbed && /\.ics$/.test(grabbed.name), grabbed && grabbed.name);
        ok("served as text/calendar", !!grabbed && grabbed.type === "text/calendar", grabbed && grabbed.type);
        ok("holding exactly one event", events(grabbed && grabbed.text) === 1, events(grabbed && grabbed.text));
        /* The privacy rule, asserted against a real practice rather than a hand-made session. */
        ok("carrying the client code and no name",
          !!grabbed && grabbed.text.includes("SUMMARY:" + live.client) && !/DESCRIPTION/.test(grabbed.text));
      }
      closeSheet();
    }

    /* -- a cancelled session is not an appointment, so it is not offered at all -- */
    const cx = S.sessions.find((s) => s.date && isCancelled(s));
    if (!cx) skip("calendar: cancelled session", "this practice has no cancellations");
    else {
      sessionForm(cx); await sleep(80);
      ok("a cancelled session is not offered to the calendar", !document.querySelector("#sheetBody #f_ics"));
      closeSheet();
    }

    /* -- the two windows, from the calendar screen -- */
    sessFilter.view = "cal";
    go("sessions"); await sleep(120);
    const card = document.querySelector("#calExport");
    ok("the calendar screen carries the export card", !!card);
    if (card) {
      ok("both windows are offered", !!card.querySelector("#ics7") && !!card.querySelector("#icsM"));
      /* An unwired info dot is a dead tap - this screen's first one, so it needed wireInfo(). */
      const dot = card.querySelector("[data-info]");
      ok("the card's explanation is registered", !!dot && !!INFO[dot.dataset.info], dot && dot.dataset.info);
      ok("the card's explanation is wired", !!dot && typeof dot.onclick === "function");

      /* Counts forward from today, so what comes out has to match what the rule says is in
         that window - recomputed here, never read back from the function. */
      const t = today();
      const iso = (d) => isoD(d);
      const win = (endDate) => S.sessions.filter((s) =>
        s.date && !isCancelled(s) && s.date >= iso(t) && s.date <= iso(endDate)).length;

      const w7 = addDays(t, 6);
      grabbed = null;
      card.querySelector("#ics7").onclick(); await sleep(60);
      const want7 = win(w7);
      if (!want7) ok("an empty 7-day window downloads nothing", grabbed === null);
      else {
        ok("the 7-day window downloads", !!grabbed && /\.ics$/.test(grabbed.name), grabbed && grabbed.name);
        ok("the 7-day window holds every session in it and no more",
          events(grabbed && grabbed.text) === want7, `${events(grabbed && grabbed.text)} vs ${want7}`);
      }

      const wM = addDays(new Date(t.getFullYear(), t.getMonth() + 1, t.getDate()), -1);
      grabbed = null;
      card.querySelector("#icsM").onclick(); await sleep(60);
      const wantM = win(wM);
      if (!wantM) ok("an empty month window downloads nothing", grabbed === null);
      else {
        ok("the month window downloads", !!grabbed && /\.ics$/.test(grabbed.name), grabbed && grabbed.name);
        ok("the month window holds every session in it and no more",
          events(grabbed && grabbed.text) === wantM, `${events(grabbed && grabbed.text)} vs ${wantM}`);
        ok("the month window is at least as wide as the week", wantM >= want7, `${wantM} vs ${want7}`);
      }
    }
    sessFilter.view = "list";
    window.download = realDownload;
  }
  return out;
}

let failed = 0;
for (const name of PROFILES) {
  const file = readdirSync(dataDir).find((f) => f.includes(name) && f.endsWith(".json"));
  if (!file) { console.log(`✗ ${name} - fixture not found`); failed++; continue; }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.normalize === "function" && typeof window.go === "function");
  const state = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
  await page.evaluate((st) => {
    window.commit = async () => true;                 /* reads and in-memory edits only */
    /* `S` is a top-level `let` - it lives in the global LEXICAL scope, so assigning window.S
       would create a second copy that nothing reads. Assign the bare name. */
    S = normalize(JSON.parse(JSON.stringify(st.state || st)));
    S.settings.onboarded = true;
    S.settings.features = {};                         /* every feature on: this tests code, not gating */
    S.settings.coach = { off: true, seen: [] };       /* a tip overlay would swallow the clicks */
    try { tyMemoClear(); applySettings(); } catch (e) {}
    try { if (typeof flowClose === "function") flowClose(); } catch (e) {}
    document.querySelectorAll(".ov").forEach((n) => n.remove());
  }, state);

  const results = await page.evaluate(inPage);
  const bad = results.filter((r) => !r.ok && !r.skip);
  const skipped = results.filter((r) => r.skip);
  if (bad.length || errs.length) {
    failed++;
    console.log(`✗ ${name}`);
    bad.forEach((r) => console.log(`    ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
    [...new Set(errs)].slice(0, 5).forEach((e) => console.log("    " + e));
  } else {
    console.log(`✓ ${name} - ${results.length - skipped.length} checks` +
      (skipped.length ? ` (${skipped.length} n/a: ${skipped.map((s) => s.detail).join("; ")})` : ""));
  }
  await page.close();
}
await browser.close(); srv.close();
console.log(failed ? `\n${failed} profile(s) with failures` : "\nEvery behaviour check passed on every profile");
process.exit(failed ? 1 : 0);
