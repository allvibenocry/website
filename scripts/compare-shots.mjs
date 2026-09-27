#!/usr/bin/env node
/**
 * "Nothing else changed", measured (D8): two sets of screenshots from
 * check-page, compared pixel by pixel, against the noise floor of the page
 * compared with itself.
 *
 *   node scripts/compare-shots.mjs <before> <after> [--noise <before, again>]
 *        [--changed <box key>,<box key>,...]
 *
 * `<before>` and `<after>` are directories of check-page's `--shots` or
 * `--full` output. Screenshots with the same name are compared.
 *
 * A full-page screenshot (`full-*.png`) comes with the boxes of its landmarks
 * (`full-*.boxes.json`). It is compared block by block, each block (the hero,
 * every section, the footer) at its own place in each picture, so that a block
 * that moved down because something above it grew is compared where it is and
 * not called different. The boxes named by `--changed` are where a change was
 * meant to be: they are left out of the comparison and reported as such. When
 * a block with a change in it changed height, the rows above the change are
 * compared from the top and the rows below it from the bottom.
 *
 * With `--noise`, every comparison is also made between `<before>` and the
 * second before run, and the result says whether after-against-before stays
 * within that: the same page, twice, differs by this much on its own.
 *
 * Exit 1 if anything outside the named changes differs by more than the noise.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

/** An 8-bit RGB PNG from its pixels, row by row, three bytes each. */
export function encode(width, height, rgb) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** An 8-bit RGB or RGBA PNG, unfiltered into its pixels. */
export function decode(buffer) {
  let offset = 8;
  let width, height, colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("only 8-bit, non-interlaced PNGs");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`PNG colour type ${colorType} is not RGB or RGBA`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[row + x - channels] : 0;
      const b = y > 0 ? pixels[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[row - stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[row + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** How two same-sized regions differ: pixels that differ, and the largest channel difference. */
function diff(A, ax, ay, B, bx, by, width, height, skip = () => false) {
  let count = 0, max = 0, compared = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (skip(x, y)) continue;
      compared += 1;
      const i = ((ay + y) * A.width + ax + x) * A.channels;
      const j = ((by + y) * B.width + bx + x) * B.channels;
      const d = Math.max(Math.abs(A.pixels[i] - B.pixels[j]), Math.abs(A.pixels[i + 1] - B.pixels[j + 1]), Math.abs(A.pixels[i + 2] - B.pixels[j + 2]));
      if (d > 0) {
        count += 1;
        if (d > max) max = d;
      }
    }
  }
  return { count, max, compared };
}

const add = (a, b) => ({ count: a.count + b.count, max: Math.max(a.max, b.max), compared: a.compared + b.compared });
const NONE = { count: 0, max: 0, compared: 0 };
const say = (r) => (r.count === 0 ? "identical" : `${r.count} of ${r.compared} px differ, by at most ${r.max}/255`);

/** The blocks a full page is made of: the hero, every section, the dusk, the footer. */
const isBlock = (key) => /^(header|section|footer|div\.dusk)/.test(key);

/**
 * One full-page screenshot against another, block by block. `changed` is the
 * set of box keys where a change was meant to be.
 */
function compareFull(beforeFile, afterFile, changed) {
  const A = decode(readFileSync(beforeFile));
  const B = decode(readFileSync(afterFile));
  // Boxes are in CSS pixels; a picture taken at 2x (mobile) has twice as many.
  const scaled = (boxes, img) => {
    const scale = img.width / Math.max(...boxes.map((b) => b.x + b.width));
    return boxes.map((b) => ({ key: b.key, x: Math.round(b.x * scale), y: Math.round(b.y * scale), width: Math.round(b.width * scale), height: Math.round(b.height * scale) }));
  };
  const boxesA = scaled(JSON.parse(readFileSync(beforeFile.replace(/\.png$/, ".boxes.json"), "utf8")), A);
  const boxesB = scaled(JSON.parse(readFileSync(afterFile.replace(/\.png$/, ".boxes.json"), "utf8")), B);
  const byKey = (boxes) => new Map(boxes.map((b) => [b.key, b]));
  const mapA = byKey(boxesA), mapB = byKey(boxesB);
  const inside = (outer, inner) => inner.y >= outer.y && inner.y + inner.height <= outer.y + outer.height && inner.x >= outer.x && inner.x + inner.width <= outer.x + outer.width;
  const clamp = (box, img) => ({ ...box, height: Math.min(box.height, img.height - box.y), width: Math.min(box.width, img.width - box.x) });

  const blocks = [];
  let total = NONE;
  for (const a of boxesA.filter((b) => isBlock(b.key) && b.height > 0)) {
    const b = mapB.get(a.key);
    if (!b) {
      blocks.push({ key: a.key, result: "missing after" });
      total = add(total, { count: 1, max: 255, compared: 1 });
      continue;
    }
    const ca = clamp(a, A), cb = clamp(b, B);
    // The intended changes inside this block, in the block's own coordinates.
    const masksA = [...changed].map((k) => mapA.get(k)).filter((m) => m && inside(a, m)).map((m) => ({ x: m.x - a.x, y: m.y - a.y, w: m.width, h: m.height }));
    const masksB = [...changed].map((k) => mapB.get(k)).filter((m) => m && inside(b, m)).map((m) => ({ x: m.x - b.x, y: m.y - b.y, w: m.width, h: m.height }));
    const masks = [...masksA, ...masksB];
    const width = Math.min(ca.width, cb.width);
    let result;
    let note = "";
    if (masks.length === 0 && ca.height === cb.height) {
      result = diff(A, ca.x, ca.y, B, cb.x, cb.y, width, ca.height);
    } else if (ca.height === cb.height) {
      const skip = (x, y) => masks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
      result = diff(A, ca.x, ca.y, B, cb.x, cb.y, width, ca.height, skip);
      note = `, leaving out the change (${masks.map((m) => `${m.w}x${m.h}`).join(" and ")})`;
    } else if (masks.length > 0) {
      // Grown or shrunk around the change: above it from the top, below it from the bottom.
      const top = Math.min(...masks.map((m) => m.y));
      const bottomA = ca.height - Math.max(...masksA.map((m) => m.y + m.h), top);
      const bottomB = cb.height - Math.max(...masksB.map((m) => m.y + m.h), top);
      const below = Math.min(bottomA, bottomB);
      result = add(
        diff(A, ca.x, ca.y, B, cb.x, cb.y, width, top),
        diff(A, ca.x, ca.y + ca.height - below, B, cb.x, cb.y + cb.height - below, width, below),
      );
      note = `, height ${ca.height} -> ${cb.height}: ${top} rows above the change from the top, ${below} below it from the bottom`;
    } else {
      result = { count: 1, max: 255, compared: 1 };
      note = `, height ${ca.height} -> ${cb.height} with no change named in it`;
    }
    blocks.push({ key: a.key, moved: cb.y - ca.y, result, note });
    total = add(total, result);
  }
  return { size: `${A.width}x${A.height} -> ${B.width}x${B.height}`, blocks, total };
}

/**
 * A section screenshot against another, the same size, pixel by pixel. With a
 * second before run, the differences that matter are the ones where the page
 * did not differ from itself (D8: animations never stop, so some pixels always
 * move); where they are is reported, so an intended change can be told apart.
 */
function compareSame(beforeFile, afterFile, noiseFile) {
  const A = decode(readFileSync(beforeFile));
  const B = decode(readFileSync(afterFile));
  const N = noiseFile && existsSync(noiseFile) ? decode(readFileSync(noiseFile)) : null;
  const size = `${A.width}x${A.height}`;
  if (A.width !== B.width || A.height !== B.height) return { size: `${size} -> ${B.width}x${B.height}`, total: null };
  const sameN = N && N.width === A.width && N.height === A.height;
  const total = diff(A, 0, 0, B, 0, 0, A.width, A.height);
  const noise = sameN ? diff(A, 0, 0, N, 0, 0, A.width, A.height) : null;
  // Differences where the page's own two runs agree.
  let fresh = { count: 0, max: 0, x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  if (sameN) {
    for (let y = 0; y < A.height; y += 1) {
      for (let x = 0; x < A.width; x += 1) {
        const i = (y * A.width + x) * A.channels;
        const d = Math.max(Math.abs(A.pixels[i] - B.pixels[i]), Math.abs(A.pixels[i + 1] - B.pixels[i + 1]), Math.abs(A.pixels[i + 2] - B.pixels[i + 2]));
        if (d === 0) continue;
        const n = Math.max(Math.abs(A.pixels[i] - N.pixels[i]), Math.abs(A.pixels[i + 1] - N.pixels[i + 1]), Math.abs(A.pixels[i + 2] - N.pixels[i + 2]));
        if (n > 0) continue;
        fresh = { count: fresh.count + 1, max: Math.max(fresh.max, d), x0: Math.min(fresh.x0, x), y0: Math.min(fresh.y0, y), x1: Math.max(fresh.x1, x), y1: Math.max(fresh.y1, y) };
      }
    }
  }
  return { size, total, noise, fresh: sameN ? fresh : null };
}

function main() {
  const [before, after, ...rest] = process.argv.slice(2);
  const options = { changed: new Set() };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--noise") options.noise = rest[(i += 1)];
    else if (rest[i] === "--changed") options.changed = new Set(rest[(i += 1)].split(","));
    else throw new Error(`unknown option ${rest[i]}`);
  }
  if (!before || !after) throw new Error("usage: compare-shots.mjs <before> <after> [--noise <before, again>] [--changed key,key]");

  let beyond = 0;
  for (const name of readdirSync(before).filter((f) => f.endsWith(".png")).sort()) {
    const afterFile = path.join(after, name);
    if (!existsSync(afterFile)) {
      process.stdout.write(`${name}: missing in ${after}\n`);
      beyond += 1;
      continue;
    }
    const full = name.startsWith("full-") || name.includes("-full-");
    const noiseFile = options.noise ? path.join(options.noise, name) : null;
    process.stdout.write(`\n${name}  `);
    let within;
    if (full) {
      const result = compareFull(path.join(before, name), afterFile, options.changed);
      const noise = noiseFile && existsSync(noiseFile) ? compareFull(path.join(before, name), noiseFile, new Set()) : null;
      process.stdout.write(`${result.size}\n`);
      for (const block of result.blocks) {
        process.stdout.write(`  ${block.key.padEnd(26)} ${block.result === "missing after" ? "MISSING after" : `${say(block.result)}${block.moved ? `, moved ${block.moved > 0 ? "down" : "up"} ${Math.abs(block.moved)} px` : ""}${block.note}`}\n`);
      }
      const t = result.total, n = noise?.total;
      // Reduced motion makes a full page deterministic but for GPU rounding (D8).
      within = t.count === 0 || t.max <= Math.max(n?.max ?? 0, 2);
      process.stdout.write(`  after against before, outside the named changes: ${say(t)}\n`);
      if (noise) process.stdout.write(`  before against itself: ${say(n)}\n`);
    } else {
      const result = compareSame(path.join(before, name), afterFile, noiseFile);
      process.stdout.write(`${result.size}\n`);
      if (!result.total) {
        within = false;
        process.stdout.write("  a different size\n");
      } else {
        process.stdout.write(`  after against before: ${say(result.total)}\n`);
        if (result.noise) process.stdout.write(`  before against itself: ${say(result.noise)}\n`);
        const f = result.fresh;
        if (f) {
          process.stdout.write(`  where the page does not move on its own: ${f.count === 0 ? "identical" : `${f.count} px differ, by at most ${f.max}/255, within x ${f.x0} to ${f.x1}, y ${f.y0} to ${f.y1}`}\n`);
          within = f.count === 0 || f.max <= 2;
        } else within = result.total.count === 0;
      }
    }
    process.stdout.write(`  ${within ? "within the noise" : "BEYOND the noise"}\n`);
    if (!within) beyond += 1;
  }
  process.stdout.write(`\n${beyond === 0 ? "nothing changed beyond the noise, outside the named changes" : `${beyond} screenshot(s) beyond the noise`}\n`);
  process.exitCode = beyond === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
