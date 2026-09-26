# State

*Updated 2026-09-26.*

## Live

Nothing yet. The site is not deployed anywhere and not published.

## What works

- The private repository `allvibenocry/website`.
- `site/index.html`: the finished page with its fonts moved out into
  `site/fonts/` (D2, D7). 85 kB instead of 320 kB. Checked in headless Edge at
  desktop and mobile width against the original (D8): same behaviour, same
  pixels outside the regions where the original differs from itself, no other
  origin contacted, all five font faces loaded.
- `site/fonts/OFL.txt`: the OFL 1.1 text and each family's copyright notice.
- `scripts/check-page.mjs`: the browser check.
- The container (D9–D11): `docker compose up -d --build` runs it on this
  workstation, healthy, read-only, as uid 101, with the headers and the CSP.
  Under that CSP headless Edge reports no console error, no CSP violation, no
  failed request and no request to another origin, at desktop and mobile width;
  behaviour and pixels match the original as in D8. The container log stays
  empty.
- `scripts/csp.mjs`: the policy, generated from the page and checkable.
- The release workflow, the production stack file and the deploy scripts
  (D12, D13). The stack file was run locally from a locally tagged image:
  healthy, with its limits; without its variables it refuses to start.

## In progress

The first setup, in six items:

1. Repository, README, DECISIONS, STATE. **Done.**
2. Fonts out of the HTML; the page moves to `site/`. **Done.**
3. Container: unprivileged nginx, read-only, security headers, local compose file. **Done.**
4. Image on GHCR, `v0.1.0` plus the commit as a second tag, package private.
5. Portainer stack `allvibenocry-website` on the production host, LAN only.
6. This file and `DECISIONS.md` updated with what is live.

## Next

Item 4.
