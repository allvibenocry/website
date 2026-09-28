# State

*Updated 2026-09-28: the product's fourth brief, items 3 to 6 done; waiting for the owner.*

This repository is public (D14). It describes the production host only
generically; its address, its port and every other detail of the network it
runs on are in `local.env`, which is gitignored (see `local.example.env`).

## Live

**`v0.2.0` is live, and public on allvibenocry.com.** Deployed 2026-09-28 at
01:26 UTC, over `v0.1.0`; the owner published the site (rule 1, D20), and the
edge in front of the production host is theirs. Seen from outside on
2026-09-28: `https://allvibenocry.com/` and `https://allvibenocry.com/under-the-hood`
answer `200` through the edge, each with `v0.2.0`'s own Content-Security-Policy;
`/under-the-hood/` and `/under-the-hood.html` answer `301` to `/under-the-hood`;
plain `http://` answers `301` to `https://`.

| | |
|---|---|
| Version released | `v0.2.0`, commit `54e3a5e` (its `site/` and `nginx/` are `c38765f`'s) |
| Image | `ghcr.io/allvibenocry/website:v0.2.0` = `:sha-54e3a5eb53bab83187b300dac26816f098f53bd3`, digest `sha256:8041b7b4695eb756498dd93e1cfd7804355bd7e2e7dc0b664616b74339aedb36`; built, tested and pushed by release run 36365874752; public, pulled without credentials (D15) |
| Production host | the production Docker host, managed by Portainer (x86_64) |
| Stack | `allvibenocry-website`, running `v0.2.0`; its container healthy, 64 MiB, 64 processes, read-only root, no capabilities, uid 101 |
| On the LAN | the host's LAN address and a port, both in `local.env`; `node scripts/check-page.mjs --deployed` checks it |
| In public | `https://allvibenocry.com/` and `/under-the-hood`, published by the owner |
| Rollback | `node scripts/stack.mjs deploy v0.1.0 --yes`; `v0.1.0` is still on GHCR, digest `sha256:04dd874272c1da490344776e825eb6debf22fb42635d82f356a12123634a7f72` |

**Checked after the deploy**: the deploy's snapshots of the host before and
after show this stack's container replaced, `v0.1.0` to `v0.2.0`, and
everything else the same: the same stacks and containers, ids, images, start
times and restart counts. `check-page --deployed --widths all` is clean for both
pages at 1440, 390, 360, 430 and 768 px, with every behaviour as in the local
container. The public pages are the new ones: their policies are `v0.2.0`'s,
and the edge did not serve them from its cache.

**A deploy is public at once** (D20), so a new version is looked at by the
owner in the local container first.

**What `v0.2.0` added**, beyond `v0.1.0`:

- **`/under-the-hood`** (D17, D23, D24): how the product is built, for a
  technical reader, 110 statements each labelled Built, Verified on hardware or
  Planned, every one a row of its fact sheet, read at product commit `218a518`;
  and a section listing the roadmap entries the main page relies on, the agent
  adapters, the guided plan, sign-in and the team version among them.
- **The main page** (D19, D21, D22, D24): links to it from the navigation, the
  footer, the open source section and the hardware section; "Some of this is
  built and some is planned. Under the hood shows which." in the safety
  section; `allvibe.local:8100` in "You try it"; the navigation on one line per
  link at every width; and words that claim no more than the product
  repository supports: backups copy the apps' data, the nightly backup and the
  release's are the ones tested, a release starts the new version and rolls
  back if it does not answer, moving needs the recovery key, and "without
  losing your data" without "ever".
- **Phones and tablets** (D22): the four steps as one card per step, each scene
  playing when it comes into view; the gates, the notes and the stamp fixed;
  Under the hood's diagrams readable at 360 px.

**Checked before the release**, in the local container: check-page clean for
both pages at every width, at `c38765f`. Against `7af600a`, with the changed
elements pinned to one height (D24), both pages at every width, light and dark,
differ by no more than 2/255 outside the elements whose words changed. Every
section of both pages before and after, at every phone and tablet width, is in
`out/screenshots/brief5.html`, which is not committed.

## In progress

**The product's fourth brief**, its website items (the product's items 1 and 2
are in its own repository). Waiting for the owner at the stop after item 6: to
look at the site on a computer and a phone, and to do the sign-in test in the
product's walkthrough, step 23. Nothing is tagged, released or deployed before
the owner writes "release" (rule 16).

3. Favicons (D26): the owner's drop at the conventional paths, a web manifest,
   a day's cache, and an icon check in check-page. **Done**, `4ae41f9`.
4. The control panel's demo at `/demo` (D27), with its checks at 1440, 768,
   390, 360 and 320 px in light and dark, and `docs/demo-claims.md`. **Done**,
   `54b25dd`.
5. Under the hood and both claims sheets read at product commit `6a20da8`, the
   demo linked from the navigation and the hero, and the main page compared
   with `v0.2.0` (D28). **Done**, `cb6ff9e`.
6. The local container rebuilt, the policies regenerated, check-page clean for
   every page at every width (3 pages, 15 runs); **the phone preview is
   running**: a second container from the same image, started by hand on the
   workstation's home-network address, port 8090, and in no file (the address
   is given in chat only). It is removed once `v0.3.0` is live. This file and
   DECISIONS.md. **Done** with this commit.
7. Release `v0.3.0`. Waiting for "release".
8. Deploy and verify `v0.3.0`, then remove the phone preview. Waiting for
   "release".

**Before that**, the website's own fourth and fifth briefs, both done:

The fifth brief, after the architect's second review of the website, came
before items 7 and 8 of the fourth:

1. The product roadmap: agent adapters, a guided plan, sign-in and
   invitations, the team version, and the README's credit (D34 there).
   **Done**, product commit `218a518`.
2. The main page's words (D24). **Done**, `9712a5e`.
3. `docs/main-page-claims.md` read at `218a518`: every claim has a source, and
   none goes further (D24). Under the hood's N8 to N11. **Done**, `c38765f`.
4. A preview for the owner's phone: a second container from the same image,
   started by hand and published on the workstation's home-network address,
   never in `compose.yaml` or any file. **Done, and removed** once `v0.2.0` was
   live.
5. The local container rebuilt, both pages checked at every width. **Done.**

The fourth brief (the second website brief of the same day, and the product's
roadmap):

1. The product roadmap: the main page's six promises and two more from the
   review, each Planned with its reason (D33 there). **Done**, product commits
   `a88f273` and `6451c59`.
2. `docs/main-page-claims.md`: every claim of the main page with its source and
   status, and the ones without (D21). **Done**; since the fifth brief, none is
   without (D24).
3. The main page's fixes: the address, the honest line, the hardware link, the
   navigation. **Done.**
4. Phones and tablets (D22). **Done.**
5. Under the hood's Planned section. **Done.**
6. The local preview, this file and DECISIONS.md. **Done.**
7. Release `v0.2.0`. **Done**: tag `v0.2.0` at `54e3a5e`, release run
   36365874752, the image pulled without credentials.
8. Deploy and verify `v0.2.0`. **Done**, and the edge recorded (D25).

## What works

- `site/index.html`: the main page, with its fonts in `site/fonts/` (D2, D7);
  since `v0.2.0`'s content, with the links, the honest line and the phone and
  tablet layout above.
- `site/under-the-hood.html` (D17, D22, D28): in the main page's design system,
  with three inline SVG diagrams, the release's now in fifteen steps; served
  at `/under-the-hood`, the two other spellings redirected there.
- `site/demo.html` (D27): the owner's demo of the control panel, served at
  `/demo`, with the site's fonts and icons and a link back in its banner;
  linked from both pages' navigation and the main page's hero.
- The icons (D26): `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`,
  `icon-192.png`, `icon-512.png` and `site.webmanifest`, a day's cache.
- `docs/under-the-hood-facts.md`, `docs/main-page-claims.md` and
  `docs/demo-claims.md` (D17, D21, D24, D27, D28): what each page says, and
  where in the product repository it comes from, all read at product commit
  `6a20da8`.
- `site/fonts/OFL.txt`: the OFL 1.1 text and each family's copyright notice.
- The container (D9 to D11, D17): healthy, read-only, as uid 101, with the
  headers and a Content-Security-Policy per page; its log stays empty.
- The release workflow (D12): the `v0.1.0` tag built, tested, pushed and read
  back its image (run 36271926458), and the `v0.2.0` tag the image above (run
  36365874752), with the fact sheet, the policies, and Under the hood's
  address, type, policy and redirects checked by a tag for the first time.
- The stack file and `scripts/stack.mjs` (D13, D16): `deploy v0.1.0 --yes`
  created the stack for real, and `deploy v0.2.0 --yes` updated it; each time
  the host's only change was this stack and its container.
- `scripts/guard.mjs` (D14), `scripts/facts.mjs` (D17), `scripts/csp.mjs` (D10,
  D17): in CI on every push, and the last two before every release.
- `scripts/check-page.mjs` (D8, D17, D18, D22, D24, D26, D27): every page, at
  each of its widths with `--widths all`, its icons and its overflow; the
  demo's keyboard, focus and flow checks, in light and dark; with screenshots and full pages in slices, and changed
  elements pinned to one height with `--pin`; `scripts/compare-shots.mjs` (D18,
  D19, D24): two sets of pictures against each other and the noise;
  `scripts/gallery.mjs` (D22): every section, before and after, at every phone
  and tablet width.
- `scripts/portainer.mjs`, `scripts/local-config.mjs`.

## Known

- **The demo shows seven things the product does not have or say** (D27,
  `docs/demo-claims.md`): "Tried by you" as a safety check, a backup before
  going back, checks every night, power and battery, the gate's container
  name, who can reach your own services, and the MCP bridge's command, port
  and pairing code. It keeps the owner's words; each needs a decision in the
  product or a change to the demo.
- **Two main page claims rest on the agent's instructions only** (D28): "Nothing
  moves on until you have seen it work" and "You try every step before it
  ships". A release does not check that anyone tried.
- **The icon files carry C2PA content credentials** (D26), served as supplied.
- **The site still says "your own API key"**: the product's agent can now sign
  in with a Claude account too (its D46), and the site says so only after the
  owner has tried it.

- **The demonstration's gates** still show the new version stopping at the
  health check while the old one stays live; its words now say the new version
  was started and is rolled back. The illustration is kept, by decision (D24).
- **The words on the laptop's screen** in the hardware section are about 5 px
  on a 360 px phone: a picture of a screen, kept as it is (D22).
- **The edge**, seen from outside on 2026-09-28: `Strict-Transport-Security:
  max-age=2592000` (one month, without `includeSubDomains` or `preload`),
  `http://` answering `301` to `https://`, and Network Error Logging headers
  (`NEL`, `Report-To`), which cannot be turned off on the current plan and are
  accepted (D25). All three are the edge's; this repository's server sends none
  of them.
- **Pictures taken by a headless browser**: one of a whole page shrinks its
  window to 1 by 1 pixel for a moment, and one of a section taller than the
  screen counts everything in it as in view. The page now waits for a change
  of width to settle, and the gallery is cut from full-page pictures (D22).
- **D8's mobile full-page comparison saw only the top half of the page** (D18).
- One container on the production host that is not this site's was already
  restarting repeatedly before any of this work; nothing here touches it (D16).

## Next, and the owner's

- A licence file, or none.
- Whether to rewrite the history that still holds network details (D14,
  rule 8).

## The first setup, for the record

Items 1 to 4 of the first brief are done. Item 5, the first deploy, stopped at
its step 6 because the image package was then private and Portainer had no
credential for it; nothing on the host changed. The package is public now
(D15), no credential is needed, and the deploy was done in the second brief.
