#!/usr/bin/env node
/**
 * The demo's checks, each seen failing on a deliberately broken copy (D35, as
 * D31 did by hand): every copy is `site/` with one thing in `demo.html`
 * broken, served by a plain local server on 127.0.0.1, and checked by
 * check-page.mjs at one width, in light and dark. A copy passes when the
 * checks it names fail, and no other check does, apart from those it names as
 * failing with it (a broken next action also stops the flows that press it).
 *
 *   node scripts/broken-demo.mjs [variant,...]    all of them, or those named
 *
 * Each change must be found in the page exactly once: a change that no longer
 * fits is an error, never silently a copy that is not broken. Everything is
 * written under out/broken/, which git ignores.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out", "broken");

/** [variant, width, the checks it must make fail, the checks that may fail with it, [search, replace] in demo.html]. */
const BROKEN = [
  ["guide-missing", "1440", ["guideAtStart"], ["trying", "reportDialog", "keyboardMark", "tabInDialog", "emptyAnswer", "dialogClosed", "newApp", "lastStepToLive", "ownAiApp"], ["  function renderGuide(){\n", "  function renderGuide(){ return;\n"]],
  ["two-pinks", "1440", ["guideAtStart", "lastStepToLive"], [], [".tryline.ready{background:var(--purple-soft);border:1.5px solid var(--purple-line)}", ".tryline.ready{background:var(--pink-soft);border:2px solid var(--pink)}"]],
  ["no-trying", "1440", ["trying"], ["reportDialog", "keyboardMark", "tabInDialog", "emptyAnswer", "dialogClosed", "lastStepToLive", "ownAiApp"], ["if (a === 'guide-try'){ p.trying = +t.dataset.i;", "if (a === 'guide-try'){ void t;"]],
  ["stays-in-preview", "1440", ["lastStepToLive"], [], ["      if (here(p)){ S.right = 'live'; if (S.m !== 'chat') S.m = 'live'; }\n", ""]],
  ["no-ending", "1440", ["lastStepToLive"], [], ["    if (p.ship && p.ship.done && p.live === p.ship.v && !p.fresh) return 'done';\n", ""]],
  ["ai-already-on", "1440", ["newApp"], [], ["making: false, plan: null, ai: 'off', trying: null,", "making: false, plan: null, ai: 'on', trying: null,"]],
  ["picture-unmarked", "1440", ["newApp"], [], ['<p class="pic-note" id="pic-note">A picture of your AI\'s own interface, in plain text. In the panel, Claude Code\'s own terminal is here, and you talk to it there.</p>', ""]],
  ["picture-artwork", "1440", ["newApp"], [], ['<div class="term aiterm">', '<div class="term aiterm"><svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4"/></svg>']],
  ["idea-ignored", "1440", ["newApp"], [], ["    else if (!p.plan && !p.making){ p.chat.push(['you', v]); p.fresh = false; planFor(p, v); }\n", ""]],
  ["account-words", "1440", ["aiWords"], [], ["It works in the test copy, and never reaches the live app. How it connects:", "It works in the test copy, and never reaches the live app. Sign in with your Claude account, or:"]],
  ["no-mcp-words", "1440", ["newApp"], [], ["${choice('mcp', 'Your own AI app, through MCP', 'The AI app you already use, on a computer on your home network.')}", "${choice('mcp', 'Your own AI app', 'The AI app you already use, on a computer on your home network.')}"]],
  ["report-focus", "1440", ["reportDialog"], [], ["'#r-did', null, 'report');", "'#shot', null, 'report');"]],
  ["own-ai-silent", "1440", ["ownAiApp"], [], ["const posted = mcp() ? '<span class=\"posted\">Your AI app posted</span>' : '';", "const posted = '';"]],
  ["strip-moves", "1440", ["previewStill"], [], ["$('#adv-strip').hidden = !S.advanced || S.view === 'project';", "$('#adv-strip').hidden = !S.advanced;"]],
  ["guide-wide", "390", ["overflow"], [], [".guide{display:flex;flex-wrap:wrap;", ".guide{min-width:520px;display:flex;flex-wrap:wrap;"]],
];

function serve(dir) {
  const types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    else if (!path.extname(p)) p = `${p}.html`;
    const file = path.join(dir, path.normalize(p).replace(/^[/\\]+/, ""));
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "max-age=60", "x-content-type-options": "nosniff" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const only = process.argv[2]?.split(",");
const variants = only ? BROKEN.filter(([v]) => only.includes(v)) : BROKEN;
if (only && variants.length !== only.length) throw new Error(`no such variant: ${only.filter((o) => !BROKEN.some(([v]) => v === o)).join(", ")}`);
mkdirSync(OUT, { recursive: true });
const summary = [];
let bad = 0;
for (const [variant, width, targets, alsoFail, [search, replace]] of variants) {
  const dir = path.join(OUT, variant);
  rmSync(dir, { recursive: true, force: true });
  cpSync(path.join(ROOT, "site"), dir, { recursive: true });
  const file = path.join(dir, "demo.html");
  const page = readFileSync(file, "utf8");
  const found = page.split(search).length - 1;
  if (found !== 1) throw new Error(`${variant}: its change is found ${found} times in demo.html, not once`);
  writeFileSync(file, page.replace(search, replace));
  const server = await serve(dir);
  const json = path.join(OUT, `${variant}.json`);
  // Not spawnSync: the copy's server is in this process, and must answer while check-page runs.
  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "check-page.mjs"), `http://127.0.0.1:${server.address().port}/`, "--page", "demo", "--widths", width, "--json", json]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  server.close();
  if (!existsSync(json)) throw new Error(`${variant}: check-page wrote no result: ${(run.stderr || run.stdout).slice(-600)}`);
  const result = JSON.parse(readFileSync(json, "utf8"));
  const failed = new Set();
  for (const r of Object.values(result.pages["/demo"].runs)) {
    for (const scheme of ["light", "dark"]) for (const f of r.behaviour?.[scheme]?.failed ?? []) failed.add(f);
    if (r.overflow > 0) failed.add("overflow");
    if (r.consoleErrors.length || r.exceptions.length) failed.add("console errors");
  }
  const missing = targets.filter((t) => !failed.has(t));
  const others = [...failed].filter((f) => !targets.includes(f) && !alsoFail.includes(f));
  const verdict = !missing.length && !others.length ? "seen failing" : missing.length ? `NOT seen failing: ${missing.join(", ")}` : `seen failing, but ${others.join(", ")} failed too`;
  if (verdict !== "seen failing") bad += 1;
  const line = `${variant} (${width} px): ${targets.join(", ")}: ${verdict}${failed.size ? `  [failed: ${[...failed].join(", ")}]` : ""}`;
  console.log(line);
  summary.push(line);
}
console.log(`\n${summary.length - bad} of ${summary.length} broken copies as they should be${bad ? `; ${bad} NOT` : ""}`);
process.exit(bad ? 1 : 0);
