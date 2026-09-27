#!/usr/bin/env node
/**
 * Load the site's pages in a real headless browser and report what a visitor's
 * browser sees (D8).
 *
 *   node scripts/check-page.mjs http://127.0.0.1:8080/                  # every page
 *   node scripts/check-page.mjs http://127.0.0.1:8080/under-the-hood    # one page
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --page main      # the main page alone
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --widths all     # 1440, 390, 360, 430 and 768
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --shots out/after
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --full out/after-full
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --json out/report.json
 *   node scripts/check-page.mjs --deployed              # the production site, from local.env (D14)
 *
 * The site's root means every page: the main page and /under-the-hood (D17).
 * For each, at desktop and at mobile width, or at the widths `--widths` names:
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
 *    every diagram's text alternative. What each one left on the page is
 *    recorded, so two runs can be compared for behaviour and not only for looks;
 *  - no en or em dash anywhere in the page's text or its text alternatives.
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
};
const DEFAULT_VIEWPORTS = ["desktop", "mobile"];

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
      ["10-limits", "#limits"],
      ["11-rules", "#rules"],
      ["12-source", "#source"],
      ["13-footer", "footer"],
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
      return { dashes, unnamedDrawings: unnamed };
    })()`,
  );
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
async function fullShot(cdp, dir, viewport, scheme, page) {
  await sleep(1500);
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
    }); })()`,
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
    // "main" rather than "/": Git Bash rewrites a lone "/" into a Windows path.
    else if (rest[i] === "--page") options.page = rest[(i += 1)] === "main" ? "/" : `/${rest[i].replace(/^\/+/, "")}`;
    else if (rest[i] === "--widths") {
      const wanted = rest[(i += 1)];
      options.viewports = wanted === "all"
        ? Object.keys(VIEWPORTS)
        : wanted.split(",").map((w) => {
            const key = Object.keys(VIEWPORTS).find((k) => String(VIEWPORTS[k].width) === w.trim() || k === w.trim());
            if (!key) throw new Error(`no width ${w}; the widths are ${Object.values(VIEWPORTS).map((v) => v.width).join(", ")}`);
            return key;
          });
    }
    else throw new Error(`unknown option ${rest[i]}`);
  }
  if (!url || !/^https?:\/\//.test(url)) throw new Error("usage: check-page.mjs <http(s) url> [--page main|under-the-hood] [--widths all|360,390,...] [--shots dir] [--full dir] [--json file]");
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

  /* Light, explicitly: headless follows the OS, and this box runs dark. */
  const { fonts } = await open(cdp, url, viewport, [{ name: "prefers-color-scheme", value: "light" }]);
  const did = await page.exercise(cdp);
  const checks = await pageChecks(cdp);
  const shots = options.shots ? await sectionShots(cdp, options.shots, viewport, page) : [];
  const csp = await evaluate(cdp, "window.__csp");

  const full = [];
  if (options.full) {
    for (const scheme of ["light", "dark"]) {
      await open(cdp, url, viewport, [
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: scheme },
      ]);
      full.push(await fullShot(cdp, options.full, viewport, scheme, page));
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
    fonts,
    behaviour: did,
    shots: [...shots, ...full],
  };
  const bad =
    elsewhere.length + seen.failed.length + errors.length + seen.exceptions.length + csp.length +
    checks.dashes.length + checks.unnamedDrawings.length + notLit + notPlaying;

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
  out(`fonts           ${fonts.join("; ")}`);
  out(`behaviour       ${JSON.stringify(did)}`);
  if (notLit) out("release steps   NOT lit up as they should be: dim until seen, then all lit");
  if (notPlaying) out("scenes          NOT playing as they should: each in view, none at the top");
  if (run.shots.length > 0) out(`screenshots     ${run.shots.length} in ${path.dirname(run.shots[0])}`);
  return { run, bad };
}

async function main() {
  const { url, origin, paths, options } = parse(process.argv.slice(2));
  for (const dir of [options.shots, options.full]) if (dir) mkdirSync(dir, { recursive: true });

  const browser = await launch();
  const report = { url, origin, pages: {} };
  let problems = 0;

  try {
    for (const p of paths) {
      const pageUrl = new URL(p, origin).href;
      report.pages[p] = { url: pageUrl, runs: {} };
      for (const viewport of options.viewports ?? DEFAULT_VIEWPORTS) {
        const { run, bad } = await checkOne(browser, pageUrl, origin, PAGES[p], viewport, options);
        report.pages[p].runs[viewport] = run;
        problems += bad;
      }
    }
  } finally {
    await browser.close();
  }

  if (options.json) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\n${problems === 0 ? `clean: ${paths.length} page(s), ${(options.viewports ?? DEFAULT_VIEWPORTS).length} width(s): no errors, no violations, no other origins, no dashes` : `${problems} problem(s)`}\n`);
  if (problems > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`check-page: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
