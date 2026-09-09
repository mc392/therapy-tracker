/* Drives the iOS records folder in a real browser, against the real index.html.
 *
 *   npm i --no-save playwright
 *   node scripts/check-records-folder.mjs
 *
 * WHY THIS EXISTS
 *   Everything in the native block is behind `Capacitor.isNativePlatform()`, so none of it runs
 *   in a browser and none of the existing harnesses touch a line of it. It is also the code that
 *   decides whether a therapist's records reach her iCloud Drive — the one part of this app that
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
 *   The Swift half is NOT covered — there is no compiler on a build machine. What is asserted
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
   directory live in localStorage so a reload — which is how the launch check is reached — finds
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
    /* Drops the bookmark. The folder and everything in it stay exactly where they are — that is
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

  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      GroundWorkNative, Filesystem,
      Share: { share: async () => ({}) },
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
   opens a moment after S is ready, and shuts it — which looks exactly like the app never asking. */
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
  /* Not now, thank you — the one-time offer is tested on its own at the end. */
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
    "a local folder is still written to — it just does not answer the reminder");

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
    "stopping deletes nothing from the folder — those files are the user's",
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
