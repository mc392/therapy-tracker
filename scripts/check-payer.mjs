/* Who pays for the work, and what that changes.
 *
 *   npm run test:payer
 *
 * WHY THIS EXISTS
 *   GroundWork assumed the person in the room was the person who paid, and the assumption ran the
 *   whole length of the money chain. Lifting it touches derive(), the Unpaid worklist, three
 *   analytics, the documents and the tax engine at once - and every one of those failures is
 *   SILENT. Nothing throws when a salaried counsellor is told she is owed nine thousand pounds by
 *   people who were never billed, and nothing throws when a tax estimate comes out three thousand
 *   pounds light because it gave the practice a personal allowance the salary had already used.
 *
 *   Four properties, all of them rules rather than readings taken off the functions:
 *     1. `payer` absent means "the client pays me". Every record written before this existed is
 *        that shape, so this is the compatibility test and it has to hold exactly.
 *     2. A session nobody pays for is never overdue, never in the Unpaid list, never on its badge
 *        and never in Outstanding - but it still counts for everything clinical: hours,
 *        attendance, the Incomplete worklist, supervision, reports.
 *     3. A money analytic needs MONEY, not sessions. Ten unpaid sessions is not an hourly rate.
 *     4. Employment income sits UNDERNEATH practice profit: the allowance and the bands are used
 *        by the wage first. Class 4 and Class 2 stay on profit alone, because they are charges on
 *        self-employment and the employer deals with Class 1.
 *
 * Expected values are derived here from the HMRC rule and from the documented behaviour, never
 * pasted from what the app returned - the same discipline, for the same reason, as the tax suite.
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
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.normalize === "function" && typeof window.go === "function");

const results = await page.evaluate(async () => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: !!cond, detail: detail == null ? "" : String(detail) });
  const near = (name, got, want, tol) => ok(name + " (want " + want + ")", Math.abs(got - want) <= (tol == null ? 0.005 : tol), got);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.commit = async () => true;                      /* reads and in-memory edits only */

  /* A practice of `n` weekly sessions ending a fortnight ago, so every one of them is PAST and
     therefore old enough to be chased. Clients are handed the payer under test. */
  const build = (clients, n) => {
    n = n || 20;
    const t = today();
    const sessions = [];
    clients.forEach((c, ci) => {
      for (let i = 0; i < n; i++) {
        const d = addDays(t, -14 - i * 7);
        sessions.push({ _id: "s" + ci + "_" + i, client: c.code, num: n - i, date: isoD(d), time: "10:00",
          mode: "In-person", location: "At home", room: "-", notes: "Y", attendConfirmed: true,
          paidDate: "", roomPaid: "", invoice: "" });
      }
    });
    S = normalize({
      clients: clients.map((c, i) => Object.assign({ _id: "c" + i, status: "Ongoing", frequency: "Weekly", rate: c.rate }, c)),
      sessions, rooms: [{ _id: "r1", location: "At home", rate: 0, billing: "session", due: "n/a" }],
      rateHistory: clients.map((c, i) => ({ _id: "rh" + i, client: c.code, effectiveFrom: "2000-01-01", rate: c.rate })),
      settings: { onboarded: true, taxAck: true, taxBasis: "accruals", features: {}, coach: { off: true, seen: [] } }
    });
    tyMemoClear();
  };

  /* ============ 1. absent means "the client pays me" ============ */
  build([{ code: "AAA", rate: 60 }]);                     /* no `payer` written at all */
  ok("a client with no payer field reads as 'client'", payerOf(S.clients[0]) === "client", payerOf(S.clients[0]));
  ok("normalize does not write a payer field", S.clients[0].payer === undefined, JSON.stringify(S.clients[0].payer));
  ok("an unrecognised stored key falls back to 'client'", payerOf({ payer: "sponsor" }) === "client");
  ok("a session for them earns", sessionEarns(S.sessions[0]) === true);
  let der = derivedSessions();
  ok("every past unpaid session of a private client is overdue", der.filter((x) => x.d.overdue).length === 20, der.filter((x) => x.d.overdue).length);
  ok("…and Outstanding is 20 × the fee", der.filter((x) => x.d.overdue).reduce((a, x) => a + x.d.rate, 0) === 1200);

  /* ============ 2. nobody pays: no debt, but all the clinical work still counts ============ */
  build([{ code: "BBB", rate: 0, payer: "none" }]);
  ok("a salaried client's sessions do not earn", sessionEarns(S.sessions[0]) === false);
  der = derivedSessions();
  ok("none of them is overdue", der.filter((x) => x.d.overdue).length === 0, der.filter((x) => x.d.overdue).length);
  ok("Outstanding is nothing", der.filter((x) => x.d.overdue).reduce((a, x) => a + x.d.rate, 0) === 0);
  ok("the attention feed raises no unpaid row", !attentionItems().some((i) => /unpaid/i.test(i.msg)),
    attentionItems().map((i) => i.msg.replace(/<[^>]+>/g, "")).join(" | "));
  ok("the Goals payment ring is not stuck at 0%", gameGoals().paidPct === 100, gameGoals().paidPct);
  ok("…and reports nothing overdue", gameGoals().over === 0, gameGoals().over);
  /* The clinical half is untouched - that is the whole point of the split. */
  ok("the sessions still exist", S.sessions.length === 20);
  ok("they are still counted as attended", der.filter((x) => !isCancelled(x.s)).length === 20);
  ok("the Incomplete worklist is unaffected by who pays", incompleteRows(der).length === 0, incompleteRows(der).length);
  /* One left unanswered must still be chased for its NOTES, just never for money. */
  S.sessions[0].notes = ""; tyMemoClear();
  ok("an unwritten-up salaried session is still incomplete", incompleteRows(derivedSessions()).length === 1);
  S.sessions[0].notes = "Y"; tyMemoClear();
  /* Reports are what a salaried or placement practitioner actually opens the app for. */
  const rep = reportBuild({ _id: "t", name: "t", template: "bacp-trainee", range: "all", from: "", to: "",
    sections: ["hours"], opts: { hourMode: "clinical" } });
  const hoursBlock = (rep.blocks || []).find((b) => /hours/i.test(b.title || ""));
  ok("a report still counts 20 clinical hours for work nobody paid for",
    !!hoursBlock && /\b20\b/.test(JSON.stringify(hoursBlock)), hoursBlock ? hoursBlock.title : "no block");

  /* ============ 2b. the Unpaid worklist and its badge ============ */
  build([{ code: "CCC", rate: 0, payer: "none" }]);
  sessFilter = { q: "", seg: "unpaid", view: "list" };
  go("sessions"); await sleep(250);
  const badge = document.querySelector('#seg button[data-s="unpaid"] .badge');
  ok("the Unpaid tab carries no badge for a practice that bills nothing", !badge, badge && badge.textContent);
  ok("the Unpaid worklist is empty", /Nothing overdue/i.test(document.querySelector("#slist").textContent),
    document.querySelector("#slist").textContent.slice(0, 60));
  /* and the same screen for a private caseload still works exactly as it did */
  build([{ code: "DDD", rate: 60 }]);
  go("sessions"); await sleep(250);
  const badge2 = document.querySelector('#seg button[data-s="unpaid"] .badge');
  ok("a private caseload still gets the badge", !!badge2 && badge2.textContent.trim() === "20", badge2 && badge2.textContent);

  /* ============ 3. a money analytic needs money ============ */
  build([{ code: "EEE", rate: 0, payer: "none" }], 40);   /* forty sessions, a year of them */
  ok("no client pays, so the practice has no paying work", anyPayingClient() === false);
  const hr = anaHourlyRate();
  ok("the hourly rate refuses rather than reporting £0.00/hr", hr.ready === false, JSON.stringify(hr.rate));
  ok("…and says what it is waiting for", /fee/i.test(hr.need || ""), hr.need);
  const fl = anaFloor();
  ok("your floor refuses rather than three £0 months", fl.ready === false, fl.ready && fl.median);
  ok("…and says what it is waiting for", /fee/i.test(fl.need || ""), fl.need);
  /* The non-money sections must be entirely unaffected - this practice is busy, just not paid. */
  ok("capacity still reports on a salaried caseload", anaCapacity().ready === true, anaCapacity().need);
  /* Mixed: the same forty sessions, but half of them billed. The gate is about money existing. */
  build([{ code: "FFF", rate: 0, payer: "none" }, { code: "GGG", rate: 60 }], 40);
  ok("one paying client is enough for the practice to have paying work", anyPayingClient() === true);
  ok("the hourly rate is ready once somebody pays", anaHourlyRate().ready === true, anaHourlyRate().need);
  ok("…and it counts only the fees that exist", anaHourlyRate().revenue === 40 * 60, anaHourlyRate().revenue);
  ok("…while the hours behind it count every session seen", anaHourlyRate().attended === 80, anaHourlyRate().attended);

  /* ============ 3b. a fee on the record is not income once nobody pays it ============
     The case this guards: a private client moves onto a salaried or placement footing. Their rate
     history stays - it has to, the past sessions were really charged at it - so every aggregate
     that adds fees up has to ask who pays rather than trusting the number. */
  const ty = taxYear(addDays(today(), -14 - 19 * 7));   /* the tax year the built sessions sit in */
  build([{ code: "NNN", rate: 60 }]);
  settings().taxBasis = "accruals"; tyMemoClear();
  const netPrivate = tyNet(ty, false), incPrivate = tyIncome(ty, false);
  ok("a private caseload's fees reach the tax figures", incPrivate > 0, incPrivate);
  /* the very same sessions, the very same rate history, one field changed */
  S.clients[0].payer = "none"; tyMemoClear();
  ok("switching a client to salaried takes their fees out of practice income", tyIncome(ty, false) === 0,
    tyIncome(ty, false) + " (was " + incPrivate + ")");
  ok("…and out of the profit the tax is worked out on", tyNet(ty, false) < netPrivate,
    tyNet(ty, false) + " (was " + netPrivate + ")");
  ok("…and out of what a session is said to earn", anaHourlyRate().ready === false);
  S.clients[0].payer = "client"; tyMemoClear();
  ok("switching back restores every figure exactly", tyIncome(ty, false) === incPrivate && tyNet(ty, false) === netPrivate,
    tyIncome(ty, false) + "/" + tyNet(ty, false));

  /* ============ 3c. the client profile says something useful either way ============ */
  build([{ code: "OOO", rate: 0, payer: "none" }], 10);
  clientProfile(S.clients[0]); await sleep(200);
  let sheet = document.querySelector("#sheetBody").textContent;
  ok("a salaried client's profile leads on hours, not money", /Clinical hours/.test(sheet), sheet.slice(0, 120));
  ok("…and does not offer a lifetime-billed figure", !/Lifetime billed/.test(sheet));
  ok("…and does not draw a monthly income chart", !/Monthly income/.test(sheet));
  ok("…and says who pays instead", /Nobody pays per session/i.test(sheet));
  closeSheet(); await sleep(100);
  build([{ code: "PPP", rate: 60 }], 10);
  clientProfile(S.clients[0]); await sleep(200);
  sheet = document.querySelector("#sheetBody").textContent;
  ok("a private client's profile is unchanged", /Lifetime billed/.test(sheet) && /Monthly income/.test(sheet), sheet.slice(0, 120));
  closeSheet(); await sleep(100);

  /* ============ 4. the organisation that pays ============ */
  build([{ code: "HHH", rate: 75, payer: "org", payerId: "p1", authorised: 6 }], 8);
  settings().payers = [{ _id: "p1", name: "Health Assured", contact: "invoices@example.org", invoiceDays: 45, defaultRate: 75 }];
  tyMemoClear();
  ok("an org-paid session still earns", sessionEarns(S.sessions[0]) === true);
  ok("…and is still chased as outstanding", derivedSessions().filter((x) => x.d.overdue).length === 8);
  ok("the bill is addressed to the organisation", (clientPayerOrg(S.clients[0]) || {}).name === "Health Assured",
    JSON.stringify(clientPayerOrg(S.clients[0])));
  const au = clientAuthorised(S.clients[0]);
  ok("authorised sessions count what went ahead", au && au.used === 8, au && au.used);
  ok("…and report the overrun against the cap", au && au.over === 2 && au.left === 0, au && JSON.stringify(au));
  /* A DNA is not a session the funder pays for, so it must not use an authorisation up. */
  S.sessions[0].cancelKind = "dna"; S.sessions[0].lateCancel = false; tyMemoClear();
  ok("a DNA does not use up an authorised session", clientAuthorised(S.clients[0]).used === 7, clientAuthorised(S.clients[0]).used);
  delete S.sessions[0].cancelKind; tyMemoClear();
  /* The document, built through the real builder, with exactly the four arguments the native
     shell re-declares. A fifth would be dropped silently on an iPhone. */
  ok("receiptHTML still takes exactly four arguments", receiptHTML.length === 4, receiptHTML.length);
  const rows = receiptRows(S.clients[0], "all").rows;
  const inv = receiptHTML(S.clients[0], rows, "All sessions", "invoice");
  ok("the invoice names the organisation", /Health Assured/.test(inv.html));
  ok("…and where it goes", /invoices@example\.org/.test(inv.html));
  ok("…and still carries the client CODE, never a name", /HHH/.test(inv.html));
  ok("…and uses the organisation's own payment terms, not the practice default",
    inv.html.includes(fmtD(addDays(today(), 45))), inv.html.match(/Due [^<]*/g));
  ok("the reference is unchanged in shape", /^INV-/.test(inv.num), inv.num);
  /* The chaser is written to the organisation, not to the person. */
  const chase = chaseText(S.clients[0], derivedSessions().filter((x) => x.d.overdue));
  ok("the chaser is addressed to an organisation", /Hello,/.test(chase) && !/^Hi,/.test(chase), chase.split("\n")[0]);
  ok("…and refers to the client by reference", /HHH/.test(chase));
  /* Deleting an organisation must not leave clients billed to nobody. */
  ok("a client pointing at a missing organisation resolves to no organisation",
    clientPayerOrg({ code: "ZZZ", payer: "org", payerId: "gone" }) === null);
  ok("a stale payerId on a private client is ignored",
    clientPayerOrg({ code: "ZZZ", payer: "client", payerId: "p1" }) === null);

  /* ============ 4c. Sessions › Unpaid groups by age, or by who owes it ============ */
  build([{ code: "R1", rate: 50, payer: "org", payerId: "zeta" },
         { code: "R2", rate: 50, payer: "org", payerId: "alpha" },
         { code: "R3", rate: 50 }], 3);
  settings().payers = [{ _id: "zeta", name: "Zurich Health" }, { _id: "alpha", name: "Aviva" }];
  tyMemoClear();
  unpaidBy = "age";
  sessFilter = { q: "", seg: "unpaid", view: "list" };
  go("sessions"); await sleep(300);
  ok("the grouping toggle appears once an organisation owes something", !!document.querySelector("#upBy"));
  let heads = [...document.querySelectorAll(".grphead")].map((h) => h.textContent);
  ok("by age, the headings are age bands", heads.some((h) => /week|month/i.test(h)), heads.join(" | "));
  ok("…and each row names who owes it", !!document.querySelector(".payrow .chip"));
  document.querySelector('#upBy button[data-b="payer"]').click(); await sleep(250);
  heads = [...document.querySelectorAll(".grphead")].map((h) => h.textContent.split("·")[0].trim());
  /* Alphabetical by the NAME shown, with direct clients last - not by the id the key is built
     from, which is a timestamp and would be no order at all. */
  ok("by payer, organisations come first in name order", heads[0] === "Aviva" && heads[1] === "Zurich Health", heads.join(" | "));
  ok("…and clients who pay directly come last", /Paid by the client/.test(heads[heads.length - 1]), heads.join(" | "));
  ok("…and the rows drop the chip that would repeat the heading", !document.querySelector(".payrow .chip"));
  const tick = document.querySelector("[data-tickorg]");
  ok("each organisation offers a Tick all", !!tick);
  tick.click(); await sleep(120);
  ok("…which ticks that organisation's sessions only",
    document.querySelectorAll(".pchk:checked").length === 3, document.querySelectorAll(".pchk:checked").length);
  tick.click(); await sleep(120);
  ok("…and unticks them again", document.querySelectorAll(".pchk:checked").length === 0);
  /* With nobody but direct clients owing, the toggle must not appear at all. */
  build([{ code: "R4", rate: 50 }], 3);
  go("sessions"); await sleep(300);
  ok("a practice with no organisations never sees the toggle", !document.querySelector("#upBy"));
  ok("…and is grouped by age as it always was", [...document.querySelectorAll(".grphead")].some((h) => /week|month/i.test(h.textContent)));

  /* ============ 4b. the form writes what it showed, and never loses the sheet ============
     The failure this guards is the one check-behaviour.mjs exists for: a form that reads a control
     it no longer renders, or opens a second sheet over itself and throws away what was typed.
     #sheetBody is a single host, so anything that calls openSheet() from inside a form destroys
     that form. */
  build([{ code: "QQQ", rate: 60 }], 2);
  settings().payers = [{ _id: "p9", name: "Vitality", contact: "claims@example.org", invoiceDays: 30 }];
  clientForm(S.clients[0]); await sleep(200);
  const sb = document.querySelector("#sheetBody");
  ok("the client form offers a Who pays control", !!sb.querySelector("#c_payer"));
  ok("the organisation row is hidden while the client pays", sb.querySelector("#c_orgWrap").hidden === true);
  ok("there is no 'add one from here' option that would replace this sheet",
    !/Add an organisation/i.test(sb.querySelector("#c_payerOrg").innerHTML), sb.querySelector("#c_payerOrg").innerHTML.slice(0, 80));
  sb.querySelector("#c_payer").value = "org";
  sb.querySelector("#c_payer").dispatchEvent(new Event("change"));
  await sleep(80);
  ok("choosing an organisation reveals the row", sb.querySelector("#c_orgWrap").hidden === false);
  ok("…listing the organisations that exist", /Vitality/.test(sb.querySelector("#c_payerOrg").innerHTML));
  sb.querySelector("#c_payerOrg").value = "p9";
  sb.querySelector("#c_auth").value = "6";
  sb.querySelector("#cSave").click(); await sleep(250);
  const saved = S.clients[0];
  ok("saving writes the payer key, not the label", saved.payer === "org", saved.payer);
  ok("…and the organisation by id", saved.payerId === "p9", saved.payerId);
  ok("…and the authorisation", saved.authorised === 6, saved.authorised);
  /* Switching back must clear the organisation, or a stale id survives the change of mind. */
  clientForm(S.clients[0]); await sleep(200);
  const sb2 = document.querySelector("#sheetBody");
  sb2.querySelector("#c_payer").value = "none";
  sb2.querySelector("#c_payer").dispatchEvent(new Event("change"));
  sb2.querySelector("#cSave").click(); await sleep(250);
  ok("switching away from an organisation clears its id", !S.clients[0].payerId, S.clients[0].payerId);
  ok("…and the authorisation with it", S.clients[0].authorised == null, S.clients[0].authorised);
  ok("…and the client now earns nothing", sessionEarns(S.sessions[0]) === false);
  closeSheet(); await sleep(100);

  /* ============ 4d. the set-up surface, and the fee box that must go away ============
     Three things a reader hit in the first five minutes of using this:
       - setup says "add an organisation under Practice › Rooms & payers" and the card that does
         it was gated on an organisation already existing. Chicken-and-egg: there was no way in.
       - the tab still said "Rooms" while being told to find payers on it.
       - picking "nobody pays per session" left a fee box on screen asking to be filled in. */
  build([{ code: "S1", rate: 60 }], 2);
  settings().payers = [];                                  /* a practice that has never met one */
  tyMemoClear();
  /* The organisations live under Clients, on that screen's own inner strip - who funds a client
     is a fact about the client. Rooms is rooms again. */
  pracTab = "rooms"; clientsTab = "list";
  go("practice"); await sleep(300);
  ok("Rooms is labelled Rooms",
    [...document.querySelectorAll("#crtab button")].some((b) => b.textContent.trim() === "Rooms"),
    [...document.querySelectorAll("#crtab button")].map((b) => b.textContent.trim()).join(" | "));
  ok("…and carries no organisations card any more", !document.querySelector("#payerOrgCard"));
  pracTab = "clients";
  go("practice"); await sleep(300);
  ok("Clients has its own inner strip", !!document.querySelector("#cltab"));
  ok("…naming the people and who pays for them",
    [...document.querySelectorAll("#cltab button")].map((b) => b.textContent.trim()).join("|") === "Clients|Clients’ insurers",
    [...document.querySelectorAll("#cltab button")].map((b) => b.textContent.trim()).join(" | "));
  ok("the client list is what it opens on", !!document.querySelector("#clist"));
  ok("…and the organisations card is not on it yet", !document.querySelector("#payerOrgCard"));
  document.querySelector('#cltab button[data-ct="payers"]').click(); await sleep(200);
  ok("the organisations card is on the screen before any organisation exists",
    !!document.querySelector("#payerOrgCard"));
  ok("…and offers the button that creates the first one", !!document.querySelector("#addOrg"));
  ok("…and the client list is put away while it shows", !document.querySelector("#clist"));
  /* and it really creates one, from that button, on that screen */
  document.querySelector("#addOrg").click(); await sleep(200);
  const ob = document.querySelector("#sheetBody");
  ok("the button opens the organisation form", !!ob.querySelector("#po_name"));
  ob.querySelector("#po_name").value = "Mind Camden";
  ob.querySelector("#po_days").value = "30";
  ob.querySelector("#poSave").click(); await sleep(250);
  ok("saving stores the organisation", payerOrgs().length === 1 && payerOrgs()[0].name === "Mind Camden",
    JSON.stringify(payerOrgs()));
  goPayers(); await sleep(250);
  ok("…and it is listed on the card afterwards", /Mind Camden/.test(document.querySelector("#payerOrgCard").textContent));
  ok("goPayers lands on Clients, not Rooms", pracTab === "clients" && clientsTab === "payers", pracTab + "/" + clientsTab);

  /* the fee box: present for a paying client, gone for one nobody pays for */
  clientForm(null); await sleep(200);
  const nb = document.querySelector("#sheetBody");
  ok("a new client starts with the fee box visible", nb.querySelector("#c_rateWrap").hidden === false);
  nb.querySelector("#c_payer").value = "none";
  nb.querySelector("#c_payer").dispatchEvent(new Event("change"));
  await sleep(80);
  ok("choosing 'nobody pays per session' takes the fee box away",
    nb.querySelector("#c_rateWrap").hidden === true);
  /* THE POINT: the hidden box still holds whatever was prefilled, and must not be read. */
  nb.querySelector("#c_rate").value = "60";
  nb.querySelector("#c_code").value = "NOFEE";
  nb.querySelector("#cSave").click(); await sleep(250);
  const made = S.clients.find((c) => c.code === "NOFEE");
  ok("the client saves without complaining about a missing rate", !!made);
  ok("…and a fee left sitting in the hidden box is NOT written", made && made.rate === 0, made && made.rate);
  ok("…nor into their rate history", (S.rateHistory || []).filter((r) => r.client === "NOFEE").every((r) => r.rate === 0),
    JSON.stringify((S.rateHistory || []).filter((r) => r.client === "NOFEE")));
  /* switching back brings it straight back - this only ever hides */
  clientForm(made); await sleep(200);
  const eb = document.querySelector("#sheetBody");
  ok("an existing non-paying client's rate block is hidden too", eb.querySelector("#c_rateWrap").hidden === true);
  eb.querySelector("#c_payer").value = "client";
  eb.querySelector("#c_payer").dispatchEvent(new Event("change"));
  await sleep(80);
  ok("switching back to a paying answer brings the rate block back",
    eb.querySelector("#c_rateWrap").hidden === false);
  closeSheet(); await sleep(100);

  /* ============ 4e. the pointer is a LINK, and it goes where it says ============
     "Add one under Practice › Rooms" was a sentence naming a screen, and the screen it named had
     since moved. A pointer that cannot be followed is worse than none: the reader has to hold the
     path in their head and go looking. */
  build([{ code: "L1", rate: 60 }], 2);
  settings().payers = [];                                  /* nothing set up, so the note points */
  tyMemoClear();
  pracTab = "clients"; clientsTab = "list";
  clientForm(S.clients[0]); await sleep(200);
  const lb = document.querySelector("#sheetBody");
  lb.querySelector("#c_payer").value = "org";
  lb.querySelector("#c_payer").dispatchEvent(new Event("change"));
  await sleep(80);
  const note = lb.querySelector("#c_orgNote");
  ok("with no organisations set up the note offers a way to add one", !!lb.querySelector("#c_orgGo"),
    note && note.textContent.trim().slice(0, 80));
  ok("…and names the screen it goes to", /Clients’ insurers/.test(note.textContent), note.textContent.trim().slice(0, 90));
  ok("…and does not name the old one", !/Rooms/.test(note.textContent), note.textContent.trim().slice(0, 90));
  lb.querySelector("#c_orgGo").click(); await sleep(300);
  ok("following it closes the sheet", !document.querySelector("#sheet").classList.contains("open"));
  ok("…and actually lands on the organisations strip", pracTab === "clients" && clientsTab === "payers",
    pracTab + "/" + clientsTab);
  ok("…with the card right there", !!document.querySelector("#payerOrgCard"));
  /* Once one exists the note stops nagging and just offers to manage them. */
  settings().payers = [{ _id: "px", name: "Vitality" }];
  clientsTab = "list";
  clientForm(S.clients[0]); await sleep(200);
  const lb2 = document.querySelector("#sheetBody");
  lb2.querySelector("#c_payer").value = "org";
  lb2.querySelector("#c_payer").dispatchEvent(new Event("change"));
  await sleep(80);
  ok("with one set up the note stops telling you to add one",
    !/Add one/i.test(lb2.querySelector("#c_orgNote").textContent),
    lb2.querySelector("#c_orgNote").textContent.trim().slice(0, 80));
  ok("…but still offers the way there", !!lb2.querySelector("#c_orgGo"));
  closeSheet(); await sleep(100);

  /* ============ 5. employment income sits underneath the practice ============ */
  /* 2026-27 rUK: PA 12,570 · basic top 50,270. Derived from the HMRC rule, not from the app.
       tax(55,000) = (50,270-12,570)*.20 + (55,000-50,270)*.40 = 7,540 + 1,892 = 9,432
       tax(40,000) = (40,000-12,570)*.20                       = 5,486
       so the practice's £15,000 carries                        = 3,946
     Class 4 on profit alone: (15,000-12,570) * 6% = 145.80 */
  build([{ code: "III", rate: 60 }]);
  settings().taxRegionYears = {}; settings().studentLoanYears = {}; settings().employmentYears = {};
  try { localStorage.removeItem("tt_pension"); } catch (e) {}
  tyMemoClear();
  const bare = ukTax(15000, "2026-27");
  near("with no salary recorded, income tax is the old figure", bare.incomeTax, (15000 - 12570) * 0.20);
  ok("…and nothing claims an employment figure", bare.employment === 0, bare.employment);
  setEmploymentPay("2026-27", 40000); tyMemoClear();
  const stacked = ukTax(15000, "2026-27");
  near("the wage uses the allowance, so the practice is taxed from where it left off", stacked.incomeTax, 3946);
  near("Class 4 is unchanged - it is a charge on self-employment", stacked.n1 + stacked.n2, 145.80);
  near("the total is income tax plus Class 4", stacked.total, 3946 + 145.80);
  ok("the correction is worth thousands on this practice", stacked.total - bare.total > 3000, (stacked.total - bare.total).toFixed(2));
  /* A wage already past the higher-rate threshold puts every pound of profit at 40%. */
  setEmploymentPay("2026-27", 60000); tyMemoClear();
  const hi = ukTax(10000, "2026-27");
  near("profit above a higher-rate wage is all at 40%", hi.incomeTax, 4000);
  near("…and is reported in the higher-rate band, not the basic one", hi.b1, 0);
  /* The personal-allowance taper is on TOTAL income, not on profit alone. */
  setEmploymentPay("2026-27", 95000); tyMemoClear();
  near("the allowance tapers on combined income", ukTax(20000, "2026-27").pa, 12570 - (115000 - 100000) / 2);
  /* Carry-forward, and the zero that stops it. */
  settings().employmentYears = {}; setEmploymentPay("2025-26", 30000); tyMemoClear();
  ok("a later year inherits the salary", employmentFor("2026-27").pay === 30000, employmentFor("2026-27").pay);
  ok("…and says that it was inherited", employmentFor("2026-27").inherited === true);
  ok("the year it was entered against is not inherited", employmentFor("2025-26").inherited === false);
  setEmploymentPay("2026-27", 0); tyMemoClear();
  ok("entering 0 stops the carry-forward", employmentFor("2026-27").pay === 0, employmentFor("2026-27").pay);
  ok("…and the earlier year keeps its own figure", employmentFor("2025-26").pay === 30000);
  ok("a later year then inherits the zero, not the old salary", employmentFor("2027-28").pay === 0, employmentFor("2027-28").pay);

  /* Student loan across two incomes is the INCREMENT the practice adds, never the whole
     combined amount and never zero. Plan 2: threshold 28,470 at 9%.
       combined (40,000): (40,000-28,470)*.09 = 1,037.70
       wage alone (30,000): (30,000-28,470)*.09 =  137.70
       the practice adds                        =  900.00 */
  settings().employmentYears = {}; settings().studentLoanYears = { "2026-27": "plan2" };
  setEmploymentPay("2026-27", 30000); tyMemoClear();
  near("student loan is the increment the practice adds", ukTax(10000, "2026-27").sl, 900);
  settings().employmentYears = {}; tyMemoClear();
  near("…and with no wage it is the plain figure on profit alone", ukTax(10000, "2026-27").sl, 0);

  /* ============ 6. the caveat that says the figure is not the whole picture ============ */
  settings().employmentYears = {}; settings().studentLoanYears = {}; tyMemoClear();
  build([{ code: "JJJ", rate: 60 }]);
  ok("a purely self-employed practice is told nothing about employment", taxEmploymentBar("2026-27") === "",
    taxEmploymentBar("2026-27").slice(0, 80));
  build([{ code: "KKK", rate: 0, payer: "none" }]);
  const bar = taxEmploymentBar("2026-27");
  ok("a practice with salaried work is warned the estimate is too low", /too low/i.test(bar), bar.replace(/<[^>]+>/g, "").slice(0, 100));
  ok("…and is offered the place to fix it", /taxEmpLink/.test(bar));
  setEmploymentPay("2026-27", 40000); tyMemoClear();
  const bar2 = taxEmploymentBar("2026-27");
  ok("once a salary is recorded the bar states it instead of warning", !/too low/i.test(bar2) && /£40,000/.test(bar2),
    bar2.replace(/<[^>]+>/g, "").slice(0, 110));
  /* An explicit zero is an answer, not a gap - the app must not argue with its own record. */
  setEmploymentPay("2026-27", 0); tyMemoClear();
  ok("a year explicitly recorded as having no salary is not warned about", taxEmploymentBar("2026-27") === "",
    taxEmploymentBar("2026-27").replace(/<[^>]+>/g, "").slice(0, 90));
  settings().employmentYears = {}; tyMemoClear();
  ok("…but a year with no answer at all still is", /too low/i.test(taxEmploymentBar("2026-27")));

  /* ============ 7. the reveal never offers tax to a practice that bills nothing ============ */
  settings().employmentYears = {}; tyMemoClear();
  const taxStep = REVEAL_STEPS.find((s) => s.keys[0] === "tax");
  build([{ code: "LLL", rate: 0, payer: "none" }], 20);
  ok("Tax is not offered to a salaried practice at ten sessions", taxStep.when(S) === false);
  build([{ code: "MMM", rate: 60 }], 20);
  ok("…and is still offered to a private one", taxStep.when(S) === true);

  /* ============ 8. the schema bump ============ */
  ok("the schema version is stamped at 11", SCHEMA_VERSION === 11, SCHEMA_VERSION);
  ok("a v11 backup is refused by a build that reads v10",
    validateImport({ schemaVersion: 12, state: { clients: [], sessions: [] } }).ok === false);
  ok("a v10 backup still restores here", stateSchemaVersion({ meta: { schemaVersion: 10 } }) === 10);

  return out;
});

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
bad.forEach((r) => console.log(`  ✗ ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`));
[...new Set(errs)].slice(0, 5).forEach((e) => console.log("  " + e));
if (!bad.length && !errs.length) console.log(`${results.length}/${results.length} payer checks passed`);
else console.log(`\n${bad.length} failed of ${results.length}${errs.length ? `, ${errs.length} page error(s)` : ""}`);
process.exit(bad.length || errs.length ? 1 : 0);
