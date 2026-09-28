# State

*Updated 2026-09-28.*

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

**A deploy is public at once** (D20). That is why `v0.2.0` below waits for the
owner to look at it, and to write "release".

## Ready, not released: `v0.2.0`

**Its content is final at `c38765f`**: `site/` and `nginx/`, which are all the
image holds. Later commits change only documentation. **Not tagged, not built
by the release workflow, not pushed, not deployed**: nothing of it is on the
production host or in public.

What it holds, beyond `v0.1.0`:

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

**Runs in the local container**: `docker compose up -d --build`, then
http://localhost:8080/ and http://localhost:8080/under-the-hood.

**Checked there**: check-page clean for both pages at 1440, 390, 360, 430 and
768 px, at `c38765f`. Against `7af600a`, with the changed elements pinned to
one height (D24), both pages at every width, light and dark, differ by no more
than 2/255 outside the elements whose words changed: the main page's hero line,
step 4 and three of the safety section's signs, and Under the hood's Planned
section. Every section of both pages before and after, at every phone and
tablet width, is in `out/screenshots/brief5.html`, which is not committed.

## In progress

The fifth brief, after the architect's second review of the website, came
before items 7 and 8 of the fourth. **Its items 1 to 5 are done; the fourth
brief's items 7 and 8, the release and the deploy of `v0.2.0`, wait for the
owner to write "release".**

1. The product roadmap: agent adapters, a guided plan, sign-in and
   invitations, the team version, and the README's credit (D34 there).
   **Done**, product commit `218a518`.
2. The main page's words (D24). **Done**, `9712a5e`.
3. `docs/main-page-claims.md` read at `218a518`: every claim has a source, and
   none goes further (D24). Under the hood's N8 to N11. **Done**, `c38765f`.
4. A preview for the owner's phone: a second container from the same image,
   started by hand and published on the workstation's home-network address. It
   is not in `compose.yaml`, and its address is in no file. **Running**; to be
   removed once `v0.2.0` is live.
5. The local container rebuilt, both pages checked at every width, this file.
   **Done.**

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
7. Release `v0.2.0`. **Waiting for "release".**
8. Deploy and verify `v0.2.0`. **Waiting for "release".**

## What works

- `site/index.html`: the main page, with its fonts in `site/fonts/` (D2, D7);
  since `v0.2.0`'s content, with the links, the honest line and the phone and
  tablet layout above.
- `site/under-the-hood.html` (D17, D22): in the main page's design system, with
  three inline SVG diagrams; served at `/under-the-hood`, the two other
  spellings redirected there.
- `docs/under-the-hood-facts.md` and `docs/main-page-claims.md` (D17, D21,
  D24): what each page says, and where in the product repository it comes
  from, both read at product commit `218a518`.
- `site/fonts/OFL.txt`: the OFL 1.1 text and each family's copyright notice.
- The container (D9 to D11, D17): healthy, read-only, as uid 101, with the
  headers and a Content-Security-Policy per page; its log stays empty.
- The release workflow (D12): the `v0.1.0` tag built, tested, pushed and read
  back the image above (run 36271926458). It also checks the fact sheet, and the
  new page's address, type, policy and redirects; that part was run locally,
  not by a tag.
- The stack file and `scripts/stack.mjs` (D13, D16): `deploy v0.1.0 --yes`
  created the stack for real, and the host's only change was this stack and
  its container.
- `scripts/guard.mjs` (D14), `scripts/facts.mjs` (D17), `scripts/csp.mjs` (D10,
  D17): in CI on every push, and the last two before every release.
- `scripts/check-page.mjs` (D8, D17, D18, D22, D24): every page, at every width
  with `--widths all`, with screenshots and full pages in slices, and changed
  elements pinned to one height with `--pin`; `scripts/compare-shots.mjs` (D18,
  D19, D24): two sets of pictures against each other and the noise;
  `scripts/gallery.mjs` (D22): every section, before and after, at every phone
  and tablet width.
- `scripts/portainer.mjs`, `scripts/local-config.mjs`.

## Known

- **The demonstration's gates** still show the new version stopping at the
  health check while the old one stays live; its words now say the new version
  was started and is rolled back. The illustration is kept, by decision (D24).
- **The words on the laptop's screen** in the hardware section are about 5 px
  on a 360 px phone: a picture of a screen, kept as it is (D22).
- **The edge**, seen from outside on 2026-09-27: no `Strict-Transport-Security`,
  `http://` answering `522`, and Network Error Logging headers. The owner is
  changing these; nothing in this repository sets them.
- **Pictures taken by a headless browser**: one of a whole page shrinks its
  window to 1 by 1 pixel for a moment, and one of a section taller than the
  screen counts everything in it as in view. The page now waits for a change
  of width to settle, and the gallery is cut from full-page pictures (D22).
- **D8's mobile full-page comparison saw only the top half of the page** (D18).
- One container on the production host that is not this site's was already
  restarting repeatedly before any of this work; nothing here touches it (D16).

## Next, and the owner's

- Look at http://localhost:8080/ and http://localhost:8080/under-the-hood on
  the computer, and at the phone preview (its address is in the chat, not
  here), then write "release" for items 7 and 8.
- The edge: HSTS, plain http, and Network Error Logging.
- A licence file, or none.
- Whether to rewrite the history that still holds network details (D14,
  rule 8).

## The first setup, for the record

Items 1 to 4 of the first brief are done. Item 5, the first deploy, stopped at
its step 6 because the image package was then private and Portainer had no
credential for it; nothing on the host changed. The package is public now
(D15), no credential is needed, and the deploy was done in the second brief.
