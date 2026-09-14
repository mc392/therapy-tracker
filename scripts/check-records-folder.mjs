/* Drives the iOS records folder in a real browser, against the real index.html.
 *
 *   npm i --no-save playwright
 *   node scripts/check-records-folder.mjs
 *
 * WHY THIS EXISTS
 *   Everything in the native block is behind `Capacitor.isNativePlatform()`, so none of it runs
 *   in a browser and none of the existing harnesses touch a line of it. It is also the code that
 *   decides whether a therapist's records reach her iCloud Drive - the one part of this app that
 *   fails silently by design (a background copy that toasted on every failure would be worse than
 *   one that does not). Written without an iPhone and shipped untested, "silently" is exactly what
 *   it would do.
 *
 * HOW
 *   `addInitScript` installs a fake Capacitor before any page script runs: a fake
 *   GroundWorkNative whose folder* methods are an in-memory folder, and a fake Filesystem for the
 *   copy in the app's own Documents. Both are kept in localStorage so they survive a reload,
 *   which is what lets the launch-time conflict check be tested at all. Nothing in
 *   TherapyTracker-web is stubbed, patched or copied: the app under test is the app.
 *
 *   The Swift half is NOT covered - there is no compiler on a build machine. What is asserted
 *   here is the contract between the two: which methods are called, in what order, and what the
 *   web layer does with each answer. `npm run check:drift` asserts the plugin declares them.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) {
  console.error("This needs Playwright, which is not a dependency of this repo on purpose.\n" +
    "  npm i --no-save playwright\nthen run this again.");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "TherapyTracker-web");
const CHROME = process.env.CHROMIUM_PATH ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome"]
    .find((p) => existsSync(p)) || undefined;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((res) => {
    const srv = createServer((req, rq) => {
      const p = decodeURIComponent(req.url.split("?")[0]);
      const file = join(webDir, p === "/" ? "index.html" : p);
      try {
        const body = readFileSync(file);
        rq.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
        rq.end(body);
      } catch (e) { rq.writeHead(404); rq.end("not found"); }
    });
    srv.listen(0, "127.0.0.1", () => res({ srv, port: srv.address().port }));
  });
}

/* ---------------- the fake phone ----------------
   Serialised into the page before index.html's own scripts run. The folder and the Documents
   directory live in localStorage so a reload - which is how the launch check is reached - finds
   them exactly where a real device would. */
function fakePhone() {
  const K = "__phone";
  const load = () => {
    try { return JSON.parse(localStorage.getItem(K)) || null; } catch (e) { return null; }
  };
  const save = (p) => { try { localStorage.setItem(K, JSON.stringify(p)); } catch (e) {} };
  let phone = load() || {
    folder: null,               /* {name, path, icloud, files:{path:{data,mtime}}} */
    docs: {},                   /* the app's own Documents directory */
    nextPick: null,             /* what the picker will return next */
    failWrites: false,
    calls: []
  };
  const flush = () => save(phone);
  const now = () => Date.now();
  const note = (m) => { phone.calls.push(m); flush(); };

  window.__phone = {
    get: () => load(),
    set: (fn) => { phone = load() || phone; fn(phone); flush(); },
    reset: () => { localStorage.removeItem(K); }
  };

  const bookmarked = () => !!(phone.folder && phone.folder.bookmarked);
  const describe = (args) => {
    if (!bookmarked()) return { set: false };
    const f = phone.folder;
    const one = (p) => {
      const e = f.files[p];
      return e ? { exists: true, modifiedAt: e.mtime, size: e.data.length } : { exists: false };
    };
    return { set: true, name: f.name, path: f.path, icloud: !!f.icloud, reachable: !f.broken,
             error: f.broken ? "the folder could not be reopened" : "",
             live: one(args && args.live || "GroundWork records.json"),
             alt:  one(args && args.alt  || "GroundWork records.enc.json") };
  };

  const GroundWorkNative = {
    biometricAvailable: async () => ({ available: false, biometry: "none" }),
    authenticate: async () => ({ success: true }),
    sharePDF: async () => ({ shared: true }),
    plusStatus: async () => ({ active: false, source: "storekit" }),
    plusProduct: async () => ({ found: false }),
    plusPurchase: async () => ({ active: false }),
    plusRestore: async () => ({ active: false }),
    plusRedeem: async () => {}, plusManage: async () => {},

    folderInfo: async (a) => { note("folderInfo"); return describe(a); },
    folderPick: async (a) => {
      note("folderPick");
      phone = load() || phone;
      if (!phone.nextPick) { flush(); return { picked: false, cancelled: true }; }
      phone.folder = Object.assign({ bookmarked: true }, phone.nextPick);
      phone.nextPick = null; flush();
      return Object.assign({ picked: true }, describe(a));
    },
    /* Drops the bookmark. The folder and everything in it stay exactly where they are - that is
       the user's folder, and this app has no business deleting from it. */
    folderForget: async () => { note("folderForget"); phone = load() || phone;
      if (phone.folder) phone.folder.bookmarked = false; flush(); return { set: false }; },
    folderWrite: async ({ path, data }) => {
      note("folderWrite:" + path);
      phone = load() || phone;
      if (!bookmarked() || phone.folder.broken) return { ok: false, error: "no folder" };
      if (phone.failWrites) return { ok: false, error: "disk is full" };
      const mtime = now();
      phone.folder.files[path] = { data, mtime };
      flush();
      return { ok: true, modifiedAt: mtime };
    },
    folderRead: async ({ path }) => {
      note("folderRead:" + path);
      phone = load() || phone;
      const e = bookmarked() && phone.folder.files[path];
      return e ? { found: true, data: e.data, modifiedAt: e.mtime } : { found: false, error: "not there" };
    },
    folderList: async ({ path }) => {
      note("folderList:" + path);
      phone = load() || phone;
      if (!bookmarked()) return { files: [] };
      const pre = path ? path + "/" : "";
      return { files: Object.keys(phone.folder.files)
        .filter((k) => k.indexOf(pre) === 0 && k.slice(pre.length).indexOf("/") < 0)
        .map((k) => k.slice(pre.length)) };
    },
    folderDelete: async ({ path }) => {
      note("folderDelete:" + path);
      phone = load() || phone;
      if (bookmarked()) { delete phone.folder.files[path]; flush(); }
      return { ok: true };
    }
  };

  const Filesystem = {
    writeFile: async ({ path, data }) => { phone = load() || phone; phone.docs[path] = data; flush(); return { uri: "file:///docs/" + path }; },
    deleteFile: async ({ path }) => { phone = load() || phone; delete phone.docs[path]; flush(); return {}; },
    readdir: async ({ path }) => {
      phone = load() || phone;
      const pre = path ? path + "/" : "";
      return { files: Object.keys(phone.docs)
        .filter((k) => k.indexOf(pre) === 0 && k.slice(pre.length).indexOf("/") < 0)
        .map((k) => ({ name: k.slice(pre.length) })) };
    }
  };

  /* The calendar screen and the share sheet, both recording what they were handed so a test
     can ask which one an export actually reached. `window.__ics.mode` drives the failure paths:
     "ok" presents, "none" is iOS reporting it had no preview, "throw" is a reject, and
     "missing" removes the method altogether - an older build of the app. */
  window.__ics = { mode: "ok", opened: [], shared: [] };
  /* A fake calendar. `mode` drives the paths: "ok" writes, "denied" is the permission refused,
     "throw" is the bridge failing. `store` is what ended up in the diary, keyed by event id, so
     a test can ask whether a second add made a duplicate or rewrote the same entry. */
  window.__cal = { mode: "ok", store: {}, calls: [], next: 1, calendars: [
    { id: "cal-personal", title: "Personal", source: "iCloud" },
    { id: "cal-work", title: "Work", source: "iCloud" }
  ] };
  GroundWorkNative.calendarList = async () => {
    if (window.__cal.mode === "denied") return { granted: false };
    if (window.__cal.mode === "throw") throw new Error("no bridge");
    return { granted: true, defaultId: "cal-personal", calendars: window.__cal.calendars.slice() };
  };
  GroundWorkNative.calendarAdd = async ({ events, calendarId }) => {
    if (window.__cal.mode === "denied") return { granted: false };
    if (window.__cal.mode === "throw") throw new Error("no bridge");
    window.__cal.calls.push({ events: JSON.parse(JSON.stringify(events)), calendarId });
    const results = events.map((e) => {
      const known = e.eventId && window.__cal.store[e.eventId];
      const id = known ? e.eventId : "ev" + (window.__cal.next++);
      window.__cal.store[id] = { uid: e.uid, title: e.title, start: e.start, end: e.end,
                                 location: e.location, calendarId: calendarId || "cal-personal" };
      return { uid: e.uid, eventId: id, updated: !!known };
    });
    const cal = window.__cal.calendars.find((c) => c.id === (calendarId || "cal-personal"));
    return { granted: true, calendar: cal ? cal.title : "", results };
  };
  GroundWorkNative.openCalendarFile = async ({ text, filename }) => {
    if (window.__ics.mode === "throw") throw new Error("no view controller");
    window.__ics.opened.push({ filename, text });
    return { shown: window.__ics.mode === "ok" };
  };

  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      GroundWorkNative, Filesystem,
      Share: { share: async (a) => { window.__ics.shared.push(a && a.title); return {}; } },
      SplashScreen: { hide: async () => {} },
      LocalNotifications: {
        checkPermissions: async () => ({ display: "denied" }),
        requestPermissions: async () => ({ display: "denied" }),
        getPending: async () => ({ notifications: [] }),
        cancel: async () => {}, schedule: async () => {}
      },
      App: { addListener: () => ({ remove() {} }) }
    }
  };
}

/* ---------------- assertions ---------------- */
const results = [];
const ok = (id, msg) => results.push({ id, ok: true, msg });
const bad = (id, msg, extra) => results.push({ id, ok: false, msg, extra });
const check = (cond, id, msg, extra) => cond ? ok(id, msg) : bad(id, msg, extra);

const SETTLE = 2900;   /* the folder write is debounced 2s behind commit() */

/* `dismiss` is only for the very first launch, which lands in the setup wizard. On any later
   launch it must stay off: closing the sheet here races the folder question that checkFolder()
   opens a moment after S is ready, and shuts it - which looks exactly like the app never asking. */
async function bootApp(page, url, dismiss) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof S !== "undefined" && S && Array.isArray(S.sessions), null, { timeout: 20000 });
  if (dismiss) await page.evaluate(() => { try { flowClose(); } catch (e) {} try { closeSheet(); } catch (e) {} });
}

/* The sheet is open AND showing what we expect. `#sheet` keeps its last body after closing, so a
   bare querySelector for a button inside it passes against a sheet nobody can see. */
async function sheetShows(page, sel, ms) {
  const until = Date.now() + (ms || 6000);
  for (;;) {
    const seen = await page.evaluate((s) => {
      const sh = document.querySelector("#sheet");
      return !!(sh && sh.classList.contains("open") && sh.querySelector(s));
    }, sel);
    if (seen || Date.now() > until) return seen;
    await page.waitForTimeout(200);
  }
}

/* A small practice, committed once so the app has something to save. */
async function seed(page) {
  await page.evaluate(async () => {
    S.settings.onboarded = true;
    S.clients = [{ _id: "c1", code: "AB12", status: "Active", freq: "Weekly" }];
    S.rooms = [{ location: "At home", rate: 0, billing: "session" }];
    S.sessions = [1, 2, 3, 4].map((i) => ({
      _id: "s" + i, client: "AB12", date: "2026-08-0" + i, time: "10:00",
      location: "At home", attended: "Y", paid: "Y", notes: "Y"
    }));
    await commit("seed");
  });
  await page.waitForTimeout(SETTLE);
}

const state = (page) => page.evaluate(() => window.__phone.get());

/* Settings groups ship collapsed, and a sheet's buttons are inside a transform that Playwright
   waits on. Open the group, then fire the handler directly: what is under test is the wiring, not
   whether a <details> animates. */
async function tap(page, sel) {
  await page.evaluate((s) => {
    const d = document.querySelector('details[data-g="device"]'); if (d) d.open = true;
    const el = document.querySelector(s);
    if (!el) throw new Error("nothing matches " + s);
    el.click();
  }, sel);
}

async function main() {
  const { srv, port } = await serve();
  const url = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  await ctx.addInitScript(fakePhone);
  const page = await ctx.newPage();
  const consoleErrors = [], dialogs = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e && e.message)));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

  await bootApp(page, url, true);
  /* Not now, thank you - the one-time offer is tested on its own at the end. */
  await page.evaluate(() => localStorage.setItem("tt_folder_asked", "1"));
  await seed(page);

  /* ---- 1. No folder chosen: the copy still goes into the app's own Documents ---- */
  let st = await state(page);
  check(!!st.docs["GroundWork auto-backup.json"], "docs.write",
    "with no folder chosen, every save still writes GroundWork auto-backup.json into Documents",
    Object.keys(st.docs));

  /* ---- 2. Choosing an iCloud folder writes the records into it ---- */
  await page.evaluate(() => window.__phone.set((p) => {
    p.nextPick = { name: "GroundWork", path: "iCloud Drive › GroundWork", icloud: true, files: {} };
  }));
  await page.evaluate(() => go("settings"));
  await page.waitForTimeout(300);
  const hasPick = await page.evaluate(() => !!document.querySelector("#fdPick"));
  check(hasPick, "settings.card", "Settings › This iPhone offers a 'Choose a folder' button");
  await tap(page, "#fdPick");
  await page.waitForTimeout(1200);
  st = await state(page);
  const live = st.folder && st.folder.files["GroundWork records.json"];
  check(!!live, "folder.write", "picking a folder writes 'GroundWork records.json' into it",
    st.folder && Object.keys(st.folder.files));
  if (live) {
    let env = null; try { env = JSON.parse(live.data); } catch (e) {}
    check(env && env.app === "GroundWork" && env.state && env.state.sessions.length === 4,
      "folder.payload", "the file in the folder is the app's own backup envelope, whole",
      env && { app: env.app, sessions: env.state && env.state.sessions.length });
  }
  const dated = st.folder && Object.keys(st.folder.files).filter((k) => k.indexOf("Previous versions/") === 0);
  check(dated && dated.length === 1, "folder.dated", "one dated copy a day lands in 'Previous versions'", dated);
  check(!st.docs["GroundWork auto-backup.json"], "docs.retired",
    "the now-superseded live copy in the app's own Documents is removed",
    Object.keys(st.docs));

  /* ---- 3. An iCloud folder answers the manual-backup nag ---- */
  const before = await page.evaluate(() => localStorage.getItem("tt_last_backup"));
  await page.evaluate(async () => { S.sessions[0].notes = ""; await commit("edit"); });
  await page.waitForTimeout(SETTLE);
  const after = await page.evaluate(() => localStorage.getItem("tt_last_backup"));
  check(before && after && +after >= +before, "nag.icloud",
    "a save into an iCloud folder marks the data backed up, so the reminder stays quiet",
    { before, after });

  /* ---- 4. A second save the same day does not add a second dated copy ---- */
  st = await state(page);
  const dated2 = Object.keys(st.folder.files).filter((k) => k.indexOf("Previous versions/") === 0);
  check(dated2.length === 1, "folder.daily",
    "a second save on the same day reuses the day's copy rather than adding another", dated2);

  /* ---- 5. A folder that stops answering falls back to the copy on the phone ---- */
  await page.evaluate(() => window.__phone.set((p) => { p.failWrites = true; }));
  await page.evaluate(async () => { S.sessions[1].notes = ""; await commit("edit2"); });
  await page.waitForTimeout(SETTLE);
  st = await state(page);
  check(!!st.docs["GroundWork auto-backup.json"], "folder.fallback",
    "when the folder refuses a write, the copy in the app's own Documents comes straight back",
    Object.keys(st.docs));
  await page.evaluate(() => window.__phone.set((p) => { p.failWrites = false; }));
  await page.evaluate(async () => { S.sessions[1].notes = "Y"; await commit("edit3"); });
  await page.waitForTimeout(SETTLE);

  /* ---- 6. Who wrote the file, not when ----
     The marker beside the records is what says which device wrote them. These three cases are the
     bug that shipped first: a phone that was the only writer was asked "two copies of your
     records?" on every single launch, because the check compared modification dates and neither
     iCloud nor a suspended WebView respects them. */
  st = await state(page);
  check(!!(st.folder && st.folder.files[".GroundWork-writer.json"]), "marker.written",
    "every save leaves a marker naming the device that wrote the records",
    st.folder && Object.keys(st.folder.files));

  /* (a) iCloud restamps a file on upload, and the WebView is suspended on backgrounding before
     the JS that records a write can run. Both leave a date this device cannot account for. */
  await page.evaluate(() => window.__phone.set((q) => {
    q.folder.files["GroundWork records.json"].mtime = Date.now() + 3600000;
  }));
  await bootApp(page, url);
  await page.waitForTimeout(3000);
  let popped = await page.evaluate(() => {
    const sh = document.querySelector("#sheet");
    return !!(sh && sh.classList.contains("open") && sh.querySelector("#fcLoad"));
  });
  check(!popped, "marker.mtimeDrift",
    "a modification date this device never recorded is NOT a conflict while the marker is its own");

  /* (b) A folder written by a build from before markers existed. Adopted once, and stamped, so
     the question is answered rather than asked again every launch. */
  await page.evaluate(() => window.__phone.set((q) => { delete q.folder.files[".GroundWork-writer.json"]; }));
  await bootApp(page, url);
  await page.waitForTimeout(3000);
  popped = await page.evaluate(() => {
    const sh = document.querySelector("#sheet");
    return !!(sh && sh.classList.contains("open") && sh.querySelector("#fcLoad"));
  });
  check(!popped, "marker.migrates",
    "a folder with no marker that this device has been writing to is adopted, not queried");
  st = await state(page);
  check(!!(st.folder && st.folder.files[".GroundWork-writer.json"]), "marker.backfilled",
    "and a marker is left behind so it is only ever adopted once");

  /* (c) A real second device: a different id in the marker, whatever the dates say. */
  const foreign = await page.evaluate(() => {
    const p = window.__phone.get();
    const cur = JSON.parse(p.folder.files["GroundWork records.json"].data);
    cur.state.sessions.push({ _id: "sX", client: "AB12", date: "2026-08-20", time: "10:00",
      location: "At home", attended: "Y", paid: "Y", notes: "Y" });
    cur.exportedAt = new Date(Date.now() + 120000).toISOString();
    const text = JSON.stringify(cur);
    window.__phone.set((q) => {
      q.folder.files["GroundWork records.json"] = { data: text, mtime: Date.now() };
      q.folder.files[".GroundWork-writer.json"] = {
        data: JSON.stringify({ app: "GroundWork", kind: "writer", writer: "d-the-other-phone",
                               at: new Date().toISOString(), file: "GroundWork records.json" }),
        mtime: Date.now() };
    });
    return cur.state.sessions.length;
  });
  await bootApp(page, url);                 /* relaunch: checkFolder() runs at boot */
  const asked = await sheetShows(page, "#fcLoad");
  check(asked, "conflict.ask",
    "records last written by another device DO raise the two-copies question at launch");

  const stampBefore = await page.evaluate(() => window.__phone.get().folder.files["GroundWork records.json"].mtime);
  await page.evaluate(async () => { S.sessions[0].time = "11:00"; await commit("edit while paused"); });
  await page.waitForTimeout(SETTLE);
  const stampAfter = await page.evaluate(() => window.__phone.get().folder.files["GroundWork records.json"].mtime);
  check(stampBefore === stampAfter, "conflict.paused",
    "while the question is open, saving carries on but nothing is written over the folder's copy",
    { stampBefore, stampAfter });
  /* The live Documents copy was retired when the folder started working. A device sitting on an
     unanswered question must not therefore be a device with no copy anywhere. */
  st = await state(page);
  check(!!st.docs["GroundWork auto-backup.json"], "conflict.stillCopied",
    "and the copy on the phone is written meanwhile, so a paused device is never left with none",
    Object.keys(st.docs));

  /* ---- 7. Loading the folder's copy goes through the app's own restore ---- */
  if (asked) {
    await tap(page, "#fcLoad");
    const restoreShown = await sheetShows(page, "#rsGo, #dzAck");
    check(restoreShown, "conflict.restoreLadder",
      "loading the folder's copy goes through restoreConfirm rather than replacing the data outright");
    if (await page.evaluate(() => !!document.querySelector("#rsGo"))) {
      await tap(page, "#rsGo");
      await page.waitForTimeout(1500);
      const n = await page.evaluate(() => S.sessions.length);
      check(n === foreign, "conflict.loaded",
        "confirming the restore leaves this device holding the folder's copy", { got: n, want: foreign });
      await page.waitForTimeout(SETTLE);
      const held = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("tt_folder_status") || "null");
        return s && s.ok;
      });
      check(!!held, "conflict.resumed", "after loading, saving into the folder resumes");
      const claimed = await page.evaluate(() => {
        const f = window.__phone.get().folder.files[".GroundWork-writer.json"];
        try { return f && JSON.parse(f.data).writer === localStorage.getItem("tt_folder_device"); }
        catch (e) { return false; }
      });
      check(!!claimed, "conflict.claims",
        "and this device becomes the writer of record, so the next launch does not ask again");
      /* The whole point: having settled it once, a relaunch must be quiet. */
      await bootApp(page, url);
      await page.waitForTimeout(3000);
      const asksAgain = await page.evaluate(() => {
        const sh = document.querySelector("#sheet");
        return !!(sh && sh.classList.contains("open") && sh.querySelector("#fcLoad"));
      });
      check(!asksAgain, "conflict.settled", "and the question is not asked again on the next launch");
    }
  }

  /* ---- 8. A folder that is not in iCloud does NOT silence the reminder ---- */
  await page.evaluate(() => {
    window.__phone.set((p) => {
      p.nextPick = { name: "GroundWork", path: "On My iPhone › GroundWork", icloud: false, files: {} };
    });
    localStorage.removeItem("tt_last_backup");
  });
  await page.evaluate(() => go("settings"));
  await page.waitForTimeout(300);
  await tap(page, "#fdPick");
  await page.waitForTimeout(1500);
  const localNag = await page.evaluate(() => localStorage.getItem("tt_last_backup"));
  check(!localNag, "nag.local",
    "a folder under 'On My iPhone' is not a copy off the phone, so the backup reminder stays on",
    localNag);
  st = await state(page);
  check(!!(st.folder && st.folder.files["GroundWork records.json"]), "folder.local.write",
    "a local folder is still written to - it just does not answer the reminder");

  /* ---- 9. Stopping leaves the user's files where they are ---- */
  const filesBefore = Object.keys(st.folder.files).length;
  await page.evaluate(() => go("settings"));
  await page.waitForTimeout(300);
  await tap(page, "#fdOff");
  await page.waitForTimeout(600);
  await tap(page, "#foGo");
  await page.waitForTimeout(SETTLE);
  st = await state(page);
  check(st.folder && Object.keys(st.folder.files).length === filesBefore, "forget.keepsFiles",
    "stopping deletes nothing from the folder - those files are the user's",
    st.folder && Object.keys(st.folder.files).length);
  check(!!st.docs["GroundWork auto-backup.json"], "forget.fallsBack",
    "and the copy in the app's own Documents takes over again", Object.keys(st.docs));

  /* ---- 10. The one-time offer ---- */
  await page.evaluate(() => { localStorage.removeItem("tt_folder_asked"); });
  await bootApp(page, url);
  const offered = await sheetShows(page, "#ofGo", 12000);
  check(offered, "offer.once", "somebody with records and no folder is offered one, once");
  const askedFlag = await page.evaluate(() => localStorage.getItem("tt_folder_asked"));
  check(askedFlag === "1", "offer.remembered", "and is not asked again whatever the answer", askedFlag);

  /* ---- 11. A calendar file goes to the event screen, not the share sheet ----
     The share sheet offers Save to Files, AirDrop and WhatsApp, none of which is Calendar, and
     somebody who picks Save to Files is left holding a file with no way in. Every failure path
     below must still end at the share sheet, though: a file the reader cannot reach at all is
     worse than one behind an awkward sheet. */
  const runExport = (name, type, mode) => page.evaluate(([n2, t2, m2]) => {
    window.__ics.mode = m2;
    window.__ics.opened = []; window.__ics.shared = [];
    download(n2, "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", t2);
    return new Promise((r) => setTimeout(() => r({
      opened: window.__ics.opened.slice(), shared: window.__ics.shared.slice() }), 260));
  }, [name, type, mode]);

  let r = await runExport("groundwork-sessions-2026-09-13-to-2026-09-19.ics", "text/calendar", "ok");
  check(r.opened.length === 1 && r.shared.length === 0, "ics.toEventScreen",
    "an .ics opens iOS's own event screen and never reaches the share sheet", r);
  check(r.opened[0] && /\.ics$/.test(r.opened[0].filename) && /BEGIN:VCALENDAR/.test(r.opened[0].text),
    "ics.handsOverFile", "and is handed the real file, by name", r.opened[0] && r.opened[0].filename);

  r = await runExport("groundwork-backup.json", "application/json", "ok");
  check(r.opened.length === 0 && r.shared.length === 1, "ics.othersUnchanged",
    "every other export still goes to the share sheet exactly as before", r);

  r = await runExport("groundwork-sessions-2026-09-13.csv", "text/csv", "ok");
  check(r.opened.length === 0 && r.shared.length === 1, "ics.csvUnchanged",
    "a CSV is a document to file away and is untouched by this", r);

  r = await runExport("x.ics", "text/calendar", "none");
  check(r.opened.length === 1 && r.shared.length === 1, "ics.fallbackNoPreview",
    "iOS reporting no preview falls back to the share sheet rather than doing nothing", r);

  r = await runExport("x.ics", "text/calendar", "throw");
  check(r.opened.length === 0 && r.shared.length === 1, "ics.fallbackThrow",
    "a rejected call falls back to the share sheet", r);

  await page.evaluate(() => { delete Capacitor.Plugins.GroundWorkNative.openCalendarFile; });
  r = await runExport("x.ics", "text/calendar", "ok");
  check(r.opened.length === 0 && r.shared.length === 1, "ics.fallbackOldBuild",
    "a build whose plugin has no openCalendarFile falls back to the share sheet", r);
  /* Put it back: everything after this point assumes a current build. */
  await page.evaluate(() => {
    Capacitor.Plugins.GroundWorkNative.openCalendarFile = async ({ text, filename }) => {
      if (window.__ics.mode === "throw") throw new Error("no view controller");
      window.__ics.opened.push({ filename, text });
      return { shown: window.__ics.mode === "ok" };
    };
  });

  /* ---- 12. Sessions are WRITTEN into the calendar on iOS, not handed over as a file ----
     Handing iOS a file is a dead end however it is presented, so on a build that can write, the
     .ics route must not be taken at all. */
  const calRun = (fn) => page.evaluate((f) => {
    window.__ics.opened = []; window.__ics.shared = [];
    window.__cal.calls = [];
    // eslint-disable-next-line no-eval
    eval(f);
    return new Promise((r) => setTimeout(() => r({
      calls: window.__cal.calls.slice(), store: JSON.parse(JSON.stringify(window.__cal.store)),
      opened: window.__ics.opened.slice(), shared: window.__ics.shared.slice(),
      map: JSON.parse(localStorage.getItem("tt_calmap") || "{}"),
      chosen: localStorage.getItem("tt_calendar") || ""
    }), 320));
  }, fn);

  await page.evaluate(() => {
    localStorage.setItem("tt_calendar", "cal-work");     /* already chosen - no picker */
    localStorage.removeItem("tt_calmap");
    window.__cal.store = {}; window.__cal.next = 1;
    S.sessions = [
      { _id: "cs1", client: "AA1", date: "2026-10-05", time: "10:00", location: "Room 2", notes: "" },
      { _id: "cs2", client: "BB2", date: "2026-10-06", time: "14:30", location: "At home", notes: "" }
    ];
  });

  let c = await calRun('calAddSession(S.sessions[0])');
  check(c.calls.length === 1 && c.opened.length === 0 && c.shared.length === 0, "cal.writesNotFile",
    "a session is written into the calendar and no file is produced at all", c);
  check(Object.keys(c.store).length === 1, "cal.oneEvent", "one event lands in the diary", c.store);
  const ev1 = Object.values(c.store)[0] || {};
  check(ev1.title === "AA1" && ev1.location === "Room 2", "cal.thinEvent",
    "carrying the client code and the room", ev1);
  /* The times come from icsFloating, so the session length and the DST rule are not recomputed
     here - 10:00 plus the 50-minute default. */
  check(ev1.start === "2026-10-05T10:00" && ev1.end === "2026-10-05T10:50", "cal.wallClock",
    "with wall-clock start and end taken from the shared arithmetic", ev1);
  check(ev1.calendarId === "cal-work", "cal.chosenCalendar",
    "into the calendar the reader chose, not the default", ev1.calendarId);
  check(c.map.cs1 && Object.keys(c.map).length === 1, "cal.remembersId",
    "and the event's identifier is remembered against that session", c.map);

  /* THE ONE THAT MATTERS: adding the same session again must rewrite it, not duplicate it. */
  c = await calRun('calAddSession(S.sessions[0])');
  check(Object.keys(c.store).length === 1, "cal.noDuplicate",
    "adding the same session again rewrites the same event rather than duplicating it", c.store);
  check(c.calls[0] && c.calls[0].events[0].eventId, "cal.sendsKnownId",
    "because the stored identifier is sent back with it", c.calls[0] && c.calls[0].events[0]);

  /* A session that moves is updated in place. */
  await page.evaluate(() => { S.sessions[0].time = "16:00"; });
  c = await calRun('calAddSession(S.sessions[0])');
  const moved = Object.values(c.store)[0] || {};
  check(Object.keys(c.store).length === 1 && moved.start === "2026-10-05T16:00", "cal.updatesMove",
    "a session that moves updates the entry already in the calendar", moved);

  c = await calRun('calAddRange("2026-10-01","2026-10-31","in the next month")');
  check(c.calls.length === 1 && c.calls[0].events.length === 2, "cal.rangeWrites",
    "a date range writes every session in it in one go", c.calls[0] && c.calls[0].events.length);
  check(Object.keys(c.store).length === 2, "cal.rangeNoDuplicate",
    "and the one already added is not duplicated by the range", c.store);

  /* Refusal must not be a dead end: say what to do, and still leave the file route open. */
  await page.evaluate(() => { window.__cal.mode = "denied"; });
  c = await calRun('calAddSession(S.sessions[1])');
  check(c.calls.length === 0 && (c.opened.length === 1 || c.shared.length === 1), "cal.deniedFallsBack",
    "refusing calendar access falls back to the file rather than doing nothing", c);

  await page.evaluate(() => { window.__cal.mode = "throw"; });
  c = await calRun('calAddSession(S.sessions[1])');
  check(c.opened.length === 1 || c.shared.length === 1, "cal.throwFallsBack",
    "a failing bridge falls back to the file too", c);
  await page.evaluate(() => { window.__cal.mode = "ok"; });

  /* An older build, with no EventKit on the plugin, is still the .ics app it always was. */
  c = await page.evaluate(() => {
    const keep = window.GWCalendarNative; window.GWCalendarNative = null;
    window.__ics.opened = []; window.__ics.shared = []; window.__cal.calls = [];
    calAddSession(S.sessions[1]);
    return new Promise((r) => setTimeout(() => {
      window.GWCalendarNative = keep;
      r({ calls: window.__cal.calls.length, opened: window.__ics.opened.length });
    }, 300));
  });
  check(c.calls === 0 && c.opened === 1, "cal.oldBuildFile",
    "a build with no calendar methods still hands over the .ics exactly as before", c);

  /* More than one writable calendar and nothing chosen yet: ask, and never write until asked. */
  await page.evaluate(() => { localStorage.removeItem("tt_calendar"); });
  const picker = await page.evaluate(() => {
    window.__cal.calls = [];
    calAddSession(S.sessions[1]);
    return new Promise((r) => setTimeout(() => r({
      open: !!document.querySelector("#sheet.open"),
      rows: document.querySelectorAll("#sheetBody [data-cal]").length,
      wrote: window.__cal.calls.length
    }), 320));
  });
  check(picker.open && picker.rows === 2, "cal.picker",
    "two writable calendars means the reader is asked which one", picker);
  check(picker.wrote === 0, "cal.pickerBlocks",
    "and nothing is written to any calendar until they have answered", picker);
  const picked = await page.evaluate(() => {
    document.querySelector('#sheetBody [data-cal="cal-work"]').click();
    return new Promise((r) => setTimeout(() => r({
      chosen: localStorage.getItem("tt_calendar"),
      wrote: window.__cal.calls.length
    }), 320));
  });
  check(picked.chosen === "cal-work" && picked.wrote === 1, "cal.pickerRemembers",
    "choosing one writes there and remembers it for next time", picked);

  check(consoleErrors.length === 0, "page.clean", "no uncaught error anywhere in the run", consoleErrors.slice(0, 4));
  check(dialogs.length === 0, "page.noAlerts", "nothing had to fall back to a native alert()", dialogs.slice(0, 4));

  await browser.close();
  srv.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results)
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.id.padEnd(22)} ${r.msg}` +
      (!r.ok && r.extra !== undefined ? `\n      got: ${JSON.stringify(r.extra)}` : ""));
  console.log(`\n${results.length - failed.length}/${results.length} records-folder checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
