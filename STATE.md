# State

*Updated 2026-09-27.*

This repository is public (D14). It describes the production host only
generically; its address, its port and every other detail of the network it
runs on are in `local.env`, which is gitignored (see `local.example.env`).

## Live

**Nothing is deployed yet.** The site is not published.

| | |
|---|---|
| Version released | `v0.1.0`, commit `e46eb09` |
| Image | `ghcr.io/allvibenocry/website:v0.1.0` = `:sha-e46eb090ada7246791664e8a50bbe6062bcc1442`, digest `sha256:04dd874272c1da490344776e825eb6debf22fb42635d82f356a12123634a7f72`; public, pulled without credentials (D15) |
| Production host | the production Docker host, managed by Portainer (x86_64) |
| Stack | `allvibenocry-website`: not created |

## In progress

The second website brief:

1. Public repository hygiene: secrets and details of the owner's network.
   **Done.** No secrets in any tracked file or in the history;
   the network details are out of the tracked files and in `local.env`.
2. The public image package, and the release workflow asserting it. **Done.**
   An anonymous pull of both tags resolves to the digest above; the workflow
   now fails a release if the package is not public; `stack.mjs` checks the
   same way.
3. The deploy of `v0.1.0` to the production host, LAN only.
4. This file and DECISIONS.md.

## What works

- `site/index.html`: the finished page with its fonts moved out into
  `site/fonts/` (D2, D7). 85 kB instead of 320 kB. Checked in headless Edge at
  desktop and mobile width against the original (D8): same behaviour, same
  pixels outside the regions where the original differs from itself, no other
  origin contacted, all five font faces loaded.
- `site/fonts/OFL.txt`: the OFL 1.1 text and each family's copyright notice.
- The container (D9–D11): `docker compose up -d --build` runs it on this
  workstation, healthy, read-only, as uid 101, with the headers and the CSP.
  Under that CSP headless Edge reports no console error, no CSP violation, no
  failed request and no request to another origin, at desktop and mobile width.
  The container log stays empty.
- The release workflow (D12): the `v0.1.0` tag built, tested, pushed and read
  back the image above (run 36271926458).
- The stack file and `scripts/stack.mjs` (D13): the stack file was run locally
  from a locally tagged image, healthy, with its limits; `plan` runs against the
  real host, read-only; `snapshot` and `compare` list every stack and container
  on the host before and after, and never print a stack's variables.
- `scripts/guard.mjs` (D14): no private address, no profile path, and none of
  the owner's private strings in the tracked files; `--history` checks every
  revision.
- `scripts/csp.mjs`, `scripts/check-page.mjs` (`--deployed` reads the address
  from `local.env`), `scripts/portainer.mjs`, `scripts/local-config.mjs`.

## Known

- One container on the production host that is not this site's was already
  restarting repeatedly before any of this work. A before-and-after comparison
  can show its restart count going up; nothing here touches it.

## The first setup, for the record

Items 1 to 4 of the first brief are done. Item 5, the first deploy, stopped at
its step 6 because the image package was then private and Portainer had no
credential for it; nothing on the host changed. The package is public now
(D15), and no credential is needed.
