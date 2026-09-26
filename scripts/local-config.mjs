/**
 * The local configuration (D14): the production host's details, which this
 * public repository never holds.
 *
 * `local.env` at the repository's root, gitignored; `local.example.env` shows
 * the placeholders. Imported first by every script that talks to the host, so
 * a value is in `process.env` before anything reads it. A variable already set
 * in the environment wins over the file.
 *
 * Only these names are read from it, and none is a secret. A secret-looking
 * name in the file (a token, a password, a key) is ignored and said so:
 * secrets are read from the environment only (rule 3). No value is ever
 * printed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "local.env");
export const LOCAL_NAMES = ["PORTAINER_URL", "PORTAINER_ENDPOINT_ID", "VIKT_HOST", "WEB_BIND", "WEB_PORT"];
const SECRET = /TOKEN|SECRET|PASS|KEY/i;

export function parseLocal(text) {
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2].trim().replace(/^"(.*)"$/, "$1"));
  }
  return values;
}

export function loadLocalConfig(file = LOCAL_FILE, env = process.env) {
  const loaded = [];
  if (!existsSync(file)) return { found: false, loaded };
  for (const [name, value] of parseLocal(readFileSync(file, "utf8"))) {
    if (SECRET.test(name)) {
      process.stderr.write(`local.env: ${name} is ignored; secrets are read from the environment only (rule 3)\n`);
      continue;
    }
    if (!LOCAL_NAMES.includes(name)) {
      process.stderr.write(`local.env: ${name} is not a setting these scripts read; ignored\n`);
      continue;
    }
    if (value !== "" && (env[name] === undefined || env[name].trim() === "")) {
      env[name] = value;
      loaded.push(name);
    }
  }
  return { found: true, loaded };
}

export const local = loadLocalConfig();
