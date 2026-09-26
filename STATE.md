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

## Known

- Browsers ask for `/favicon.ico` on their own. The page declares no icon, so
  any plain static server answers 404 and the console logs it; the original
  file did the same. The container will answer it (item 3).

## In progress

The first setup, in six items:

1. Repository, README, DECISIONS, STATE. **Done.**
2. Fonts out of the HTML; the page moves to `site/`. **Done.**
3. Container: unprivileged nginx, read-only, security headers, local compose file.
4. Image on GHCR, `v0.1.0` plus the commit as a second tag, package private.
5. Portainer stack `allvibenocry-website` on the production host, LAN only.
6. This file and `DECISIONS.md` updated with what is live.

## Next

Item 3.
