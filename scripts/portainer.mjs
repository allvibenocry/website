#!/usr/bin/env node
/**
 * The one way this repository talks to Portainer. Vikt's `scripts/portainer.mjs`,
 * adapted (D13).
 *
 *   node scripts/portainer.mjs check     # the token works, and whose it is
 *
 * The token and the address come from the environment, by the names Vikt uses:
 *
 *   PORTAINER_URL     where Portainer answers
 *   PORTAINER_TOKEN   an access token (My account, Access tokens)
 *
 * **Nothing here prompts** (rule 3). Either variable missing, it names the
 * variable and exits 2; there is no password path at all. Every line it prints
 * passes through `redact`, so a server that reflects the token into a response
 * or an error page cannot put it on the screen.
 */
import { pathToFileURL } from "node:url";

export function requireUrl() {
  const url = process.env.PORTAINER_URL?.trim();
  if (!url) {
    process.stderr.write("PORTAINER_URL is not set. It is where Portainer answers, set beside PORTAINER_TOKEN.\n");
    process.exit(2);
  }
  return url.replace(/\/$/, "");
}

export function requireToken() {
  const token = process.env.PORTAINER_TOKEN?.trim();
  if (!token) {
    process.stderr.write(
      "PORTAINER_TOKEN is not set.\n" +
        "This script does not prompt for a credential and has no password path.\n" +
        "Create an access token in Portainer (My account, Access tokens) and set it in the environment.\n",
    );
    process.exit(2);
  }
  return token;
}

export function redact(text) {
  const value = String(text);
  const token = process.env.PORTAINER_TOKEN?.trim();
  if (!token || token.length < 8) return value;
  return value.split(token).join("<redacted>");
}

export const out = (text = "") => process.stdout.write(`${redact(text)}\n`);
export const err = (text) => process.stderr.write(redact(text));

/** A raw request, with the token added here and nowhere else. */
export async function request(path, { method = "GET", headers = {}, body } = {}) {
  const token = requireToken();
  return fetch(requireUrl() + path, {
    method,
    headers: { "X-API-Key": token, ...headers },
    ...(body === undefined ? {} : { body }),
  });
}

/** JSON in, JSON out; `null` on any HTTP error, with the error printed (redacted). */
export async function portainer(path, { method = "GET", body } = {}) {
  const response = await request(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    err(`${method} ${path} -> HTTP ${response.status}\n${text.slice(0, 400)}\n`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();

if (invokedDirectly) {
  const [command] = process.argv.slice(2);
  try {
    if (command === "check") {
      const me = await portainer("/api/users/me");
      if (me) out(`token works: ${me.Username} (role ${me.Role}${me.Role === 1 ? ", administrator" : ""})`);
      else process.exitCode = 1;
    } else {
      err("usage: portainer.mjs check\n");
      process.exitCode = 2;
    }
  } catch (error) {
    err(`request failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
