# State

*Updated 2026-09-26.*

## Live

Nothing yet. The site is not deployed anywhere and not published.

## What works

- The private repository `allvibenocry/website` exists, with a copy of the
  finished page as `index.html` (byte-identical to the original design file,
  SHA-256 `f86bd3e7…608addf2`).

## In progress

The first setup, in six items:

1. Repository, README, DECISIONS, STATE. **Done with this commit.**
2. Fonts out of the HTML into self-hosted files, with the OFL text; the page
   moves to `site/`.
3. Container: unprivileged nginx, read-only, security headers, local compose file.
4. Image on GHCR, `v0.1.0` plus the commit as a second tag, package private.
5. Portainer stack `allvibenocry-website` on the production host, LAN only.
6. This file and `DECISIONS.md` updated with what is live.

## Next

Item 2.
