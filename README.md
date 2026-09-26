# allvibenocry.com

The website for **All vibe no cry**: one static page that explains the product.

All vibe no cry is a self-hosted suite, in development, that lets total beginners
build and run their own apps with AI on an old computer at home without losing
data. The product lives in its own repository,
[allvibenocry/allvibenocry](https://github.com/allvibenocry/allvibenocry). This
repository holds only the website, so the two can have separate lifecycles and
separate visibility ([D1](DECISIONS.md#d1-a-separate-repository-for-the-website)).

The site is not published yet. Publishing it on allvibenocry.com (Cloudflare,
DNS, tunnel) is done by hand, by the owner, and nothing in this repository does it.

## What is here

| Path | What it is |
|---|---|
| `site/` | Everything the web server serves, and nothing else. |
| `site/index.html` | The page, with inline CSS and inline JavaScript. |
| `site/fonts/` | The three font families as `.woff2` files named by their content hash, and `OFL.txt` with their copyright notices and licence ([D2](DECISIONS.md#d2-fonts-served-as-separate-self-hosted-files-not-embedded-in-the-html), [D7](DECISIONS.md#d7-font-files-named-by-their-content-linked-relatively-and-preloaded)). |
| `Dockerfile`, `.dockerignore` | The image: the pinned unprivileged nginx with `site/` and `nginx/` copied in, nothing else ([D9](DECISIONS.md#d9-how-the-container-runs-nginx)). |
| `nginx/` | The whole nginx configuration: `nginx.conf`, the security headers in `headers.conf`, and `csp.conf`, which is generated ([D10](DECISIONS.md#d10-the-security-headers-and-what-the-csp-allows), [D11](DECISIONS.md#d11-nothing-about-a-visitor-is-logged)). |
| `compose.yaml` | Runs the image locally, with the production stack's hardening. |
| `scripts/csp.mjs` | Writes `nginx/csp.conf` from the page's inline script and style; `--check` fails when they disagree. |
| `scripts/check-page.mjs` | Loads the page in headless Edge or Chrome and reports every request by origin, console error, CSP violation and behaviour; takes screenshots ([D8](DECISIONS.md#d8-nothing-visible-changed-is-measured-against-a-noise-floor)). |
| `DECISIONS.md` | Every decision about how the site is built and run, with the reason for it. Append-only. |
| `STATE.md` | What works, what is in progress, what is next, and what is live. |

## Running it locally

The way production runs it, with its headers, its Content-Security-Policy and
its read-only filesystem (needs Docker):

```sh
docker compose up -d --build      # then open http://localhost:8080/
docker compose ps                 # "healthy" after a few seconds
docker compose down
```

`WEB_PORT=8081 docker compose up -d --build` if 8080 is taken.

**After changing `site/index.html`**, regenerate the policy, or the browser will
refuse the page's own script or style:

```sh
node scripts/csp.mjs              # rewrites nginx/csp.conf; commit it with the page
```

To check the page the way a visitor's browser sees it (needs Node 22 and Edge or
Chrome; set `BROWSER` to use another Chromium). It exits 1 on any console error,
CSP violation, failed request or request to another origin:

```sh
node scripts/check-page.mjs http://localhost:8080/                    # report only
node scripts/check-page.mjs http://localhost:8080/ --shots out/shots  # and screenshots
```

Without Docker, any static file server on `site/` shows the page, though
without the headers (browsers refuse fonts from `file://`, so opening the file
directly does not work):

```sh
python -m http.server 8000 --directory site
```

## Releasing and rolling back

Not built yet. The plan
([D5](DECISIONS.md#d5-deployed-the-same-way-as-vikt-lan-only-until-published)):
a version tag `vX.Y.Z` builds an image on GHCR, a Portainer stack runs that exact
tag, and a rollback is deploying the previous tag again.

## How this repository is worked on

**Roles.** The owner, Fredrik, relays between two assistants: an architect and
reviewer that owns *what* and *why*, and an implementer that owns *how* (code,
tests, verification). Decisions of either kind are recorded in `DECISIONS.md`.

**The design and the copy are final for this version.** No visible design, text
or behaviour changes; only technical changes described in a brief are made.

**Rules.**

1. **Publishing is the owner's.** No Cloudflare, DNS, tunnel or router changes of
   any kind are made from here.
2. **On the production host, only this website's stack and containers** are
   created or changed. Nothing else is stopped, restarted, updated or removed, and
   there is never a global prune. The host's stacks and containers are listed
   before and after every change, to show that nothing else changed.
3. **Secrets are read by name** from the environment or from the tools' own
   credential stores. They are never printed, never written to the repository and
   never passed on a command line, and nothing prompts for a password. SSH, where
   needed, is key-based with `BatchMode=yes`.
4. **Stop at the first failure.** Name the step and what would have to be true,
   and take no further steps.
5. **The site makes no third-party requests, sets no cookies and has no
   analytics.** The web server does not log visitor IP addresses.
6. **Every image deployed to production has a fixed version tag**, so a rollback
   is redeploying the previous tag. `latest` is never deployed.
7. **The original design file stays where it is**
   (`C:\Dev\AllVibeNoCry\index.html` on the owner's workstation). This
   repository works on a copy.
8. **Reports keep what was run and observed apart from what was only built.**
