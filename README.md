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
| `index.html` | The page: one self-contained file with inline CSS, inline JavaScript and three embedded fonts. A copy of the finished design. |
| `README.md` | This file. |
| `DECISIONS.md` | Every decision about how the site is built and run, with the reason for it. Append-only. |
| `STATE.md` | What works, what is in progress, what is next, and what is live. |

The layout changes as the setup proceeds: see `STATE.md`.

## Running it locally

For now the page is a single self-contained file: open `index.html` in a browser.

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
