#!/usr/bin/env node
/**
 * Load the page in a real headless browser and report what a visitor's browser
 * sees (D8).
 *
 *   node scripts/check-page.mjs http://127.0.0.1:8080/
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --shots out/after
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --full out/after-full
 *   node scripts/check-page.mjs http://127.0.0.1:8080/ --json out/report.json
 *
 * One run, at desktop and at mobile width:
 *
 *  - every request the page makes, grouped by origin, and any that failed;
 *  - every console message and uncaught exception, and every Content-Security-
 *    Policy violation, both as the browser logs it and as the page's own
 *    `securitypolicyviolation` event reports it;
 *  - the main document's response headers;
 *  - every interactive part of the page, exercised: the scroll-driven steps, the
 *    headline replay, both "ship" buttons, the laptop and the routes replays,
 *    and the waitlist form. What each one left on the page is recorded, so two
 *    runs can be compared for behaviour and not only for looks.
 *
 * `--shots` saves one screenshot per section and width after its animations
 * have settled. `--full` saves full-page screenshots with reduced motion, light
 * and dark, which are deterministic and so can be compared pixel for pixel.
 *
 * Exit 1 when anything a visitor should never meet happened: a console error, a
 * CSP violation, an exception, a failed request, or any request to an origin
 * other than the page's own (rule 5).
 *
 * The browser is `BROWSER` if set, else Edge, else Chrome at their usual
 * Windows paths. It runs with a throwaway profile and without `--remote-allow-
 * origins`, so the debugging port answers only this process on loopback.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

/** The sections the setup brief names, by the element that holds each one. */
const SECTIONS = [
  ["1-hero", "header.hero"],
  ["2-four-steps", "#how"],
  ["3-try-to-break-it", "#break"],
  ["4-where-it-belongs", "#where"],
  ["5-laptop", "#hardware"],
  ["6-comparison", "#compare"],
  ["7-footer", "footer"],
];

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
 * Every interactive part of the page, in order, and what each one left behind.
 * The result is plain data, so two runs compare with a JSON equality.
 */
async function exercise(cdp) {
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

/** One screenshot per section, each after its animations have settled. */
async function sectionShots(cdp, dir, viewport) {
  const saved = [];
  for (const [name, selector] of SECTIONS) {
    await evaluate(cdp, `scrollTo(0, document.querySelector('${selector}').getBoundingClientRect().top + scrollY)`);
    await sleep(6000);
    const box = await evaluate(
      cdp,
      `(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`,
    );
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { ...box, scale: 1 },
    });
    const file = path.join(dir, `${viewport}-${name}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    saved.push(file);
  }
  return saved;
}

/** The whole page, with reduced motion: deterministic, for a pixel comparison. */
async function fullShot(cdp, dir, viewport, scheme) {
  await sleep(1500);
  const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
  });
  const file = path.join(dir, `full-${viewport}-${scheme}.png`);
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  return file;
}

/* ------------------------------------------------------------------- main -- */

function parse(argv) {
  const [url, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--shots") options.shots = rest[(i += 1)];
    else if (rest[i] === "--full") options.full = rest[(i += 1)];
    else if (rest[i] === "--json") options.json = rest[(i += 1)];
    else throw new Error(`unknown option ${rest[i]}`);
  }
  if (!url || !/^https?:\/\//.test(url)) throw new Error("usage: check-page.mjs <http(s) url> [--shots dir] [--full dir] [--json file]");
  return { url, options };
}

async function main() {
  const { url, options } = parse(process.argv.slice(2));
  const origin = new URL(url).origin;
  for (const dir of [options.shots, options.full]) if (dir) mkdirSync(dir, { recursive: true });

  const browser = await launch();
  const report = { url, origin, runs: {} };
  let problems = 0;

  try {
    for (const viewport of Object.keys(VIEWPORTS)) {
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
      const did = await exercise(cdp);
      const shots = options.shots ? await sectionShots(cdp, options.shots, viewport) : [];
      const csp = await evaluate(cdp, "window.__csp");

      const full = [];
      if (options.full) {
        for (const scheme of ["light", "dark"]) {
          await open(cdp, url, viewport, [
            { name: "prefers-reduced-motion", value: "reduce" },
            { name: "prefers-color-scheme", value: scheme },
          ]);
          full.push(await fullShot(cdp, options.full, viewport, scheme));
        }
        await cdp.send("Emulation.setEmulatedMedia", { features: [] });
      }
      cdp.close();

      const byOrigin = {};
      for (const { url: requested } of seen.requests) {
        const where = /^(data|blob):/.test(requested) ? requested.slice(0, requested.indexOf(":") + 1) : new URL(requested).origin;
        byOrigin[where] = (byOrigin[where] ?? 0) + 1;
      }
      const elsewhere = Object.keys(byOrigin).filter((where) => where !== origin && !/^(data|blob):$/.test(where));
      const errors = [
        ...seen.log.filter((entry) => entry.level === "error"),
        ...seen.console.filter((entry) => entry.type === "error"),
      ];

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
        fonts,
        behaviour: did,
        shots: [...shots, ...full],
      };
      report.runs[viewport] = run;

      const bad = elsewhere.length + seen.failed.length + errors.length + seen.exceptions.length + csp.length;
      problems += bad;

      process.stdout.write(`\n== ${viewport} (${VIEWPORTS[viewport].width}x${VIEWPORTS[viewport].height})\n`);
      process.stdout.write(`document        ${seen.document?.status ?? "?"}\n`);
      process.stdout.write(`requests        ${Object.entries(byOrigin).map(([k, v]) => `${k} x${v}`).join(", ")}\n`);
      process.stdout.write(`other origins   ${elsewhere.length === 0 ? "none" : elsewhere.join(", ")}\n`);
      process.stdout.write(`failed          ${seen.failed.length === 0 ? "none" : JSON.stringify(seen.failed)}\n`);
      process.stdout.write(`console errors  ${errors.length === 0 ? "none" : ""}\n`);
      for (const entry of errors) process.stdout.write(`  ${entry.source ?? entry.type}: ${entry.text}\n`);
      process.stdout.write(`console other   ${run.consoleOther.length === 0 ? "none" : ""}\n`);
      for (const entry of run.consoleOther) process.stdout.write(`  ${entry.level ?? entry.type}: ${entry.text}\n`);
      process.stdout.write(`exceptions      ${seen.exceptions.length === 0 ? "none" : seen.exceptions.join("\n")}\n`);
      process.stdout.write(`CSP violations  ${csp.length === 0 ? "none" : JSON.stringify(csp)}\n`);
      process.stdout.write(`fonts           ${fonts.join("; ")}\n`);
      process.stdout.write(`behaviour       ${JSON.stringify(did)}\n`);
      if (run.shots.length > 0) process.stdout.write(`screenshots     ${run.shots.length} in ${path.dirname(run.shots[0])}\n`);
    }
  } finally {
    await browser.close();
  }

  if (options.json) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\n${problems === 0 ? "clean: no errors, no violations, no other origins" : `${problems} problem(s)`}\n`);
  if (problems > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`check-page: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
