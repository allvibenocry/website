#!/usr/bin/env node
/**
 * The Content-Security-Policy, generated from the pages it protects (D10, D17).
 *
 *   node scripts/csp.mjs           # write nginx/csp.conf
 *   node scripts/csp.mjs --check   # exit 1 if nginx/csp.conf is not what the pages need
 *
 * Each page gets a policy of its own, derived from that page alone: its inline
 * script and inline style by their SHA-256, and only the other sources that page
 * itself uses. So every policy has to change whenever its page's script or style
 * does. Generated rather than hand-edited, and checked in CI before an image is
 * built, so a copy edit can never ship a page that its own header blocks.
 *
 * nginx picks the policy by URI, with a `map` in nginx/csp.conf: the main page's
 * is the default, so every response that is not another page (a font, a 404)
 * gets exactly the policy it had when the site was one page.
 *
 * It also refuses the things a same-origin policy would silently break rather
 * than report here: an external script, an inline event handler, a
 * `javascript:` URL. Each would reach the browser, be blocked there, and show
 * up as a dead button instead of a failed build.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "nginx", "csp.conf");

/**
 * Every page of the site, and the URIs nginx serves it at (nginx/nginx.conf).
 * The first is the default policy. `$uri` is matched both before and after
 * `try_files` has pointed it at the file, so both spellings are listed.
 */
export const PAGES = [
  { file: "site/index.html", uris: [] },
  { file: "site/under-the-hood.html", uris: ["/under-the-hood", "/under-the-hood.html"] },
];

/** What a browser hashes: the element's text, exactly, as UTF-8. */
const sha256 = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

export function inlineBlocks(html) {
  const scripts = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)];
  const styles = [...html.matchAll(/<style(\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi)];
  return {
    scripts: scripts.map((m) => ({ attributes: m[1] ?? "", text: m[2] })),
    styles: styles.map((m) => ({ attributes: m[1] ?? "", text: m[2] })),
  };
}

/** The page's tags, with the contents of its script and style elements taken out. */
const markupOf = (html) => html.replace(/<(script|style)(\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, "");
const tagsOf = (html) => markupOf(html).match(/<[a-z][^>]*>/gi) ?? [];

/** Everything a same-origin policy would block without a word at build time. */
export function problems(html) {
  const found = [];
  const { scripts } = inlineBlocks(html);
  for (const { attributes } of scripts) {
    if (/\ssrc\s*=/i.test(attributes)) found.push(`a <script${attributes}> loads a file; this policy allows inline scripts by hash only`);
  }
  for (const tag of tagsOf(html)) {
    const handler = tag.match(/\s(on[a-z]+)\s*=/i);
    if (handler) found.push(`inline event handler ${handler[1]} in ${tag.slice(0, 60)}`);
    if (/=\s*["']?\s*javascript:/i.test(tag)) found.push(`javascript: URL in ${tag.slice(0, 60)}`);
  }
  return found;
}

export function policy(html) {
  const { scripts, styles } = inlineBlocks(html);
  const css = styles.map((s) => s.text).join("\n");
  const styleAttributes = tagsOf(html).filter((tag) => /\sstyle\s*=/i.test(tag)).length;
  const hashes = (blocks) => (blocks.length ? blocks.map((b) => sha256(b.text)) : ["'none'"]);

  const directives = [
    // Nothing is allowed unless a line below allows it.
    ["default-src", "'none'"],
    // The page's inline script, by hash. No 'unsafe-inline', no file, no eval.
    ["script-src", ...hashes(scripts)],
    // The <style> element, by hash.
    ["style-src-elem", ...hashes(styles)],
  ];
  if (styleAttributes > 0) {
    // style="" attributes, allowed (D10): on the main page, 26 of them, each
    // setting a CSS custom property such as --i:3; an attribute cannot run
    // code. The style-src line is for browsers from before style-src-elem and
    // -attr (Safari < 15.4, Firefox < 108), which read only it and would
    // otherwise refuse the attributes; current browsers ignore it for styles.
    directives.push(["style-src-attr", "'unsafe-inline'"], ["style-src", "'unsafe-inline'"]);
  } else {
    // No style="" attributes, so none is allowed: style-src-attr falls back to
    // this line, and so do browsers from before style-src-elem.
    directives.push(["style-src", ...hashes(styles)]);
  }
  // The five woff2 files next to the page.
  if (/@font-face/.test(css)) directives.push(["font-src", "'self'"]);
  // Images only if the page has one: its icons, from this origin (Firefox
  // holds a tab's icon to img-src), and inline ones, as the main page's check
  // mark, an SVG data URI in its CSS.
  const markup = markupOf(html);
  const images = [];
  if (/<link\s[^>]*rel\s*=\s*["']?(icon|apple-touch-icon)["'\s>]/i.test(markup)) images.push("'self'");
  if (/url\(\s*["']?data:image\//i.test(css) || /<img\s[^>]*src\s*=\s*["']?data:image\//i.test(html)) images.push("data:");
  if (images.length) directives.push(["img-src", ...images]);
  // Its web manifest, from this origin, if it links one (D26).
  if (/<link\s[^>]*rel\s*=\s*["']?manifest["'\s>]/i.test(markup)) directives.push(["manifest-src", "'self'"]);
  // A form may only go back to this origin; a page without one may submit nowhere.
  // (The main page's waitlist form is a mockup whose script prevents sending.)
  directives.push(["form-action", /<form[\s>]/i.test(markupOf(html)) ? "'self'" : "'none'"]);
  directives.push(["base-uri", "'none'"], ["frame-ancestors", "'none'"]);
  return directives;
}

const value = (html) =>
  policy(html)
    .map((directive) => directive.join(" "))
    .join("; ");

export function render(pages) {
  const [first, ...others] = pages;
  const width = Math.max("default".length, ...others.flatMap((p) => p.uris.map((u) => u.length)));
  const lines = [
    "# GENERATED by scripts/csp.mjs from the pages in site/. Do not edit: run",
    "# `node scripts/csp.mjs` after changing a page, and commit both (D10, D17).",
    "#",
    "# One policy per page, each allowing only that page's own inline script and",
    "# style. Included at http level by nginx.conf; headers.conf sends the value on",
    "# every response. The default is the main page's, as when the site was one page.",
    "map $uri $content_security_policy {",
    `    ${"default".padEnd(width)} "${value(first.html)}";`,
  ];
  for (const page of others) {
    for (const uri of page.uris) lines.push(`    ${uri.padEnd(width)} "${value(page.html)}";`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const pages = PAGES.map((page) => ({ ...page, html: readFileSync(path.join(ROOT, page.file), "utf8") }));
  let refused = false;
  for (const page of pages) {
    for (const problem of problems(page.html)) {
      process.stderr.write(`csp: ${page.file}: ${problem}\n`);
      refused = true;
    }
  }
  if (refused) process.exit(1);

  const wanted = render(pages);
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
    } catch {
      /* missing is the same as wrong */
    }
    if (current !== wanted) {
      process.stderr.write(
        "csp: nginx/csp.conf does not match the pages in site/.\n" +
          "     A page's inline script or style changed and its policy did not.\n" +
          "     Run `node scripts/csp.mjs` and commit nginx/csp.conf.\n",
      );
      process.exit(1);
    }
    process.stdout.write(`csp: nginx/csp.conf matches ${pages.map((p) => p.file).join(" and ")}\n`);
  } else {
    writeFileSync(OUT, wanted);
    for (const page of pages) {
      const { scripts, styles } = inlineBlocks(page.html);
      process.stdout.write(`csp: ${page.file}: ${scripts.length} script, ${styles.length} style hashed${page.uris.length ? `, at ${page.uris.join(" and ")}` : ", the default"}\n`);
    }
    process.stdout.write("csp: wrote nginx/csp.conf\n");
  }
}
