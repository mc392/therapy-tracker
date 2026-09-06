/* Generates the test-data "exports" in tests/test-data/.
 *
 *   node scripts/make-test-data.mjs
 *
 * Each file is a REAL GroundWork backup envelope — the same shape backupPayload() writes — so it
 * can be restored through Settings › Data & backup › Restore on any device, and read straight off
 * disk by scripts/review-test-data.mjs.
 *
 * WHY THESE ARE GENERATED RATHER THAN HAND-WRITTEN
 *   The engines under test (the tax engine and the twenty ana* trends) only say anything
 *   interesting once there are a few hundred sessions spread over years. Hand-written fixtures at
 *   that size are unmaintainable, and worse, they get tuned until the app agrees with them — the
 *   exact failure tests/tax-tests.js warns about. Here the DATA is generated to a described shape
 *   ("weekly client, 18% missed, pays about three weeks late") and the expectations are derived
 *   from that shape, never from what the app returned.
 *
 * ANCHORED TO A DATE, ON PURPOSE
 *   ANCHOR below is the "today" the whole corpus is built around, and every profile is described
 *   relative to it (a client who started "14 months ago"). The dates written into the files are
 *   absolute, so the fixtures are stable and diffable — but a fixture generated for one anchor and
 *   read a year later will have drifted out of the windows the trends engine cares about (last 12
 *   months, last 26 weeks, this tax year). Re-run this script when that happens; it is
 *   deterministic, so nothing but the dates moves.
 *
 * NO REAL PEOPLE
 *   Client codes are synthetic (C001, JB2, …) and nothing here is clinical. The `notes` field is
 *   the app's yes/no write-up marker, not a note.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tests", "test-data");

/* The date the corpus is built around. Kept in step with tests/tax-tests.js, which assumes
   2026-27 is the year IN PROGRESS. */
const ANCHOR = "2026-09-05";
const SCHEMA_VERSION = 7;
const NOTES_SCOPE =
  "The 'notes' field on a session is a yes/no marker that clinical notes were completed elsewhere. " +
  "'adminNote' is a free-text practical comment written by the practitioner. This file contains no clinical notes.";
const RATE_EPOCH = "2000-01-01";

/* ---------- deterministic randomness ----------
   Every profile seeds its own generator from its name, so regenerating one file never moves the
   others and a diff shows only what actually changed. */
function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const chance = (r, p) => r() < p;
const intBetween = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/* ---------- dates ---------- */
const parseD = (s) => { const p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const isoD = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); const dim = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d.getDate(), dim)); return x; };
/* GroundWork's own tax-year rule: 6 April to 5 April. */
function taxYear(d) {
  if (typeof d === "string") d = parseD(d);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const start = y - ((m < 4 || (m === 4 && day < 6)) ? 1 : 0);
  return start + "-" + String(start + 1).slice(-2);
}
const TODAY = parseD(ANCHOR);
const monthsAgo = (n) => addMonths(TODAY, -n);

let _uid = 0;
/* Stable ids: the same run produces the same ids, so the files diff cleanly. */
const uid = (tag) => tag + "-" + String(++_uid).padStart(5, "0");

/* ---------- the pieces a profile is assembled from ---------- */

/* A client, plus the dated fee history that makes their sessions derive the right rate.
   Fees are ALWAYS history, never a flat field: `derive()` reads effRate(client,date), so a rise
   part-way through must leave earlier sessions on the old fee — which is the tax figures. */
function makeClient(spec) {
  const c = {
    _id: uid("cl"), code: spec.code, status: spec.status,
    category: spec.category || null,
    frequency: spec.frequency || "Weekly",
    insurance: spec.insurance || "N",
    notes: "", created: isoD(spec.start),
  };
  if (spec.source) c.source = spec.source;
  if (spec.usualDay) c.usualDay = spec.usualDay;
  if (spec.usualTime) c.usualTime = spec.usualTime;
  return c;
}
function rateRows(code, steps) {
  /* The first step is stamped RATE_EPOCH so a session logged before any rise still resolves — the
     same floor the spreadsheet importer and the setup wizard use. */
  return steps.map((s, i) => ({ _id: uid("rh"), client: code, effectiveFrom: i === 0 ? RATE_EPOCH : isoD(s.from), rate: s.rate }));
}

const FREQ_DAYS = { "Weekly": 7, "Every 2 weeks": 14, "Every 3 weeks": 21, "Monthly": 28 };

/* Therapists take holidays, and the analytics that matter most — weeks actually worked, the
   seasonal index, the worst month — are ABOUT those holidays. A generator that produces a session
   every single week for four years makes "you worked 52 weeks of 52" true and the card useless.
   Three weeks in August and a fortnight over Christmas is a normal private practice. */
function inBreak(d) {
  const m = d.getMonth(), day = d.getDate();
  if (m === 7 && day <= 21) return true;                    /* 1–21 August */
  if (m === 11 && day >= 20) return true;                   /* 20–31 December */
  if (m === 0 && day <= 3) return true;                     /* 1–3 January */
  return false;
}

/* One client's whole run of sessions, described rather than enumerated:
     start / end            when the work ran
     frequency              their cadence, which sets the interval
     missRate               share of appointments that became a late cancellation or DNA
     payLagDays             typical days from session to payment ([lo,hi]); null = never pays
     unpaidTailWeeks        recent sessions deliberately left unpaid (money genuinely outstanding)
     notesGap               share of sessions with the write-up not ticked (the Incomplete worklist)
   Every session carries what the app itself would have written: a stamped cancelCharge on a
   missed one, a paidDate on a settled one, "Y" in notes for a completed write-up. */
function makeSessions(r, spec, ctx) {
  const out = [];
  const step = FREQ_DAYS[spec.frequency] || 7;
  let d = new Date(spec.start), n = 0;
  const end = spec.end < TODAY ? spec.end : (spec.upcoming ? addDays(TODAY, 21) : TODAY);
  const unpaidFrom = spec.unpaidTailWeeks ? addDays(TODAY, -7 * spec.unpaidTailWeeks) : null;
  while (d <= end) {
    if (spec.breaks && inBreak(d)) { d = addDays(d, step); continue; }   /* away — nothing logged */
    n++;
    const iso = isoD(d);
    const missed = chance(r, spec.missRate || 0);
    const dna = missed && chance(r, 0.4);
    const future = d > TODAY;
    const s = {
      _id: uid("sx"), client: spec.code, num: n, date: iso,
      time: spec.time, mode: chance(r, spec.onlineRate == null ? 0.25 : spec.onlineRate) ? "Online" : "In-person",
      location: spec.location, room: ctx.roomNumber || "",
      invoice: "", paidDate: "", receipt: "",
      notes: "", adminNote: "", roomPaid: "", roomPaidDate: "", lateCancel: false,
    };
    if (missed && !future) {
      /* A missed session is charged at the practice's policy — stamped on the session, because
         editing the policy later must never rewrite what a client was already billed. */
      s.cancelKind = dna ? "dna" : "late";
      s.lateCancel = !dna;
      s.cancelledAt = isoD(addDays(d, -intBetween(r, 0, 2)));
      s.cancelCharge = dna ? (ctx.dnaPct == null ? 100 : ctx.dnaPct) : pick(r, ctx.latePcts || [100]);
    }
    if (!future) {
      /* Write-up ticked, unless this profile leaves a share of them open. */
      s.notes = chance(r, spec.notesGap || 0) ? "" : "Y";
      const willPay = spec.payLagDays && !(unpaidFrom && d >= unpaidFrom) && !chance(r, spec.badDebtRate || 0);
      if (willPay) {
        const lag = intBetween(r, spec.payLagDays[0], spec.payLagDays[1]);
        const pd = addDays(d, lag);
        if (pd <= TODAY) s.paidDate = isoD(pd);
      }
      /* Only a room that actually charges per session on that date has a fee to settle; the app
         stamps "n/a" itself for the rest, so leaving it blank here is what a real record looks
         like for an at-home or monthly-rent practice. */
      if (ctx.perSessionRoom) s.roomPaid = chance(r, 0.9) ? "Y" : "";
      if (chance(r, 0.05)) s.adminNote = pick(r, ["moved from Tuesday", "invoice goes to her employer", "needs a receipt", "room swapped"]);
    }
    out.push(s);
    d = addDays(d, step + (chance(r, 0.15) ? intBetween(r, -2, 3) : 0));
  }
  return out;
}

/* ---------- profiles ---------- */
/* Each returns the STATE object. Everything the app would have set for itself (normalize's
   defaults, migration flags) is deliberately left out — restoring these exercises normalize()
   exactly as a real backup would. */

const CATS = [
  { status: "Ongoing", category: "Active" },
  { status: "Initial session booked", category: "Active" },
  { status: "Active enquiry", category: "Pipeline" },
  { status: "Paused", category: "Pipeline" },
  { status: "Finished", category: "Finished" },
];

function baseState(extra) {
  return Object.assign({
    clients: [], rooms: [], sessions: [], supervision: [], peerSupervision: [],
    rateHistory: [], roomRateHistory: [], roomRentHistory: [],
    expenses: [], otherIncome: [], paidCharges: {},
    clientCategories: CATS.map((c) => ({ ...c })),
    settings: {}, meta: { schemaVersion: SCHEMA_VERSION },
  }, extra || {});
}

/* A recurring cost, and the tick-list entries that say it was actually settled. The cash basis
   reads those ticks, so a profile that never ticks anything is a different (and realistic) test
   from one that keeps on top of it. */
function recurringCost(state, r, o) {
  const x = {
    _id: uid("ex"), desc: o.desc, amount: o.amount, date: isoD(o.from),
    recurrence: o.recurrence || "monthly", endDate: o.to ? isoD(o.to) : "", cat: o.cat,
  };
  state.expenses.push(x);
  if (o.tickRate) {
    let d = new Date(o.from);
    const stop = o.to && o.to < TODAY ? o.to : TODAY;
    const bump = o.recurrence === "annually" ? 12 : o.recurrence === "quarterly" ? 3 : 1;
    while (d <= stop) {
      if (chance(r, o.tickRate)) state.paidCharges["exp:" + x._id + "|" + isoD(d)] = isoD(addDays(d, intBetween(r, 0, 6)));
      d = addMonths(d, bump);
    }
  }
  return x;
}

function supervisionRun(state, r, o) {
  let d = new Date(o.from);
  while (d <= TODAY) {
    state.supervision.push({
      _id: uid("sv"), date: isoD(d), supervisor: o.supervisor,
      count: intBetween(r, 2, 6), cost: o.cost, clients: [],
    });
    d = addDays(d, o.everyDays);
  }
}

/* ---------- 1 · Newly qualified, three months in ---------- */
/* The empty-ish end of the range: everything the trends engine needs a year of is deliberately
   not there yet, so every readiness gate should say so in plain words rather than draw a chart
   from four data points. Works at home, so there is no room fee to chase — the case that used to
   put every session on the Incomplete worklist for ever. */
function profileNewcomer() {
  const r = rng("newcomer");
  const st = baseState();
  st.settings = {
    practiceName: "Bramble Counselling", practiceTagline: "Counselling & psychotherapy",
    taxBasis: "cash", cpdTarget: 30,
    features: { accreditation: false },
  };
  st.rooms.push({ _id: uid("rm"), location: "At home", rate: 0, due: "n/a", billing: "session" });
  st.roomRateHistory.push({ _id: uid("rr"), location: "At home", effectiveFrom: RATE_EPOCH, rate: 0 });
  const specs = [
    { code: "C001", start: monthsAgo(3), end: TODAY, frequency: "Weekly", rate: 45, status: "Ongoing", time: "10:00", missRate: 0.05, payLagDays: [0, 3], source: "Counselling Directory", upcoming: true },
    { code: "C002", start: monthsAgo(3), end: TODAY, frequency: "Weekly", rate: 45, status: "Ongoing", time: "12:00", missRate: 0.1, payLagDays: [0, 5], source: "Word of mouth", upcoming: true },
    { code: "C003", start: monthsAgo(2), end: TODAY, frequency: "Every 2 weeks", rate: 45, status: "Ongoing", time: "14:00", missRate: 0, payLagDays: [1, 6], source: "Counselling Directory" },
    { code: "C004", start: monthsAgo(2), end: addDays(TODAY, -40), frequency: "Weekly", rate: 45, status: "Finished", time: "16:00", missRate: 0.2, payLagDays: [0, 4] },
  ];
  specs.forEach((sp) => {
    st.clients.push(makeClient({ ...sp, location: "At home" }));
    st.rateHistory.push(...rateRows(sp.code, [{ rate: sp.rate }]));
    st.sessions.push(...makeSessions(r, { ...sp, location: "At home", notesGap: 0.15 }, { perSessionRoom: false, latePcts: [100], dnaPct: 100 }));
  });
  supervisionRun(st, r, { from: monthsAgo(3), everyDays: 28, supervisor: "M. Okafor", cost: 60 });
  return { st, note: "Three months of history, four clients, works at home. Every trends gate should decline politely." };
}

/* ---------- 2 · Established practice, four years, room hired per session ---------- */
/* The volume case, and the one everything else is checked against: enough history for
   seasonality, cohorts and fee erosion, a fee rise part-way through, a room whose per-session
   cost also rose, supervision throughout, and a full set of business costs. */
function profileEstablished() {
  const r = rng("established");
  const st = baseState();
  st.settings = {
    practiceName: "Charlotte Bloor Therapy", practiceTagline: "Counselling & psychotherapy",
    /* The Tax tab draws nothing until the disclaimer has been read. Anyone with four years of
       history has long since acknowledged it; leaving it off (as `newcomer` and `day-one` do)
       is what the gate itself looks like. */
    taxAck: true,
    taxBasis: "cash", cpdTarget: 30, class2Voluntary: false,
    sessionMins: 50, adminMinsPerSession: 15,
    cancelRules: { window: [{ hoursBefore: 48, chargePct: 0 }, { hoursBefore: 24, chargePct: 50 }], dnaChargePct: 100 },
    useOfHome: { years: { "2024-25": { method: "simplified", hours: 30, appliedAt: "2024-04-06" } } },
    taxPot: { bufferPct: 15, balance: 6200, balanceAt: isoD(monthsAgo(1)) },
  };
  st.rooms.push({ _id: uid("rm"), location: "Wellbeing Rooms", rate: 22, due: "EOM", billing: "session", pay: { freq: "monthly", day: "last" } });
  st.rooms.push({ _id: uid("rm"), location: "At home", rate: 0, due: "n/a", billing: "session" });
  st.roomRateHistory.push(
    { _id: uid("rr"), location: "Wellbeing Rooms", effectiveFrom: RATE_EPOCH, rate: 18 },
    { _id: uid("rr"), location: "Wellbeing Rooms", effectiveFrom: isoD(monthsAgo(20)), rate: 22 },
    { _id: uid("rr"), location: "At home", effectiveFrom: RATE_EPOCH, rate: 0 },
  );
  const sources = ["Counselling Directory", "Word of mouth", "GP referral", "Psychology Today", "Own website"];
  const days = ["mon", "tue", "wed", "thu"];
  const specs = [];
  for (let i = 0; i < 26; i++) {
    const startM = intBetween(r, 1, 48);
    const runM = Math.min(startM, intBetween(r, 3, 30));
    const stillOn = startM - runM <= 1;
    specs.push({
      code: "C" + String(101 + i), start: monthsAgo(startM), end: monthsAgo(startM - runM),
      frequency: pick(r, ["Weekly", "Weekly", "Weekly", "Every 2 weeks", "Every 3 weeks"]),
      rate: pick(r, [55, 55, 60, 60, 65, 50]),
      status: stillOn ? (chance(r, 0.12) ? "Paused" : "Ongoing") : "Finished",
      time: pick(r, ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]),
      missRate: r() * 0.18, payLagDays: [0, intBetween(r, 5, 40)],
      source: chance(r, 0.8) ? pick(r, sources) : null,
      usualDay: chance(r, 0.5) ? pick(r, days) : null,
      location: chance(r, 0.75) ? "Wellbeing Rooms" : "At home",
      unpaidTailWeeks: stillOn && chance(r, 0.3) ? intBetween(r, 2, 8) : 0,
      upcoming: stillOn, breaks: true,
    });
  }
  /* Discharged last week, and still inside their own cadence. Nothing else in the corpus is:
     this is the client who separates "status says finished" from "has gone quiet", which is the
     difference between the episode-length median counting a completed piece of work and waiting
     three intervals to notice it ended. They must NOT appear on the drifting list either. */
  specs.push({
    code: "C199", start: monthsAgo(9), end: addDays(TODAY, -6), frequency: "Weekly",
    rate: 60, status: "Finished", time: "12:00", missRate: 0.05, payLagDays: [0, 4],
    source: "Word of mouth", location: "Wellbeing Rooms", breaks: true,
  });
  specs.forEach((sp) => {
    st.clients.push(makeClient(sp));
    /* A fee rise 14 months ago for anyone who was already on the books then — the case that makes
       fee erosion and the dated-rate rule mean something. */
    const steps = [{ rate: sp.rate }];
    if (sp.start < monthsAgo(14) && sp.end > monthsAgo(14)) steps.push({ from: monthsAgo(14), rate: sp.rate + 5 });
    st.rateHistory.push(...rateRows(sp.code, steps));
    st.sessions.push(...makeSessions(r, { ...sp, notesGap: 0.08 }, {
      perSessionRoom: sp.location === "Wellbeing Rooms", roomNumber: "3",
      latePcts: [0, 50, 50, 100], dnaPct: 100,
    }));
  });
  supervisionRun(st, r, { from: monthsAgo(47), everyDays: 30, supervisor: "M. Okafor", cost: 65 });
  for (let i = 0; i < 14; i++) {
    st.peerSupervision.push({ _id: uid("pv"), date: isoD(monthsAgo(i * 3)), with: "Peer group", hours: 1.5, cost: 0, notes: "" });
  }
  recurringCost(st, r, { desc: "Professional indemnity", amount: 18.5, from: monthsAgo(47), cat: "insurance", tickRate: 0.85 });
  recurringCost(st, r, { desc: "BACP membership", amount: 190, from: monthsAgo(46), recurrence: "annually", cat: "memberships", tickRate: 1 });
  recurringCost(st, r, { desc: "Website & hosting", amount: 14, from: monthsAgo(40), cat: "website", tickRate: 0.8 });
  recurringCost(st, r, { desc: "Accountant", amount: 480, from: monthsAgo(30), recurrence: "annually", cat: "accountancy", tickRate: 1 });
  recurringCost(st, r, { desc: "Phone & internet", amount: 22, from: monthsAgo(47), cat: "phone", tickRate: 0.7 });
  recurringCost(st, r, { desc: "ICO fee", amount: 40, from: monthsAgo(44), recurrence: "annually", cat: "ico", tickRate: 1 });
  st.expenses.push({ _id: uid("ex"), desc: "CPD — trauma course", amount: 420, date: isoD(monthsAgo(9)), recurrence: "once", cat: "cpd" });
  st.expenses.push({ _id: uid("ex"), desc: "New chair", amount: 260, date: isoD(monthsAgo(22)), recurrence: "once", cat: "equipment" });
  st.otherIncome.push({ _id: uid("oi"), desc: "Workshop — anxiety", amount: 350, date: isoD(monthsAgo(7)), recurrence: "once", cat: "workshops", scope: "practice" });
  st.otherIncome.push({ _id: uid("oi"), desc: "Supervising a trainee", amount: 120, date: isoD(monthsAgo(18)), recurrence: "monthly", cat: "supervising", scope: "practice" });
  return { st, note: "Four years, 26 clients, room hired per session with a mid-history rate rise, cancellation policy at 0/50/100%." };
}

/* ---------- 3 · Part-time, below the personal allowance ---------- */
/* Every band edge that only shows up at low profit: no income tax, no Class 4, Class 2 paid
   VOLUNTARILY below the Small Profits Threshold to protect a pension year, and a use-of-home
   claim that is a real share of a small profit. Accruals basis, which is the election. */
function profilePartTime() {
  const r = rng("parttime");
  const st = baseState();
  st.settings = {
    practiceName: "Quiet Room Therapy", taxBasis: "accruals", class2Voluntary: true, taxAck: true,
    cpdTarget: 20,
    useOfHome: { years: { "2024-25": { method: "simplified", hours: 55, appliedAt: "2024-04-06" } } },
    taxPot: { bufferPct: 5 },
    features: { accreditation: false },
  };
  st.rooms.push({ _id: uid("rm"), location: "At home", rate: 0, due: "n/a", billing: "session" });
  st.roomRateHistory.push({ _id: uid("rr"), location: "At home", effectiveFrom: RATE_EPOCH, rate: 0 });
  const specs = [
    { code: "PT1", breaks: true, start: monthsAgo(26), end: TODAY, frequency: "Weekly", rate: 40, status: "Ongoing", time: "09:30", missRate: 0.08, payLagDays: [0, 7], source: "Word of mouth", upcoming: true },
    { code: "PT2", start: monthsAgo(24), end: monthsAgo(6), frequency: "Every 2 weeks", rate: 40, status: "Finished", time: "11:00", missRate: 0.05, payLagDays: [0, 10], source: "GP referral" },
    { code: "PT3", breaks: true, start: monthsAgo(20), end: TODAY, frequency: "Every 2 weeks", rate: 42, status: "Ongoing", time: "13:00", missRate: 0.12, payLagDays: [2, 14], source: "Word of mouth", upcoming: true },
    { code: "PT4", start: monthsAgo(14), end: monthsAgo(2), frequency: "Weekly", rate: 42, status: "Finished", time: "15:00", missRate: 0.06, payLagDays: [0, 5] },
    { code: "PT5", start: monthsAgo(9), end: TODAY, frequency: "Monthly", rate: 45, status: "Ongoing", time: "10:00", missRate: 0, payLagDays: [0, 2], source: "Own website" },
    { code: "PT6", start: monthsAgo(5), end: TODAY, frequency: "Weekly", rate: 45, status: "Ongoing", time: "16:30", missRate: 0.1, payLagDays: [0, 9], upcoming: true },
  ];
  specs.forEach((sp) => {
    st.clients.push(makeClient({ ...sp, location: "At home" }));
    st.rateHistory.push(...rateRows(sp.code, [{ rate: sp.rate }]));
    st.sessions.push(...makeSessions(r, { ...sp, location: "At home", notesGap: 0.05 }, { perSessionRoom: false, latePcts: [100], dnaPct: 100 }));
  });
  supervisionRun(st, r, { from: monthsAgo(26), everyDays: 42, supervisor: "R. Vance", cost: 55 });
  recurringCost(st, r, { desc: "Professional indemnity", amount: 12, from: monthsAgo(26), cat: "insurance", tickRate: 0.9 });
  recurringCost(st, r, { desc: "BACP membership", amount: 175, from: monthsAgo(26), recurrence: "annually", cat: "memberships", tickRate: 1 });
  return { st, note: "Part-time, ~£8k profit — under the personal allowance, Class 2 voluntary, accruals basis, use of home at the £18 band." };
}

/* ---------- 4 · Scotland, high earner, filed returns and payments on account ---------- */
/* The other end of the tax engine: Scottish bands, a student loan that FINISHES part-way through
   (the exact thing per-year settings exist for), a pension, HMRC's own assessments entered for
   two filed years, instalments recorded as paid, and a monthly room rent rather than per-session.
   Income is over £50k, so the MTD prompts are live too. */
function profileScotlandHigh() {
  const r = rng("scotland");
  const st = baseState();
  st.settings = {
    practiceName: "Fair Wynd Psychotherapy", taxBasis: "cash", taxAck: true,
    taxRegion: "scotland", studentLoan: "none",
    taxRegionYears: { "2022-23": "scotland" },
    /* Plan 2 until it was paid off in 2025-26; nothing after. One scalar could not say this. */
    studentLoanYears: { "2022-23": "plan2", "2026-27": "none" },
    /* HMRC's own figures for the two filed years, close to but not equal to the app's estimate —
       which is the realistic case, and the one where the "actual wins everywhere" rule shows.
       The instalments HMRC actually SET for 2024-25 are lower than the calculated ones, and
       2026-27 carries a claim to reduce (SA303), so all three levels of precedence
       (claim > HMRC's figure > the estimate) are exercised in one profile. */
    taxYears: {
      "2023-24": { liability: 4910, liabilityAt: "2025-01-20", filed: true },
      "2024-25": { liability: 11260, liabilityAt: "2026-01-18", filed: true, poaSet: 2400, poaSetAt: "2026-01-18" },
      "2026-27": { poaClaim: 3000, poaClaimAt: "2026-06-14", poaClaimWhy: "Two contracts ended in April" },
    },
    taxPaid: {
      "2025-01-31": { date: "2025-01-29", amount: 7310 },
      "2025-07-31": { date: "2025-07-30", amount: 2400 },
      "2026-01-31": { date: "2026-01-30", amount: 11288.19 },
      "2026-07-31": { date: "2026-07-29", amount: 4828.19 },
    },
    taxPot: { bufferPct: 20, balance: 14500, balanceAt: isoD(monthsAgo(2)) },
    useOfHome: { years: { "2023-24": { method: "actual", rooms: 6, workRooms: 1, businessPct: 70, costs: { rent: 14400, councilTax: 2100, gas: 900, electric: 780, water: 420, broadband: 480 }, appliedAt: "2023-04-06" } } },
    cpdTarget: 40,
  };
  st.rooms.push({ _id: uid("rm"), location: "Thistle Practice", rate: 0, due: "EOM", billing: "monthly", pay: { freq: "monthly", day: 1 } });
  st.rooms.push({ _id: uid("rm"), location: "At home", rate: 0, due: "n/a", billing: "session" });
  st.roomRateHistory.push(
    { _id: uid("rr"), location: "Thistle Practice", effectiveFrom: RATE_EPOCH, rate: 0 },
    { _id: uid("rr"), location: "At home", effectiveFrom: RATE_EPOCH, rate: 0 },
  );
  st.roomRentHistory.push(
    { _id: uid("rn"), location: "Thistle Practice", effectiveFrom: isoD(monthsAgo(52)), amount: 420 },
    { _id: uid("rn"), location: "Thistle Practice", effectiveFrom: isoD(monthsAgo(16)), amount: 480 },
  );
  const specs = [];
  for (let i = 0; i < 30; i++) {
    const startM = intBetween(r, 1, 52);
    const runM = Math.min(startM, intBetween(r, 4, 34));
    const stillOn = startM - runM <= 1;
    specs.push({
      code: "S" + String(201 + i), start: monthsAgo(startM), end: monthsAgo(startM - runM),
      frequency: pick(r, ["Weekly", "Weekly", "Weekly", "Every 2 weeks"]),
      /* A city practice at the top of the market: this is the profile that has to reach the
         42% Scottish band and the £50,000 MTD floor. */
      rate: pick(r, [115, 125, 130, 140]),
      status: stillOn ? "Ongoing" : "Finished",
      time: pick(r, ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"]),
      missRate: r() * 0.1, payLagDays: [0, intBetween(r, 3, 21)],
      source: chance(r, 0.6) ? pick(r, ["Psychology Today", "EAP referral", "Word of mouth", "Own website"]) : null,
      location: "Thistle Practice", upcoming: stillOn, breaks: true,
    });
  }
  specs.forEach((sp) => {
    st.clients.push(makeClient(sp));
    st.rateHistory.push(...rateRows(sp.code, [{ rate: sp.rate }]));
    st.sessions.push(...makeSessions(r, { ...sp, notesGap: 0.04 }, { perSessionRoom: false, roomNumber: "1", latePcts: [50, 100], dnaPct: 100 }));
  });
  supervisionRun(st, r, { from: monthsAgo(52), everyDays: 21, supervisor: "K. Mackay", cost: 80 });
  for (let i = 0; i < 20; i++) st.peerSupervision.push({ _id: uid("pv"), date: isoD(monthsAgo(i * 2)), with: "Peer group", hours: 2, cost: 15, notes: "" });
  recurringCost(st, r, { desc: "Professional indemnity", amount: 32, from: monthsAgo(52), cat: "insurance", tickRate: 0.95 });
  recurringCost(st, r, { desc: "UKCP membership", amount: 310, from: monthsAgo(52), recurrence: "annually", cat: "memberships", tickRate: 1 });
  recurringCost(st, r, { desc: "Accountant", amount: 900, from: monthsAgo(50), recurrence: "annually", cat: "accountancy", tickRate: 1 });
  recurringCost(st, r, { desc: "Software & subscriptions", amount: 28, from: monthsAgo(44), cat: "software", tickRate: 0.6 });
  st.otherIncome.push({ _id: uid("oi"), desc: "Supervision provided", amount: 260, date: isoD(monthsAgo(30)), recurrence: "monthly", cat: "supervising", scope: "practice" });
  /* A separate trade — must never reach the practice's Self Assessment figure. */
  st.otherIncome.push({ _id: uid("oi"), desc: "University teaching", amount: 900, date: isoD(monthsAgo(24)), recurrence: "quarterly", cat: "other", scope: "personal" });
  /* The pension contribution is NOT in `st`: pensionPcm() reads localStorage (tt_pension), so it
     does not travel in a backup at all — see the review report. The harness applies it as a device
     setting so the pension path is still exercised. */
  return { st, device: { tt_pension: "400" },
    note: "Scotland, ~£55k profit, Plan 2 student loan ending 2026-27, £400/month pension (a device setting), monthly room rent, two filed years with HMRC's own figures, instalments HMRC set, and a claim to reduce." };
}

/* ---------- 5 · Chaotic payments, accruals basis ---------- */
/* Deliberately untidy, because the app's job is to be right about untidy data: a third of
   sessions never paid, several clients months in arrears, cancellations at every charge
   percentage the policy allows, and a tick-list nobody keeps up with. Accruals, so the tax
   figures should ignore all of that and count the work when it was done. */
function profileChaotic() {
  const r = rng("chaotic");
  const st = baseState();
  st.settings = {
    practiceName: "Northgate Therapy", taxBasis: "accruals", taxAck: true,
    cancelRules: { window: [{ hoursBefore: 72, chargePct: 0 }, { hoursBefore: 24, chargePct: 50 }], dnaChargePct: 75 },
    cpdTarget: 30, taxPot: { bufferPct: 0 },
  };
  st.rooms.push({ _id: uid("rm"), location: "The Old Bank", rate: 25, due: "EOW", billing: "session", pay: { freq: "weekly", day: "5" } });
  st.roomRateHistory.push({ _id: uid("rr"), location: "The Old Bank", effectiveFrom: RATE_EPOCH, rate: 25 });
  const specs = [];
  for (let i = 0; i < 14; i++) {
    const startM = intBetween(r, 2, 30);
    const runM = Math.min(startM, intBetween(r, 2, 24));
    const stillOn = startM - runM <= 1;
    specs.push({
      code: "N" + String(301 + i), start: monthsAgo(startM), end: monthsAgo(startM - runM),
      frequency: pick(r, ["Weekly", "Every 2 weeks", "Every 3 weeks", "Monthly"]),
      rate: pick(r, [50, 55, 60]), status: stillOn ? "Ongoing" : pick(r, ["Finished", "Paused"]),
      time: pick(r, ["10:00", "11:00", "12:00", "15:00", "19:00"]),
      missRate: 0.1 + r() * 0.25,
      payLagDays: chance(r, 0.7) ? [5, intBetween(r, 30, 90)] : null,
      badDebtRate: 0.25,
      unpaidTailWeeks: stillOn ? intBetween(r, 4, 16) : 0,
      location: "The Old Bank", upcoming: stillOn,
    });
  }
  specs.forEach((sp) => {
    st.clients.push(makeClient(sp));
    st.rateHistory.push(...rateRows(sp.code, [{ rate: sp.rate }]));
    st.sessions.push(...makeSessions(r, { ...sp, notesGap: 0.35 }, { perSessionRoom: true, roomNumber: "2", latePcts: [0, 50, 100], dnaPct: 75 }));
  });
  supervisionRun(st, r, { from: monthsAgo(30), everyDays: 35, supervisor: "T. Aldridge", cost: 70 });
  recurringCost(st, r, { desc: "Insurance", amount: 16, from: monthsAgo(30), cat: "insurance", tickRate: 0.15 });
  recurringCost(st, r, { desc: "Room deposit written off", amount: 150, from: monthsAgo(12), recurrence: "once", cat: "other" });
  return { st, note: "Accruals basis, 14 clients, a third of sessions unpaid, cancellations at 0/50/75/100%, tick-list barely used." };
}

/* ---------- 6 · Winding down after a long career ---------- */
/* Five and a half years of history, most of it finished, and almost nothing recent. This is the
   profile that catches anything which reads "no data lately" as "no data": the year figures, the
   drifting list, episode length and the retention review all have to behave when the practice is
   mostly in the past. */
function profileWindingDown() {
  const r = rng("winddown");
  const st = baseState();
  st.settings = {
    practiceName: "Elm House Counselling", taxBasis: "cash", cpdTarget: 30, taxAck: true,
    retention: { notesYears: 6, financeYears: 6, endedStatuses: ["Finished"] },
    taxPot: { bufferPct: 10, balance: 900, balanceAt: isoD(monthsAgo(4)) },
  };
  st.rooms.push({ _id: uid("rm"), location: "Elm House", rate: 15, due: "EOM", billing: "session", pay: { freq: "monthly", day: 28 } });
  st.roomRateHistory.push({ _id: uid("rr"), location: "Elm House", effectiveFrom: RATE_EPOCH, rate: 15 });
  const specs = [];
  for (let i = 0; i < 30; i++) {
    /* Weighted to the past: the practice was busy three to five years ago and is now down to two. */
    const startM = intBetween(r, 14, 66);
    const runM = Math.min(startM - 1, intBetween(r, 4, 28));
    const stillOn = i >= 28;
    specs.push({
      code: "E" + String(401 + i),
      start: monthsAgo(startM), end: stillOn ? TODAY : monthsAgo(startM - runM),
      frequency: pick(r, ["Weekly", "Every 2 weeks"]),
      rate: pick(r, [40, 45, 50]),
      status: stillOn ? "Ongoing" : "Finished",
      time: pick(r, ["10:00", "11:00", "14:00"]),
      missRate: r() * 0.12, payLagDays: [0, 14],
      source: chance(r, 0.4) ? pick(r, ["Word of mouth", "GP referral"]) : null,
      location: "Elm House", upcoming: stillOn, breaks: true,
    });
  }
  specs.forEach((sp) => {
    st.clients.push(makeClient(sp));
    st.rateHistory.push(...rateRows(sp.code, [{ rate: sp.rate }]));
    st.sessions.push(...makeSessions(r, { ...sp, notesGap: 0.02 }, { perSessionRoom: true, roomNumber: "A", latePcts: [100], dnaPct: 100 }));
  });
  supervisionRun(st, r, { from: monthsAgo(66), everyDays: 42, supervisor: "H. Price", cost: 50 });
  recurringCost(st, r, { desc: "Insurance", amount: 14, from: monthsAgo(66), to: monthsAgo(3), cat: "insurance", tickRate: 0.9 });
  recurringCost(st, r, { desc: "BACP membership", amount: 165, from: monthsAgo(66), recurrence: "annually", cat: "memberships", tickRate: 1 });
  return { st, note: "Five and a half years, 30 clients, 28 of them finished — a practice winding down to two clients." };
}

/* ---------- 7 · Gone digital: online-only, monthly rent nowhere, everything at home ---------- */
/* Two things nothing else covers: a practice with no room record beyond home (roomPaidNA true for
   every session by a different route) and a first year that straddles the 5 April boundary, so
   the same client's sessions land in two tax years. Simple reveal mode, most features off — the
   engines must not assume a tab is switched on. */
function profileOnlineOnly() {
  const r = rng("online");
  const st = baseState();
  st.settings = {
    practiceName: "Anywhere Therapy", taxBasis: "cash", cpdTarget: 25,
    reveal: { mode: "simple", shown: [] },
    features: { trends: false, tax: false, money: false, finances: false, accreditation: false, peer: false },
    useOfHome: { years: { "2025-26": { method: "simplified", hours: 110, appliedAt: "2025-04-06" } } },
  };
  st.rooms.push({ _id: uid("rm"), location: "At home", rate: 0, due: "n/a", billing: "session" });
  st.roomRateHistory.push({ _id: uid("rr"), location: "At home", effectiveFrom: RATE_EPOCH, rate: 0 });
  const specs = [];
  for (let i = 0; i < 11; i++) {
    const startM = intBetween(r, 1, 17);
    const runM = Math.min(startM, intBetween(r, 3, 15));
    const stillOn = startM - runM <= 1;
    specs.push({
      code: "OL" + String(11 + i), start: monthsAgo(startM), end: monthsAgo(startM - runM),
      frequency: pick(r, ["Weekly", "Every 2 weeks"]), rate: pick(r, [50, 55]),
      status: stillOn ? "Ongoing" : "Finished",
      time: pick(r, ["08:00", "12:00", "13:00", "17:00", "18:00", "19:00"]),
      missRate: r() * 0.15, payLagDays: [0, 2], onlineRate: 1,
      location: "At home", upcoming: stillOn,
    });
  }
  specs.forEach((sp) => {
    st.clients.push(makeClient(sp));
    st.rateHistory.push(...rateRows(sp.code, [{ rate: sp.rate }]));
    st.sessions.push(...makeSessions(r, { ...sp, notesGap: 0.1 }, { perSessionRoom: false, latePcts: [100], dnaPct: 100 }));
  });
  supervisionRun(st, r, { from: monthsAgo(17), everyDays: 28, supervisor: "D. Alvi", cost: 60 });
  recurringCost(st, r, { desc: "Video platform", amount: 12, from: monthsAgo(17), cat: "software", tickRate: 0.5 });
  return { st, note: "Online only, 17 months, everything at home, most features switched off (simple reveal mode)." };
}

/* ---------- 8 · Just installed, one client, nothing else ---------- */
/* The floor. Every engine has to survive a practice with a single session in it — this is the
   state a therapist is in on day one, and a crash or a nonsense figure here is the worst possible
   first impression. */
function profileDayOne() {
  const st = baseState();
  st.settings = { practiceName: "GroundWork", taxBasis: "cash" };
  st.rooms.push({ _id: uid("rm"), location: "At home", rate: 0, due: "n/a", billing: "session" });
  st.roomRateHistory.push({ _id: uid("rr"), location: "At home", effectiveFrom: RATE_EPOCH, rate: 0 });
  st.clients.push(makeClient({ code: "A1", status: "Initial session booked", start: addDays(TODAY, -2), frequency: "Weekly" }));
  st.rateHistory.push(...rateRows("A1", [{ rate: 50 }]));
  st.sessions.push({
    _id: uid("sx"), client: "A1", num: 1, date: isoD(addDays(TODAY, -2)), time: "10:00",
    mode: "In-person", location: "At home", room: "", invoice: "", paidDate: "", receipt: "",
    notes: "", adminNote: "", roomPaid: "", roomPaidDate: "", lateCancel: false,
  });
  return { st, note: "One client, one session, two days in. The floor every engine has to survive." };
}

/* ---------- write them out ---------- */
const PROFILES = [
  ["newcomer", profileNewcomer],
  ["established", profileEstablished],
  ["part-time", profilePartTime],
  ["scotland-high", profileScotlandHigh],
  ["chaotic-payments", profileChaotic],
  ["winding-down", profileWindingDown],
  ["online-only", profileOnlineOnly],
  ["day-one", profileDayOne],
];

mkdirSync(outDir, { recursive: true });
const index = [];
for (const [name, fn] of PROFILES) {
  _uid = 0;                                   /* ids restart per profile, so files diff cleanly */
  const { st, note, device } = fn();
  const envelope = {
    app: "GroundWork", version: 1, schemaVersion: SCHEMA_VERSION, note: NOTES_SCOPE,
    /* Not new Date(): a generated-at stamp that moves every run would make every file dirty, and
       restoreConfirm compares this against the device's own last change. Anchored, like the data. */
    exportedAt: ANCHOR + "T09:00:00.000Z",
    /* `device` is NOT part of the backup — it is the per-device localStorage this profile assumes
       (see profileScotlandHigh). Recorded here so the harness can reproduce it and so the file
       says out loud which settings a restore would not carry. */
    testData: { profile: name, anchor: ANCHOR, describes: note, generatedBy: "scripts/make-test-data.mjs",
      device: device || null },
    state: st, audit: [],
  };
  const file = "groundwork-testdata-" + name + ".json";
  writeFileSync(join(outDir, file), JSON.stringify(envelope, null, 1) + "\n");
  const years = {};
  st.sessions.forEach((s) => { years[taxYear(s.date)] = (years[taxYear(s.date)] || 0) + 1; });
  index.push({
    name, file, note,
    clients: st.clients.length, sessions: st.sessions.length,
    first: st.sessions.map((s) => s.date).sort()[0] || null,
    last: st.sessions.map((s) => s.date).sort().pop() || null,
    basis: st.settings.taxBasis || "cash",
    taxYears: Object.keys(years).sort(),
  });
  console.log(name.padEnd(18), String(st.clients.length).padStart(3) + " clients", String(st.sessions.length).padStart(5) + " sessions");
}
writeFileSync(join(outDir, "index.json"), JSON.stringify({ anchor: ANCHOR, schemaVersion: SCHEMA_VERSION, profiles: index }, null, 2) + "\n");
console.log("\nWritten to tests/test-data/ (anchor " + ANCHOR + ")");
