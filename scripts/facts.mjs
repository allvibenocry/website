#!/usr/bin/env node
/**
 * The under-the-hood page says nothing that is not in its fact sheet (D17).
 *
 *   node scripts/facts.mjs
 *
 * Every statement on site/under-the-hood.html carries the ID of its row in
 * docs/under-the-hood-facts.md (`data-fact`), and its status as a badge. This
 * fails unless, for every one:
 *
 *  - the row exists, and the page's words are the row's words, exactly
 *    (apart from spacing and code marks), so a change to the page cannot skip
 *    its source;
 *  - the badge on the page is the row's status;
 *  - and every row of the sheet is on the page, and every diagram draws only
 *    statements that are.
 *
 * It also fails on "never" in a statement the sheet does not list under "Where
 * the page says never", with what enforces it; and on an en or em dash anywhere
 * in a page of the site, which the owner does not want in its copy.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "site", "under-the-hood.html");
const SHEET = path.join(ROOT, "docs", "under-the-hood-facts.md");
const STATUS = { "b-built": "Built", "b-hw": "Verified on hardware", "b-planned": "Planned" };

const decode = (text) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export const normalise = (text) => text.replace(/`/g, "").replace(/\s+/g, " ").trim();

/** The inner HTML of the element whose opening tag starts at `at`. */
function inner(html, at) {
  const open = html.slice(at).match(/^<([a-z0-9]+)\b[^>]*>/i);
  const name = open[1].toLowerCase();
  const tag = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  tag.lastIndex = at + open[0].length;
  let depth = 1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { name, opening: open[0], body: html.slice(at + open[0].length, m.index) };
  }
  throw new Error(`unclosed <${name}> at ${at}`);
}

/** What a statement says, as words: no badge, no decision links, no markup. */
export function words(body) {
  const text = body
    .replace(/<span class="badge [^"]*">[\s\S]*?<\/span>/g, "")
    .replace(/<span class="refs">[\s\S]*?<\/span>/g, "")
    .replace(/<caption[\s\S]*?<\/caption>|<thead[\s\S]*?<\/thead>/g, "")
    .replace(/<tr>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g, " $1: $2;")
    .replace(/<\/h3>/g, ". ")
    .replace(/<span class="n">[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]+>/g, " ");
  return decode(text).replace(/\s+/g, " ").trim().replace(/ ([.,;:])/g, "$1");
}

/** Every `data-fact` on the page: its IDs, its status badge, its words. */
export function pageFacts(html) {
  const facts = [];
  for (const m of html.matchAll(/<[a-z0-9]+\b[^>]*\sdata-fact="([^"]+)"[^>]*>/gi)) {
    const { name, body } = inner(html, m.index);
    const ids = m[1].split(/\s+/);
    if (name === "figure") {
      facts.push({ ids, figure: true });
      continue;
    }
    const badge = body.match(/<span class="badge ([a-z-]+)">/);
    facts.push({ ids, status: badge ? STATUS[badge[1]] : null, text: words(body), quoted: /<blockquote/.test(body) });
  }
  return facts;
}

/** Every row of the sheet's tables whose first cell is an ID: its words and its status. */
export function sheetFacts(md) {
  const rows = new Map();
  for (const line of md.split("\n")) {
    const cells = line.match(/^\| ([A-Z]\d+) \|(.*)\|\s*$/);
    if (!cells) continue;
    const rest = cells[2].split("|").map((c) => c.trim());
    rows.set(cells[1], { text: normalise(rest[0]), status: rest.at(-1) });
  }
  return rows;
}

/** The IDs the sheet lists under "Where the page says never". */
export function neverList(md) {
  const part = md.split(/^## Where the page says "never"$/m)[1]?.split(/^## /m)[0] ?? "";
  return new Set([...part.matchAll(/^\| ([A-Z]\d+):/gm)].map((m) => m[1]));
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const html = readFileSync(PAGE, "utf8");
  const md = readFileSync(SHEET, "utf8");
  const sheet = sheetFacts(md);
  const never = neverList(md);
  const page = pageFacts(html);
  const problems = [];
  const onPage = new Set();

  for (const fact of page) {
    for (const id of fact.ids) {
      if (!sheet.has(id)) problems.push(`${id}: on the page, not in the fact sheet`);
      if (!fact.figure) onPage.add(id);
    }
    if (fact.figure) continue;
    const [id] = fact.ids;
    const row = sheet.get(id);
    if (!row) continue;
    if (fact.status !== row.status) problems.push(`${id}: the page says ${fact.status ?? "no status"}, the fact sheet ${row.status}`);
    if (!fact.quoted && normalise(fact.text) !== row.text) problems.push(`${id}: the page's words are not the fact sheet's\n    page:  ${fact.text}\n    sheet: ${row.text}`);
    if (!fact.quoted && /\bnever\b/i.test(fact.text) && !never.has(id)) problems.push(`${id}: says "never", and the fact sheet does not say what enforces it`);
  }
  for (const figure of page.filter((f) => f.figure)) {
    for (const id of figure.ids) if (!onPage.has(id)) problems.push(`${id}: drawn in a diagram, but not stated on the page`);
  }
  for (const id of sheet.keys()) if (!onPage.has(id)) problems.push(`${id}: in the fact sheet, not on the page`);

  for (const file of readdirSync(path.join(ROOT, "site")).filter((f) => f.endsWith(".html"))) {
    readFileSync(path.join(ROOT, "site", file), "utf8").split("\n").forEach((line, i) => {
      if (/[–—]/.test(line)) problems.push(`site/${file}:${i + 1}: an en or em dash`);
    });
  }

  const statements = page.filter((f) => !f.figure).length;
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`facts: ${problem}\n`);
    process.stderr.write(`facts: ${problems.length} problem(s)\n`);
    process.exit(1);
  }
  process.stdout.write(`facts: ${statements} statements and ${page.length - statements} diagrams on the page, every one in the fact sheet with the same words and status; ${sheet.size} rows, every one on the page; no dashes\n`);
}
