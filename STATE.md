# State

*Updated 2026-09-26.*

## Live

**Nothing is deployed.** The first deploy stopped before it changed anything
(see "Blocked" below). The site is not published.

| | |
|---|---|
| Version released | `v0.1.0`, commit `e46eb09` |
| Image | `ghcr.io/allvibenocry/website:v0.1.0` = `:sha-e46eb090ada7246791664e8a50bbe6062bcc1442`, digest `sha256:04dd874272c1da490344776e825eb6debf22fb42635d82f356a12123634a7f72`, package private |
| Production host | the Portainer environment `local` (id 2): Debian 11, Docker 29.5.2, x86_64, LAN address `192.168.1.20` |
| Stack | `allvibenocry-website`: **not created** |
| Address it will have | `http://192.168.1.20:8091/`, bound to that IPv4 address only; port checked free on 2026-09-26 |

## Blocked

**Portainer has no credential for ghcr.io, and the image is private.** Vikt's
images are public and pulled anonymously, so Portainer has no registries at all.
`node scripts/stack.mjs plan v0.1.0 --bind 192.168.1.20 --port 8091` passes its
first five steps and stops at step 6, "Portainer can pull the private image".
Adding the credential is the owner's (README, "The registry credential"). Then:

```sh
node scripts/stack.mjs deploy v0.1.0 --bind 192.168.1.20 --port 8091 --yes
node scripts/check-page.mjs http://192.168.1.20:8091/
```

## What works

- The private repository `allvibenocry/website`.
- `site/index.html`: the finished page with its fonts moved out into
  `site/fonts/` (D2, D7). 85 kB instead of 320 kB. Checked in headless Edge at
  desktop and mobile width against the original (D8): same behaviour, same
  pixels outside the regions where the original differs from itself, no other
  origin contacted, all five font faces loaded.
- `site/fonts/OFL.txt`: the OFL 1.1 text and each family's copyright notice.
- The container (D9–D11): `docker compose up -d --build` runs it on this
  workstation, healthy, read-only, as uid 101, with the headers and the CSP.
  Under that CSP headless Edge reports no console error, no CSP violation, no
  failed request and no request to another origin, at desktop and mobile width;
  behaviour and pixels match the original as in D8. The container log stays
  empty.
- The release workflow (D12): the `v0.1.0` tag built, tested, pushed and read
  back the image above (run 36271926458), and an anonymous pull is refused.
- The stack file and `scripts/stack.mjs` (D13): the stack file was run locally
  from a locally tagged image, healthy, with its limits; `plan` runs against the
  real host, read-only; `snapshot` and `compare` showed the host's 9 stacks and
  28 containers unchanged across the attempt.
- `scripts/csp.mjs`, `scripts/check-page.mjs`, `scripts/portainer.mjs`.

## Known

- `security-dashboard-securitydashboard-1` on the production host had restarted
  38 times since 2026-09-24 when it was first listed. It is not this site's and
  was not touched; it is noted because a restart of it would show up in a
  before-and-after comparison as a change nobody here made.

## The first setup

1. Repository, README, DECISIONS, STATE. **Done.**
2. Fonts out of the HTML; the page moves to `site/`. **Done.**
3. Container: unprivileged nginx, read-only, security headers, local compose file. **Done.**
4. Image on GHCR, `v0.1.0` plus the commit as a second tag, package private. **Done.**
5. Portainer stack `allvibenocry-website` on the production host, LAN only.
   **Stopped** at the registry credential; nothing on the host was changed.
6. This file and `DECISIONS.md`. **Done for everything up to the stop**; the
   "Live" table is filled in when item 5 completes.

## Next

The owner adds the ghcr.io credential in Portainer; then item 5's deploy and
browser check, and this file's "Live" table.
