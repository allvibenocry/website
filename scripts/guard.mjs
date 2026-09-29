#!/usr/bin/env node
/**
 * Nothing about the owner's own network in this public repository (D14).
 *
 *   node scripts/guard.mjs                   # every file about to be committed
 *   node scripts/guard.mjs --staged          # and every file as it is staged (the pre-commit hook)
 *   node scripts/guard.mjs --message <file>  # a commit message (the commit-msg hook)
 *   node scripts/guard.mjs --history         # every file in every committed revision
 *
 * The hooks are scripts/hooks/pre-commit and scripts/hooks/commit-msg, copied
 * into .git/hooks/ of the owner's clone (D34): a commit the guard refuses is
 * not made. The staged copy is read too, because a file can be staged with a
 * finding and then changed in the working tree.
 *
 * Generically: no private IPv4 address (10/8, 172.16/12, 192.168/16, 100.64/10)
 * and no Windows user profile path. On the owner's workstation also every
 * string in `.local/private-strings.txt`, a gitignored list of the owner's own
 * addresses, host names, ids and other apps' stack and container names. CI has
 * the generic half.
 *
 * A finding is reported as file, line (or revisions) and kind, **never with the
 * text that matched**: this repository and its CI logs are public, and a check
 * that repeats a leaked address has leaked it again. Examples in this
 * repository use 192.0.2.0/24, a range reserved for documentation.
 *
 * Two private ranges are allowed, exactly as written and nowhere else in their
 * ranges: the product's own Docker address pools, which the product repository
 * publishes (its D16) and the under-the-hood page names. They are design
 * values, nobody's network; the product's own guard allows the same two.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIST = path.join(ROOT, ".local", "private-strings.txt");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const PRIVATE_V4 =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})(?:\/\d{1,2})?\b/;
const ALLOWED_ADDRESSES = new Map([
  ["172.20.0.0/14", "the product's Docker address pool (product D16): a design value, nobody's network"],
  ["10.201.0.0/16", "the product's fallback pool (product D16)"],
]);
const WINDOWS_PROFILE = /\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/;

const local = existsSync(LIST)
  ? readFileSync(LIST, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.toLowerCase())
  : null;

/** What in one text is a finding: line and kind, never the text itself. */
function inspect(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    const lower = line.toLowerCase();
    const addresses = [...line.matchAll(new RegExp(PRIVATE_V4.source, "g"))].map((m) => m[0]);
    if (addresses.some((a) => !ALLOWED_ADDRESSES.has(a))) found.push({ line: index + 1, kind: "a private IPv4 address" });
    if (WINDOWS_PROFILE.test(line)) found.push({ line: index + 1, kind: "a Windows user profile path" });
    if (local && local.some((s) => lower.includes(s))) found.push({ line: index + 1, kind: "a string from .local/private-strings.txt" });
  });
  return found;
}

const findings = [];

if (process.argv.includes("--history")) {
  // Every revision, oldest first; for each file with a finding, the revisions
  // it is in. Each distinct file version is inspected once.
  const revisions = git("rev-list", "--all", "--reverse").trim().split("\n");
  const byBlob = new Map();
  const byFile = new Map();
  for (const rev of revisions) {
    for (const entry of git("ls-tree", "-r", rev).trim().split("\n")) {
      const [meta, file] = entry.split("\t");
      const blob = meta.split(" ")[2];
      if (!byBlob.has(blob)) {
        const text = git("cat-file", "-p", blob);
        byBlob.set(blob, text.includes("\0") ? [] : [...new Set(inspect(text).map((f) => f.kind))]);
      }
      const kinds = byBlob.get(blob);
      if (kinds.length === 0) continue;
      const seen = byFile.get(file) ?? { revisions: [], kinds: new Set() };
      seen.revisions.push(rev.slice(0, 7));
      for (const kind of kinds) seen.kinds.add(kind);
      byFile.set(file, seen);
    }
  }
  for (const [file, seen] of byFile) findings.push(`${file}: ${[...seen.kinds].join("; ")}; in ${seen.revisions.join(" ")}`);

  const messages = git("log", "--all", "--format=%H%x00%B%x01").split("\x01").filter((m) => m.trim());
  for (const message of messages) {
    const [rev, body] = message.trim().split("\0");
    if (inspect(body ?? "").length) findings.push(`${rev.slice(0, 7)}: its commit message`);
  }
  process.stdout.write(
    `guard --history: ${revisions.length} revisions, ${byBlob.size} distinct file versions and every commit message` +
      `${local ? `, with ${local.length} local private strings` : ""}\n`,
  );
} else if (process.argv.includes("--message")) {
  const file = process.argv[process.argv.indexOf("--message") + 1];
  if (!file || !existsSync(file)) {
    process.stdout.write("guard: --message needs the commit message's file\n");
    process.exit(2);
  }
  // git's own comment lines are not part of the message.
  const text = readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n");
  for (const { line, kind } of inspect(text)) findings.push(`the commit message:${line}: ${kind}`);
  process.stdout.write(`guard: the commit message${local ? `, with ${local.length} local private strings` : ""}\n`);
} else {
  const files = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean);
  for (const file of files) {
    if (!existsSync(path.join(ROOT, file))) continue;
    const buffer = readFileSync(path.join(ROOT, file));
    if (buffer.includes(0)) continue;
    for (const { line, kind } of inspect(buffer.toString("utf8"))) findings.push(`${file}:${line}: ${kind}`);
  }
  let staged = 0;
  if (process.argv.includes("--staged")) {
    // Every file as it is staged, read from the index in one go.
    const entries = git("ls-files", "-s", "-z").split("\0").filter(Boolean).map((e) => {
      const [meta, file] = e.split("\t");
      return { file, mode: meta.split(" ")[0], blob: meta.split(" ")[1] };
    }).filter((e) => e.mode !== "160000");
    if (entries.length) {
      const out = execFileSync("git", ["cat-file", "--batch"], { cwd: ROOT, input: `${entries.map((e) => e.blob).join("\n")}\n`, maxBuffer: 512 * 1024 * 1024 });
      let at = 0;
      for (const entry of entries) {
        const end = out.indexOf(0x0a, at);
        const size = Number(out.subarray(at, end).toString("utf8").split(" ")[2]);
        const buffer = out.subarray(end + 1, end + 1 + size);
        at = end + 1 + size + 1;
        if (buffer.includes(0)) continue;
        for (const { line, kind } of inspect(buffer.toString("utf8"))) findings.push(`${entry.file} (staged):${line}: ${kind}`);
      }
    }
    staged = entries.length;
  }
  process.stdout.write(`guard: ${files.length} files${staged ? `, and ${staged} as staged` : ""}${local ? `, with ${local.length} local private strings` : " (generic checks only: no .local/private-strings.txt here)"}\n`);
}

if (findings.length) {
  for (const finding of findings) process.stdout.write(`  ${finding}\n`);
  process.stdout.write(`guard: ${findings.length} finding(s); the matched text is not shown\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("guard: clean\n");
}
