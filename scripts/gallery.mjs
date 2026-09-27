#!/usr/bin/env node
/**
 * A local gallery of every section of both pages, before and after a change,
 * at every width: cut out of check-page's full-page pictures (reduced motion,
 * light), by the boxes recorded beside them, so each scene shows its end
 * state and nothing depends on when a picture was taken.
 *
 *   node scripts/gallery.mjs <before --full dir> <after --full dir> <out/screenshots/name>
 *
 * Writes `<name>.html` and the cut-out pictures in `<name>/`. Everything goes
 * under out/, which git ignores.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decode, encode } from "./compare-shots.mjs";

const PAGES = [
  {
    name: "Main page",
    prefix: "",
    sections: [
      ["hero", "header#top"], ["problem", "section.section"], ["four steps", "section#how"], ["try to break it", "section#break"],
      ["where it belongs", "section#where"], ["laptop", "section#hardware"], ["the boring parts", "section.section:1"],
      ["open source", "section.section:2"], ["teams", "div#enterprise"], ["comparison", "section#compare"],
      ["waitlist", "section#waitlist"], ["footer", "footer"],
    ],
  },
  {
    name: "Under the hood",
    prefix: "uth-",
    sections: [
      ["header", "header#top"], ["what this page is", "section#labels"], ["the stack", "section#stack"],
      ["dev and prod", "section#isolation"], ["the release pipeline", "section#release"], ["backups", "section#backups"],
      ["rollback and data", "section#rollback"], ["secrets and keys", "section#keys"], ["off-site backups", "section#offsite"],
      ["planned", "section#planned"], ["what it does not protect against", "section#limits"], ["the house rules", "section#rules"],
      ["read the source", "section#source"], ["footer", "footer"],
    ],
  },
];
const WIDTHS = [["mobile-360", 360], ["mobile", 390], ["mobile-430", 430], ["tablet", 768]];

function cut(dir, page, viewport, outDir, tag) {
  const png = path.join(dir, `${page.prefix}full-${viewport}-light.png`);
  if (!existsSync(png)) return {};
  const image = decode(readFileSync(png));
  const boxes = JSON.parse(readFileSync(png.replace(/\.png$/, ".boxes.json"), "utf8"));
  const scale = image.width / Math.max(...boxes.map((b) => b.x + b.width));
  const files = {};
  page.sections.forEach(([label, key], index) => {
    const box = boxes.find((b) => b.key === key);
    if (!box) return;
    const y0 = Math.round(box.y * scale);
    const h = Math.min(Math.round(box.height * scale), image.height - y0);
    const rgb = Buffer.alloc(image.width * h * 3);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const i = ((y0 + y) * image.width + x) * image.channels;
        const o = (y * image.width + x) * 3;
        rgb[o] = image.pixels[i];
        rgb[o + 1] = image.pixels[i + 1];
        rgb[o + 2] = image.pixels[i + 2];
      }
    }
    const name = `${tag}-${page.prefix || "main-"}${viewport}-${String(index + 1).padStart(2, "0")}.png`;
    writeFileSync(path.join(outDir, name), encode(image.width, h, rgb));
    files[label] = name;
  });
  return files;
}

const [before, after, out] = process.argv.slice(2);
if (!before || !after || !out) throw new Error("usage: gallery.mjs <before dir> <after dir> <out/screenshots/name>");
const outDir = out;
mkdirSync(outDir, { recursive: true });
const title = path.basename(out);
let body = "";
let count = 0;
for (const page of PAGES) {
  body += `<h2>${page.name}</h2>\n`;
  const cuts = WIDTHS.map(([viewport]) => ({ before: cut(before, page, viewport, outDir, "before"), after: cut(after, page, viewport, outDir, "after") }));
  for (const [label] of page.sections) {
    if (!cuts.some((c) => c.before[label] || c.after[label])) continue;
    body += `<section><h3>${label}</h3><div class="widths">\n`;
    WIDTHS.forEach(([, width], w) => {
      const b = cuts[w].before[label], a = cuts[w].after[label];
      count += (b ? 1 : 0) + (a ? 1 : 0);
      body += `<div class="width"><p>${width} px</p><div class="pair">` +
        `<figure><figcaption>before</figcaption>${b ? `<img src="${title}/${b}" alt="${page.name}, ${label}, ${width} px, before">` : "<em>not on the page</em>"}</figure>` +
        `<figure><figcaption>after</figcaption>${a ? `<img src="${title}/${a}" alt="${page.name}, ${label}, ${width} px, after">` : "<em>not on the page</em>"}</figure></div></div>\n`;
    });
    body += "</div></section>\n";
  }
}
writeFileSync(`${out}.html`, `<!doctype html><meta charset="utf-8"><title>${title}: every section, before and after</title>
<style>body{font:15px system-ui;margin:20px;background:#eee}h2{margin:32px 0 8px}section{background:#fff;border-radius:10px;padding:12px;margin:12px 0}
h3{margin:0 0 8px}.widths{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}.width p{margin:0 0 4px;font-weight:700}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}figure{margin:0}figcaption{color:#666;font-size:12px}img{width:100%;border:1px solid #ccc}</style>
<h1>Every section of both pages, before and after, at 360, 390, 430 and 768 px</h1>
<p>Cut out of full-page pictures taken with reduced motion, light scheme, so every animation shows its end state.</p>
${body}`);
console.log(`${out}.html: ${count} pictures`);
