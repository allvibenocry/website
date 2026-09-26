# Decisions

How the site is built and run, and why. **Append-only**: a decision that changes
gets a new entry that names the one it replaces, so the reasoning that was true
at the time stays readable.

Each entry says what was decided, why, and what was considered instead.

---

## D1. A separate repository for the website

*2026-09-26*

The website lives in `allvibenocry/website`, not in the product repository
`allvibenocry/allvibenocry`.

**Why.** The site and the product have different lifecycles and will have
different visibility. The site is released when its copy changes, not when the
product does, and it will be public on allvibenocry.com while the product
repository may stay private for a while, or the other way round. Keeping them
apart means neither decision drags the other along: no product history leaks
through the site's repository, and a site fix never needs a product release.

**Instead.** A `website/` folder in the product repository. Rejected because its
visibility and its release tags would be the product's.

## D2. Fonts served as separate self-hosted files, not embedded in the HTML

*2026-09-26*

The three font families (Bricolage Grotesque, Atkinson Hyperlegible Next and
Atkinson Hyperlegible Mono, all under the SIL Open Font License 1.1) are served
as `.woff2` files from the site's own origin, next to the page. The OFL text and
the copyright notices of each family ship with them in `site/fonts/OFL.txt`.

**Why.**
- **The page stays small and editable.** Embedded as base64 the fonts were about
  250 kB of a 320 kB file, so every copy edit meant scrolling past them and
  every visit re-downloaded them.
- **Fonts are cached.** A separate file can carry a long, immutable cache
  lifetime while the page itself is revalidated on every visit.
- **Still no third-party requests** (rule 5): the files come from the same
  origin as the page, never from a font CDN.
- **The licence requires it.** The OFL allows redistribution of the fonts
  provided the copyright notice and the licence travel with them; a data URI
  inside a page carried neither.

**Instead.** Keeping the data URIs (the page works offline as a single file, but
see above), or a font CDN (a third-party request, which rule 5 forbids).

## D3. A static site served by an unprivileged nginx, pinned, non-root, read-only

*2026-09-26*

The site is static files served by the official unprivileged nginx image, pinned
to an exact version, running as a non-root user with a read-only root
filesystem. Only the directories nginx must write to are writable, as tmpfs.

**Why.** There is nothing to run but a file server, so the smallest thing that
serves files well is the right one, and nginx does gzip, caching headers and
security headers in configuration rather than in code. Unprivileged and
read-only means a compromise of the web server cannot rewrite the site or the
server, and cannot persist anything across a restart. An exact pin means a
rebuild of the same commit produces the same server, and an upgrade is a
reviewed change rather than something a moving tag did.

**Instead.** Node or Caddy (more moving parts for the same result), or the
root-running `nginx` image (binds port 80 as root for no benefit here).

## D4. Security headers in the container, CSP same-origin only; HSTS at the edge

*2026-09-26*

The container sets the security headers itself, including a
Content-Security-Policy that allows only same-origin resources. HSTS is **not**
set by the container.

**Why.** Headers set where the files are served travel with the image, so the
site is protected the same way on the LAN, behind any proxy, and in a local run
where it can be tested. A same-origin-only policy is the enforcement of rule 5:
even a mistake in the page cannot make the browser talk to anyone else.

HSTS is left to the edge because it is a promise about HTTPS on the public
hostname. The container serves plain HTTP on the LAN; sending HSTS from it would
be meaningless there and, if it ever reached a browser over HTTPS by accident
through a proxy on another name, hard to take back. The edge that terminates TLS
for allvibenocry.com sets it when the site is published.

## D5. Deployed the same way as Vikt, LAN only until published

*2026-09-26*

The site is built into an image on GHCR (`ghcr.io/allvibenocry/website`) and run
as a Portainer stack on the production Docker host, deployed through the
Portainer API with the same approach and the same credential variable names as
Vikt (`PORTAINER_URL`, `PORTAINER_TOKEN`, `VIKT_HOST` for key-based SSH). Until
the owner publishes it, it is reachable on the LAN only.

**Why.** One way of deploying for everything on that host means one runbook to
know, one token to manage, and scripts that have already been through real
releases. A pulled image rather than a stack built from git keeps compilation off
the host and makes a rollback the previous tag rather than a checkout.

## D6. Line endings are LF on every checkout

*2026-09-26*

`.gitattributes` sets `* text=auto eol=lf`.

**Why.** The Content-Security-Policy will carry SHA-256 hashes of the page's
inline script and style (D4), and a hash covers exact bytes. The workstation has
`core.autocrlf=true`, so without this a Windows checkout would hold CRLF while
the image built in CI holds LF, and a policy computed from one would block the
page served from the other.
