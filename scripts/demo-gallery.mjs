#!/usr/bin/env node
/**
 * The demo's before-and-after gallery (D31): every state of the control
 * panel's demo, at every width it is checked at, before a change and after it,
 * side by side, as a local page to look at.
 *
 *   node scripts/demo-gallery.mjs <before url> <after url> <out/screenshots/name>
 *
 * Each state is reached from a fresh load, the way a person gets there, in
 * light and with reduced motion, both set explicitly (headless Edge follows
 * the machine otherwise); dark changes the colours and not the layout. A state
 * that is still running (a step being built, a version being put live) is
 * taken with the demo's clock stopped, so that the picture is of that moment.
 * Dialogs and menus are taken as the window shows them; everything else whole,
 * in slices of at most 8000 device pixels, put together (D22).
 *
 * The before is the demo as it was: for D31, with the app's old tabs, so each
 * state of the new app view is shown beside the old screen closest to it, and
 * a state the old demo had no equivalent of says so. Writes `<name>.html` and
 * its pictures in `<name>/`; everything goes under out/, which git ignores.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { VIEWPORTS, connect, evaluate, launch, open, until } from "./check-page.mjs";
import { decode, encode } from "./compare-shots.mjs";

const WIDTHS = ["mobile-320", "mobile-360", "mobile", "tablet", "desktop"];

/* ------------------------------------------------------------- the states -- */

/** What a state's driver can do: click, wait for, stop the clock. */
const driver = (cdp, narrow) => ({
  narrow,
  click: async (selector) => {
    await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)})?.click() ?? null`);
    await sleep(250);
  },
  wait: (expression, ms = 8000) => until(cdp, expression, ms),
  /* The demo schedules each next step with setTimeout: stopped here, what is
     running stays where it is. Every state starts from a fresh load. */
  stopClock: () => evaluate(cdp, "window.setTimeout = () => 0"),
});

/* After: the new app view. */
const app = async (d) => d.click('#nav [data-open="guestbook"]');
const tab = (id) => async (d) => d.click(d.narrow ? `#mtab-${id}` : `#rtab-${id}`);
const chat = async (d) => { if (d.narrow) await d.click("#mtab-chat"); };
const advanced = async (d) => { await d.click("#mode-switch"); await d.click("#adv-ok"); await d.click("#adv-go"); };
const more = (item) => async (d) => { await app(d); await d.click("#more-btn"); if (item) await d.click(`[data-action="${item}"]`); };
const newApp = async (d) => { await d.click('#nav [data-action="new-app"]'); await d.click('[data-action="make-plan"]'); await d.wait("!!document.querySelector('#approve')"); };
const allTried = async (d) => {
  await app(d);
  await d.click('[data-action="works"][data-i="1"]');
  await d.wait("!!document.querySelector('[data-action=\"works\"][data-i=\"2\"]')");
  await d.click('[data-action="works"][data-i="2"]');
  await d.click('#tryline [data-action="to-live"]');
};
const own = async (d) => { await d.click('#nav [data-go="settings"]'); await d.click('input[data-mode="mcp"]'); await d.click('#dialog [data-action="close"]'); };

/* Before: the old demo, with its app tabs. */
const oldApp = app;
const oldTab = (id) => async (d) => { await oldApp(d); await d.click(`[data-tab="${id}"]`); };
const oldAdvanced = async (d) => { await oldApp(d); await advanced(d); };
const oldAllTried = async (d) => {
  await oldApp(d);
  await d.click('[data-action="works"][data-i="1"]');
  await d.wait("!!document.querySelector('[data-action=\"works\"][data-i=\"2\"]')");
  await d.click('[data-action="works"][data-i="2"]');
  await d.wait("!!document.querySelector('[data-action=\"ship\"]:not([disabled])')");
};
const oldPlan = async (d) => { await d.click('#nav [data-action="new-app"]'); await d.click('[data-action="make-plan"]'); await d.wait("!!document.querySelector('#create-go')"); };

/**
 * Every state: its label, and for each side how to get there and how it is
 * taken ("window" or "whole"). A side may instead name another state whose
 * picture it shares, or give a note where the old demo had nothing like it.
 */
const STATES = [
  { key: "home", label: "Home", before: { go: async () => {} }, after: { go: async () => {} } },
  { key: "app-preview", label: "An app, simple mode: Preview, with \"It works\" and \"Something is wrong\" above it (before: the Build tab)",
    before: { go: oldApp }, after: { go: app } },
  { key: "app-chat", label: "An app, simple mode: Chat, \"Your AI\" with the plan as a checklist (one row of tabs only)", narrowOnly: true,
    before: { same: "app-preview" }, after: { go: async (d) => { await app(d); await chat(d); } } },
  { key: "app-live", label: "An app, simple mode: Live, with the earlier versions (before: the Versions tab)",
    before: { go: oldTab("versions") }, after: { go: async (d) => { await app(d); await tab("live")(d); } } },
  { key: "more", label: "More, next to the app's name",
    before: { note: "The old demo had no More: the app's backups and service keys were tabs of their own, beside Build and Versions." }, after: { go: more(null), shot: "window" } },
  { key: "more-backups", label: "More: Backups (before: the Backups tab)", before: { go: oldTab("backups") }, after: { go: more("more-backups"), shot: "window" } },
  { key: "more-keys", label: "More: Service keys (before: the Service keys tab)", before: { go: oldTab("keys") }, after: { go: more("more-keys"), shot: "window" } },
  { key: "more-settings", label: "More: App settings", before: { note: "New: the old demo had no settings for one app." }, after: { go: more("more-settings"), shot: "window" } },
  { key: "report", label: "\"Something is wrong\": the report dialog",
    before: { go: async (d) => { await oldApp(d); await d.click('[data-action="report"][data-i="1"]'); }, shot: "window" },
    after: { go: async (d) => { await app(d); await d.click('[data-action="report"][data-i="1"]'); }, shot: "window" } },
  { key: "advanced-dialog", label: "\"Show what's under the hood\": the warning and the consent",
    before: { go: async (d) => { await oldApp(d); await d.click("#mode-switch"); }, shot: "window" },
    after: { go: async (d) => { await app(d); await d.click("#mode-switch"); }, shot: "window" } },
  { key: "adv-preview", label: "An app, advanced mode: Preview, and on the left Plan, the architect (before: the Build tab, advanced)",
    before: { go: oldAdvanced }, after: { go: async (d) => { await app(d); await advanced(d); } } },
  { key: "adv-plan", label: "An app, advanced mode: Chat, with Plan and Build (one row of tabs only)", narrowOnly: true,
    before: { same: "adv-preview" }, after: { go: async (d) => { await app(d); await advanced(d); await chat(d); } } },
  { key: "adv-build", label: "An app, advanced mode: Build, the builder's session (before: the helper's Builder tab)",
    before: { go: async (d) => { await oldAdvanced(d); await d.click('[data-htab="builder"]'); } },
    after: { go: async (d) => { await app(d); await advanced(d); await chat(d); await d.click("#ltab-build"); } } },
  { key: "adv-code", label: "An app, advanced mode: Code, a file tree and the chosen file with its changes (before: the Files tab)",
    before: { go: async (d) => { await oldAdvanced(d); await d.click('[data-tab="files"]'); } },
    after: { go: async (d) => { await app(d); await advanced(d); await tab("code")(d); } } },
  { key: "adv-live", label: "An app, advanced mode: Live, with commits and migrations (before: the Versions tab, advanced)",
    before: { go: async (d) => { await oldAdvanced(d); await d.click('[data-tab="versions"]'); } },
    after: { go: async (d) => { await app(d); await advanced(d); await tab("live")(d); } } },
  { key: "adv-brief", label: "Advanced mode: the instructions for the builder, the brief (before: the helper's Instructions tab)",
    before: { go: async (d) => { await oldAdvanced(d); await d.click('[data-htab="brief"]'); } },
    after: { go: async (d) => { await app(d); await advanced(d); await chat(d); await d.click('[data-action="brief"]'); }, shot: "window" } },
  { key: "new-app", label: "Start a new app: the dialog",
    before: { go: (d) => d.click('#nav [data-action="new-app"]'), shot: "window" }, after: { go: (d) => d.click('#nav [data-action="new-app"]'), shot: "window" } },
  { key: "new-app-planning", label: "A new app, in planning, with \"Looks good, start building\" (before: the plan in a dialog)",
    before: { go: oldPlan, shot: "window" }, after: { go: newApp } },
  { key: "new-app-preview", label: "A new app, in planning: the preview shows the starter app (one row of tabs only)", narrowOnly: true,
    before: { same: "new-app-planning" }, after: { go: async (d) => { await newApp(d); await tab("preview")(d); } } },
  { key: "new-app-building", label: "A new app: building its first step",
    before: { go: async (d) => { await oldPlan(d); await d.stopClock(); await d.click("#create-go"); } },
    after: { go: async (d) => { await newApp(d); await d.stopClock(); await d.click("#approve"); } } },
  { key: "putting-live", label: "Putting v3 live: the safety checks as progress (before: on the Build tab)",
    before: { go: async (d) => { await oldAllTried(d); await d.stopClock(); await d.click('[data-action="ship"]'); } },
    after: { go: async (d) => { await allTried(d); await d.stopClock(); await d.click('[data-action="ship"]'); } } },
  { key: "v3-live", label: "\"v3 is live\" (before: on the Build tab)",
    before: { go: async (d) => { await oldAllTried(d); await d.click('[data-action="ship"]'); await d.wait("document.querySelector('#ship h2')?.textContent === 'v3 is live.'"); } },
    after: { go: async (d) => { await allTried(d); await d.click('[data-action="ship"]'); await d.wait("document.querySelector('#shipcard h2')?.textContent === 'v3 is live.'"); } } },
  { key: "go-back", label: "Going back to an earlier version: the dialog",
    before: { go: async (d) => { await oldTab("versions")(d); await d.click('[data-action="rollback"][data-v="1"]'); }, shot: "window" },
    after: { go: async (d) => { await app(d); await tab("live")(d); await d.click('[data-action="rollback"][data-v="1"]'); }, shot: "window" } },
  { key: "recipes", label: "The recipe box: a simple recipe list in the preview (before: its Build tab)",
    before: { go: (d) => d.click('#nav [data-open="recipes"]') }, after: { go: (d) => d.click('#nav [data-open="recipes"]') } },
  { key: "machine", label: "Machine health", before: { go: (d) => d.click('#nav [data-go="machine"]') }, after: { go: (d) => d.click('#nav [data-go="machine"]') } },
  { key: "backups", label: "Backups of all your apps", before: { go: (d) => d.click('#nav [data-go="backups"]') }, after: { go: (d) => d.click('#nav [data-go="backups"]') } },
  { key: "services", label: "Your own services (advanced mode)",
    before: { go: async (d) => { await d.click('#nav [data-go="services"]'); await d.click("#adv-ok"); await d.click("#adv-go"); } },
    after: { go: async (d) => { await d.click('#nav [data-go="services"]'); await d.click("#adv-ok"); await d.click("#adv-go"); } } },
  { key: "settings", label: "Settings: the AI in this panel", before: { go: (d) => d.click('#nav [data-go="settings"]') }, after: { go: (d) => d.click('#nav [data-go="settings"]') } },
  { key: "settings-own", label: "Settings: your own AI app", before: { go: own }, after: { go: own } },
  { key: "app-own", label: "An app with your own AI app: what it posted and did, and the box to continue there",
    before: { go: async (d) => { await own(d); await oldApp(d); } }, after: { go: async (d) => { await own(d); await app(d); await chat(d); } } },
];

/* ---------------------------------------------------------------- pictures -- */

/** The window as it is, or the whole page in slices put together. */
async function take(cdp, file, viewport, shot) {
  await evaluate(cdp, "document.querySelector('#toast')?.classList.remove('show')");
  await sleep(400);
  if (shot === "window") {
    const picture = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(picture.data, "base64"));
    return;
  }
  await evaluate(cdp, "scrollTo(0, 0)");
  await sleep(200);
  const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
  const width = Math.round(cssContentSize.width);
  const height = Math.round(cssContentSize.height);
  const slice = Math.floor(8000 / VIEWPORTS[viewport].deviceScaleFactor);
  const parts = [];
  for (let y = 0; y < height; y += slice) {
    const picture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y, width, height: Math.min(slice, height - y), scale: 1 } });
    parts.push(decode(Buffer.from(picture.data, "base64")));
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
  writeFileSync(file, encode(pixelWidth, row, rgb));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function main() {
  const [beforeUrl, afterUrl, target] = process.argv.slice(2);
  if (!beforeUrl || !afterUrl || !target) throw new Error("usage: demo-gallery.mjs <before url> <after url> <out/screenshots/name>");
  const dir = target;
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  const cdp = await connect(browser.port);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const media = [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }];
  const taken = {};
  const problems = [];
  try {
    for (const viewport of WIDTHS) {
      for (const [side, url] of [["before", beforeUrl], ["after", afterUrl]]) {
        for (const state of STATES) {
          const how = state[side];
          if (!how.go) continue;
          await open(cdp, url, viewport, media);
          const narrow = await evaluate(cdp, "matchMedia('(max-width:1080px)').matches");
          if (state.narrowOnly && !narrow) continue;
          try {
            await how.go(driver(cdp, narrow));
          } catch (error) {
            problems.push(`${viewport} ${side} ${state.key}: ${error.message}`);
          }
          const file = `${VIEWPORTS[viewport].width}-${state.key}-${side}.png`;
          await take(cdp, path.join(dir, file), viewport, how.shot ?? "whole");
          taken[`${viewport}|${state.key}|${side}`] = file;
          process.stderr.write(`${file}\n`);
        }
      }
    }
  } finally {
    cdp.close();
    await browser.close();
  }

  const name = path.basename(dir);
  const picture = (viewport, state, side) => {
    const how = state[side];
    const file = how.same ? taken[`${viewport}|${how.same}|${side}`] : taken[`${viewport}|${state.key}|${side}`];
    if (how.note) return `<figure><figcaption>${side === "before" ? "Before" : "After"}</figcaption><p class="note">${esc(how.note)}</p></figure>`;
    if (!file) return `<figure><figcaption>${side === "before" ? "Before" : "After"}</figcaption><p class="note">Not taken.</p></figure>`;
    return `<figure><figcaption>${side === "before" ? "Before" : "After"}${how.same ? ` (the same screen as "${esc(STATES.find((s) => s.key === how.same).label)}")` : ""}</figcaption><a href="${name}/${file}"><img src="${name}/${file}" alt="${esc(state.label)}, ${side}, ${VIEWPORTS[viewport].width} px" loading="lazy"></a></figure>`;
  };
  const sections = STATES.map((state) => {
    const rows = WIDTHS.filter((viewport) => !(state.narrowOnly && VIEWPORTS[viewport].width > 1080)).map((viewport) =>
      `<h3>${VIEWPORTS[viewport].width} px</h3><div class="pair">${picture(viewport, state, "before")}${picture(viewport, state, "after")}</div>`).join("");
    return `<section id="${state.key}"><h2>${esc(state.label)}</h2>${rows}</section>`;
  }).join("\n");
  const count = Object.keys(taken).length;
  writeFileSync(`${dir}.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The demo, before and after</title>
<style>
body{margin:0;padding:24px;font:16px/1.5 system-ui,sans-serif;background:#F3F0F8;color:#1B1530}
h1{margin:0 0 6px}h2{margin:40px 0 8px;font-size:1.25rem}h3{margin:18px 0 6px;font-size:.95rem;color:#5A5270}
nav{columns:3 280px;margin:16px 0;font-size:.92rem}nav a{display:block;color:inherit}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
figure{margin:0;background:#fff;border:1px solid #d9d3e6;border-radius:10px;padding:8px}
figcaption{font-weight:700;font-size:.85rem;margin-bottom:6px}
img{display:block;max-width:100%;height:auto;margin:0 auto;border:1px solid #eee}
.note{color:#5A5270;font-size:.92rem;margin:6px 0}
</style></head><body>
<h1>The demo, before and after</h1>
<p>Every state of the control panel's demo at 320, 360, 390, 768 and 1440 px, in light, with reduced motion (dark changes the colours, not the layout). Before: <code>${esc(beforeUrl)}</code>. After: <code>${esc(afterUrl)}</code>. ${count} pictures; made by <code>scripts/demo-gallery.mjs</code> (D31).</p>
<nav>${STATES.map((s) => `<a href="#${s.key}">${esc(s.label)}</a>`).join("")}</nav>
${sections}
</body></html>
`);
  process.stdout.write(`gallery: ${count} pictures, ${dir}.html\n`);
  for (const problem of problems) process.stdout.write(`PROBLEM ${problem}\n`);
  if (problems.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`demo-gallery: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
