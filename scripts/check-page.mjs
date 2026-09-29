#!/usr/bin/env node
/**
 * Load the site's pages in a real headless browser and report what a visitor's
 * browser sees (D8).
 *
 *   node scripts/check-page.mjs http://127.0.0.1:8080/                  # every page
 *   node scripts/check-page.mjs http://127.0.0.1:8080/under-the-hood    # one page
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --page main      # the main page alone
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --widths all     # every page at each of its widths
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --shots out/after
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --full out/after-full
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --json out/report.json
 *   node scripts/check-page.mjs --deployed              # the production site, from local.env (D14)
 *
 * The site's root means every page: the main page, /under-the-hood (D17) and
 * /demo (D27). For each, at desktop and at mobile width, or at the widths
 * `--widths` names; `all` is each page's own list: 1440, 390, 360, 430 and 768
 * for the main page and Under the hood, and 1440, 768, 390, 360 and 320 for the
 * demo, which is also exercised in light and in dark:
 *
 *  - every request the page makes, grouped by origin, and any that failed;
 *  - every console message and uncaught exception, and every Content-Security-
 *    Policy violation, both as the browser logs it and as the page's own
 *    `securitypolicyviolation` event reports it;
 *  - the document's response headers;
 *  - every interactive part of the page, exercised. On the main page: the
 *    scroll-driven steps, the headline replay, both "ship" buttons, the laptop
 *    and the routes replays, and the waitlist form. Under the hood: the release
 *    steps, which light up once when they come into view, the headings, and
 *    every diagram's text alternative. The demo (D27, D31): its report dialog
 *    (focus on its first question, a mark made with the keyboard, an empty
 *    last answer refused, Tab kept inside it, focus given back), every tab
 *    list of the app view with the arrow keys, Home and End, "More", the
 *    preview not moving when advanced mode is turned on and off, a new app
 *    opening in planning and "Looks good, start building", the whole way from
 *    trying the last step to "v3 is live" in Live, the second way to connect
 *    an AI, "Start over", and no horizontal overflow in any of the states it
 *    passes through. What each one left on the page is recorded, so two runs
 *    can be compared for behaviour and not only for looks;
 *  - no horizontal overflow: nothing wider than the window;
 *  - no en or em dash anywhere in the page's text or its text alternatives;
 *  - its icons (D26): every one its head declares, and every one its web
 *    manifest names, answering 200 with its own type, nosniff and a cache time.
 *
 * `--shots` saves one screenshot per section and width after its animations
 * have settled. `--full` saves full-page screenshots with reduced motion, light
 * and dark, which are deterministic and so can be compared pixel for pixel. The
 * main page's files keep the names they had when it was the only page; the
 * other page's start with its name.
 *
 * Exit 1 when anything a visitor should never meet happened: a console error, a
 * CSP violation, an exception, a failed request, any request to an origin other
 * than the page's own (rule 5), a dash in the copy, a diagram without a text
 * alternative, or release steps that did not light up.
 *
 * The browser is `BROWSER` if set, else Edge, else Chrome at their usual
 * Windows paths. It runs with a throwaway profile and without `--remote-allow-
 * origins`, so the debugging port answers only this process on loopback.
 */
import "./local-config.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { decode, encode } from "./compare-shots.mjs";

/**
 * The widths a page is checked at. Desktop and the 390 px phone are the
 * default; `--widths` picks others, by width or "all". Every phone is taken at
 * 2x, which is enough to read and keeps a full page's picture a sensible size.
 */
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  "mobile-360": { width: 360, height: 780, deviceScaleFactor: 2, mobile: true },
  "mobile-430": { width: 430, height: 932, deviceScaleFactor: 2, mobile: true },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true },
  "mobile-320": { width: 320, height: 640, deviceScaleFactor: 2, mobile: true },
};
const DEFAULT_VIEWPORTS = ["desktop", "mobile"];
/** A page's widths for `--widths all`, unless it names its own. */
const ALL_VIEWPORTS = ["desktop", "mobile", "mobile-360", "mobile-430", "tablet"];

/**
 * The site's pages, by path. Each has its sections (by the element that holds
 * each one, as the briefs name them), how it is exercised, how long a section
 * takes to settle before its screenshot, and the prefix of its files.
 */
const PAGES = {
  "/": {
    name: "main page",
    prefix: "",
    settle: 6000,
    exercise: exerciseMain,
    sections: [
      ["01-hero", "header.hero"],
      ["02-problem", "section[aria-labelledby=problem-h]"],
      ["03-four-steps", "#how"],
      ["04-try-to-break-it", "#break"],
      ["05-where-it-belongs", "#where"],
      ["06-laptop", "#hardware"],
      ["07-safety", "section[aria-labelledby=safe-h]"],
      ["08-open-source", "section[aria-labelledby=open-h]"],
      ["09-teams", "#enterprise"],
      ["10-comparison", "#compare"],
      ["11-waitlist", "#waitlist"],
      ["12-footer", "footer"],
    ],
  },
  "/under-the-hood": {
    name: "under the hood",
    prefix: "uth-",
    settle: 2500,
    exercise: exerciseUnderTheHood,
    sections: [
      ["01-header", "header.head"],
      ["02-labels", "#labels"],
      ["03-stack", "#stack"],
      ["04-isolation", "#isolation"],
      ["05-release", "#release"],
      ["06-backups", "#backups"],
      ["07-rollback", "#rollback"],
      ["08-keys", "#keys"],
      ["09-offsite", "#offsite"],
      ["10-planned", "#planned"],
      ["11-limits", "#limits"],
      ["12-rules", "#rules"],
      ["13-source", "#source"],
      ["14-footer", "footer"],
    ],
  },
  "/demo": {
    name: "demo",
    prefix: "demo-",
    settle: 1200,
    exercise: exerciseDemo,
    widths: ["desktop", "tablet", "mobile", "mobile-360", "mobile-320"],
    schemes: ["light", "dark"],
    sections: [
      ["01-banner", ".demo-banner"],
      ["02-side", ".side"],
      ["03-main", "#main"],
    ],
  },
};

/* ------------------------------------------------------------ the browser -- */

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("no browser found; set BROWSER to a Chromium-based browser");
  return found;
}

async function launch() {
  const profile = mkdtempSync(path.join(tmpdir(), "check-page-"));
  const child = spawn(
    findBrowser(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-sync",
      "--disable-background-networking",
      "--disable-component-update",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const port = await new Promise((resolve, reject) => {
    let seen = "";
    const timer = setTimeout(() => reject(new Error(`the browser did not start:\n${seen}`)), 20_000);
    child.stderr.on("data", (chunk) => {
      seen += chunk;
      const match = seen.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on("exit", (code) => reject(new Error(`the browser exited with ${code}:\n${seen}`)));
  });

  const close = async () => {
    child.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { port, close };
}

/** A minimal CDP client over one page's WebSocket. */
async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let next = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result);
    } else {
      for (const handler of handlers.get(message.method) ?? []) handler(message.params);
    }
  });

  return {
    send(method, params = {}) {
      const id = (next += 1);
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
    },
    on(method, handler) {
      handlers.set(method, [...(handlers.get(method) ?? []), handler]);
    },
    close: () => ws.close(),
  };
}

/* --------------------------------------------------------------- one load -- */

/**
 * Everything the browser reports while the page is open, for one viewport.
 * `media` sets `prefers-reduced-motion` and `prefers-color-scheme` before the
 * page loads, because the page reads them once at start.
 */
async function open(cdp, url, viewport, media = []) {
  await cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORTS[viewport]);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: VIEWPORTS[viewport].mobile });
  await cdp.send("Emulation.setEmulatedMedia", { features: media });

  const loaded = new Promise((resolve) => cdp.on("Page.loadEventFired", resolve));
  await cdp.send("Page.navigate", { url });
  await loaded;

  const fonts = await evaluate(
    cdp,
    `document.fonts.ready.then(() => [...document.fonts].map(f => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status))`,
  );
  return { fonts };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result.value;
}

/** Wait until an expression is truthy, or give up after `ms`. */
async function until(cdp, expression, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Every interactive part of the main page, in order, and what each one left
 * behind. The result is plain data, so two runs compare with a JSON equality.
 */
async function exerciseMain(cdp) {
  const did = {};

  /* The scroll-driven steps: scroll the whole page, half a screen at a time. */
  const height = await evaluate(cdp, "document.documentElement.scrollHeight");
  const step = await evaluate(cdp, "Math.round(innerHeight / 2)");
  const activeSeen = new Set();
  for (let y = 0; y <= height; y += step) {
    await evaluate(cdp, `scrollTo(0, ${y})`);
    await sleep(120);
    activeSeen.add(await evaluate(cdp, "[...document.querySelectorAll('.step')].findIndex(s => s.classList.contains('is-active'))"));
  }
  did.stepsActivatedWhileScrolling = [...activeSeen].sort();

  /* On narrow screens each step is a card with its own scene, which plays when
     it comes into view: scrolled to, each must be playing; at the top of the
     page, none. On a desktop there are no cards, and this is null. */
  did.scenesPlayInView = await evaluate(cdp, "document.querySelector('.flow.cards') ? [] : null");
  if (did.scenesPlayInView) {
    for (let i = 0; i < 4; i += 1) {
      await evaluate(cdp, `document.querySelectorAll('.scene')[${i}].scrollIntoView({ block: 'center' })`);
      await sleep(1600);
      did.scenesPlayInView.push(await evaluate(cdp, `document.querySelectorAll('.scene')[${i}].classList.contains('is-active')`));
    }
    await evaluate(cdp, "scrollTo(0, 0)");
    await sleep(800);
    did.scenesPlayingAtTheTop = await evaluate(cdp, "document.querySelectorAll('.scene.is-active').length");
  }

  /* The headline replays the tear. */
  await evaluate(cdp, "scrollTo(0, 0)");
  await evaluate(cdp, "document.querySelector('.headline').click()");
  did.headlineReplay = await evaluate(cdp, "document.querySelector('.hero').classList.contains('play')");

  /* "Go on, try to break it": a good release, then a broken one. */
  await evaluate(cdp, "document.querySelector('#break').scrollIntoView()");
  const lastLog = "[...document.querySelectorAll('[data-log] p')].map(p => (p.className ? p.className + ': ' : '') + p.textContent)";
  const idle = "[...document.querySelectorAll('[data-ship]')].every(b => !b.disabled)";
  await evaluate(cdp, "document.querySelector('[data-ship=\"good\"]').click()");
  did.buttonsDisabledWhileRunning = await evaluate(cdp, "[...document.querySelectorAll('[data-ship]')].every(b => b.disabled)");
  did.goodRunFinished = await until(cdp, idle, 20_000);
  did.afterGood = { live: await evaluate(cdp, "document.querySelector('[data-live]').textContent"), log: await evaluate(cdp, lastLog) };
  await evaluate(cdp, "document.querySelector('[data-ship=\"broken\"]').click()");
  did.brokenRunFinished = await until(cdp, idle, 20_000);
  did.afterBroken = { live: await evaluate(cdp, "document.querySelector('[data-live]').textContent"), log: await evaluate(cdp, lastLog) };

  /* "Everything goes where it belongs": plays in view, and the button replays. */
  await evaluate(cdp, "document.querySelector('#where').scrollIntoView()");
  await sleep(300);
  await evaluate(cdp, "document.querySelector('[data-replay-routes]').click()");
  did.routesReplay = await evaluate(cdp, "document.querySelector('[data-routes]').classList.contains('run')");

  /* The laptop: boots in view, and the button replays. */
  await evaluate(cdp, "document.querySelector('.laptop').scrollIntoView()");
  await sleep(300);
  await evaluate(cdp, "document.querySelector('[data-boot]').click()");
  did.laptopBoot = await evaluate(cdp, "document.querySelector('.laptop').classList.contains('boot')");

  /* The waitlist: an honest mockup that sends nothing. */
  const before = await evaluate(cdp, "location.href");
  await evaluate(cdp, "document.querySelector('#waitlist').scrollIntoView()");
  await evaluate(cdp, "document.querySelector('#email').value = 'someone@example.com'");
  await evaluate(cdp, "document.querySelector('[data-signup]').requestSubmit()");
  await sleep(300);
  did.waitlist = {
    thanks: await evaluate(cdp, "document.querySelector('[data-thanks]').textContent"),
    stayedOnPage: (await evaluate(cdp, "location.href")) === before,
  };

  return did;
}

/**
 * Under the hood: the release steps light up once, when they come into view
 * (and not before); the headings; and what each diagram says to someone who
 * cannot see it. Plain data, like the main page's.
 */
async function exerciseUnderTheHood(cdp) {
  const did = {};
  const lit = "[...document.querySelectorAll('.pipe .nd circle')].filter(c => getComputedStyle(c).fill === 'rgb(0, 166, 80)').length";

  await evaluate(cdp, "scrollTo(0, 0)");
  did.releaseStepsBeforeInView = await evaluate(cdp, `({ dim: document.querySelector('.pipe').classList.contains('dim'), lit: ${lit} })`);
  const height = await evaluate(cdp, "document.documentElement.scrollHeight");
  const step = await evaluate(cdp, "Math.round(innerHeight / 2)");
  for (let y = 0; y <= height; y += step) {
    await evaluate(cdp, `scrollTo(0, ${y})`);
    await sleep(120);
  }
  await evaluate(cdp, "document.querySelector('.pipe').scrollIntoView({ block: 'center' })");
  await sleep(2600);
  did.releaseStepsAfterInView = await evaluate(cdp, `({ dim: document.querySelector('.pipe').classList.contains('dim'), lit: ${lit}, of: document.querySelectorAll('.pipe .nd').length })`);

  did.headings = await evaluate(
    cdp,
    "({ h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()), h2: [...document.querySelectorAll('h2')].map(h => h.textContent.trim()) })",
  );
  did.diagrams = await evaluate(
    cdp,
    `[...document.querySelectorAll('svg:not([aria-hidden="true"])')].map(svg => {
      const text = (ids) => (ids ?? '').split(/\\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent.trim() ?? '');
      const [name = '', description = ''] = text(svg.getAttribute('aria-labelledby'));
      return { role: svg.getAttribute('role'), name, descriptionWords: description.split(/\\s+/).filter(Boolean).length };
    })`,
  );
  did.labels = await evaluate(
    cdp,
    `(() => { const n = (s) => document.querySelectorAll('[data-fact] .badge.' + s).length;
      return { statements: document.querySelectorAll('[data-fact]:not(figure)').length, built: n('b-built'), verifiedOnHardware: n('b-hw'), planned: n('b-planned') }; })()`,
  );
  did.navCurrent = await evaluate(cdp, "[...document.querySelectorAll('[aria-current=page]')].map(a => a.getAttribute('href'))");
  return did;
}

/** Keys as a keyboard sends them: a real keydown, with the browser's own default (Tab moves focus). */
const KEY_CODES = { Enter: 13, Tab: 9, Escape: 27, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
async function press(cdp, key, { shift = false } = {}) {
  const event = { key, code: key, windowsVirtualKeyCode: KEY_CODES[key], nativeVirtualKeyCode: KEY_CODES[key], modifiers: shift ? 8 : 0 };
  // Enter carries its character, as a real one does, so that it also presses a button.
  await cdp.send("Input.dispatchKeyEvent", key === "Enter" ? { type: "keyDown", text: "\r", unmodifiedText: "\r", ...event } : { type: "rawKeyDown", ...event });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  await sleep(60);
}

/** How far the page is wider than its window, in CSS pixels; 0 when it is not. */
const OVERFLOW = "Math.max(0, Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)";
/**
 * The same inside the demo's own scrolling parts: from 1081 px its app view is
 * two sides the height of the window, each scrolling on its own, so something
 * too wide there would widen a side, not the page. Its code viewer and its map
 * scroll sideways on purpose and are not among these.
 */
const INNER_OVERFLOW = "Math.max(0, ...[...document.querySelectorAll('#rpane, #lpane, #chat, #log, #dialog, #more-menu')].filter(e => e.getClientRects().length).map(e => e.scrollWidth - e.clientWidth))";

/**
 * The control panel's demo (D27, D31), the way a person would use it, from the
 * keyboard where the brief asks for it. Plain data, like the other pages'; each
 * `ok` says whether the step did what it must.
 */
async function exerciseDemo(cdp) {
  const did = { overflow: {} };
  const q = (selector) => JSON.stringify(selector);
  // A missing element is a failed step, seen in its result, not a stopped run.
  const click = (selector) => evaluate(cdp, `document.querySelector(${q(selector)})?.click() ?? "missing"`);
  const text = (selector) => evaluate(cdp, `document.querySelector(${q(selector)})?.textContent.trim() ?? null`);
  const count = (selector) => evaluate(cdp, `document.querySelectorAll(${q(selector)}).length`);
  const shown = (selector) => evaluate(cdp, `(document.querySelector(${q(selector)})?.getClientRects().length ?? 0) > 0`);
  const active = () => evaluate(cdp, "(() => { const a = document.activeElement; return a ? (a.id || a.dataset.action || a.tagName.toLowerCase()) : null; })()");
  const inDialog = "!!document.querySelector('#dialog')?.contains(document.activeElement)";
  const overflowAt = async (state) => { did.overflow[state] = await evaluate(cdp, `Math.max(${OVERFLOW}, ${INNER_OVERFLOW})`); };
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });

  /* Up to 1080 px the app view is one row of tabs (Chat, Preview, Code, Live);
     from 1081 px, two sides with a tab list each. */
  const narrow = await evaluate(cdp, "matchMedia('(max-width:1080px)').matches");
  did.layout = narrow ? "one row of tabs" : "two sides";
  const showRight = async (id) => { await click(narrow ? `#mtab-${id}` : `#rtab-${id}`); await sleep(150); };
  const openGuestbook = async () => { await click('#nav [data-open="guestbook"]'); await sleep(300); if (narrow) await showRight("preview"); };

  await overflowAt("home");
  did.bannerLink = await evaluate(cdp, "(() => { const a = document.querySelector('.demo-banner a.back'); return a && { href: a.getAttribute('href'), text: a.textContent, visible: a.getClientRects().length > 0 }; })()");

  /* Grandma's guestbook: step 2 is ready to try, on the line above the preview. */
  await openGuestbook();
  await overflowAt("app, simple: preview");

  /* The report dialog, opened from the keyboard, with focus on its first question. */
  await evaluate(cdp, "document.querySelector('[data-action=\"report\"][data-i=\"1\"]')?.focus()");
  await press(cdp, "Enter");
  await sleep(300);
  did.reportDialog = { open: await evaluate(cdp, "!document.querySelector('#modal').hidden"), focus: await active() };
  did.reportDialog.ok = did.reportDialog.open && did.reportDialog.focus === "r-did";
  await overflowAt("report dialog");

  /* A mark made with the keyboard: Enter, move, resize, Enter to place it. */
  await evaluate(cdp, "document.querySelector('#shot')?.focus()");
  await press(cdp, "Enter");
  await press(cdp, "ArrowRight");
  await press(cdp, "ArrowRight");
  await press(cdp, "ArrowDown", { shift: true });
  await press(cdp, "Enter");
  did.keyboardMark = await evaluate(cdp, "({ placed: document.querySelectorAll('#shot .mark:not(.active)').length, moving: document.querySelectorAll('#shot .mark.active').length, said: document.querySelector('#mark-count')?.textContent ?? null })");
  did.keyboardMark.ok = did.keyboardMark.placed === 1 && did.keyboardMark.moving === 0 && did.keyboardMark.said === "1 area marked.";

  /* Tab never leaves the open dialog, forwards or backwards. */
  const stops = await evaluate(cdp, "document.querySelectorAll('#dialog button, #dialog textarea, #dialog input, #dialog summary, #dialog [tabindex]').length");
  let outside = 0;
  for (let i = 0; i < stops + 3; i += 1) { await press(cdp, "Tab"); if (!(await evaluate(cdp, inDialog))) outside += 1; }
  for (let i = 0; i < stops + 3; i += 1) { await press(cdp, "Tab", { shift: true }); if (!(await evaluate(cdp, inDialog))) outside += 1; }
  did.tabInDialog = { presses: 2 * (stops + 3), outside, ok: outside === 0 };

  /* An empty last answer is refused, and says why, where the person is. */
  await evaluate(cdp, "(document.querySelector('#r-got') ?? {}).value = ''");
  await click('[data-action="send-report"]');
  await sleep(200);
  did.emptyAnswer = { stillOpen: await evaluate(cdp, "!document.querySelector('#modal').hidden"), said: await evaluate(cdp, "document.querySelector('#r-err')?.textContent ?? ''"), focus: await active() };
  did.emptyAnswer.ok = did.emptyAnswer.stillOpen && did.emptyAnswer.said.length > 0 && did.emptyAnswer.focus === "r-got";

  /* Escape closes it, and focus goes back to what opened it. */
  await press(cdp, "Escape");
  did.dialogClosed = { hidden: await evaluate(cdp, "document.querySelector('#modal').hidden"), focus: await active() };
  did.dialogClosed.ok = did.dialogClosed.hidden && did.dialogClosed.focus === "report";

  /* One tab list, from the keyboard (the product's control-panel rule 7): each
     arrow, Home and End must move focus to the tab it names, select it, leave
     it the only tab in the Tab order, and show its panel. The tabs and where
     they start come from the page; the keys go all the way round. */
  const tabList = async (list, state) => {
    const tabs = `${list} [role="tab"]`;
    const ids = await evaluate(cdp, `[...document.querySelectorAll(${q(tabs)})].map(t => t.id)`);
    const visible = await shown(list);
    if (!ids.length || !visible) return { list, visible, ids, ok: false };
    let i = Math.max(0, await evaluate(cdp, `[...document.querySelectorAll(${q(tabs)})].findIndex(t => t.getAttribute('aria-selected') === 'true')`));
    await evaluate(cdp, `document.querySelectorAll(${q(tabs)})[${i}]?.focus()`);
    const n = ids.length;
    const expected = [];
    const seen = [];
    for (const key of [...Array(n).fill("ArrowRight"), "End", "Home", "ArrowLeft", "Home"]) {
      i = key === "ArrowRight" ? (i + 1) % n : key === "ArrowLeft" ? (i + n - 1) % n : key === "Home" ? 0 : n - 1;
      expected.push(ids[i]);
      await press(cdp, key);
      await sleep(100);
      seen.push(await evaluate(cdp, `(() => { const a = document.activeElement;
        if (!a || a.getAttribute('role') !== 'tab') return a ? 'focus on ' + (a.id || a.tagName.toLowerCase()) : null;
        const all = [...a.closest('[role=tablist]').querySelectorAll('[role=tab]')];
        const alone = all.filter(t => t.getAttribute('aria-selected') === 'true').length === 1 && all.filter(t => t.tabIndex === 0).length === 1 && a.tabIndex === 0;
        const panel = document.getElementById(a.getAttribute('aria-controls'));
        return a.id + (a.getAttribute('aria-selected') === 'true' ? '' : ' (not selected)') + (alone ? '' : ' (not the only one)') + (panel && panel.getClientRects().length ? '' : ' (its panel not shown)'); })()`));
      await overflowAt(`${state}: ${ids[i]}`);
    }
    return { list, seen, ok: seen.join() === expected.join() };
  };
  const lists = {};
  lists["simple #" + (narrow ? "mtabs" : "rtabs")] = await tabList(narrow ? "#mtabs" : "#rtabs", "app, simple");
  await showRight("preview");

  /* "More", next to the app's name: the backups, the service keys and the app's settings. */
  await click("#more-btn");
  await sleep(100);
  did.more = { open: await shown("#more-menu"), items: await evaluate(cdp, "[...document.querySelectorAll('#more-menu button')].map(b => b.firstChild.textContent.trim())") };
  await overflowAt("app: More");
  await press(cdp, "Escape");
  did.more.closed = !(await shown("#more-menu"));
  did.more.focus = await active();
  for (const [action, name] of [["more-backups", "backups"], ["more-keys", "keys"], ["more-settings", "settings"]]) {
    await click("#more-btn");
    await click(`[data-action="${action}"]`);
    await sleep(200);
    did.more[name] = await text("#dialog-title");
    await overflowAt(`app: More, ${name}`);
    await press(cdp, "Escape");
    did.more[`${name}, focus back`] = await active();
  }
  did.more.ok = did.more.open && did.more.items.join() === "Backups,Service keys,App settings" && did.more.closed && did.more.focus === "more-btn" &&
    did.more.backups === "Backups of Grandma's guestbook" && did.more.keys === "Service keys of Grandma's guestbook" && did.more.settings === "Settings of Grandma's guestbook" &&
    ["backups", "keys", "settings"].every((name) => did.more[`${name}, focus back`] === "more-btn");

  /* Turning advanced mode on and off does not move the preview (D55): where it
     is, from the top of the page, before, with advanced mode on, and after. On
     a phone the switch is in the menu, and the preview is under its tab. */
  const frame = () => evaluate(cdp, "(() => { scrollTo(0, 0); const f = document.querySelector('#preview-frame'); if (!f || !f.getClientRects().length) return null; const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()");
  const same = (a, b) => !!a && !!b && ["x", "y", "width", "height"].every((k) => Math.abs(a[k] - b[k]) <= 0.5);
  const still = { simple: await frame() };
  if (narrow) await click("#menu-btn");
  await evaluate(cdp, "document.querySelector('#mode-switch')?.focus()");
  await press(cdp, "Enter");
  await sleep(200);
  still.dialog = await text("#dialog-title");
  await overflowAt("advanced mode dialog");
  await click("#adv-ok");
  await click("#adv-go");
  await sleep(300);
  still.mode = await evaluate(cdp, "document.querySelector('#mode-switch')?.getAttribute('aria-checked') ?? null");
  still.advanced = await frame();
  await overflowAt("app, advanced: preview");

  /* In advanced mode: the right side gains Code, and the left side Plan and Build. */
  lists["advanced #" + (narrow ? "mtabs" : "rtabs")] = await tabList(narrow ? "#mtabs" : "#rtabs", "app, advanced");
  if (narrow) await click("#mtab-chat");
  lists["advanced #ltabs"] = await tabList("#ltabs", "app, advanced");
  did.tabLists = { lists, ok: Object.keys(lists).length === 3 && Object.values(lists).every((l) => l.ok) };
  await showRight("code");
  await click('[data-file="STATE.md"]');
  did.code = { file: await text("#rpane .code .fh span") };
  await overflowAt("app, advanced: code, STATE.md");

  /* The other screens that only advanced mode has, or shows more of. */
  for (const view of ["services", "machine", "settings"]) { await click(`#nav [data-go="${view}"]`); await sleep(200); await overflowAt(`${view}, advanced`); }
  await openGuestbook();
  still.advancedAgain = await frame();
  await click('.chipline [data-action="to-simple"]');
  await sleep(300);
  still.back = await frame();
  still.ok = still.dialog === "Turn on advanced mode?" && still.mode === "true" && same(still.simple, still.advanced) && same(still.simple, still.advancedAgain) && same(still.simple, still.back);
  did.previewStill = still;

  /* A new app opens in planning, and "Looks good, start building" starts it. */
  const fresh = {};
  await click('#nav [data-action="new-app"]');
  await sleep(200);
  fresh.dialog = await text("#dialog-title");
  await overflowAt("new app dialog");
  await click('[data-action="make-plan"]');
  fresh.planned = await until(cdp, "!!document.querySelector('#approve')", 5000);
  fresh.name = await text("#app-name");
  fresh.proposed = await count("#plan-box li.proposed");
  fresh.button = await text("#approve");
  fresh.focus = await active();
  await overflowAt("new app: planning");
  if (narrow) await showRight("preview");
  fresh.line = await text("#tryline");
  fresh.starter = await text("#preview-frame .tc-h");
  await overflowAt("new app: planning, preview");
  if (narrow) await click("#mtab-chat");
  await click("#approve");
  await sleep(200);
  fresh.building = await count("#plan-box li.building");
  fresh.said = await evaluate(cdp, "[...document.querySelectorAll('#chat .status')].map(s => s.textContent.trim()).pop() ?? null");
  if (narrow) await showRight("preview");
  fresh.lineAfter = await text("#tryline");
  await overflowAt("new app: building");
  fresh.ready = await until(cdp, "!!document.querySelector('[data-action=\"works\"][data-i=\"0\"]')", 10_000);
  fresh.ok = fresh.dialog === "Start a new app" && fresh.planned && fresh.name === "Chore chart" && fresh.proposed === 3 && fresh.button === "Looks good, start building" && fresh.focus === "approve" &&
    /^This is your app as it is now\./.test(fresh.line ?? "") && fresh.starter === "Guestbook" &&
    fresh.building === 1 && fresh.said === "Building step 1" && /^Building step 1:/.test(fresh.lineAfter ?? "") && fresh.ready;
  did.newApp = fresh;

  /* The whole way from trying the last step to "v3 is live", in Live. */
  const flow = {};
  await openGuestbook();
  await click('[data-action="works"][data-i="1"]');
  flow.lastStepReady = await until(cdp, "!!document.querySelector('[data-action=\"works\"][data-i=\"2\"]')", 10_000);
  if (flow.lastStepReady) await click('[data-action="works"][data-i="2"]');
  flow.allTried = await until(cdp, "!!document.querySelector('#tryline [data-action=\"to-live\"]')", 5000);
  await evaluate(cdp, "document.querySelector('#tryline [data-action=\"to-live\"]')?.focus()");
  await press(cdp, "Enter");
  await sleep(200);
  flow.liveTab = await evaluate(cdp, `document.querySelector(${q(narrow ? "#mtab-live" : "#rtab-live")})?.getAttribute('aria-selected') ?? null`);
  flow.button = await text('[data-action="ship"]');
  flow.focus = await active();
  await overflowAt("app: Live, ready to put live");
  await click('[data-action="ship"]');
  await sleep(1200);
  flow.putting = await text("#shipcard h2");
  await overflowAt("app: Live, putting v3 live");
  flow.live = await until(cdp, "document.querySelector('#shipcard h2')?.textContent === 'v3 is live.'", 15_000);
  flow.result = await text("#shipcard h2");
  flow.checksDone = await count("#shipcard .safety li.done");
  flow.chip = await text("#apphead .chip");
  flow.versions = await evaluate(cdp, "[...document.querySelectorAll('#rpane .vrow')].map(r => r.querySelector('b')?.textContent + ' ' + (r.querySelector('.chip, button')?.textContent ?? ''))");
  await overflowAt("app: Live, v3 is live");
  await click('[data-action="rollback"][data-v="2"]');
  await sleep(200);
  flow.goBack = await text("#dialog-title");
  await overflowAt("go back dialog");
  await press(cdp, "Escape");
  flow.ok = flow.lastStepReady && flow.allTried && flow.liveTab === "true" && flow.button === "Put v3 live" && flow.focus === "ship" && flow.putting === "Putting v3 live" &&
    flow.live && flow.checksDone === 6 && flow.chip === "v3 is live" && flow.versions.join() === "v3 Live now,v2 Go back to v2,v1 Go back to v1" && flow.goBack === "Go back to v2?";
  did.lastStepToLive = flow;

  /* The other screens, and the second way to connect an AI: in the app, what
     the person's own AI app posted and did, and the box to continue there. */
  for (const view of ["machine", "backups"]) { await click(`#nav [data-go="${view}"]`); await sleep(200); await overflowAt(view); }
  await click('#nav [data-go="settings"]');
  await sleep(200);
  await overflowAt("settings");
  const own = {};
  await click('input[data-mode="mcp"]');
  await sleep(200);
  own.dialog = await text("#dialog-title");
  await overflowAt("connect your own AI app");
  await press(cdp, "Escape");
  await openGuestbook();
  if (narrow) await click("#mtab-chat");
  own.who = await text("#who-h");
  own.posted = await count("#chat .posted");
  own.said = await count("#chat .msg.you");
  own.box = await text("#continue b");
  own.input = await count("#say");
  await overflowAt("app, your own AI app");
  own.ok = own.dialog === "Connect your own AI app" && own.who === "Your AI app" && own.posted > 0 && own.said === 0 && own.box === "Continue in your AI app." && own.input === 0;
  did.ownAiApp = own;

  /* "Start over" puts everything back. */
  await click('[data-action="reset"]');
  await sleep(300);
  did.startOver = await evaluate(cdp, "({ heading: document.querySelector('#main h1')?.textContent, guestbook: document.querySelector('.app-card .chip')?.textContent, apps: document.querySelectorAll('#nav [data-open]').length, advanced: document.querySelector('#mode-switch')?.getAttribute('aria-checked') })");
  await click('#nav [data-go="settings"]');
  await sleep(200);
  did.startOver.panel = await evaluate(cdp, "document.querySelector('input[data-mode=\"panel\"]')?.checked ?? null");
  await click('#nav [data-go="home"]');
  did.startOver.ok = did.startOver.heading === "Your apps" && did.startOver.guestbook === "v2 is live" && did.startOver.apps === 2 && did.startOver.advanced === "false" && did.startOver.panel === true;

  did.overflowMax = Math.max(...Object.values(did.overflow));
  did.failed = ["reportDialog", "keyboardMark", "tabInDialog", "emptyAnswer", "dialogClosed", "tabLists", "more", "previewStill", "newApp", "lastStepToLive", "ownAiApp", "startOver"].filter((k) => !did[k]?.ok);
  if (!did.bannerLink || did.bannerLink.href !== "/" || !did.bannerLink.visible) did.failed.push("bannerLink");
  if (did.overflowMax > 0) did.failed.push("overflow");
  return did;
}

/**
 * Checks every page must pass, whatever it is: no en or em dash in its text or
 * in any text alternative (the owner's rule for copy on the site), and, for
 * every drawing that is not hidden from assistive technology, a name and a
 * description.
 */
async function pageChecks(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const dash = /[\\u2013\\u2014]/;
      const dashes = [];
      const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement && node.parentElement.closest('script, style')) continue;
        if (dash.test(node.nodeValue)) dashes.push(node.nodeValue.trim().slice(0, 80));
      }
      for (const el of document.querySelectorAll('[aria-label], [title], [alt], [placeholder], meta[name="description"]')) {
        for (const attribute of ['aria-label', 'title', 'alt', 'placeholder', 'content']) {
          const value = el.getAttribute(attribute);
          if (value && dash.test(value)) dashes.push(attribute + ': ' + value.slice(0, 80));
        }
      }
      const unnamed = [...document.querySelectorAll('svg[role="img"]')]
        .filter(svg => !(svg.getAttribute('aria-label') || (svg.getAttribute('aria-labelledby') ?? '').split(/\\s+/).some(id => document.getElementById(id)?.textContent.trim())))
        .map(svg => svg.outerHTML.slice(0, 60));
      return { dashes, unnamedDrawings: unnamed, overflow: ${OVERFLOW} };
    })()`,
  );
}

/** The type each kind of icon file must be served with (D26). */
const ICON_TYPES = {
  ico: /^image\/(x-icon|vnd\.microsoft\.icon)\b/,
  svg: /^image\/svg\+xml\b/,
  png: /^image\/png\b/,
  webmanifest: /^application\/manifest\+json\b/,
};

/**
 * Every icon the page's head declares, its web manifest included, and every
 * icon that manifest names: each fetched as a browser would, and each must
 * answer 200 with its own type, nosniff and a cache time. A page that declares
 * no icon at all fails too.
 */
async function iconChecks(cdp) {
  const declared = await evaluate(cdp, "[...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon], link[rel=manifest]')].map(l => l.href)");
  const urls = new Set(declared);
  for (const url of declared.filter((u) => u.endsWith(".webmanifest"))) {
    try {
      const manifest = await (await fetch(url)).json();
      for (const icon of manifest.icons ?? []) urls.add(new URL(icon.src, url).href);
    } catch {
      /* an unreadable manifest fails below, on its own type or status */
    }
  }
  const icons = [];
  for (const url of urls) {
    const response = await fetch(url);
    await response.arrayBuffer();
    const type = response.headers.get("content-type") ?? "";
    const cache = response.headers.get("cache-control") ?? "";
    const wanted = ICON_TYPES[new URL(url).pathname.split(".").pop()];
    icons.push({
      path: new URL(url).pathname,
      status: response.status,
      type,
      cache,
      ok: response.status === 200 && Boolean(wanted?.test(type)) && response.headers.get("x-content-type-options") === "nosniff" && /max-age=\d+/.test(cache),
    });
  }
  return { declared: declared.length, icons };
}

/** One screenshot per section, each after its animations have settled. */
async function sectionShots(cdp, dir, viewport, page) {
  const saved = [];
  for (const [name, selector] of page.sections) {
    await evaluate(cdp, `scrollTo(0, document.querySelector('${selector}').getBoundingClientRect().top + scrollY)`);
    await sleep(page.settle);
    const box = await evaluate(
      cdp,
      `(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`,
    );
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { ...box, scale: 1 },
    });
    const file = path.join(dir, `${page.prefix}${viewport}-${name}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    saved.push(file);
  }
  return saved;
}

/** The whole page, with reduced motion: deterministic, for a pixel comparison. */
async function fullShot(cdp, dir, viewport, scheme, page, pin) {
  await sleep(1500);
  /* `--pin steps>4=800,section#planned=2200`: each element, by its key in the
     boxes below, given that height in CSS pixels, the same in both pictures of
     a comparison. A sentence that gains a line moves everything under it by a
     fraction of a pixel, and the main page's background is one gradient and
     grid the height of the page, so otherwise no row below a change would match. */
  if (pin) {
    await evaluate(cdp, `(() => { for (const [key, px] of ${JSON.stringify(pin)}) {
      const [parent, n] = key.split(">");
      const el = document.querySelector(n ? "." + parent + " > :nth-child(" + n + ")" : key);
      if (!el) throw new Error("--pin: nothing is " + key);
      el.style.height = px + "px";
    } })()`);
    await sleep(500);
  }
  const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
  const width = Math.round(cssContentSize.width);
  const height = Math.round(cssContentSize.height);
  /* In slices, put together. Taken in one piece, a page taller than the
     browser draws at once (about 16 000 device pixels: the mobile main page at
     2x is 31 000) comes back with its top repeated where its bottom should be. */
  const slice = Math.floor(8000 / VIEWPORTS[viewport].deviceScaleFactor);
  const parts = [];
  for (let y = 0; y < height; y += slice) {
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y, width, height: Math.min(slice, height - y), scale: 1 },
    });
    parts.push(decode(Buffer.from(shot.data, "base64")));
  }
  const pixelWidth = parts[0].width;
  const rgb = Buffer.alloc(pixelWidth * parts.reduce((sum, p) => sum + p.height, 0) * 3);
  let row = 0;
  for (const part of parts) {
    for (let y = 0; y < part.height; y += 1) {
      for (let x = 0; x < pixelWidth; x += 1) {
        const i = (y * part.width + x) * part.channels;
        const o = ((row + y) * pixelWidth + x) * 3;
        rgb[o] = part.pixels[i];
        rgb[o + 1] = part.pixels[i + 1];
        rgb[o + 2] = part.pixels[i + 2];
      }
    }
    row += part.height;
  }
  const file = path.join(dir, `${page.prefix}full-${viewport}-${scheme}.png`);
  writeFileSync(file, encode(pixelWidth, row, rgb));
  /* Where each landmark is, beside the picture: a comparison can then line up
     the parts of two pages that moved, instead of calling everything below a
     change different. */
  const boxes = await evaluate(
    cdp,
    `(() => { const seen = new Map(); return [...document.querySelectorAll('header, footer, nav, section, [id], .nav-links, .foot-links, .foot-top, .foot-bottom, .open > *, .cta-row, .honest, .dusk, .band')].map(el => {
      const base = el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.classList.length ? '.' + [...el.classList].join('.') : '');
      const n = seen.get(base) ?? 0; seen.set(base, n + 1);
      const r = el.getBoundingClientRect();
      return { key: n ? base + ':' + n : base, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
    }).concat([...document.querySelectorAll('.steps > li, .signs > li, .hero-copy > p')].map(el => {
      /* Items whose classes change as the page runs, named by their place instead: steps>4, signs>2. */
      const r = el.getBoundingClientRect();
      return { key: el.parentElement.classList[0] + '>' + ([...el.parentElement.children].indexOf(el) + 1), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
    })); })()`,
  );
  writeFileSync(file.replace(/\.png$/, ".boxes.json"), `${JSON.stringify(boxes, null, 1)}\n`);
  return file;
}

/* ------------------------------------------------------------------- main -- */

function parse(argv) {
  let [url, ...rest] = argv;
  // The deployed site, at the address and port in local.env, which this public
  // repository never names (D14).
  if (url === "--deployed") {
    const bind = process.env.WEB_BIND?.trim();
    const port = process.env.WEB_PORT?.trim();
    if (!bind || !port) throw new Error("--deployed needs WEB_BIND and WEB_PORT in local.env (see local.example.env)");
    url = `http://${bind}:${port}/`;
  }
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--shots") options.shots = rest[(i += 1)];
    else if (rest[i] === "--full") options.full = rest[(i += 1)];
    else if (rest[i] === "--json") options.json = rest[(i += 1)];
    else if (rest[i] === "--pin") options.pin = rest[(i += 1)].split(",").map((p) => {
      const [key, px] = p.split("=");
      if (!/^([\w-]+>\d+|[a-z]+[#.][\w-]+)$/.test(key) || !(Number(px) > 0)) throw new Error(`--pin wants key=px, as in steps>4=800 or section#planned=2200, not ${p}`);
      return [key, Number(px)];
    });
    // "main" rather than "/": Git Bash rewrites a lone "/" into a Windows path.
    else if (rest[i] === "--page") options.page = rest[(i += 1)] === "main" ? "/" : `/${rest[i].replace(/^\/+/, "")}`;
    else if (rest[i] === "--widths") {
      const wanted = rest[(i += 1)];
      options.viewports = wanted === "all"
        ? "all"
        : wanted.split(",").map((w) => {
            const key = Object.keys(VIEWPORTS).find((k) => String(VIEWPORTS[k].width) === w.trim() || k === w.trim());
            if (!key) throw new Error(`no width ${w}; the widths are ${Object.values(VIEWPORTS).map((v) => v.width).join(", ")}`);
            return key;
          });
    }
    else throw new Error(`unknown option ${rest[i]}`);
  }
  if (!url || !/^https?:\/\//.test(url)) throw new Error("usage: check-page.mjs <http(s) url> [--page main|under-the-hood|demo] [--widths all|320,360,390,...] [--shots dir] [--full dir [--pin key=px,...]] [--json file]");
  // The root is the whole site, or the one page --page names; any other path is
  // that one page.
  const where = new URL(url);
  const paths = options.page ? [options.page] : where.pathname === "/" ? Object.keys(PAGES) : [where.pathname.replace(/\/$/, "")];
  for (const p of paths) if (!PAGES[p]) throw new Error(`no page ${p}; the pages are ${Object.keys(PAGES).join(" and ")}`);
  return { url, origin: where.origin, paths, options };
}

/** One page at one width: everything the browser reported, and every check. */
async function checkOne(browser, url, origin, page, viewport, options) {
  const cdp = await connect(browser.port);
  const seen = { requests: [], failed: [], log: [], console: [], exceptions: [], document: null };
  cdp.on("Network.requestWillBeSent", ({ request, type }) => seen.requests.push({ url: request.url, type }));
  cdp.on("Network.loadingFailed", ({ errorText, blockedReason, type }) => seen.failed.push({ errorText, blockedReason, type }));
  cdp.on("Network.responseReceived", ({ type, response }) => {
    if (type === "Document") seen.document = { status: response.status, headers: response.headers };
  });
  cdp.on("Log.entryAdded", ({ entry }) => seen.log.push({ level: entry.level, source: entry.source, text: entry.text, url: entry.url }));
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => seen.console.push({ type, text: args.map((a) => a.value ?? a.description).join(" ") }));
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => seen.exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text));

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  /* The page's own view of CSP violations, beside the browser's log. */
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "window.__csp = []; document.addEventListener('securitypolicyviolation', e => " +
      "window.__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample }), true);",
  });

  /* Light, explicitly: headless follows the OS, and this box runs dark. A page
     that asks for both (the demo) is exercised in each, from a fresh load. */
  const schemes = page.schemes ?? ["light"];
  const byScheme = {};
  let fonts = [];
  let checks = { dashes: [], unnamedDrawings: [], overflow: 0 };
  let csp = [];
  for (const scheme of schemes) {
    ({ fonts } = await open(cdp, url, viewport, [{ name: "prefers-color-scheme", value: scheme }]));
    byScheme[scheme] = await page.exercise(cdp);
    const found = await pageChecks(cdp);
    checks = {
      dashes: [...checks.dashes, ...found.dashes],
      unnamedDrawings: [...checks.unnamedDrawings, ...found.unnamedDrawings],
      overflow: Math.max(checks.overflow, found.overflow),
    };
    csp = [...csp, ...(await evaluate(cdp, "window.__csp"))];
  }
  const did = schemes.length === 1 ? byScheme[schemes[0]] : byScheme;
  const icons = await iconChecks(cdp);
  const shots = options.shots ? await sectionShots(cdp, options.shots, viewport, page) : [];

  const full = [];
  if (options.full) {
    for (const scheme of ["light", "dark"]) {
      await open(cdp, url, viewport, [
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: scheme },
      ]);
      full.push(await fullShot(cdp, options.full, viewport, scheme, page, options.pin));
    }
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  }
  cdp.close();

  const byOrigin = {};
  for (const { url: requested } of seen.requests) {
    const at = /^(data|blob):/.test(requested) ? requested.slice(0, requested.indexOf(":") + 1) : new URL(requested).origin;
    byOrigin[at] = (byOrigin[at] ?? 0) + 1;
  }
  const elsewhere = Object.keys(byOrigin).filter((at) => at !== origin && !/^(data|blob):$/.test(at));
  const errors = [
    ...seen.log.filter((entry) => entry.level === "error"),
    ...seen.console.filter((entry) => entry.type === "error"),
  ];
  /* Under the hood, the release steps must be dim until seen, and all lit after. */
  const steps = did.releaseStepsAfterInView;
  const notLit = steps && (!did.releaseStepsBeforeInView.dim || steps.dim || steps.lit !== steps.of) ? 1 : 0;
  /* On the main page's cards, every scene plays in view, and none at the top. */
  const notPlaying = did.scenesPlayInView ? did.scenesPlayInView.filter((playing) => !playing).length + (did.scenesPlayingAtTheTop ? 1 : 0) : 0;
  /* The demo: every step of its exercise, in every scheme. */
  const demoFailed = page.schemes ? Object.entries(byScheme).flatMap(([scheme, d]) => (d.failed ?? []).map((f) => `${scheme}: ${f}`)) : [];

  const run = {
    document: seen.document,
    requestsByOrigin: byOrigin,
    requests: seen.requests.map((r) => `${r.type} ${r.url.startsWith("data:") ? r.url.slice(0, 40) + "…" : r.url}`),
    otherOrigins: elsewhere,
    failedRequests: seen.failed,
    consoleErrors: errors,
    consoleOther: [...seen.log.filter((entry) => entry.level !== "error"), ...seen.console.filter((entry) => entry.type !== "error")],
    exceptions: seen.exceptions,
    cspViolations: csp,
    dashes: checks.dashes,
    unnamedDrawings: checks.unnamedDrawings,
    overflow: checks.overflow,
    icons: icons.icons,
    fonts,
    behaviour: did,
    shots: [...shots, ...full],
  };
  const bad =
    elsewhere.length + seen.failed.length + errors.length + seen.exceptions.length + csp.length +
    checks.dashes.length + checks.unnamedDrawings.length + notLit + notPlaying +
    icons.icons.filter((icon) => !icon.ok).length + (icons.declared ? 0 : 1) +
    (checks.overflow > 0 ? 1 : 0) + demoFailed.length;

  const out = (line) => process.stdout.write(`${line}\n`);
  out(`\n== ${page.name}, ${viewport} (${VIEWPORTS[viewport].width}x${VIEWPORTS[viewport].height})`);
  out(`document        ${seen.document?.status ?? "?"}`);
  out(`requests        ${Object.entries(byOrigin).map(([k, v]) => `${k} x${v}`).join(", ")}`);
  out(`other origins   ${elsewhere.length === 0 ? "none" : elsewhere.join(", ")}`);
  out(`failed          ${seen.failed.length === 0 ? "none" : JSON.stringify(seen.failed)}`);
  out(`console errors  ${errors.length === 0 ? "none" : ""}`);
  for (const entry of errors) out(`  ${entry.source ?? entry.type}: ${entry.text}`);
  out(`console other   ${run.consoleOther.length === 0 ? "none" : ""}`);
  for (const entry of run.consoleOther) out(`  ${entry.level ?? entry.type}: ${entry.text}`);
  out(`exceptions      ${seen.exceptions.length === 0 ? "none" : seen.exceptions.join("\n")}`);
  out(`CSP violations  ${csp.length === 0 ? "none" : JSON.stringify(csp)}`);
  out(`dashes          ${checks.dashes.length === 0 ? "none" : JSON.stringify(checks.dashes)}`);
  out(`drawings        ${checks.unnamedDrawings.length === 0 ? "every one named" : `unnamed: ${JSON.stringify(checks.unnamedDrawings)}`}`);
  out(`overflow        ${checks.overflow > 0 ? `WIDER than the window by ${checks.overflow} px` : "none"}`);
  out(`icons           ${icons.declared ? icons.icons.map((i) => `${i.ok ? "" : "NOT OK "}${i.path} ${i.status} ${i.type} (${i.cache})`).join("; ") : "NONE declared"}`);
  out(`fonts           ${fonts.join("; ")}`);
  out(`behaviour       ${JSON.stringify(did)}`);
  if (notLit) out("release steps   NOT lit up as they should be: dim until seen, then all lit");
  if (notPlaying) out("scenes          NOT playing as they should: each in view, none at the top");
  if (page.schemes) out(`demo checks     ${demoFailed.length === 0 ? `all as they must be, in ${schemes.join(" and ")}` : `NOT as they must be: ${demoFailed.join(", ")}`}`);
  if (run.shots.length > 0) out(`screenshots     ${run.shots.length} in ${path.dirname(run.shots[0])}`);
  return { run, bad };
}

async function main() {
  const { url, origin, paths, options } = parse(process.argv.slice(2));
  for (const dir of [options.shots, options.full]) if (dir) mkdirSync(dir, { recursive: true });

  const browser = await launch();
  const report = { url, origin, pages: {} };
  let problems = 0;
  let runs = 0;
  const widthsOf = (p) => (options.viewports === "all" ? PAGES[p].widths ?? ALL_VIEWPORTS : options.viewports ?? DEFAULT_VIEWPORTS);

  try {
    for (const p of paths) {
      const pageUrl = new URL(p, origin).href;
      report.pages[p] = { url: pageUrl, runs: {} };
      for (const viewport of widthsOf(p)) {
        const { run, bad } = await checkOne(browser, pageUrl, origin, PAGES[p], viewport, options);
        report.pages[p].runs[viewport] = run;
        problems += bad;
        runs += 1;
      }
    }
  } finally {
    await browser.close();
  }

  if (options.json) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\n${problems === 0 ? `clean: ${paths.length} page(s), ${runs} page and width runs: no errors, no violations, no other origins, no dashes, no overflow` : `${problems} problem(s)`}\n`);
  if (problems > 0) process.exitCode = 1;
}

/* Run when invoked, not when imported: scripts/demo-gallery.mjs uses the browser helpers above. */
const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`check-page: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}

export { VIEWPORTS, launch, connect, open, evaluate, until, press };
