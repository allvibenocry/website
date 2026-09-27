# State

*Updated 2026-09-27.*

This repository is public (D14). It describes the production host only
generically; its address, its port and every other detail of the network it
runs on are in `local.env`, which is gitignored (see `local.example.env`).

## Live

**`v0.1.0` is live, and published on allvibenocry.com.** The owner published it
(rule 1, D20); the edge in front of the production host is theirs, and nothing
in this repository configures it. Deployed 2026-09-27 (23:46 UTC on
26 September). Seen from outside on 2026-09-27: `https://allvibenocry.com/`
answers `200` through the edge, with `v0.1.0`'s Content-Security-Policy.

| | |
|---|---|
| Version released | `v0.1.0`, commit `e46eb09` |
| Image | `ghcr.io/allvibenocry/website:v0.1.0` = `:sha-e46eb090ada7246791664e8a50bbe6062bcc1442`, digest `sha256:04dd874272c1da490344776e825eb6debf22fb42635d82f356a12123634a7f72`; public, pulled without credentials (D15) |
| Production host | the production Docker host, managed by Portainer (x86_64) |
| Stack | `allvibenocry-website`, running `v0.1.0`; its container healthy, 64 MiB, 64 processes, read-only root, no capabilities, uid 101 |
| On the LAN | the host's LAN address and a port, both in `local.env`; `node scripts/check-page.mjs --deployed` checks it |
| In public | `https://allvibenocry.com/`, published by the owner |
| Rollback | none needed yet; `v0.1.0` is the first version |

**A deploy is now public at once** (D20). That is why `v0.2.0` below waits for
the owner's review.

## Ready, not released: `v0.2.0`

**The two-page site**: `/under-the-hood` (D17), and the main page's links to it
(D19).

- **Its content is final at `3ac55b4`**: `site/` and `nginx/`, which are all the
  image holds. Later commits change only documentation.
- **Not tagged, not built by the release workflow, not pushed, not deployed.**
  Nothing about it is on the production host or in public.
- **Runs in the local container**: `docker compose up -d --build`, then
  http://localhost:8080/ and http://localhost:8080/under-the-hood.
- **Checked there**: check-page is clean for both pages at both widths; the main
  page's behaviour, requests and headers are `v0.1.0`'s, and so are those of a
  font, the favicon and a 404; the main page is the same, pixel by pixel,
  outside its three new links (D19); the release workflow's container test,
  run locally, passes.
- **Releasing it** is a separate brief: the tag, the release workflow, then
  `node scripts/stack.mjs deploy v0.2.0 --yes`.

## In progress

Nothing. The third brief is done, as far as it goes here:

1. The product repository: the architect's review of its first brief (D29 to
   D32 there) and `docs/roadmap.md`. **Done**, product commit `148ccc5`.
2. The fact sheet, `docs/under-the-hood-facts.md`. **Done.**
3. The page, `/under-the-hood`. **Done.**
4. The links from the main page, and the checks. **Done.**
5. This file and DECISIONS.md. **Done.**

## What works

- `site/index.html`: the finished page with its fonts moved out into
  `site/fonts/` (D2, D7), 85 kB instead of 320 kB, checked in headless Edge
  against the original (D8). Since `v0.2.0`'s content, it links to
  `/under-the-hood` from its navigation, its footer and its open source section
  (D19).
- `site/under-the-hood.html` (D17): how the product is built, in the main
  page's design system, with three inline SVG diagrams, 99 statements, each
  labelled Built, Verified on hardware or Planned, and each a row of
  `docs/under-the-hood-facts.md`, which cites its source at product commit
  `148ccc5`. Served at `/under-the-hood`; the two other spellings redirect there.
- `site/fonts/OFL.txt`: the OFL 1.1 text and each family's copyright notice.
- The container (D9 to D11, D17): `docker compose up -d --build` runs it on
  this workstation, healthy, read-only, as uid 101, with the headers and a
  Content-Security-Policy per page. The container log stays empty.
- The release workflow (D12): the `v0.1.0` tag built, tested, pushed and read
  back the image above (run 36271926458). Since `v0.2.0`'s content it also checks
  the fact sheet, and the new page's address, type, policy and redirects; that
  container test was run locally, not by a tag.
- The stack file and `scripts/stack.mjs` (D13, D16): `deploy v0.1.0 --yes`
  created the stack for real, and the host's only change was this stack and
  its container.
- The deployed site, checked from the workstation with `check-page --deployed`
  when it was deployed: clean at desktop and mobile width, and its log stayed
  empty.
- `scripts/guard.mjs` (D14): no private address, no profile path, and none of
  the owner's private strings in the tracked files; `--history` checks every
  revision. It allows the product's two Docker address pools, exactly.
- `scripts/facts.mjs` (D17): the technical page says only what its fact sheet
  does, and no page has an en or em dash. In CI on every push, and before every
  release.
- `scripts/csp.mjs` (D10, D17): one policy per page, generated; `--check` in CI
  and before every release.
- `scripts/check-page.mjs` (D8, D17, D18): every page of the site, at both
  widths, with screenshots; full pages in slices. `scripts/compare-shots.mjs`
  (D18, D19): two sets of those screenshots against each other and the noise.
- `scripts/portainer.mjs`, `scripts/local-config.mjs`.

## Known

- **The main page's navigation wraps between 821 and about 1024 px wide.** Its
  link text breaks onto two lines there; `v0.1.0` already did so between 821
  and 900 px, and the fifth link widens that band (D19). Mending it needs a CSS
  change on the main page, which the third brief ruled out.
- **The main page describes things the product repository does not have, not
  even as planned**: a key vault, opening `allvibe.local` (the product decided
  on an address and a port instead, and against `.local` names, its D18), an
  installer on a USB stick, warnings about a disk wearing out, a monthly
  check-up, and moving to a new computer in one click. It says the product is
  in development, and the technical page says only what the repository
  supports, so the two pages now disagree in places. The main page's design and
  copy are final for this version: changing them is the owner's and the
  architect's.
- **What the edge sends, seen from outside on 2026-09-27**, none of which this
  repository sets: no `Strict-Transport-Security` (D4 puts HSTS at the edge);
  `http://allvibenocry.com/` answers `522` rather than redirecting to https; and
  Network Error Logging headers (`NEL`, `Report-To`) that ask a visitor's browser
  to report failed loads to `a.nel.cloudflare.com`, another origin, which rule 5
  may want switched off.
- **D8's mobile full-page comparison saw only the top half of the page**: the
  picture repeated its top where its bottom should have been (D18). The section
  screenshots of the same comparison covered the whole page.
- One container on the production host that is not this site's was already
  restarting repeatedly before any of this work. A before-and-after comparison
  can show its restart count going up; `compare` notes that instead of failing
  (D16), and nothing here touches it.

## Next, and the owner's

- Look at `/under-the-hood` and the main page's links in the local container,
  then a brief to release and deploy `v0.2.0`.
- The edge: HSTS, plain http, and Network Error Logging (see Known).
- A licence file, or none.
- Whether to rewrite the history that still holds network details (D14,
  rule 8).

## The first setup, for the record

Items 1 to 4 of the first brief are done. Item 5, the first deploy, stopped at
its step 6 because the image package was then private and Portainer had no
credential for it; nothing on the host changed. The package is public now
(D15), no credential is needed, and the deploy was done in the second brief.
