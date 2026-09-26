#!/usr/bin/env node
/**
 * The site's Portainer stack: look, plan, deploy, and prove that nothing else on
 * the host changed (D13). Vikt's `scripts/stack.mjs`, adapted to one container.
 *
 *   node scripts/stack.mjs host                                   # addresses and ports in use, read-only
 *   node scripts/stack.mjs snapshot out/host-before.json          # every stack and container, read-only
 *   node scripts/stack.mjs compare out/host-before.json out/host-after.json
 *   node scripts/stack.mjs plan   v0.1.0                          # address and port from local.env
 *   node scripts/stack.mjs deploy v0.1.0 --yes
 *   node scripts/stack.mjs deploy v0.1.1 --yes                    # later: the stack's address and port stay
 *
 * **The host's details live in local.env** (gitignored; local.example.env
 * shows the placeholders), never in this public repository (D14): the
 * address and port (WEB_BIND, WEB_PORT), and PORTAINER_URL, VIKT_HOST and
 * PORTAINER_ENDPOINT_ID, which may also come from the environment. --bind and
 * --port override the file for one run.
 *
 * **A rollback is a deploy of the previous version**, nothing else:
 *
 *   node scripts/stack.mjs deploy v0.1.0 --yes
 *
 * `plan` and `deploy` go through the same steps in the same order and **stop at
 * the first that fails** (rule 4), naming it and what would have to be true.
 * `deploy` without `--yes` is `plan`. With it, it snapshots the host, creates or
 * updates the stack, waits for the container to be healthy on the new image,
 * asks the site for its page, snapshots again, and fails if anything that is
 * not this stack changed (rule 2).
 *
 * What it needs, all by name (rule 3), the names Vikt uses:
 *
 *   PORTAINER_URL, PORTAINER_TOKEN   read by scripts/portainer.mjs
 *   VIKT_HOST                        user@host of the Docker host, for read-only
 *                                    checks over key-based SSH with BatchMode=yes
 *   gh                               logged in, to read the release workflow
 *   PORTAINER_ENDPOINT_ID            only if Portainer has more than one environment
 *
 * **It never prints another stack's variables.** Portainer returns every stack's
 * environment, secrets included, in its stack listing; this reads names, ids and
 * states from it and nothing else. Nor does it print VIKT_HOST.
 */
import "./local-config.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { err, out, portainer } from "./portainer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STACK_NAME = "allvibenocry-website";
const COMPOSE_PATH = "compose.portainer.yaml";
const IMAGE = "ghcr.io/allvibenocry/website";
const REPO = "allvibenocry/website";
const WAIT_MS = Number(process.env.STACK_WAIT_MS ?? 180_000);

/* ------------------------------------------------------------- plumbing -- */

const ok = (evidence) => ({ ok: true, evidence });
const fail = (why, fix = null) => ({ ok: false, why, fix });

function local(file, args) {
  const result = spawnSync(file, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { code: result.status ?? 1, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/** A read-only command on the Docker host. No key, no answer: never a prompt. */
function remote(command) {
  const host = process.env.VIKT_HOST?.trim();
  if (!host) return { code: 2, out: "VIKT_HOST is not set" };
  return local("ssh", [
    "-o", "BatchMode=yes",
    "-o", "PasswordAuthentication=no",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    host,
    command,
  ]);
}

async function must(apiPath) {
  const result = await portainer(apiPath);
  if (result === null) throw new Error(`could not read ${apiPath} from Portainer`);
  return result;
}

async function endpointId() {
  const given = process.env.PORTAINER_ENDPOINT_ID?.trim();
  if (given) return Number(given);
  const endpoints = await must("/api/endpoints");
  if (endpoints.length !== 1) {
    throw new Error(`Portainer has ${endpoints.length} environments; set PORTAINER_ENDPOINT_ID to the production one`);
  }
  return endpoints[0].Id;
}

const isPrivateIPv4 = (a) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);

/* ---------------------------------------------------------- the host view -- */

/** What the host listens on, and which of its ports Docker publishes. */
async function hostView(endpoint) {
  const listening = remote("ss -Hltn");
  const v4 = remote("ip -4 -o addr show");
  const v6 = remote("ip -6 -o addr show scope global");
  if (listening.code !== 0 || v4.code !== 0) {
    throw new Error(`could not read the host over SSH (exit ${listening.code}): ${listening.out.slice(0, 300)}`);
  }
  const ports = new Map();
  for (const line of listening.out.split("\n").filter(Boolean)) {
    const local4 = line.trim().split(/\s+/)[3] ?? "";
    const port = Number(local4.slice(local4.lastIndexOf(":") + 1));
    if (port) ports.set(port, [...(ports.get(port) ?? []), local4]);
  }
  const addresses = v4.out
    .split("\n")
    .map((line) => line.match(/^\d+:\s+(\S+)\s+inet\s+([\d.]+)\//))
    .filter(Boolean)
    .map(([, iface, address]) => ({ iface, address }));
  const globalV6 = v6.code === 0
    ? v6.out.split("\n").filter(Boolean).map((line) => line.match(/^\d+:\s+(\S+)/)?.[1]).filter(Boolean)
    : [];

  const published = new Map();
  for (const c of await must(`/api/endpoints/${endpoint}/docker/containers/json?all=1`)) {
    for (const p of c.Ports ?? []) {
      if (p.PublicPort) {
        const name = (c.Names?.[0] ?? c.Id).replace(/^\//, "");
        published.set(p.PublicPort, [...new Set([...(published.get(p.PublicPort) ?? []), name])]);
      }
    }
  }
  return { ports, addresses, globalV6, published };
}

/* ------------------------------------------------------ snapshot, compare -- */

/**
 * Every stack and every container on the environment, by name, with what would
 * show a change: ids, images, states, start times, restart counts. Never a
 * stack's variables.
 */
async function snapshot(endpoint) {
  const stacks = (await must("/api/stacks"))
    .map((s) => ({ id: s.Id, name: s.Name, endpoint: s.EndpointId, status: s.Status === 1 ? "active" : "inactive", updated: s.UpdateDate ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const containers = [];
  for (const c of await must(`/api/endpoints/${endpoint}/docker/containers/json?all=1`)) {
    const d = await must(`/api/endpoints/${endpoint}/docker/containers/${c.Id}/json`);
    containers.push({
      name: d.Name.replace(/^\//, ""),
      id: d.Id.slice(0, 12),
      stack: c.Labels?.["com.docker.compose.project"] ?? "",
      image: d.Config?.Image ?? "",
      imageId: (d.Image ?? "").replace(/^sha256:/, "").slice(0, 12),
      state: d.State?.Status ?? "",
      health: d.State?.Health?.Status ?? "none",
      started: d.State?.StartedAt ?? "",
      restarts: d.RestartCount ?? 0,
    });
  }
  containers.sort((a, b) => a.name.localeCompare(b.name));
  return { taken: new Date().toISOString(), endpoint, stacks, containers };
}

function printSnapshot(snap) {
  out(`snapshot ${snap.taken}, environment ${snap.endpoint}`);
  out(`stacks (${snap.stacks.length})`);
  for (const s of snap.stacks) out(`  ${String(s.id).padStart(3)}  ${s.name.padEnd(24)} ${s.status}`);
  out(`containers (${snap.containers.length})`);
  for (const c of snap.containers) {
    const state = c.health === "none" ? c.state : `${c.state}/${c.health}`;
    out(`  ${c.name.padEnd(34)} ${c.id}  ${state.padEnd(17)} started ${c.started.slice(0, 19)}  restarts ${c.restarts}  ${c.image}`);
  }
}

/** What changed between two snapshots, this stack's changes apart from everyone else's. */
function compare(before, after) {
  const mine = { stacks: [], containers: [] };
  const others = { stacks: [], containers: [] };
  const notes = [];

  const byName = (list) => new Map(list.map((x) => [x.name, x]));
  const stackB = byName(before.stacks), stackA = byName(after.stacks);
  for (const name of new Set([...stackB.keys(), ...stackA.keys()])) {
    const b = stackB.get(name), a = stackA.get(name);
    const bucket = name === STACK_NAME ? mine : others;
    if (!b) bucket.stacks.push(`stack ${name}: added (id ${a.id})`);
    else if (!a) bucket.stacks.push(`stack ${name}: removed`);
    else if (b.status !== a.status || b.updated !== a.updated || b.id !== a.id) {
      bucket.stacks.push(`stack ${name}: ${b.status} -> ${a.status}${b.updated !== a.updated ? ", updated" : ""}`);
    }
  }

  const contB = byName(before.containers), contA = byName(after.containers);
  const fields = ["id", "image", "imageId", "state", "started", "restarts"];
  for (const name of new Set([...contB.keys(), ...contA.keys()])) {
    const b = contB.get(name), a = contA.get(name);
    const bucket = (a ?? b).stack === STACK_NAME ? mine : others;
    if (!b) bucket.containers.push(`container ${name}: added (${a.image}, ${a.state}/${a.health})`);
    else if (!a) bucket.containers.push(`container ${name}: removed`);
    else {
      const differing = fields.filter((f) => b[f] !== a[f]);
      const changed = differing.map((f) => `${f} ${b[f]} -> ${a[f]}`);
      /*
        A container that was already restarting on its own before this run,
        and has only restarted again (the same container, the same image, a
        later start and a higher count), is noted, not counted: nothing here
        did it, and nothing here touches it. Anything else is a change.
      */
      const restartedOnItsOwn =
        bucket === others &&
        b.restarts > 0 &&
        a.restarts > b.restarts &&
        differing.every((f) => f === "started" || f === "restarts" || f === "state") &&
        ["running", "restarting"].includes(a.state) &&
        ["running", "restarting"].includes(b.state);
      if (restartedOnItsOwn) notes.push(`container ${name}: restarted on its own (restarts ${b.restarts} -> ${a.restarts}); it was already restarting before, and was not touched`);
      else if (changed.length > 0) bucket.containers.push(`container ${name}: ${changed.join(", ")}`);
      else if (b.health !== a.health) notes.push(`container ${name}: health ${b.health} -> ${a.health} (same container, not restarted)`);
    }
  }
  return { mine, others, notes };
}

function printComparison({ mine, others, notes }) {
  out(`this stack (${STACK_NAME}):`);
  const m = [...mine.stacks, ...mine.containers];
  for (const line of m.length ? m : ["no change"]) out(`  ${line}`);
  out("everything else on the host:");
  const o = [...others.stacks, ...others.containers];
  const unchanged = notes.length
    ? "no change apart from the notes below: same stacks, same containers, same ids and images"
    : "no change: same stacks, same containers, same ids, images, start times and restart counts";
  for (const line of o.length ? o : [unchanged]) out(`  ${line}`);
  for (const line of notes) out(`  note: ${line}`);
  return o.length === 0;
}

/* --------------------------------------------------------------- the plan -- */

/** The steps, in order. Each returns ok(evidence) or fail(why, fix). */
function steps(version, options, context) {
  return [
    {
      name: "the workstation has what it needs",
      async run() {
        for (const name of ["PORTAINER_URL", "PORTAINER_TOKEN", "VIKT_HOST"]) {
          if (!process.env[name]?.trim()) return fail(`${name} is not set`, `set ${name} in the workstation's environment (README, "Deploying")`);
        }
        if (local("gh", ["auth", "status"]).code !== 0) return fail("gh is not logged in", "gh auth login");
        const me = await portainer("/api/users/me");
        if (me === null) return fail("Portainer refused the token", "create a new access token in Portainer and set PORTAINER_TOKEN");
        context.endpoint = await endpointId();
        return ok(`PORTAINER_URL, PORTAINER_TOKEN and VIKT_HOST set; gh logged in; token works (role ${me.Role}); environment ${context.endpoint}`);
      },
    },
    {
      name: "the version is a release tag",
      async run() {
        if (!/^v\d+\.\d+\.\d+$/.test(version)) {
          return fail(`${version} is not vMAJOR.MINOR.PATCH`, "deploy a version tag; `latest` and branches are never deployed (rule 6)");
        }
        const remoteTag = local("git", ["ls-remote", "--tags", "origin", `refs/tags/${version}`]);
        if (remoteTag.code !== 0 || !/^[0-9a-f]{40}\s/.test(remoteTag.out)) {
          return fail(`${version} is not a tag on origin`, `git tag ${version} && git push origin ${version}`);
        }
        local("git", ["fetch", "--quiet", "origin", "tag", version]);
        /* The commit, not the tag object: an annotated tag has its own sha. */
        const commit = local("git", ["rev-parse", `${version}^{commit}`]).out;
        if (!/^[0-9a-f]{40}$/.test(commit)) return fail(`${version} could not be resolved to a commit`);
        context.commit = commit;
        return ok(`${version} is on origin, at commit ${commit.slice(0, 7)}`);
      },
    },
    {
      name: "the release workflow for the tag is green",
      async run() {
        const listed = local("gh", [
          "run", "list", "--repo", REPO, "--workflow", "release.yml", "--limit", "30",
          "--json", "databaseId,status,conclusion,headBranch,headSha",
        ]);
        if (listed.code !== 0) return fail("could not read the release workflow's runs", listed.out);
        const run = JSON.parse(listed.out || "[]").find((r) => r.headBranch === version && r.conclusion !== "cancelled");
        if (!run) return fail(`no run of release.yml for ${version}`, "push the tag and wait for its run");
        if (run.status !== "completed" || run.conclusion !== "success") {
          return fail(`run ${run.databaseId} for ${version} is ${run.status}/${run.conclusion}`, `gh run view ${run.databaseId} --repo ${REPO} --log-failed`);
        }
        if (run.headSha !== context.commit) {
          return fail(`run ${run.databaseId} built ${run.headSha.slice(0, 7)}, but ${version} is ${context.commit.slice(0, 7)}`, "the tag was moved after its image was built; release a new version instead");
        }
        return ok(`run ${run.databaseId} built ${run.headSha.slice(0, 7)} and succeeded, so ${IMAGE}:${version} and :sha-${run.headSha.slice(0, 7)}… were pushed and read back`);
      },
    },
    {
      name: "the stack file is the release's",
      async run() {
        const shown = local("git", ["show", `${context.commit}:${COMPOSE_PATH}`]);
        if (shown.code !== 0) return fail(`${COMPOSE_PATH} is not in ${version}`, "a release must carry the stack file it is deployed with");
        const reads = ["IMAGE_TAG", "WEB_BIND", "WEB_PORT"].filter((name) => !shown.out.includes(`\${${name}`));
        if (reads.length > 0) return fail(`${COMPOSE_PATH} at ${version} does not read ${reads.join(", ")}`);
        context.file = `${shown.out.replace(/\r\n/g, "\n").trimEnd()}\n`;
        return ok(`${COMPOSE_PATH} at ${version} reads IMAGE_TAG, WEB_BIND and WEB_PORT`);
      },
    },
    {
      name: "the stack's address and port are right",
      async run() {
        const stacks = await must("/api/stacks");
        const found = stacks.find((s) => s.Name === STACK_NAME);
        context.existing = found ? await must(`/api/stacks/${found.Id}`) : null;
        const current = new Map((context.existing?.Env ?? []).map((e) => [e.name, e.value]));
        context.env = current;

        // A flag for this run, else what the stack already has, else local.env (D14).
        const bind = options.bind ?? current.get("WEB_BIND") ?? process.env.WEB_BIND?.trim();
        const port = Number(options.port ?? current.get("WEB_PORT") ?? process.env.WEB_PORT?.trim());
        if (!bind || !port) {
          return fail(
            "no address or port for a new stack",
            "WEB_BIND and WEB_PORT in local.env (see local.example.env), or --bind and --port; `node scripts/stack.mjs host` lists the host's addresses and free ports",
          );
        }
        const view = await hostView(context.endpoint);
        const address = view.addresses.find((a) => a.address === bind);
        if (!address) return fail(`${bind} is not an IPv4 address of the host`, `one of: ${view.addresses.map((a) => a.address).join(", ")}`);
        if (!isPrivateIPv4(bind)) return fail(`${bind} is not a private (LAN) address`, "bind to the host's LAN address only (D13)");

        const ours = context.existing && Number(current.get("WEB_PORT")) === port;
        const listeners = view.ports.get(port) ?? [];
        const publishers = (view.published.get(port) ?? []).filter((name) => !name.startsWith(`${STACK_NAME}-`));
        if (publishers.length > 0) return fail(`port ${port} is published by ${publishers.join(", ")}`, "choose another port");
        if (listeners.length > 0 && !ours) return fail(`port ${port} is in use on the host (${listeners.join(", ")})`, "choose another port");

        context.bind = bind;
        context.port = port;
        return ok(
          `${bind} is the host's ${address.iface} address, private; port ${port} ${ours ? "is this stack's own" : "is free on the host and published by no container"}` +
            `${view.globalV6.length ? `; the host has global IPv6 on ${view.globalV6.join(", ")}, which the IPv4-only bind keeps out of reach` : "; the host has no global IPv6 address"}`,
        );
      },
    },
    {
      name: "the image can be pulled without credentials",
      /**
       * The package is public and the host pulls it anonymously, with no
       * registry credential in Portainer (D15). So this asks GHCR the way the
       * host will: an anonymous pull token, then the version's manifest, and
       * reports the digest it resolves to (Vikt D160: ask the question the
       * deploy will ask).
       */
      async run() {
        const repository = IMAGE.replace(/^ghcr\.io\//, "");
        const grant = await fetch(`https://ghcr.io/token?scope=repository:${repository}:pull&service=ghcr.io`);
        const token = grant.ok ? (await grant.json()).token : null;
        const manifest = token
          ? await fetch(`https://ghcr.io/v2/${repository}/manifests/${version}`, {
              method: "HEAD",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: [
                  "application/vnd.oci.image.index.v1+json",
                  "application/vnd.oci.image.manifest.v1+json",
                  "application/vnd.docker.distribution.manifest.list.v2+json",
                  "application/vnd.docker.distribution.manifest.v2+json",
                ].join(", "),
              },
            })
          : null;
        if (!manifest?.ok) {
          return fail(
            `${IMAGE}:${version} cannot be pulled anonymously: token endpoint ${grant.status}, manifest ${manifest?.status ?? "not asked"}`,
            "the package is public (GitHub, the package's settings, Change visibility) and the tag exists (D15)",
          );
        }
        return ok(`${IMAGE}:${version} is anonymously pullable, digest ${manifest.headers.get("docker-content-digest")}`);
      },
    },
    {
      name: "what the deploy will change",
      async run() {
        const before = context.env.get("IMAGE_TAG");
        context.previous = before ?? null;
        const extra = [...context.env.keys()].filter((name) => !["IMAGE_TAG", "WEB_BIND", "WEB_PORT"].includes(name));
        context.sendEnv = [
          { name: "IMAGE_TAG", value: version },
          { name: "WEB_BIND", value: context.bind },
          { name: "WEB_PORT", value: String(context.port) },
          // Portainer replaces a stack's environment wholesale: keep anything else it has.
          ...extra.map((name) => ({ name, value: context.env.get(name) })),
        ];
        return ok(
          context.existing
            ? `update stack ${STACK_NAME} (id ${context.existing.Id}): IMAGE_TAG ${before ?? "(unset)"} -> ${version}, WEB_BIND ${context.bind}, WEB_PORT ${context.port}`
            : `create stack ${STACK_NAME}: IMAGE_TAG ${version}, WEB_BIND ${context.bind}, WEB_PORT ${context.port}`,
        );
      },
    },
  ];
}

async function runSteps(version, options) {
  const context = {};
  const list = steps(version, options, context);
  for (const [index, step] of list.entries()) {
    let result;
    try {
      result = await step.run();
    } catch (error) {
      result = fail(error instanceof Error ? error.message : String(error));
    }
    const number = `${index + 1}/${list.length}`;
    if (result.ok) {
      out(`ok   ${number} ${step.name}`);
      out(`       ${result.evidence}`);
      continue;
    }
    out(`FAIL ${number} ${step.name}`);
    for (const line of String(result.why).split("\n")) out(`       ${line}`);
    if (result.fix) {
      out("");
      out("     what would have to be true:");
      for (const line of String(result.fix).split("\n")) out(`       ${line}`);
    }
    out("");
    out(`stopped at step ${number}. Nothing after it was attempted, and nothing was changed.`);
    return null;
  }
  out("");
  out("nothing blocks this deploy");
  return context;
}

/* ------------------------------------------------------------- the deploy -- */

async function deploy(version, options) {
  const context = await runSteps(version, options);
  if (context === null) return false;
  if (!options.yes) {
    out("nothing was changed. Run again with --yes to deploy.");
    return true;
  }

  mkdirSync(path.join(ROOT, "out"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const before = await snapshot(context.endpoint);
  writeFileSync(path.join(ROOT, "out", `host-${stamp}-before.json`), `${JSON.stringify(before, null, 2)}\n`);
  out("");
  out(`host before: ${before.stacks.length} stacks, ${before.containers.length} containers (out/host-${stamp}-before.json)`);

  const result = context.existing
    ? await portainer(`/api/stacks/${context.existing.Id}?endpointId=${context.endpoint}`, {
        method: "PUT",
        body: { stackFileContent: context.file, env: context.sendEnv, prune: false, pullImage: true },
      })
    : await portainer(`/api/stacks/create/standalone/string?endpointId=${context.endpoint}`, {
        method: "POST",
        body: { name: STACK_NAME, stackFileContent: context.file, env: context.sendEnv },
      });
  if (result === null) {
    err(`the stack ${context.existing ? "update" : "creation"} was refused; see the response above\n`);
    return false;
  }
  out(`${context.existing ? "updated" : "created"} stack ${STACK_NAME} (id ${result.Id}); waiting for the container`);

  const want = `${IMAGE}:${version}`;
  const deadline = Date.now() + WAIT_MS;
  let last = "";
  let healthy = false;
  while (Date.now() < deadline) {
    const now = (await snapshot(context.endpoint)).containers.filter((c) => c.stack === STACK_NAME);
    const line = now.map((c) => `${c.name} ${c.image} ${c.state}/${c.health}`).join("; ") || "no container yet";
    if (line !== last) out(`  ${line}`);
    last = line;
    if (now.length === 1 && now[0].image === want && now[0].state === "running" && now[0].health === "healthy") {
      healthy = true;
      break;
    }
    await sleep(3000);
  }

  let answered = false;
  if (healthy) {
    const url = `http://${context.bind}:${context.port}/`;
    try {
      const response = await fetch(url);
      const csp = response.headers.get("content-security-policy") ?? "";
      answered = response.status === 200 && csp.startsWith("default-src 'none'");
      out(`${url} answered ${response.status}${csp ? ", with its Content-Security-Policy" : ", WITHOUT a Content-Security-Policy"}`);
    } catch (error) {
      out(`${url} did not answer from this workstation: ${error instanceof Error ? error.message : error}`);
    }
  }

  const after = await snapshot(context.endpoint);
  writeFileSync(path.join(ROOT, "out", `host-${stamp}-after.json`), `${JSON.stringify(after, null, 2)}\n`);
  out("");
  out(`host after: ${after.stacks.length} stacks, ${after.containers.length} containers (out/host-${stamp}-after.json)`);
  const untouched = printComparison(compare(before, after));

  out("");
  if (healthy && answered && untouched) {
    out(`deployed ${version}: healthy, answering on http://${context.bind}:${context.port}/, and nothing else on the host changed`);
    if (context.previous) out(`rollback: node scripts/stack.mjs deploy ${context.previous} --yes`);
    return true;
  }
  if (!untouched) err("SOMETHING ELSE ON THE HOST CHANGED between the two snapshots; read the comparison above\n");
  if (!healthy) err(`the container was not healthy on ${version} within ${Math.round(WAIT_MS / 1000)} s\n`);
  if (context.previous && context.previous !== version) err(`rollback: node scripts/stack.mjs deploy ${context.previous} --yes\n`);
  return false;
}

/* -------------------------------------------------------------------- cli -- */

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { yes: false, positional: [] };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--yes") options.yes = true;
    else if (rest[i] === "--bind") options.bind = rest[(i += 1)];
    else if (rest[i] === "--port") options.port = rest[(i += 1)];
    else if (rest[i].startsWith("--")) throw new Error(`unknown option ${rest[i]}`);
    else options.positional.push(rest[i]);
  }
  return { command, options };
}

const USAGE =
  "usage: stack.mjs host | snapshot [file] | compare <before.json> <after.json>\n" +
  "       stack.mjs plan|deploy <vX.Y.Z> [--bind <LAN IPv4>] [--port <port>] [--yes]\n";

try {
  const { command, options } = parse(process.argv.slice(2));
  const [first, second] = options.positional;
  if (command === "host") {
    const view = await hostView(await endpointId());
    out("IPv4 addresses on the host:");
    for (const a of view.addresses) out(`  ${a.iface.padEnd(18)} ${a.address}${isPrivateIPv4(a.address) ? "" : "  (not private)"}`);
    out(`global IPv6: ${view.globalV6.length ? view.globalV6.join(", ") : "none"}`);
    const used = [...new Set([...view.ports.keys(), ...view.published.keys()])].sort((a, b) => a - b);
    out(`TCP ports listening or published: ${used.join(", ")}`);
    const free = [];
    const from = Number(process.env.WEB_PORT) || 8080;
    for (let p = from; free.length < 5 && p < from + 200; p += 1) if (!view.ports.has(p) && !view.published.has(p)) free.push(p);
    out(`free from ${from} up: ${free.join(", ")}`);
  } else if (command === "snapshot") {
    const snap = await snapshot(await endpointId());
    printSnapshot(snap);
    if (first) {
      mkdirSync(path.dirname(path.resolve(first)), { recursive: true });
      writeFileSync(first, `${JSON.stringify(snap, null, 2)}\n`);
      out(`written to ${first}`);
    }
  } else if (command === "compare" && first && second) {
    const untouched = printComparison(compare(JSON.parse(readFileSync(first, "utf8")), JSON.parse(readFileSync(second, "utf8"))));
    if (!untouched) process.exitCode = 1;
  } else if ((command === "plan" || command === "deploy") && first) {
    const done = command === "plan" ? (await runSteps(first, options)) !== null : await deploy(first, options);
    if (!done) process.exitCode = 1;
  } else {
    err(USAGE);
    process.exitCode = 2;
  }
} catch (error) {
  err(`stack: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
