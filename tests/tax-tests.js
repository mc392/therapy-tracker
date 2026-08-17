/* ============================================================================
   GroundWork — tax engine test suite
   ============================================================================

   HOW TO RUN
     1. Serve the app:  python -m http.server 8899 --directory TherapyTracker-web
        (or use the "therapy-tracker" entry in .claude/launch.json)
     2. Open http://127.0.0.1:8899 and wait for it to finish loading.
     3. Paste this whole file into the browser console and press Enter.
        It prints a table and returns a summary object.

   Not served with the app on purpose — this file lives outside TherapyTracker-web/
   so it never deploys to GitHub Pages.

   WHY THE EXPECTED VALUES ARE SPELLED OUT LONGHAND
     Every expectation below is computed from the HMRC rule, not read off the app.
     That is the whole point. Two real bugs were found this way, and one of them
     (payment dates a year early) initially PASSED a test that had been written by
     copying what the app produced. If a test ever needs updating because the app
     changed, re-derive the number from the rule — do not paste in what the code
     now returns.

   RULES ENCODED HERE (2026-27; thresholds frozen to 2027-28)
     Personal allowance   12,570, tapered £1 for every £2 over 100,000
     Basic 20% to 50,270 · Higher 40% to 125,140 · Additional 45% above
     Class 4 NIC          6% between 12,570 and 50,270, then 2%
     Class 2 NIC          not mandatory from 2024/25; payable voluntarily below
                          the Small Profits Threshold (6,725) at £3.50/wk
     Scotland             19% to 15,397 · 20% to 27,491 · 21% to 43,662
                          42% to 75,000 · 45% to 125,140 · 48% above
     Student loans        Plan 1 26,065 · Plan 2 28,470 · Plan 4 32,745
                          Plan 5 25,000 all at 9%; Postgraduate 21,000 at 6%
     Payments on account  due once the liability passes 1,000; two instalments of
                          50%; Class 2 and student loan are never included
     Deadlines            balancing payment 31 Jan FOLLOWING THE END of the tax
                          year (2026-27 -> 31 Jan 2028), second instalment 31 Jul
     Use of home          simplified £10 (25-50 hrs/mo), £18 (51-100), £26 (101+)

   The suite never calls commit(), and restores the live state when it finishes.

   NOT COVERED YET — cancellation charging (schema v5, Aug 2026)
     derive() now returns rate = fullRate x cancelPct/100, where cancelPct is STAMPED on the
     session (s.cancelCharge) rather than read from the policy. Every case below predates that
     and builds sessions with no cancelCharge, so they all take the cancelPct=100 path and the
     multiplication is never exercised here. The suite passing therefore says nothing about it.

     It was verified by hand at the time — with 50/25/0/100% charges spread across all four
     quarters, the MTD quarters still summed to tyNet on both the cash and accruals bases, and
     the v5 backfill left every existing figure unchanged — but a hand check is not a test.
     Adding it is the highest-value next work on this file. Derive the expectations from the
     rule, as above: full fee x the stamped percentage, never from what derive() currently says.
   ============================================================================ */
(function () {
  "use strict";
  if (typeof S === "undefined" || S === null) {
    console.error("Load the app first — S is not initialised.");
    return;
  }

  var savedState = JSON.parse(JSON.stringify(S));
  var savedPension = pensionPcm();
  var TY = "2026-27";

  /* ---------- harness ---------- */
  var results = [];
  function run(name, fn) {
    try {
      var r = fn(), pass;
      if (r.pass !== undefined && r.exp === undefined) pass = r.pass;
      else if (typeof r.exp === "number" && typeof r.act === "number") pass = Math.abs(r.act - r.exp) <= (r.tol || 0.01);
      else if (r.exp !== undefined) pass = (r.act === r.exp);
      else pass = r.pass !== false;
      results.push({ name: name, pass: pass, exp: r.exp, act: r.act, note: r.note || "" });
    } catch (e) {
      results.push({ name: name, pass: false, exp: "-", act: "THREW " + e.message, note: "" });
    }
  }
  var num = function (v) { return typeof v === "number" ? Math.round(v * 100) / 100 : v; };

  /* ---------- scenario builders ---------- */
  function mkState(o) {
    o = o || {};
    var st = {
      clients: [{ _id: "c1", code: "AB", status: "Ongoing", category: "Active", rate: o.fee || 60 },
                { _id: "c2", code: "CD", status: "Finished", category: "Finished", rate: o.fee || 60 }],
      rooms: o.rooms || [{ _id: "r1", location: "At home", rate: 0, due: "n/a", billing: "session" }],
      roomRateHistory: o.roomRateHistory || [{ _id: "h1", location: "At home", effectiveFrom: "2000-01-01", rate: 0 }],
      roomRentHistory: o.roomRentHistory || [],
      rateHistory: [{ _id: "q1", client: "AB", effectiveFrom: "2000-01-01", rate: o.fee || 60 },
                    { _id: "q2", client: "CD", effectiveFrom: "2000-01-01", rate: o.fee || 60 }],
      clientCategories: [{ status: "Ongoing", category: "Active" }, { status: "Finished", category: "Finished" }],
      sessions: o.sessions || [], supervision: o.supervision || [], peerSupervision: o.peerSupervision || [],
      expenses: o.expenses || [], otherIncome: o.otherIncome || [], paidCharges: o.paidCharges || {},
      settings: {
        onboarded: true, betaAck: true,
        taxBasis: o.basis || "accruals", taxRegion: o.region || "rUK",
        studentLoan: o.studentLoan || "none", class2Voluntary: !!o.class2Voluntary,
        useOfHome: o.useOfHome || { years: {} }, features: {}
      }
    };
    S = normalize(st);
    setPensionPcm(o.pension || 0);
    return S;
  }
  /* n weekly sessions, paid on the day unless told otherwise */
  function mkSessions(n, startISO, fee, opts) {
    opts = opts || {};
    var out = [], d = parseD(startISO);
    for (var i = 0; i < n; i++) {
      var iso = isoD(d);
      out.push({
        _id: "s" + i + "_" + iso, client: opts.client || "AB", num: i + 1, date: iso, time: "10:00",
        location: opts.location || "At home", room: "-", notes: "Y", roomPaid: "n/a",
        paidDate: opts.unpaid ? "" : (opts.paidOffsetDays ? isoD(addDays(d, opts.paidOffsetDays)) : iso)
      });
      d = addDays(d, 7);
    }
    return out;
  }

  /* =========================================================================
     1. Income tax, National Insurance, student loans, pension relief
     ========================================================================= */
  var base = function (p) { mkState({}); return ukTax(p, TY); };

  run("IT: nil profit", function () { return { act: base(0).incomeTax, exp: 0 }; });
  run("IT: exactly at the personal allowance", function () { return { act: base(12570).incomeTax, exp: 0 }; });
  run("IT: £20k, basic rate only", function () { return { act: base(20000).incomeTax, exp: (20000 - 12570) * 0.20 }; });
  run("IT: exactly at the basic-rate top", function () { return { act: base(50270).incomeTax, exp: (50270 - 12570) * 0.20 }; });
  run("IT: £60k spans the higher rate", function () {
    return { act: base(60000).incomeTax, exp: (50270 - 12570) * 0.20 + (60000 - 50270) * 0.40 }; });
  run("IT: £110k with the allowance tapered", function () {
    var pa = 12570 - (110000 - 100000) / 2;
    return { act: base(110000).incomeTax, exp: (50270 - pa) * 0.20 + (110000 - 50270) * 0.40 }; });
  run("IT: £130k, allowance gone, additional rate", function () {
    return { act: base(130000).incomeTax,
      exp: 50270 * 0.20 + (125140 - 50270) * 0.40 + (130000 - 125140) * 0.45 }; });
  run("IT: allowance fully tapered at £125,140", function () { return { act: base(125140).pa, exp: 0 }; });

  run("C4: nothing below the lower limit", function () { return { act: base(10000).n1 + base(10000).n2, exp: 0 }; });
  run("C4: £20k at the main rate", function () { return { act: base(20000).n1, exp: (20000 - 12570) * 0.06 }; });
  run("C4: £60k across both rates", function () {
    return { act: base(60000).n1 + base(60000).n2, exp: (50270 - 12570) * 0.06 + (60000 - 50270) * 0.02 }; });

  run("C2: not charged above the Small Profits Threshold", function () { return { act: base(20000).class2, exp: 0 }; });
  run("C2: not charged below it unless opted in", function () { return { act: base(5000).class2, exp: 0 }; });
  run("C2: voluntary below the SPT is 52 weeks", function () {
    mkState({ class2Voluntary: true }); return { act: ukTax(5000, TY).class2, exp: 52 * 3.50 }; });
  run("C2: voluntary ignored above the SPT", function () {
    mkState({ class2Voluntary: true }); return { act: ukTax(20000, TY).class2, exp: 0 }; });
  run("C2: still mandatory in a pre-2024 year", function () {
    mkState({}); return { act: ukTax(20000, "2023-24").class2, exp: 52 * 3.45 }; });

  var sl = function (plan, p) { mkState({ studentLoan: plan }); return ukTax(p, TY).sl; };
  run("SL: Plan 1 at £40k", function () { return { act: sl("plan1", 40000), exp: (40000 - 26065) * 0.09 }; });
  run("SL: Plan 2 at £40k", function () { return { act: sl("plan2", 40000), exp: (40000 - 28470) * 0.09 }; });
  run("SL: Plan 4 at £40k", function () { return { act: sl("plan4", 40000), exp: (40000 - 32745) * 0.09 }; });
  run("SL: Plan 5 at £40k", function () { return { act: sl("plan5", 40000), exp: (40000 - 25000) * 0.09 }; });
  run("SL: Postgraduate at £40k", function () { return { act: sl("pg", 40000), exp: (40000 - 21000) * 0.06 }; });
  run("SL: nothing below the threshold", function () { return { act: sl("plan2", 20000), exp: 0 }; });
  run("SL: none selected", function () { return { act: sl("none", 40000), exp: 0 }; });

  run("Pension: £500/mo grosses up to £7,500", function () {
    mkState({ pension: 500 }); return { act: ukTax(60000, TY).penGross, exp: 500 * 12 / 0.8, tol: 1 }; });
  run("Pension: saves 20% of the gross for a higher-rate payer", function () {
    mkState({}); var without = ukTax(60000, TY).incomeTax;
    mkState({ pension: 500 }); var with_ = ukTax(60000, TY).incomeTax;
    return { act: without - with_, exp: 7500 * 0.20, tol: 1 }; });
  run("Pension: no band benefit for a basic-rate payer", function () {
    mkState({}); var a = ukTax(30000, TY).incomeTax;
    mkState({ pension: 500 }); var b = ukTax(30000, TY).incomeTax;
    return { act: a - b, exp: 0 }; });

  /* =========================================================================
     2. Scottish income tax
     Reference implementation, deliberately separate from the app's.
     ========================================================================= */
  function scotIT(p) {
    var bands = [[15397, 0.19], [27491, 0.20], [43662, 0.21], [75000, 0.42], [125140, 0.45], [Infinity, 0.48]];
    var pa = 12570; if (p > 100000) pa = Math.max(0, 12570 - (p - 100000) / 2);
    var lower = pa, tax = 0;
    bands.forEach(function (b) {
      var amt = Math.max(0, Math.min(p, b[0]) - lower);
      tax += amt * b[1]; lower = Math.max(lower, b[0]);
    });
    return tax;
  }
  var scot = function (p) { mkState({ region: "scotland" }); return ukTax(p, TY); };
  [14000, 20000, 40000, 50000, 90000, 140000].forEach(function (p) {
    run("Scotland: £" + (p / 1000) + "k", function () {
      return { act: scot(p).incomeTax, exp: scotIT(p), tol: 1 }; });
  });
  run("Scotland: Class 4 NIC stays UK-wide", function () {
    var s = scot(40000); mkState({}); var r = ukTax(40000, TY);
    return { act: s.n1 + s.n2, exp: r.n1 + r.n2 }; });
  run("Scotland: pension still extends the bands", function () {
    mkState({ region: "scotland" }); var a = ukTax(50000, TY).incomeTax;
    mkState({ region: "scotland", pension: 500 }); var b = ukTax(50000, TY).incomeTax;
    return { pass: b < a, act: Math.round(a - b), note: "saves " + Math.round(a - b) }; });

  /* =========================================================================
     3. Payments on account and deadlines
     ========================================================================= */
  var busy = function (extra) {
    return mkState(Object.assign({ fee: 800, sessions: mkSessions(50, "2026-04-08", 800) }, extra || {})); };

  run("POA: a small practice owes no instalments", function () {
    mkState({ sessions: mkSessions(40, "2026-04-08", 60) });
    var sc = taxSchedule(TY);
    return { act: sc.jan.poa, exp: 0, note: "tax " + Math.round(sc.calc.total) }; });
  run("POA: engages once the bill passes £1,000", function () {
    busy(); var sc = taxSchedule(TY);
    return { pass: sc.jan.poa > 0, act: Math.round(sc.jan.poa) }; });
  run("POA: each instalment is half the liability", function () {
    busy(); var sc = taxSchedule(TY);
    return { act: sc.jan.poa, exp: poaBase(sc.calc) / 2, tol: 0.5 }; });
  run("POA: the first January is 150% of the tax", function () {
    busy(); var sc = taxSchedule(TY);
    return { act: sc.jan.total, exp: sc.calc.total * 1.5, tol: 1 }; });
  run("POA: July matches January's instalment", function () {
    busy(); var sc = taxSchedule(TY);
    return { act: sc.jul.total, exp: sc.jan.poa, tol: 0.5 }; });
  run("POA: Class 2 and student loan are excluded", function () {
    busy({ studentLoan: "plan2" }); var sc = taxSchedule(TY);
    return { act: poaBase(sc.calc), exp: sc.calc.total - sc.calc.sl - sc.calc.class2, tol: 0.5,
      note: "SL " + Math.round(sc.calc.sl) + " excluded" }; });
  run("POA: first-year flag when nothing was paid on account before", function () {
    busy(); return { pass: taxSchedule(TY).firstYear === true }; });
  run("POA: prior-year instalments reduce the balancing payment", function () {
    mkState({ fee: 800, sessions: mkSessions(50, "2025-04-08", 800).concat(mkSessions(50, "2026-04-08", 800)) });
    var sc = taxSchedule(TY);
    return { pass: sc.poaPrev > 0 && sc.jan.balancing < sc.calc.total,
      act: Math.round(sc.jan.balancing), note: "already on account " + Math.round(sc.poaPrev * 2) }; });

  /* Deadlines: 31 January FOLLOWING THE END of the tax year. 2026-27 ends 5 Apr
     2027, so the balancing payment is 31 Jan 2028. These caught an off-by-one-year. */
  run("Dates: 2026-27 balancing payment is 31 Jan 2028", function () {
    busy(); return { act: isoD(taxSchedule(TY).jan.date), exp: "2028-01-31" }; });
  run("Dates: 2026-27 second instalment is 31 Jul 2028", function () {
    busy(); return { act: isoD(taxSchedule(TY).jul.date), exp: "2028-07-31" }; });
  run("Dates: 2025-26 balancing payment is 31 Jan 2027", function () {
    mkState({ fee: 800, sessions: mkSessions(50, "2025-04-08", 800) });
    return { act: isoD(taxSchedule("2025-26").jan.date), exp: "2027-01-31" }; });
  run("Dates: the next payment is always in the future", function () {
    busy(); var n = nextTaxPayment();
    return { pass: !!n && n.when >= today(), act: n ? isoD(n.when) : "none" }; });

  /* =========================================================================
     4. Cash versus accruals
     ========================================================================= */
  var arrears = function () {
    return { sessions: mkSessions(20, "2026-04-08", 60).concat(mkSessions(5, "2027-02-03", 60, { unpaid: true })) }; };

  run("Basis: accruals counts sessions not yet paid for", function () {
    mkState(Object.assign({ basis: "accruals" }, arrears()));
    return { act: tyNet(TY, false), exp: 25 * 60 }; });
  run("Basis: cash excludes them", function () {
    mkState(Object.assign({ basis: "cash" }, arrears()));
    return { act: tyNet(TY, false), exp: 20 * 60 }; });
  run("Basis: cash counts a session in the year it was PAID", function () {
    mkState({ basis: "cash", sessions: [{ _id: "x", client: "AB", num: 1, date: "2027-03-01", time: "10:00",
      location: "At home", room: "-", notes: "Y", roomPaid: "n/a", paidDate: "2027-04-20" }] });
    return { act: tyNet("2026-27", false), exp: 0, note: "lands in 2027-28 = " + tyNet("2027-28", false) }; });
  run("Basis: accruals counts it in the year it was seen", function () {
    mkState({ basis: "accruals", sessions: [{ _id: "x", client: "AB", num: 1, date: "2027-03-01", time: "10:00",
      location: "At home", room: "-", notes: "Y", roomPaid: "n/a", paidDate: "2027-04-20" }] });
    return { act: tyNet("2026-27", false), exp: 60 }; });
  run("Basis: an unticked cost still counts, on its due date", function () {
    mkState({ basis: "cash", expenses: [{ _id: "e1", desc: "Insurance", amount: 200, date: "2026-06-01",
      recurrence: "once", cat: "insurance" }] });
    var b = tyBounds(TY); return { act: ledgerBetween(b.start, b.end, {}).expenses, exp: 200 }; });
  run("Basis: ticking it into the next year moves it out", function () {
    mkState({ basis: "cash", expenses: [{ _id: "e1", desc: "Insurance", amount: 200, date: "2026-06-01",
      recurrence: "once", cat: "insurance" }], paidCharges: { "exp:e1|2026-06-01": "2027-05-02" } });
    var b = tyBounds(TY); return { act: ledgerBetween(b.start, b.end, {}).expenses, exp: 0 }; });

  /* =========================================================================
     5. Ledger, recurrence and tax-year boundaries
     ========================================================================= */
  var B = function () { return tyBounds(TY); };
  run("Ledger: a monthly cost expands to 12", function () {
    mkState({ expenses: [{ _id: "e", desc: "Wifi", amount: 30, date: "2026-04-10", recurrence: "monthly", cat: "phone" }] });
    return { act: ledgerBetween(B().start, B().end, {}).expenses, exp: 360 }; });
  run("Ledger: a weekly cost expands to 52 or 53", function () {
    mkState({ expenses: [{ _id: "e", desc: "Parking", amount: 5, date: "2026-04-08", recurrence: "weekly", cat: "travel" }] });
    var n = ledgerBetween(B().start, B().end, {}).expenses / 5;
    return { pass: n === 52 || n === 53, act: n }; });
  run("Ledger: quarterly expands to 4", function () {
    mkState({ expenses: [{ _id: "e", desc: "Sub", amount: 100, date: "2026-04-15", recurrence: "quarterly", cat: "software" }] });
    return { act: ledgerBetween(B().start, B().end, {}).expenses, exp: 400 }; });
  run("Ledger: annual expands to 1", function () {
    mkState({ expenses: [{ _id: "e", desc: "Insurance", amount: 180, date: "2026-05-01", recurrence: "annually", cat: "insurance" }] });
    return { act: ledgerBetween(B().start, B().end, {}).expenses, exp: 180 }; });
  run("Ledger: an end date stops the series", function () {
    mkState({ expenses: [{ _id: "e", desc: "Old", amount: 10, date: "2026-04-10", recurrence: "monthly",
      endDate: "2026-07-10", cat: "other" }] });
    return { act: ledgerBetween(B().start, B().end, {}).expenses, exp: 40, note: "Apr-Jul inclusive" }; });
  run("Ledger: the 31st clamps in short months without drifting", function () {
    mkState({ expenses: [{ _id: "e", desc: "X", amount: 1, date: "2027-01-31", recurrence: "monthly",
      endDate: "2027-04-30", cat: "other" }] });
    var occ = moneyOccurrences(S.expenses[0], parseD("2027-01-01"), parseD("2027-05-01")).map(function (o) { return isoD(o.date); });
    return { act: occ.join(","), exp: "2027-01-31,2027-02-28,2027-03-31,2027-04-30" }; });
  run("Ledger: 5 April is the old year, 6 April the new", function () {
    mkState({ expenses: [{ _id: "a", desc: "A", amount: 99, date: "2027-04-05", recurrence: "once", cat: "other" },
                         { _id: "b", desc: "B", amount: 77, date: "2027-04-06", recurrence: "once", cat: "other" }] });
    var now = ledgerBetween(B().start, B().end, {}).expenses;
    var nxt = ledgerBetween(tyBounds("2027-28").start, tyBounds("2027-28").end, {}).expenses;
    return { act: now + "/" + nxt, exp: "99/77" }; });
  run("Ledger: separate-work income never enters the practice net", function () {
    mkState({ otherIncome: [{ _id: "i", desc: "Tutoring", amount: 5000, date: "2026-06-01",
      recurrence: "once", scope: "personal", cat: "other" }] });
    var l = ledgerBetween(B().start, B().end, {});
    return { act: l.total, exp: 0, note: "reported separately as " + l.personalIncome }; });
  run("Ledger: monthly practice income Jun-Apr is 11 payments", function () {
    mkState({ otherIncome: [{ _id: "i", desc: "Sublet", amount: 200, date: "2026-06-01",
      recurrence: "monthly", scope: "practice", cat: "sublet" }] });
    return { act: ledgerBetween(B().start, B().end, {}).otherIncome, exp: 2200 }; });

  /* =========================================================================
     6. Use of home
     ========================================================================= */
  run("UoH: nothing is claimed by default", function () { mkState({}); return { act: uohMonthly(TY), exp: 0 }; });
  [[0, 0], [24, 0], [25, 10], [50, 10], [51, 18], [100, 18], [101, 26], [300, 26]].forEach(function (pair) {
    run("UoH: " + pair[0] + " hrs/month = £" + pair[1], function () {
      return { act: uohRate(pair[0]), exp: pair[1] }; });
  });
  run("UoH: actual = costs x room share x business share", function () {
    mkState({ useOfHome: { years: { "2026-27": { method: "actual", rooms: 5, workRooms: 1, businessPct: 60,
      costs: { rent: 9000, councilTax: 1500, gas: 600, electric: 600, water: 300, broadband: 0 },
      appliedAt: "2026-04-06" } } } });
    return { act: uohActualAnnual(uohConfig(TY)), exp: 12000 * (1 / 5) * 0.60 }; });
  run("UoH: it reaches the tax figures", function () {
    mkState({ useOfHome: { years: { "2026-27": { method: "simplified", hours: 60, appliedAt: "2026-04-06" } } } });
    return { act: ledgerBetween(B().start, B().end, {}).useOfHome, exp: 18 * 12 }; });
  run("UoH: a different method in each tax year", function () {
    mkState({ useOfHome: { years: {
      "2025-26": { method: "actual", rooms: 5, workRooms: 1, businessPct: 60, costs: { rent: 12000 }, appliedAt: "2025-04-06" },
      "2026-27": { method: "simplified", hours: 60, appliedAt: "2026-04-06" } } } });
    var a = ledgerBetween(tyBounds("2025-26").start, tyBounds("2025-26").end, {}).useOfHome;
    var c = ledgerBetween(B().start, B().end, {}).useOfHome;
    return { act: Math.round(a) + "/" + Math.round(c), exp: "1440/216" }; });
  run("UoH: a year with no choice carries the last one forward", function () {
    mkState({ useOfHome: { years: { "2026-27": { method: "simplified", hours: 60, appliedAt: "2026-04-06" } } } });
    var f = uohForYear("2027-28");
    return { act: f.cfg.method, exp: "simplified", note: "inherited from " + f.from }; });

  /* =========================================================================
     7. Making Tax Digital
     ========================================================================= */
  run("MTD: the quarters tile the tax year exactly", function () {
    mkState({}); var q = mtdQuarters(TY), b = tyBounds(TY);
    var contiguous = q.slice(1).every(function (x, i) { return Math.round((x.from - q[i].to) / 86400000) === 1; });
    return { pass: isoD(q[0].from) === isoD(b.start) && isoD(q[3].to) === isoD(b.end) && contiguous,
      act: q.map(function (x) { return isoD(x.from) + ".." + isoD(x.to); }).join(" | ") }; });
  run("MTD: room rent to box 21, supervision to box 28", function () {
    mkState({ rooms: [{ _id: "r2", location: "Studio", rate: 0, due: "EOM", billing: "monthly" }],
      roomRateHistory: [{ _id: "h2", location: "Studio", effectiveFrom: "2000-01-01", rate: 0 }],
      roomRentHistory: [{ _id: "m1", location: "Studio", effectiveFrom: "2026-04-01", amount: 300 }],
      supervision: [{ _id: "v1", date: "2026-06-01", supervisor: "J", count: 1, cost: 60, clients: [] }] });
    var bx = mtdExpenseBoxes(B().start, B().end);
    return { act: Math.round(bx[21] || 0) + "/" + Math.round(bx[28] || 0), exp: "3600/60" }; });
  run("MTD: per-session room fees also land in box 21", function () {
    mkState({ rooms: [{ _id: "r2", location: "Rooms", rate: 15, due: "EOM", billing: "session" }],
      roomRateHistory: [{ _id: "h2", location: "Rooms", effectiveFrom: "2000-01-01", rate: 15 }],
      sessions: mkSessions(10, "2026-05-05", 60, { location: "Rooms" }) });
    return { act: mtdExpenseBoxes(B().start, B().end)[21], exp: 150 }; });
  run("MTD: the export has four periods with box totals", function () {
    mkState({ expenses: [{ _id: "e", desc: "Wifi", amount: 30, date: "2026-04-10", recurrence: "monthly", cat: "phone" }] });
    var real = window.download, cap = null;
    window.download = function (n, t) { cap = { n: n, t: t }; };
    mtdExport(TY); window.download = real;
    var j = JSON.parse(cap.t);
    return { pass: j.periods.length === 4 && j.periods[0].expenses.length > 0 && !!j.basis,
      act: j.periods.length + " periods, basis=" + j.basis }; });

  /* =========================================================================
     8. Reconciliation across realistic practice profiles
     The invariant that matters: the breakdown sheet, the four MTD quarters and
     tyNet must always agree. A mismatch means a cost reached one but not another.
     ========================================================================= */
  var profiles = {
    "part-time starter": { sessions: mkSessions(30, "2026-04-08", 45) },
    "established": { fee: 65, sessions: mkSessions(48, "2026-04-08", 65),
      expenses: [{ _id: "e1", desc: "Insurance", amount: 180, date: "2026-05-01", recurrence: "once", cat: "insurance" }] },
    "room-renting": { rooms: [{ _id: "r2", location: "Studio", rate: 0, due: "EOM", billing: "monthly" }],
      roomRateHistory: [{ _id: "h2", location: "Studio", effectiveFrom: "2000-01-01", rate: 0 }],
      roomRentHistory: [{ _id: "m1", location: "Studio", effectiveFrom: "2026-04-01", amount: 400 }],
      sessions: mkSessions(40, "2026-04-08", 70, { location: "Studio" }) },
    "mixed income": { sessions: mkSessions(40, "2026-04-08", 60),
      otherIncome: [{ _id: "i1", desc: "Sublet", amount: 200, date: "2026-05-01", recurrence: "monthly", scope: "practice", cat: "sublet" },
                    { _id: "i2", desc: "Tutoring", amount: 3000, date: "2026-07-01", recurrence: "once", scope: "personal", cat: "other" }] },
    "cash with arrears": { basis: "cash",
      sessions: mkSessions(30, "2026-04-08", 60).concat(mkSessions(8, "2027-01-06", 60, { unpaid: true })) },
    "everything on": { basis: "cash", fee: 70, sessions: mkSessions(45, "2026-04-08", 70, { paidOffsetDays: 14 }),
      supervision: [{ _id: "v", date: "2026-06-01", supervisor: "J", count: 1, cost: 60, clients: [] }],
      peerSupervision: [{ _id: "p", date: "2026-07-01", with: "Group", hours: 1.5, cost: 10 }],
      expenses: [{ _id: "e", desc: "Wifi", amount: 30, date: "2026-04-10", recurrence: "monthly", cat: "phone" }],
      otherIncome: [{ _id: "i", desc: "Sublet", amount: 150, date: "2026-05-01", recurrence: "monthly", scope: "practice", cat: "sublet" }],
      useOfHome: { years: { "2026-27": { method: "simplified", hours: 60, appliedAt: "2026-04-06" } } } }
  };
  Object.keys(profiles).forEach(function (k) {
    run("Reconcile [" + k + "]: breakdown = quarters = tyNet", function () {
      mkState(profiles[k]);
      var b = tyBounds(TY);
      var bd = profitBreakdown(b.start, b.end).net;
      var qs = mtdQuarters(TY).reduce(function (a, q) { return a + mtdPeriod(q).net; }, 0);
      var tn = tyNet(TY, false);
      return { pass: Math.abs(bd - tn) < 1 && Math.abs(qs - tn) < 1,
        act: Math.round(bd) + "/" + Math.round(qs) + "/" + Math.round(tn) };
    });
  });

  /* ---------- restore and report ---------- */
  S = savedState; setPensionPcm(savedPension);
  try { normalize(S); if (typeof go === "function") go("home"); } catch (e) {}

  var passed = results.filter(function (r) { return r.pass; }).length;
  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) {
    console.log((r.pass ? "PASS  " : "FAIL  ") + r.name +
      (r.exp !== undefined ? ("  exp=" + num(r.exp) + " act=" + num(r.act)) : "") +
      (r.note ? "  [" + r.note + "]" : ""));
  });
  console.log("\n" + passed + "/" + results.length + " passed" + (failed.length ? " — " + failed.length + " FAILED" : ""));
  return { passed: passed, total: results.length,
    failures: failed.map(function (r) { return r.name + ": exp=" + num(r.exp) + " act=" + num(r.act); }) };
})();
