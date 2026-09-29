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

## D12. The image is built in GitHub Actions, on a version tag, and tested before it is pushed

*2026-09-26*

Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`, which builds the
image, runs it the way the stack runs it, checks it, and only then pushes it to
`ghcr.io/allvibenocry/website` under two tags: **`vX.Y.Z`** and
**`sha-<full commit>`**. It then reads both tags back from the registry and checks
that they are one image, and checks that the package is still private.

**Why, following Vikt.**
- **No credential on the workstation.** The job pushes with its own
  `GITHUB_TOKEN`, scoped to `packages: write` for this repository. The
  workstation's `gh` token does not even have a packages scope, and does not
  need one.
- **The version tag is what the stack pins**, so a rollback is the previous tag
  (rule 6). The commit tag traces any image back to its source. The image tag
  keeps the `v` (Vikt's drop it) so that the git tag, the image tag and the
  stack's `IMAGE_TAG` are one string: `v0.1.0` everywhere.
- **No `latest`, ever.** Nothing may deploy it, so nothing pushes it.

**Where it differs from Vikt, and why.**
- **The image that was tested is the image that is pushed.** It is built once
  with `docker build`, run read-only with the stack's limits, asked for its
  headers, its gzip, its font caching and its favicon, and its log must be empty
  (D11); then that same image is tagged and pushed. Vikt's workflow uses
  `docker/build-push-action` and `docker/metadata-action`; this uses the Docker
  CLI, so the only third-party action in a job that can write to the registry
  production pulls from is `actions/checkout`, **pinned by commit**.
- **The CSP is checked against the page before anything is built**
  (`node scripts/csp.mjs --check`, D10).
- **The visibility check is Vikt's turned around.** Vikt proves its packages
  are anonymously pullable because its host pulls them anonymously. This package
  must stay private, so the same anonymous request must fail. The expected
  answer is one line in the workflow (`PACKAGE_VISIBILITY`), so making the
  package public later is a visible decision, not a check someone deletes.
- **amd64 only**: the production host is x86_64 (read from Docker on it), and
  that is what GitHub's runner builds.

## D13. The Portainer stack: created through the API, bound to one LAN address

*2026-09-26*

The stack `allvibenocry-website` is created and updated only by
`scripts/stack.mjs`, through the Portainer API, with the credential variables
Vikt uses (`PORTAINER_URL`, `PORTAINER_TOKEN`, and `VIKT_HOST` for read-only
checks over key-based SSH). The stack file it sends is `compose.portainer.yaml`
**as it is at the release tag**, so what runs is always a released file.

- **Plan before deploy, stop at the first failure** (rule 4). `plan` and
  `deploy` run the same steps: the tag exists; its release workflow is green
  **and built the tag's own commit**, which is the proof the image exists (the
  workstation's `gh` token cannot read packages, and needs no scope that could);
  the stack file at the tag reads its three
  variables; the address and port are right; Portainer can pull the image. Then
  `deploy --yes` creates or updates the stack, waits for the container to be
  healthy on the new image, and asks the site for its page.
- **Before and after** (rule 2). `deploy` snapshots every stack and container
  on the host through Portainer (ids, images, states, start times, restart
  counts; never a stack's variables), deploys, snapshots again, and fails if
  anything that is not this stack changed.
- **Bound to the host's LAN IPv4 address, not to all addresses.** An unaddressed
  published port is also published on IPv6, and a host with a global IPv6
  address is reachable from the internet without any router forward. This host
  has none today (checked), and the explicit IPv4 bind keeps that from mattering
  if it ever gets one. `plan` refuses an address that is not the host's own or
  not private.
- **A port checked free**: not listened on by anything on the host (read with
  `ss` over SSH, so processes outside Docker count too) and not published by any
  container.
- **LAN only until published.** Nothing forwards to that port: no router rule,
  no tunnel, no proxy host. Publishing the site is the owner's (rule 1), and when
  it happens the edge terminates TLS and sets HSTS (D4).
- **The registry credential is the owner's to add.** The other images the
  production host runs are public and pulled anonymously: Portainer has no
  registries at all. This
  package is private, so Portainer needs a credential for ghcr.io that can read
  it. `plan` checks for one and stops without it; the script never adds
  credentials. Once a ghcr.io credential exists, Portainer may present it for
  every ghcr.io pull on this host, other apps' included, so its expiry matters
  beyond this site.
- **Rollback is a deploy of the previous tag**:
  `node scripts/stack.mjs deploy v0.1.0 --yes`. The stack's `IMAGE_TAG` changes
  and nothing else does.

## D14. The repository is public, so nothing about the owner's network is in it

*2026-09-27*

The owner made this repository public. It has no licence file yet; that is the
owner's decision, separately.

Because anyone can read it, it holds **no detail of the owner's network**: no
internal IP address, host name, SSH user, Portainer address or endpoint id, and
no name of another app's stack or container on the same host. It describes the
production host only generically ("the production Docker host").

- **The host's details live in `local.env`**, gitignored, which the scripts
  read through `scripts/local-config.mjs`: `PORTAINER_URL`,
  `PORTAINER_ENDPOINT_ID`, `VIKT_HOST`, `WEB_BIND` and `WEB_PORT`. A variable
  already set in the environment wins. `local.example.env` shows placeholders
  from 192.0.2.0/24, the range reserved for documentation. Secrets are never
  read from the file: a secret-looking name in it is ignored, and said so
  (rule 3).
- **`scripts/stack.mjs` takes the address and port from it**, so a deploy
  command names neither (`node scripts/stack.mjs deploy v0.1.0 --yes`), and
  `scripts/check-page.mjs --deployed` checks the deployed site the same way.
- **`scripts/guard.mjs`** fails on any private IPv4 address and any Windows
  profile path in a file about to be committed and, on the owner's workstation,
  on any string in `.local/private-strings.txt`, a gitignored list of the
  owner's own addresses, ids and other apps' names. `--history` checks every
  revision and commit message. It reports where, never what.
- **Every push is checked** (`.github/workflows/checks.yml`): a gitleaks scan of
  the whole history, image pinned by digest and findings redacted, and the
  guard's generic half.

**What the history still holds.** Before this entry, STATE.md (commit `83a9c59`)
named the host's LAN address, the chosen port, the Portainer environment's name
and id, the host's OS and Docker versions, and another app's container;
`scripts/stack.mjs` (`45d3463` to `83a9c59`) used a private address as an
example; DECISIONS.md and the README (`45d3463` to `83a9c59`) named another app
as running on the same host; and the README (`2f06283` to `83a9c59`) gave the
path of the design file on the owner's workstation. No secret is anywhere in the
history (gitleaks, every commit). The history is not rewritten: that is the
owner's decision (rule 8).

**Why.** A public repository is read by strangers, and a private address, a host
name or the list of what else runs beside the site tells an attacker where to
look. The scripts need those values; they do not need them to be committed.

## D15. The image package is public, and pulled without credentials

*2026-09-27. Supersedes the private-package parts of D12 (the workflow asserting
"private") and D13 (the registry credential in Portainer), whose text stays as
it was written.*

The owner made `ghcr.io/allvibenocry/website` public in GitHub's package
settings. **No registry is added to Portainer**: the production host pulls the
image anonymously.

- **Checked the way the host will pull it**: an anonymous pull token, then the
  manifests of `v0.1.0` and `sha-e46eb090ada7246791664e8a50bbe6062bcc1442`, both
  `200` and both
  `sha256:04dd874272c1da490344776e825eb6debf22fb42635d82f356a12123634a7f72`,
  the digest the release workflow read back when it pushed them.
- **The release workflow asserts it** (`PACKAGE_VISIBILITY: public`), so a
  future release fails if the package is not public, before any deploy could
  find out. The step was run locally against the live registry: it passes with
  `public` and fails with the old `private`.
- **`scripts/stack.mjs` asks the same question** as its step 6, "the image can
  be pulled without credentials", and prints the digest the version resolves
  to, where it used to look for a registry credential in Portainer.

**Why.**
- **Private protected nothing.** The image holds only what the site serves
  publicly anyway (the page, the fonts, the nginx configuration) and no secret.
- **A credential in Portainer would reach beyond this site.** Portainer may
  present a ghcr.io credential for every ghcr.io pull on the host, so a token
  that expired or was revoked could break other apps' deploys.
- **The token itself was the risk.** A classic token with `read:packages` is
  broad (every package the account can read) and has to be rotated.

## D16. A container that was already restarting on its own is noted, not counted

*2026-09-27. Refines the before-and-after check of D13.*

One container on the production host that is not this site's was already
restarting repeatedly before any of this work. `compare` would have failed a
deploy of this site every time that container happened to restart during it.

`compare` now reports such a container as a **note** ("restarted on its own"),
not as a change, but only when all of this holds: it belongs to something other
than this stack; its restart count was already above zero before the run and is
higher after; nothing about it differs except its start time, its restart count
and its state; and its state is running or restarting both times. It is the
same container on the same image. Anything else about any other container,
including a first restart, a new image, a stop or a removal, is still a change,
and still fails the deploy.

**Why.** Rule 2 asks to show that nothing here changed anything else. A
container restarting on its own, as it did before, is not something this
deploy did, and it is not to be touched; hiding it would be wrong, and so would
calling it a change. In the first deploy (`v0.1.0`) it did not restart, so the
note did not appear.

## D17. The under-the-hood page: its address, its own policy, and its fact sheet

*2026-09-27*

A second page, `site/under-the-hood.html`, describes how the product is built,
for developers, system administrators, contributors and IT departments. It uses
the main page's design system: the same fonts, colour tokens and components,
the pink band with the same navigation, the night background, the same footer.

- **At a clean address, `/under-the-hood`.** nginx serves the file there with
  `try_files`, so the file keeps its extension and its type comes from
  `mime.types` like every other file's. `/under-the-hood/` and
  `/under-the-hood.html` answer `301` to `/under-the-hood`, so the page has one
  address. `absolute_redirect off` makes that redirect name only the path:
  behind the edge, the visitor reached the site at another scheme, host and
  port than nginx sees, and a redirect that named nginx's own would send them
  there.
- **A Content-Security-Policy of its own.** `scripts/csp.mjs` now derives a
  policy from each page, and nginx picks it by `$uri` with a `map` in
  `nginx/csp.conf`; `headers.conf` sends it on every response, as before. The
  main page's policy is the default, and is byte for byte what it was, so every
  other response (a font, a 404) gets exactly the policy it had. The new page
  has no `style=""` attribute, no image and no form, so its policy allows none:
  its style and script by hash, its fonts from `'self'`, `form-action 'none'`,
  and nothing else. Whatever a page uses, and only that, is what its policy
  allows.
- **Every statement traces to the product repository.** The page makes 99
  statements, each labelled Built, Verified on hardware or Planned, and each a
  row in `docs/under-the-hood-facts.md` with its source file, pinned to the
  product commit it was read at, and its decision. `scripts/facts.mjs` fails
  unless the page's words and label for every row are the sheet's, every row is
  on the page, "never" appears only where the sheet cites what enforces it, and
  no page of the site has an en or em dash. It runs on every push and before
  every release; each way it can fail was made to happen once.
- **Motion:** the release steps light up once, when they come into view, and
  nothing moves under reduced motion. Without a script, they are lit from the
  start.
- **`check-page` covers every page.** The site's root means both pages; a
  path means one. For this page it checks that the release steps are dim until
  seen and all lit after, that every diagram has a name and a description, and
  that there is no dash anywhere in the text or its alternatives.

**Why.** The main page speaks to beginners and promises; a technical reader
wants to know what is actually there, and an IT department will check. A page
that claims more than the repository supports would be worse than no page, so
the claims are tied to their sources by a check, not by care alone. A policy
per page keeps each one as strict as its own page allows, instead of letting
each page run the other's script.

**Instead.** One policy listing both pages' hashes (each page would allow the
other's script and style); the page at `/under-the-hood/` as a directory index
(two addresses for one page, or a redirect the other way); the diagrams as
images (a request each, and no text a screen reader could read).

## D18. Full-page screenshots are taken in slices; D8's mobile comparison saw half the page

*2026-09-27. Corrects the evidence of D8, whose text stays as it was written.*

`check-page --full` took each full page as one picture. The main page at
mobile width is 15 500 CSS pixels tall, 31 000 device pixels at 2x, and a
picture that tall comes back from headless Edge with its top repeated where its
bottom should be: the hero, the four steps and "Try to break it" twice, and
never the laptop, the night sections or the footer. Desktop, at 14 400 pixels,
was whole. So **D8's mobile full-page result ("100 of 24 million pixels,
mobile, dark") compared the top half of the page with itself, twice**. The
section screenshots of the same comparison did cover every section at mobile
width, and were within the noise.

Found while comparing the main page before and after its new links (D19): the
page's own boxes put the comparison table where the picture showed the four
steps.

**Now** a full page is taken in slices of 8 000 device pixels, one picture per
slice, and put together into one. The mobile main page taken that way shows
every section once, in order, and its boxes match it.

**Why it matters.** A comparison that cannot see a part of the page proves
nothing about that part, and said otherwise. The same lesson as the product's
mistake 5: a check has to be able to fail the way the real thing fails, and
here it could not.

## D19. The main page links to Under the hood, and is otherwise the same

*2026-09-27*

"Under the hood" is in the main page's navigation (after "For teams"), its
footer (before "GitHub"), and its open source section, as a second outlined
button beside "Follow on GitHub", the two in the hero's own `cta-row`.

- **Markup only.** No style and no script changed, so the page's policy
  (D10, D17) is byte for byte `v0.1.0`'s, and so are its response headers.
- **Measured against `v0.1.0` itself**, the released image run beside the new
  build, with `scripts/compare-shots.mjs` and D8's noise floor, the before
  version taken twice:
  - behaviour, requests and headers: identical, at both widths;
  - full pages with reduced motion, block by block: identical outside the
    three links, except rounding at 1 or 2/255, which the page also shows
    against itself, and, at mobile, the anti-aliasing of the waitlist button's
    two rounded ends (188 edge pixels, at most 31/255) after it moved down
    with everything below the new row of buttons;
  - section screenshots: differences only in the navigation's row and the
    footer's links on desktop, a taller footer on mobile, where its links wrap
    onto a third row, and the hero's headline, which never stops moving.
- **The navigation wraps between 821 and about 1024 px**, where `v0.1.0`'s
  already wrapped between 821 and 900. Mending that needs a CSS change on the
  main page, which the brief ruled out; it is in STATE.md under Known.

**Why these three places.** The navigation and the footer are where a visitor
looks for another page; the open source section is where a developer is,
already, reading about the code. A button beside "Follow on GitHub" says the
same kind of thing in the same way, with nothing new to style.

## D20. The site is published, by the owner; a deploy is public at once

*2026-09-27. Supersedes the "LAN only until published" parts of D5 and D13,
whose text stays as it was written.*

The owner published `v0.1.0` on allvibenocry.com (rule 1). How, and through
what, is the owner's and is not recorded here (D14). Nothing in this repository
configures the edge, the DNS or anything in front of the production host.

**What follows.** A deploy is public the moment it is healthy. So a new version
is reviewed by the owner in the local container before it is released, and
releasing and deploying are a brief of their own: `v0.2.0` is ready and waits
for that (STATE.md).

## D21. The main page's claims have sources too

*2026-09-27. After the architect's review of the Under the hood page.*

`docs/main-page-claims.md` lists every statement the main page makes about the
product, each with its source in the product repository (a file and a decision,
or a roadmap entry), pinned to the product commit it was read at, and one
status, Built or Planned. The main page may never claim more than the product
repository supports, at least as Planned (the product's D33).

- **The six promises** the product did not have (a key vault, the control panel
  at `allvibe.local`, an installer on a USB stick, disk health warnings, a
  monthly check-up, moving to a new computer) stay on the page: they are now
  the product's roadmap entries, and Planned.
- **What still has no source** is listed there, not given one: which AI agent
  and whose key; the plan with a test per step; inviting people; the team
  version; and who the project is by. So are the claims that are supported
  with a gap between the words and the repository. Changing the page for them
  is the architect's and the owner's decision.
- Unlike the Under the hood page and its fact sheet (D17), nothing checks the
  main page against this file mechanically: the main page's copy is final, and
  the list is for the people who decide it.

## D22. Phones and tablets: the four steps as cards, and what else was fixed

*2026-09-28*

Every section of both pages was looked at 360, 390, 430 and 768 px wide, before
and after, and what did not look right was fixed.

- **The four steps, at 900 px and below, are one card per step**: the step's
  text, then its own scene in a card of its own. The sticky stage above the
  steps cut its scene off at the top and the bottom on a phone, and left long
  empty stretches between the steps. The script moves each scene into its
  step, and back into the stage above 900 px; without a script, narrow screens
  keep the stage. **Each scene plays when it comes into view**, and stops when
  it leaves; with reduced motion, every scene shows its end state at once.
  **The progress rail is gone from the cards**: the cards need the width (at
  360 px the rail would leave them 254 px), and beside a card it had nothing to
  show progress along.
- **The desktop keeps the sticky stage, unchanged.** On a desktop the script
  does nothing at load, and it acts on a change of width only once the change
  has settled (150 ms). The block-by-block comparison found why that matters:
  a headless browser taking a full-page picture shrinks its window to 1 by 1
  pixel for a moment, the phone layout switched in and out, and the one scene
  moved back into the stage was drawn with greyscale instead of subpixel
  anti-aliasing. Found by taking the same picture of eleven variants of the
  page, and by recording every width the script saw.
- **The navigation**: between 821 and 1099 px the links get a row of their own,
  each on one line, instead of breaking inside a link (item 3 of the third
  brief); below 381 px the button's text no longer breaks.
- **The gates**: on a phone the station's minimum width reached back to the
  third gate, which disappeared behind it with its label. At 480 px and below
  the gates close up.
- **The problem section's notes**: on a tablet, two side by side instead of one
  narrow column with a third of the width empty.
- **The "Tried by you" stamp** sits below the browser in a card, where it no
  longer covers the address.
- **Under the hood's diagrams** were 10 to 12 px on a phone. Their words are
  larger now, with some labels shorter or on two lines, and on a phone the
  diagram's card reaches nearer the screen's edges: at least 12.4 px at 360 px,
  13.5 at 390. Below 980 px a diagram is at most 560 px wide, instead of the
  whole column.
- **Not changed:** the words on the laptop's screen in the hardware section,
  about 5 px at 360. It is a picture of a screen with a text alternative, and
  its words repeat the copy beside it.

**How it was looked at.** `scripts/gallery.mjs` cuts every section out of
check-page's full-page pictures, taken with reduced motion, so that every
scene shows its end state. Pictures of one section at a time are not used for
this: a section taller than the screen is drawn in one go, the browser counts
every card in it as in view, and the scenes restart as the picture is taken. On
a desktop the same kind of picture can catch the stage switching scenes, when
drawing it fires the page's scroll handler; the full-page pictures, which do
not, are what the comparison relies on.

`check-page --widths all` checks both pages at 1440, 390, 360, 430 and 768 px,
and on the main page's cards that every scene plays in view and none at the
top.

## D23. Under the hood shows what the main page relies on, and is read at a newer product commit

*2026-09-28*

- **A section, "Planned, and on the main page"**, lists the roadmap entries the
  main page shows as part of the product (a key vault, the control panel at
  `allvibe.local`, an installer on a USB stick, disk health warnings, a monthly
  check-up, moving to a new computer), each Planned and linked to its entry in
  the product's `docs/roadmap.md`, and the later work the product names in its
  CLAUDE.md that the main page also shows. So a reader who comes from a promise
  on the main page finds out, in one place, that it is a plan and why.
- **The fact sheet is read at product commit `6451c59`**, the one that holds
  those roadmap entries, instead of `148ccc5` (D17). Every source was checked
  again at the new commit: the only line that moved is STATE.md's "To verify on
  real hardware", three lines down. The sheet gains seven rows, N1 to N7, and
  the page 106 statements in all.
- **The main page links to the page from its hardware section too**, beside
  "Start it again", and says in its safety section that some of it is built and
  some planned (the product's D33).

## D24. Every claim on the main page has a source, and none goes further

*2026-09-28. After the architect's second review of the website.*

D21 listed five claims with no source and four that went further than theirs,
and left the decision to the architect and the owner. They decided:

- **The five get sources, as plans.** The product's roadmap gains agent
  adapters (Claude Code first, with the user's own API key; the suite never
  touches the user's AI account or pays for AI usage), a guided plan, sign-in
  and invitations, and the team version after version 1, and its README says
  who makes it (D34 there, commit `218a518`). The main page's words for them
  stay as they are.
- **The four get new words**, and one more that re-reading the sheet showed:
  - the nightly backup copies the apps' *data*, not the apps;
  - *which* backups are tested: the nightly one and the one each release takes
    (one taken by hand is not, until the next check);
  - a release *starts* the new version, checks it, and rolls back if it does not
    answer: nothing on the page may say the new version is held back before it
    starts, so step 4 and the demonstration's log say so. The gates in scene 4
    stay: their caption says each gate opens when its check passes, which is
    still true;
  - moving to a new computer needs the recovery key, and is no longer "one
    click";
  - "without ever losing your data" loses "ever": the product lists what it
    does not protect against (Under the hood, "What it does not protect
    against"), and "ever" said there was nothing.
- **`docs/main-page-claims.md` is read at `218a518`**: every claim has a source,
  none is left without one, and none says more than its source. What changed is
  at its end. It is still not checked mechanically (D21).
- **Under the hood lists the four new roadmap entries** in "Planned, and on the
  main page" (N8 to N11), and its fact sheet is read at `218a518`: the only line
  that moved is STATE.md's "To verify on real hardware", one line down.
- **A change of words is compared with the changed elements pinned.** The
  main page's text is 17 px with a line height of 1.55, so a sentence that gains
  a line moves everything under it by 26.35 px, a fraction of a device pixel;
  and its background is one gradient and grid the height of the page, so a
  taller page changes the colour of every row. Block by block (D18), everything
  under the change then differs. So check-page's `--pin` gives each changed
  element the same height in the pictures before and after (larger than it
  needs in either), and everything outside the changed elements must then be
  identical. check-page now records those elements by their place
  (`steps>4`, `signs>2`, `hero-copy>1`), since their classes change as the page
  runs. compare-shots' `--margin` leaves out what a changed element paints
  outside its own box: step 4's card has a 6 px shadow, and at 360 and 430 px,
  where the new text takes another line above the card in a pinned step, the
  card is shorter, so the shadow's lower edge moves. A row-by-row
  comparison that matched unchanged rows wherever they moved was tried first,
  and dropped: with the page-tall gradient, no row under a change is unchanged.

## D25. The edge's Network Error Logging is accepted, and rule 5 is about the site

*2026-09-28. The owner's decision, recorded when `v0.2.0` was deployed.*

The edge in front of the site is Cloudflare's (D20), and it adds two headers
to every response: `NEL` and `Report-To`. They ask the visitor's browser to
report to Cloudflare when a page load fails. On the owner's current Cloudflare
plan this cannot be turned off. **It is accepted**, because:

- reports are sent only when a load fails: the edge sends
  `"success_fraction":0.0`, so a load that works reports nothing;
- they go to Cloudflare, which already carries every request to the site;
- per Cloudflare, they contain no personal data.

**So rule 5, "no third-party requests", is about the site**: its pages, the
files they load, and the responses of this repository's server. It is not about
headers the edge adds, which nothing in this repository sets or can change
(rule 1). check-page and the Content-Security-Policy go on enforcing it for
everything the site itself does.

**The edge also, now**, as seen from outside on 2026-09-28:

- sends `Strict-Transport-Security: max-age=2592000`: one month, without
  `includeSubDomains` and without `preload`;
- answers plain `http://` with `301` to the same address on `https://`.

Neither is set here either: this repository's nginx sends no
`Strict-Transport-Security`, `NEL` or `Report-To`, checked on the local
container. They are recorded so that a change at the edge can be noticed.

**Considered instead.** Turning the headers off, which the current plan does
not allow; the plan, like everything at the edge, is the owner's.

## D26. The site's icons: the owner's drop, at the names browsers look for

*2026-09-28. The product's fourth brief, item 3.*

**What.** The owner's icon, a drop with a check mark, as five files served at
the conventional paths, taken from the owner's files unchanged:
`/favicon.ico` (16, 32 and 48 px), `/favicon.svg`, `/apple-touch-icon.png`
(180 px), `/icon-192.png` and `/icon-512.png`; and `/site.webmanifest`, a
small web manifest with the site's name and the two larger icons. Every page's
head declares them:

```html
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
```

This replaces D9's `204` for `/favicon.ico`, which was there only because the
site had no icon.

**Types.** nginx's own `mime.types` gives `.ico`, `.svg` and `.png` their
types, and has none for `.webmanifest`, which would go out as
`application/octet-stream`: its location sets `application/manifest+json`.
Like everything else, they go out with `nosniff`.

**Caching: a day.** The fonts are named by their content and cached for a
year (D7), but an icon has to keep the name browsers ask for, so a new one
cannot get a new name. The icons and the manifest are sent with `public,
max-age=86400`: a changed icon reaches a returning visitor within a day, and a
visit does not ask for them again meanwhile. The pages stay `no-cache`.

**The Content-Security-Policy** (D10, D17) follows each page, as before: a
page that declares icons gets `img-src 'self'` (some browsers hold a tab's icon to
it; the main page keeps `data:` for its check mark), and one that links the
manifest gets `manifest-src 'self'`. Nothing from another origin.

**Checked.** check-page (D8) now fetches every icon a page declares, and
every icon its manifest names, and fails unless each answers `200` with its
own type, `nosniff` and a cache time; and fails a page that declares none.
In a real Edge window, not headless, both pages' tabs showed the drop.

**Content credentials.** The four image files the owner supplied carry C2PA
content credentials: a signed statement by Anthropic that Claude provided the
file (in the SVG's metadata and in each PNG's `caBX` chunk, about 5.7 kB
each, most of the SVG's 8 kB). There is nothing private in them. They are
served as supplied; removing them would be a change to the owner's files.

## D27. The control panel's demo, at /demo

*2026-09-28. The product's fourth brief, item 4. The product records the demo
as the panel's reference design (its D51).*

**What.** The owner's clickable demo of the control panel, served at `/demo`
from `site/demo.html` (`/demo/` and `/demo.html` answer `301` to `/demo`, as
for `/under-the-hood`, D17). It is the owner's file, unchanged but for three
things the brief asked for:

- **its icon**: the site's own (D26), instead of a data-URI copy of it;
- **its fonts**: the same three families it already names, from the site's
  own files, preloaded and declared exactly as on the other pages (D2, D7),
  instead of the system fonts its review copy fell back to;
- **a plain link back to the main page** in its yellow banner, "Back to the
  main page", inside the banner's text so that it wraps with it on a narrow
  screen.

Everything it does and says is kept: its pretend data, its scripted AI, the
yellow banner and "Start over".

**Its Content-Security-Policy** is generated like every page's (D10, D17): its
one inline script and one style by hash, its fonts, icons and manifest from
this origin, nothing else. The demo builds its screens as HTML strings, and 25
of them carry `style=""` attributes of plain CSS, which a policy without
`style-src-attr 'unsafe-inline'` would block when the script inserts them. So
`scripts/csp.mjs` now counts the style attributes a page's script writes as
well as those in its markup, and the demo gets the same allowance as the main
page (D10): an attribute cannot run code. The other two pages' policies did not
change. The demo stores nothing: no cookie, no storage, its state in memory
only, gone on reload or "Start over". Its "Copy the message" button uses the
clipboard, which needs no permission to write.

**Checked** (D8). check-page exercises the demo at 1440, 768, 390, 360 and
320 px, each in light and in dark, from a fresh load, the way a person would,
from the keyboard where it matters:

- the report dialog, opened with Enter, has focus on its first question;
- a mark is made with the keyboard (Enter, the arrow keys, Shift and an arrow,
  Enter);
- Tab and Shift-Tab, pressed more times than the dialog has stops, never leave
  it;
- an empty last answer is refused, with its message, and focus on it;
- Escape closes the dialog and gives focus back to "Something is wrong";
- the project tabs move with the arrow keys, Home and End;
- after "Make a plan", focus lands on "Create the app";
- the whole way from trying the last step to "v3 is live" completes, all six
  safety checks done;
- "Start over" puts the demo back where it started;
- the banner's link is there and points to `/`;
- nothing is wider than the window, at home, in the app, with the report
  dialog open, with the new app's dialogs open, and after "v3 is live";

and, as on every page, no console error, no CSP violation, no request to
another origin, no failed request, no dash and every icon answering. **Each of
these was seen failing** before it was trusted: eleven copies of the demo, each
with one of these behaviours broken, each failed exactly that check (the copy
that sends an empty answer also failed the steps after it, whose state it had
changed), and a run no longer stops at the first missing element.

**What it claims** is in [docs/demo-claims.md](docs/demo-claims.md), read at
product commit `6a20da8`: 81 things it shows, each with its source and status.
Seven have no source in the product, or go further than it; they are listed
there for the owner, and the demo keeps its words.

**Not checked:** a screen reader reading it (the checks are of focus, roles and
names, not of speech); marking with a finger on a touch screen; and a real
phone, until the owner looks at the preview.

## D28. Read at the product's fourth brief, and the demo linked

*2026-09-28. The product's fourth brief, item 5.*

**Under the hood, read again** at product commit `6a20da8`, the product's
latest after its fourth brief. The second and third briefs' work is Built
there, built and run on the test host and not yet tried by the owner, and so
it is here: 129 statements, up from 110.

- **The coding agent** (I10 to I15): Claude Code, unmodified, in a container of
  its own on dev's network, with one way out to the model's API through a gate
  that reads nothing, your own API key as a file, its instructions (the guided
  plan, which was N9 under Planned), and its commits key-checked.
- **The machine and the home network** (I16 to I19): the firewall for every
  project container, and doctor's check that no app network has IPv6.
- **The probe from inside dev** (I9), run again: both front doors and dev's own
  now answer "refused" where they answered 403 and 200, because the firewall
  refuses a container before nginx sees it.
- **The release** has 15 steps, not 13 (R1, R15, R5): the migrations check and
  the key vault's restore were added; its diagram is redrawn with fifteen. The
  automatic rollback now stops, and says so, when the failed version's
  migration has already changed prod's data (R9).
- **Rollback knows the schema** (D7, D8), which closes the known gap the first
  version had.
- **The key vault and the key check before every commit** (K12 to K15, B14);
  N1 moves from Planned to these.
- **The installer's steps** are thirteen (L2), and the agent's image is in the
  stack (S17).
- **Planned, and shown on the main page or in the demo** (N12 to N16): two modes
  in the panel, a bug report builder, the architect, your own services, and the
  panel's design, which is the demo. N7 and N8 no longer list the agent's
  container, which is built.

**Not said on the site:** that the agent can sign in with a Claude account
(the product's D46). The owner decided that the site says "your own API key"
until they have tried that mode.

**The sheets.** `docs/under-the-hood-facts.md`, `docs/main-page-claims.md` and
`docs/demo-claims.md` are all read at `6a20da8`. On the main page, eleven claims
moved from Planned to Built (the agent with your own API key, its plan and its
steps as its own instructions, the key vault, and dev without prod's keys), and
the rows about the agent say that it has not yet talked to the model through
the suite, as no real key has been used. Two of them, "Nothing moves on until you have seen it
work" and "You try every step before it ships", rest on the agent's instructions
only: a release does not check that anyone tried. They are marked so, for the
owner.

**The demo, linked** from the main page's navigation ("Demo"), as the hero's
second button ("Try the control panel demo": the panel itself is planned, so
the button says it is a demo), and from Under the hood's navigation and its
statement about the panel's design (N16).

**The navigation between 1100 and 1199 px.** With a seventh link, a link
wrapped onto a second line inside the one-row navigation at those widths,
measured at 1100 and 1150 px. The layout that gives the links a row of their
own, used from 821 px, now reaches to 1199 px on both pages; from 1200 px the
navigation is one row, as before.

**Checked.** facts.mjs: every statement in the fact sheet, with the same words
and status. check-page: every page at each of its widths, clean (the main page
and Under the hood at five, the demo at five in light and in dark).

**The main page, against `v0.2.0`, block by block** (D8, D24). On a phone the
new button puts the hero's buttons on three rows instead of two (or one, at
430 px), and the hero, which centres its content, moves its headline up by half
of that; the page's height does not change. So the button row was pinned to one
height in both versions (`--pin "div.cta-row=168"`), `v0.2.0` taken twice for
the noise, and the navigation's links and the hero's buttons named as the
change. At 1440, 768, 430, 390 and 360 px, light and dark, all ten full pages
are within the noise: outside the change, at most 407 pixels differ, by at most
2/255, as the page does against itself. Unpinned, every section below the
hero on a phone differed by up to 4/255 across its whole area, a background
shade following the hero's content; on a desktop the sections were within the
noise either way.

## D29. The demo's claims settled, and two main page claims planned again

*2026-09-29. The product's fifth brief, item 2: the architect's review of the
fourth.*

**In the demo**, two corrections and nothing else: the gate's container is
named as the product names it, `allvibe-guestbook-agent-egress`; and the MCP
bridge's undecided details are gone: "Use the address this machine shows you",
"A one-time connection code, shown once", and the box that asks the person to
continue says "Type this there" without naming a command.

**`docs/demo-claims.md`**, read at product commit `4f22bdf`: every one of its 81
rows has a source. Four of the seven that had none are now plans in the
product's roadmap (its D53): a release only after every step is tried, a fresh
backup before every change to the live app, doctor every night, and mains and
battery. The services' reach is now in the product's roadmap too, and the two
corrections above settle the other two. The list is kept at the end of the
sheet.

**`docs/main-page-claims.md`**, read at `4f22bdf`: "Nothing moves on until you
have seen it work" and "You try every step before it ships" are Planned again,
sourced to that plan, with today's instructions to the agent noted as a
partial step. Nothing is without a source.

**Kept**: the icons' C2PA content credentials, as supplied (D26).

**Under the hood** stays read at product commit `6a20da8`: nothing it says has
changed in the product since.

## D30. The release workflow's own test, caught up with the icons and the demo

*2026-09-29. The product's fifth brief, item 3.*

**What happened.** Tag `v0.3.0` at `c27db1d` started the release workflow (run
36494595479). It stopped at "The image works before anything is pushed",
before logging in to GHCR: its test still expected `/favicon.ico` to answer
`204`, which D26 replaced with the icon itself. The fourth brief updated nginx
and check-page for the icons, and not the workflow's own test. **Nothing was
pushed**: no image, no digest. `v0.2.0` stays live.

**Fixed on `main`**: the test now checks each of the six icon paths (200, its
type, `nosniff`, a day's cache) and `/demo` (200, HTML, a policy of its own,
different from both other pages', and `/demo/` and `/demo.html` redirected
to it). Run locally as the workflow runs it, against an image of the same
site: the old test fails at the favicon, and the new one passes.

**Not done, and why.** The workflow runs its test from the tagged commit, so
`v0.3.0` at `c27db1d` can never pass. Releasing needs one of two things only
the owner can give: moving the pushed tag `v0.3.0` to the fixed commit, which
rewrites a pushed ref (rule 11), or a release authorised as `v0.3.1` at the
fixed commit, which carries the same site. The owner's "release" was for
`v0.3.0` only. So the release and the deploy wait.

## D31. The demo's app view, rebuilt to the product's D55

*2026-09-29. The product's fifth brief, item 6. The product's D55 and "The app
view" in its docs/design/control-panel.md, read at product commit `f205494`,
and the owner's mockup of the app view in both modes. Committed and pushed;
not tagged, released or deployed: a preview for the owner.*

**What.** The demo's page for one app follows the product's app view: the same
layout in simple and advanced mode, so that nothing moves when the person
switches.

- **Left, who you talk to.** In simple mode one chat, "Your AI", with the plan
  as a checklist at its top. In advanced mode two tabs: Plan, the architect,
  and Build, the builder's session with "Talk to the builder directly".
- **Right, what you look at.** Preview and Live, and in advanced mode Code: a
  file tree and the chosen file with its changes. The line for the step being
  tried, with "It works" and "Something is wrong", sits above the preview.
- **The preview** draws the test copy, as the mockup does: the guestbook,
  whose photo button and photo appear as those steps are built; the recipe
  box's list; and for a new app first the starter app, which is the product's
  guestbook template, then its own first page.
- **Live** holds the version the family uses, "Put v3 live" with the six safety
  checks as progress, and the earlier versions with "Go back".
- **More**, next to the app's name: Backups, Service keys and App settings, each
  a dialog. App settings is new: the name, who can use it (anyone on the home
  network, as today), "Publish" marked Planned, and in advanced mode the two
  addresses.
- **Up to 1080 px wide, one row of tabs**: Chat, Preview, Code in advanced mode,
  and Live. From 1081 px the two sides are the height of the window, and each
  scrolls on its own.
- **A new app opens in planning**: the idea in the chat, three proposed steps
  with "Done when", and "Looks good, start building", which starts step 1. In
  advanced mode the Build tab shows Claude Code's plan mode writing the plan to
  STATE.md. The dialogs "Making a plan" and "The plan for ..." with "Create
  the app" are gone.

**What moved.** The app's tabs: Versions into Live, Files into advanced mode's
Code, Backups and Service keys under More. The helper's Instructions tab is
"The brief for the builder", a dialog opened from the plan in advanced mode.
"Open the live app" is in Live; the test copy is the preview, with "Restart
the test copy" on its bar and, in advanced mode, its address. "How this works"
is replaced by the line under "Your AI", as in the mockup. In simple mode the
chat, the report and the new app dialogs say "your AI" where they said "the
architect".

**What was kept.** Everything else the demo has and does: home, machine health,
backups, your own services with Home Assistant's install and update, settings
with both ways to connect an AI (with your own AI app, the left side shows what
it posted and did, and the box to continue there), profiles and safe defaults,
the report dialog and its keyboard marks, the rollback dialog, the scripted
builder, the guestbook with step 2 ready and the recipe box with step 2 on its
way, the way from trying the last step to "v3 is live", the colour roles, the
words, the toasts, the yellow banner with "Start over" and the link back, and
the real mode switch with its warning and consent. The mockup's own switcher
of modes and states is not shipped.

**Three changes beyond the layout.**

- "Back to simple mode" is on the app's own line in the app view, instead of
  the strip at the top, which would move the preview down; every other screen
  keeps the strip.
- The call the AI app made to start the test copy was shown as `deploy_dev`.
  D55 says the panel never says "deploy", so it is `start_test_copy`.
- On a phone, the dark bar at the top grew when a screen was shorter than the
  window (the page's grid stretched its rows); it no longer does.

**Checked** (D8, D27). check-page's demo exercise is rewritten for the new
flows, at 1440, 768, 390, 360 and 320 px, in light and in dark, each from a
fresh load:

- the report dialog, as before: opened with Enter on "Something is wrong",
  focus on its first question; a mark made with the keyboard; Tab and
  Shift-Tab kept inside; an empty last answer refused, with its message and
  focus on it; Escape giving focus back to "Something is wrong";
- every tab list it meets, all the way round with the arrow keys, Home and End:
  in simple mode Preview and Live (on the one row, Chat, Preview and Live), in
  advanced mode the same with Code, and Plan and Build; each key must focus and
  select its tab, leave it the only one in the Tab order, and show its panel;
- More: its three items, Escape closing it, and each of its dialogs giving
  focus back to More;
- the preview's box, from the top of the page, before advanced mode, with it on
  (and again after other screens), and after turning it off: equal within
  0.5 px; on a phone under the Preview tab, with the switch in the menu,
  pressed with Enter;
- a new app: its dialog, "Make a plan", the app in planning with three proposed
  steps and focus on "Looks good, start building", the starter app in the
  preview; pressing it builds step 1, which then becomes ready;
- the way from trying the last step to "v3 is live" in Live: "Go to Live"
  pressed with Enter, focus on "Put v3 live", "Putting v3 live", all six checks
  done, the chip "v3 is live", the versions v3, v2 and v1 with "Go back", and
  the go back dialog;
- your own AI app: its dialog, then in the app "Your AI app", what it posted,
  none of the person's own messages, no box to write in, and "Continue in your
  AI app";
- "Start over": home, v2 live, two apps, simple mode, the AI in the panel; and
  the banner's link to `/`;
- no horizontal overflow in any of the states it passes through (33 on a
  desktop, 35 with the one row of tabs), measured in the page and inside the
  app view's own scrolling sides and dialogs;

and, as on every page, no console error, CSP violation, request to another
origin or failed request. All of the site, at every width: clean, 3 pages and
15 runs.

**Each check was seen failing.** Fifteen copies of the demo, each with one
behaviour broken and its own policy, served by a plain local server and checked
at 1440 and 390 px in light and in dark; an unbroken copy served the same way
was clean.

| Broken | Failed |
|---|---|
| Live's earlier versions wider than the window | overflow |
| an error logged when Live is drawn | console errors |
| the report dialog opens with focus on the picture | reportDialog |
| Enter on the picture makes no mark | keyboardMark |
| an empty last answer is sent | emptyAnswer, previewStill |
| Tab not kept inside a dialog | tabInDialog |
| the report dialog gives focus to the page | dialogClosed |
| Home does not move to the first tab | tabLists |
| Escape does not close More | more |
| the advanced mode strip shown in the app view too | previewStill |
| "Looks good, start building" starts nothing | newApp |
| putting it live never finishes | lastStepToLive |
| with your own AI app, nothing says what it posted | ownAiApp |
| "Start over" keeps the state | startOver |
| the banner's link goes to the demo | bannerLink |

The copy that sends an empty report also failed the preview check: the report
made the builder redo step 2, so the line above the preview changed while the
preview was measured.

**The claims sheet**, [docs/demo-claims.md](docs/demo-claims.md), read at
product commit `f205494`: 98 rows, up from 81. Seventeen are new, for the app
view (DX6, DW1 to DW14, DN3, DN4), each resting on D55 and "The app view"; the
rows whose things moved say where they are now. 58 are Planned, 22 Built, and
18 part of each; none is without a source.

**A gallery**, `scripts/demo-gallery.mjs`: every state of the demo, before and
after, at the five widths, in light, side by side in a local page under
`out/screenshots/`. check-page exports its browser helpers for it, and runs its
checks only when it is the script invoked.

**Not checked**: a screen reader reading it, and a real phone. **Not read**: the
product's commits after `f205494`, whose D56 to D59 build four things the sheet
still marks Planned.

## D32. Claude Code may not run the most dangerous commands in this repository

*2026-09-29. The product's sixth brief, item 1, after its mistake 41: text ran
as shell commands on the owner's workstation, and nothing was written or
deleted only by luck. The same file, and the reasons, are in the product's
repository (its D61).*

**What.** `.claude/settings.json` denies, to Claude Code's Bash and PowerShell
tools, in any mode: force-pushing and moving or deleting pushed refs (rule 11
here too: the tag `v0.3.0` stays where it is), `git reset --hard`, `git clean
-f`, every kind of Docker prune, removing Docker volumes, and recursive
deletion outside the repository (a target starting with `/`, `~`, `..`, `$`, a
quote or a drive letter; every recursive `Remove-Item` in PowerShell).

**Proved** with the pinned Claude Code on the product's test host, with this
file as the project's settings (the product's `test/host/deny-probe.mjs`):
201 of 201, every rule refusing its command and the controls running, and
without the file every command running (110 of 110).

**Limits**: the same as the product's D61. A command inside `bash -c` is not
looked into; a relative path after `cd` is not seen as outside; and the rules
apply only to a session whose project is this repository, not to one opened on
a folder above it.

## D33. The architect's review of D30 and D31: v0.3.0 stays unreleased, and the sheets catch up

*2026-09-29. The product's sixth brief, the architect's decisions, and its
item 3.*

**`v0.3.0` is a tag that was never released.** Its workflow failed its own
test before pushing anything (D30). The tag stays where it is, at `c27db1d`,
and is not moved or deleted (rule 11 here too). There is no `v0.3.1`: the next
release is `v0.4.0`, from `main`, which carries the workflow's fixed test
(`7830fce`) and the new demo (`415ea52`).

**The demo's judgement calls are accepted** (D31): the one row of tabs up to
1080 px, the "How this works" card dropped, and `start_test_copy`. **A file's
name in the Code tab no longer breaks inside a word**: it breaks after a
slash, and inside a word only when one part cannot fit on a line of its own.

**The status words are the same everywhere.** Built means built and run on the
test host, not yet tried by the owner. So what the product built at its fifth
brief is Built on Under the hood and in both claims sheets, read again at the
product's `3bfa5e8`:

- **Under the hood**: a release is 16 steps, the second that every step of the
  plan is tried by you (R16), with its diagram redrawn; going back by hand
  behind a fresh backup (D9); doctor every night (B15) and power (B16); the
  agent's activity log and its kept conversations (I20, I21), and that the log
  is a narrative, not proof (I22); the agent's instructions now say what the
  release enforces (I14); backups taken before going back are kept (B7); and
  house rule 6 says what the owner has tried.
- **The main page's claims**: "Nothing moves on until you have seen it work"
  (M10) and "You try every step before it ships" (M50) are Built.
- **The demo's claims**: "Tried by you" (DA9), the backup before going back
  (DV4), checks every night (DM1) and power (DM6) are Built. Two of the demo's
  words were brought to the product's: on mains, doctor gives the battery's
  charge, not a time (DM6); and the plan is written to `plan.json`, with a short
  version in `STATE.md` (DN4).

The product's Commercial Terms gate (its D52) changes nothing on the site. The
two history sections of the main page's sheet now name the commits they were
read at, `6a20da8` and `4f22bdf`: they used the current reading's, so the
fourth brief's named the wrong one.

## D34. Deny rules and a hook for every project, and the guard before every commit

*2026-09-29. The product's seventh brief, item 2; the whole decision, with
what was seen, is the product's D71.*

- **This repository's project settings** (`.claude/settings.json`) keep D32's
  deny rules and gain 20 more against skipping the commit hooks (`git commit
  --no-verify` or `-n`, `git push --no-verify`, `git merge --no-verify`, any
  git command naming `core.hooksPath`), the same 110 as the product's, and a
  hook, `scripts/hooks/inline-scripts.mjs` (a copy of the product's, where its
  tests are), that refuses a heredoc, a PowerShell here-string and any quoted
  text over several lines before it runs. The owner's user settings hold the
  same, so that they apply to every project on the workstation.
- **The guard before every commit, in the owner's clone**:
  `scripts/hooks/pre-commit` runs `node scripts/guard.mjs --staged` and
  `scripts/hooks/commit-msg` runs `node scripts/guard.mjs --message <file>`,
  copied into `.git/hooks/`; each decides by its exit code. The guard gained
  both modes: `--staged` reads every file as it is staged, as well as the
  working tree, and `--message` reads the commit's message.
- **Seen**: in a throwaway clone with the same hooks and the owner's list, a
  private string in a staged file, only in the staged copy, or in the message
  was refused, each with a control where the same commit was made, and an
  ordinary commit went through, 9 of 9; in the real clone, this commit was
  refused while an untracked file held a private string, and went through once
  it was gone.

**Why.** D32's rules applied only to a session opened on this repository, and
the guard's exit code was once lost in a pipe (the product's mistake 42); a
hook that git runs cannot be piped.
