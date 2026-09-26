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
  235 kB of a 320 kB file, so every copy edit meant scrolling past them and
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

## D7. Font files named by their content, linked relatively, and preloaded

*2026-09-26*

The five font files (one variable Bricolage Grotesque, Atkinson Hyperlegible
Next 400 and 700, Atkinson Hyperlegible Mono 400 and 600) were extracted byte for
byte from the page's data URIs. Each is named `<family>-<weight>.<hash>.woff2`,
where `<hash>` is the first eight hex digits of the file's SHA-256, and the
`@font-face` rules point at them as `url(fonts/…)`. The `<head>` preloads all
five.

**Why.**
- **A content hash in the name makes the file immutable**, so it can be cached
  for a year (D3's server sends it so): a changed font is a new name, and the
  page that names it is never cached.
- **Relative, not `/fonts/…`**, so the page works wherever it is mounted, and the
  URL is same-origin by construction.
- **Preloaded**, because a data URI was available the moment the CSS was parsed,
  and a file is not until it is requested. Preloading starts all five downloads
  while the head is still being read, which keeps the first paint as close as
  possible to the embedded version. All five faces are used on the first screen
  of the page, so none is fetched for nothing (they total 176 kB, about 60 kB
  less than their base64 did).
- **The copyright notices in `OFL.txt` were read from the fonts' own name
  tables** and checked against each family's `OFL.txt` in the Google Fonts
  repository: they agree word for word. None declares a Reserved Font Name. The
  licence text is copied verbatim from those files.

The page's only other change is its CSS comment, which said the fonts were
embedded.

## D8. "Nothing visible changed" is measured, against a noise floor

*2026-09-26*

A change that must not be visible is checked in a real browser, not by eye:
`scripts/check-page.mjs` loads the page in headless Edge (or Chrome) at desktop
(1440×900) and mobile (390×844, 2×) width, exercises every interactive part,
records what each part left on the page, lists every request by origin, every
console message and every CSP violation, and takes screenshots. The old and new
versions are then compared pixel by pixel, and **the original is also compared
with itself**, run twice.

**Why.** The page has five animations that never stop and a hero that differs
between two loads of the same file, so "the screenshots differ" means nothing
until it is known how much the original differs from itself. A comparison that
knows the noise floor can say exactly what changed. For the font extraction
(D7) the result was: behaviour identical; every section screenshot identical
outside the regions where the original also varies between runs; full-page
screenshots with reduced motion identical except for at most 1/255 in one
colour channel on 1 pixel (desktop) and 100 of 24 million pixels (mobile, dark),
which is rounding in the GPU's blending and repeats at the raster tile height.

## D9. How the container runs nginx

*2026-09-26*

- **Base image**: `nginxinc/nginx-unprivileged:1.30.5-alpine`, pinned by version
  and by index digest (D3). 1.30 is nginx's stable branch.
- **nginx is started directly** (`ENTRYPOINT ["nginx"]`), not through the
  image's `docker-entrypoint.sh`. Its scripts rewrite files under `/etc/nginx`
  at start, which a read-only filesystem refuses, and none of what they do is
  wanted here.
- **One configuration file of our own** replaces the image's `nginx.conf` and
  does not include `conf.d/`, so nothing in the base image can add a server
  block or a log line. The configuration and the site are copied in owned by
  root, so nginx's own user (uid 101) could not change them even on a writable
  filesystem.
- **At run time**: read-only root filesystem, an 8 MB tmpfs at `/tmp` for the pid
  file and nginx's temp directories (the only paths it writes), all Linux
  capabilities dropped (a non-root process on port 8080 needs none),
  `no-new-privileges`, 64 MB of memory, 64 processes, one worker. The local
  compose file uses exactly the settings of the production stack, so a local run
  tests what production runs.
- **Caching**: a font file's name carries its content hash (D7), so it is sent
  with `Cache-Control: public, max-age=31536000, immutable`. Everything else,
  the page first, with `no-cache`: the browser revalidates on every visit, the
  ETag makes that a 304 when nothing changed, and a release is seen at once.
- **gzip** for text (the page goes from 85 kB to 22 kB); woff2 is already
  compressed and is sent as it is.
- **`/favicon.ico` answers 204 No Content.** Browsers request it on their own;
  the page declares no icon, so a plain 404 was logged in the console on every
  first visit, by the original file too. 204 shows exactly what the page showed
  before (no icon) without the error.
- **Only files are served**: a directory is a 404 and there is no listing; any
  method other than GET and HEAD is a 405.
- **The health check lives in the image** (`wget --spider` on `/` every 30 s),
  so every way of running it, local or Portainer, has the same one. Healthy
  means the page is served, not only that nginx answers.

## D10. The security headers, and what the CSP allows

*2026-09-26*

Every response, errors included, carries:

- `Content-Security-Policy`, allowing only same-origin resources:
  `default-src 'none'`, then only what the page uses. `script-src` is the
  SHA-256 of the one inline script, with no `'unsafe-inline'`; `font-src 'self'`
  for the five fonts; `img-src data:` for the one image, a check mark that is an
  SVG data URI in the CSS (inline, not a request); `form-action 'self'`,
  `base-uri 'none'`, and `frame-ancestors 'none'`, which is what stops the page
  being framed. Nothing else, so no fetch, no frame, no worker and no plugin can
  load at all.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`: following one of the page's links to GitHub
  tells GitHub nothing about where the visitor came from.
- `Permissions-Policy` switching off camera, microphone, geolocation, payment,
  USB and the motion sensors. Only features Chromium recognises are named,
  because it logs an unknown one as a console error.

**Styles, and why not a hash for everything.** The `<style>` element is allowed
by its hash (`style-src-elem`). The page also has 26 `style=""` attributes, each
setting a CSS custom property such as `--i:3` or `--at:24%`; they are allowed
with `style-src-attr 'unsafe-inline'`. Hashing them would need
`'unsafe-hashes'` and 23 separate hashes that change with any copy edit, to guard
against CSS in an attribute, which cannot run code and which only markup
injection could add, while the page has no input that reaches its markup. A
`style-src 'unsafe-inline'` line is kept for browsers older than
`style-src-elem` (Safari before 15.4, Firefox before 108), which would otherwise
refuse the attributes; current browsers ignore it for styles. The script's
behaviour needed no change: it only sets styles through the CSSOM, which a CSP
does not restrict.

**The policy is generated, and checked.** `scripts/csp.mjs` hashes the inline
script and style of `site/index.html` and writes `nginx/csp.conf`; with
`--check` it fails when the two disagree, and the release workflow runs that
before building an image. It also refuses an external script, an inline event
handler or a `javascript:` URL, which the policy would block in the browser
without anything failing at build time.

**Not set:** HSTS, which belongs to the edge (D4); `X-Frame-Options`, which
`frame-ancestors` supersedes in every browser the page otherwise supports.

## D11. Nothing about a visitor is logged

*2026-09-26*

There is no access log, and nginx's error log is at `emerg`.

**Why.** Rule 5 says the web server does not log visitor IP addresses. The
access log was the obvious place, and it is off rather than reformatted: nothing
here would read it. The error log is the less obvious one: every message nginx
writes while handling a request, at any level, ends with `client: <address>`,
including a 404's "open() failed" at `error` and resource exhaustion at `crit`.
`emerg` is the level at which nginx refuses to start, which is the message worth
having; whether it is serving is answered by the health check (D9). The
container's log is therefore empty in normal operation, which was observed.

**Instead.** An access log in a format without `$remote_addr`. Rejected for now:
it would still hold the user agent and the referrer, and nobody reads it. If
traffic numbers are ever wanted, that is a decision of its own.
