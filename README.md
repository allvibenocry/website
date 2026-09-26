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
| `compose.portainer.yaml` | The production stack: the image at `IMAGE_TAG`, bound to `WEB_BIND:WEB_PORT`. |
| `.github/workflows/release.yml` | On a version tag: builds, tests and pushes the image to GHCR. |
| `scripts/stack.mjs` | Plans and deploys the Portainer stack, and snapshots the host before and after. |
| `scripts/portainer.mjs` | The one way the scripts talk to Portainer: token by name, never a prompt. |
| `scripts/local-config.mjs`, `local.example.env` | The production host's details, read from the gitignored `local.env` ([D14](DECISIONS.md#d14-the-repository-is-public-so-nothing-about-the-owners-network-is-in-it)). |
| `scripts/guard.mjs` | Fails on anything about the owner's network in a tracked file; `--history` checks every revision. |
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

## Releasing a new version

A version is a git tag `vX.Y.Z`. The tag builds the image, and the Portainer
stack runs exactly that tag
([D5](DECISIONS.md#d5-deployed-the-same-way-as-vikt-lan-only-until-published),
[D12](DECISIONS.md#d12-the-image-is-built-in-github-actions-on-a-version-tag-and-tested-before-it-is-pushed),
[D13](DECISIONS.md#d13-the-portainer-stack-created-through-the-api-bound-to-one-lan-address)).

1. **Change, check, commit, push.** After any change to `site/index.html`:

   ```sh
   node scripts/csp.mjs                              # the policy follows the page
   docker compose up -d --build                      # look at it on http://localhost:8080/
   node scripts/check-page.mjs http://localhost:8080/   # must end "clean"
   git commit -am "…" && git push
   ```

2. **Tag.** The next version, never reusing one:

   ```sh
   git tag v0.1.1 && git push origin v0.1.1
   gh run watch --repo allvibenocry/website          # the release workflow for the tag
   ```

   The workflow checks the CSP against the page, builds the image, runs and
   checks it, pushes `ghcr.io/allvibenocry/website:v0.1.1` and `:sha-<commit>`,
   reads both back, and checks that the package is public. Nothing is
   pushed if any check fails.

3. **Deploy.** `plan` changes nothing; `deploy --yes` deploys:

   ```sh
   node scripts/stack.mjs plan v0.1.1
   node scripts/stack.mjs deploy v0.1.1 --yes
   ```

   The deploy lists the host's stacks and containers before and after, and fails
   if anything other than this stack changed. It ends by printing the rollback
   command. Afterwards, check the live site the way a browser sees it:

   ```sh
   node scripts/check-page.mjs --deployed    # the address and port in local.env
   ```

4. **Record** what is live in `STATE.md`.

## Rolling back

Deploy the previous tag. Nothing else changes:

```sh
node scripts/stack.mjs deploy v0.1.0 --yes
```

Every version ever released is still on GHCR under its tag, so any of them can
be deployed this way. `git tag --list 'v*'` lists them.

## What deploying needs

This repository is public, so nothing about the network it is deployed on is
in it ([D14](DECISIONS.md#d14-the-repository-is-public-so-nothing-about-the-owners-network-is-in-it)).
The host's details go in **`local.env`**, which is gitignored: copy
`local.example.env` to `local.env` and fill it in. A variable already set in
the environment wins over the file.

| Setting | Where | What |
|---|---|---|
| `PORTAINER_URL` | `local.env` or environment | Where Portainer answers. |
| `PORTAINER_TOKEN` | **environment only** | A Portainer access token (My account, Access tokens). `node scripts/portainer.mjs check` proves it works. A secret: never in a file, never on a command line (rule 3). |
| `VIKT_HOST` | `local.env` or environment | `user@host` of the Docker host, with a key-based SSH login. Used only to read which addresses and ports are in use; every SSH call has `BatchMode=yes`, so a missing key fails instead of prompting. |
| `PORTAINER_ENDPOINT_ID` | `local.env` or environment | Only if Portainer ever has more than one environment. |
| `WEB_BIND`, `WEB_PORT` | `local.env` or environment | The host's LAN IPv4 address and the port the site is published on. `node scripts/stack.mjs host` lists the host's addresses and free ports. The first deploy reads them; later deploys keep the stack's. |

And `gh`, logged in, to read the release workflow's result.

`node scripts/guard.mjs` checks, before every commit, that none of this has
found its way into a tracked file.

### The image is public

`ghcr.io/allvibenocry/website` is a public package, and Portainer pulls it
anonymously, with no registry credential
([D15](DECISIONS.md#d15-the-image-package-is-public-and-pulled-without-credentials)).
The image holds only what the site serves publicly anyway, and no secret.
`plan` checks the version can be pulled without credentials and prints its
digest; the release workflow fails if the package is not public.

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
   (outside this repository, on the owner's workstation). This
   repository works on a copy.
8. **Reports keep what was run and observed apart from what was only built.**
