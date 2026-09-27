# Under the hood: the fact sheet

Every technical statement on [site/under-the-hood.html](../site/under-the-hood.html)
(served at `/under-the-hood`), with where it comes from in the product
repository, the decision behind it, and its status. **The page says nothing that
is not in this file**, and each statement on the page carries the ID it has
here.

**Read at:** [allvibenocry/allvibenocry](https://github.com/allvibenocry/allvibenocry)
commit [`148ccc5`](https://github.com/allvibenocry/allvibenocry/tree/148ccc5a2ea02badc1dd86907f8dce27c14227eb), 2026-09-27, the commit that records the architect's
review (D29 to D32) and adds `docs/roadmap.md`. Every source link below points
into that commit, so it stays true when the product changes; the page itself
links to the current files. When the product changes, this file is read again
against a new commit, and the page follows it.

## The statuses

Each statement has exactly one:

| Status | Means | On the page |
|---|---|---|
| **Built** | Built, and tested on the local test host: a disposable Debian 13 machine in a container on a workstation, into which `install.sh` installs everything for real ([DECISIONS.md, D14](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d14-development-testing-uses-a-disposable-test-host-in-a-container) D14). Not yet tried by the owner, and not yet run on real hardware ([STATE.md L8-10](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L8-L10)). | green badge |
| **Verified on hardware** | Built, and verified on a real Debian 13 machine. **Nothing qualifies yet** ([STATE.md L78-112](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L78-L112), "To verify on real hardware"). | yellow badge |
| **Planned** | Named as later work in the product repository ([docs/roadmap.md](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md), [CLAUDE.md L31-34](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L31-L34), or a decision). Nothing of it is built. | outlined badge |

A statement about a limit ("the suite does not ...") has the status of the thing
it describes: a limit of what is built is Built.

The three definitions above are the page's legend, not statements about the
software, so they carry no status of their own.

## The opening

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| P1 | All vibe no cry is in development and not ready to install on a machine that matters. | [README.md L9-10](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/README.md#L9-L10) | | Built |
| P2 | What exists today is the operational core, as command-line tools: the host installer, projects with dev and prod, backups with restore checks, and releases with rollback. | [CLAUDE.md L31-34](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L31-L34), [STATE.md L12-37](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L12-L37) | D11 | Built |

P1 is Built in the sense that it describes the state of what is built.

## The stack

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| S1 | A host is Debian 13 on x86-64. The installer refuses anything else, and anything not run as root, before it changes anything. | [install.sh L93-116](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L93-L116) | D8, D17 | Built |
| S2 | Docker Engine and its Compose plugin come from Docker's own repository, after the installer checks Docker's signing key against its published fingerprint. | [install.sh L179-233](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L179-L233) | D9, D17 | Built |
| S3 | Everything a project runs is a Docker Compose stack, and every project has two: dev and prod. | [src/lib/project.ts L197-254](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L197-L254) | D9 | Built |
| S4 | One nginx is the reverse proxy for the whole host: the unprivileged nginx image, on the host's network, with a read-only filesystem, every capability dropped, and no access log. | [src/lib/proxy.ts L17-18](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/proxy.ts#L17-L18), [src/lib/proxy.ts L43-44](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/proxy.ts#L43-L44), [src/lib/proxy.ts L75-106](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/proxy.ts#L75-L106) | D12, D27 | Built |
| S5 | Its configuration is generated, and `nginx -t` checks it before every reload. | [src/lib/proxy.ts L108-113](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/proxy.ts#L108-L113) | D12 | Built |
| S6 | Each environment has its own PostgreSQL 18, so a project has two databases: one for dev and one for prod. | [src/lib/project.ts L30-31](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L30-L31), [src/lib/project.ts L204-215](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L204-L215) | D10, D27 | Built |
| S7 | The command-line tool, `allvibe`, is TypeScript compiled to JavaScript. It runs on Debian 13's own Node.js package (20.19.2), and uses only Node's standard library: it has no runtime dependencies, so installing it downloads nothing from npm. | [install.sh L160-176](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L160-L176), [src/cli.ts](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/cli.ts) | D11, D15, D32 | Built |
| S8 | It runs as a service user of its own, `allvibe`, which owns everything the suite creates. | [install.sh L293-311](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L293-L311) | D15 | Built |
| S9 | Backups are encrypted with age, from Debian's `age` package. | [install.sh L160-176](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L160-L176), [src/lib/backup.ts L171-175](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L171-L175) | D13 | Built |
| S10 | Docker is told to hand out addresses from 172.20.0.0/14 (or 10.201.0.0/16 if that overlaps a network the machine is on), to keep small rotating logs, and to keep containers running while Docker itself restarts. | [install.sh L237-289](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L237-L289) | D16 | Built |
| S11 | Every image the suite pulls is pinned by digest: PostgreSQL 18.6, Node.js 24.21.0 for the starter app, and nginx 1.30.5 for the proxy. A project's own images are built on the host. | [src/lib/project.ts L30-31](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L30-L31), [src/lib/proxy.ts L17-18](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/proxy.ts#L17-L18) | D27 | Built |
| S12 | A systemd timer runs the daily backup at 03:30, plus up to 30 random minutes, and catches up after the machine was off. The installer enables and starts it. | [install.sh L376-423](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L376-L423) | D24 | Built |
| S13 | A new project starts as a guestbook: Node.js 24 with `node:http`, one dependency (the `pg` driver), its migrations applied at start, and a `/healthz` that asks the database. | [templates/guestbook/server.js L1-12](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/templates/guestbook/server.js#L1-L12), [templates/guestbook/server.js L49-74](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/templates/guestbook/server.js#L49-L74) | D19 | Built |
| S14 | Projects are reached at the host's address and a port: prod on 8100 plus two per project, dev on the port after it, up to 49 projects. No DNS, router or hosts file is changed. | [src/lib/config.ts L20-23](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/config.ts#L20-L23), [src/lib/project.ts L137-144](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L137-L144) | D18, D30 | Built |
| S15 | Reaching a project from another machine on the home network has not been verified: the test host's ports are on the workstation's loopback only. | [STATE.md L78-112](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L78-L112) | D18 | Built |
| S16 | A control panel in the browser, which will show links instead of ports, is planned. | [CLAUDE.md L22-34](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L22-L34) | D30 | Planned |

The host diagram draws S1 to S14 and nothing else.

## Dev and prod, kept apart

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| I1 | Dev and prod share no network, no volume and no secret. | [src/lib/project.ts L197-254](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L197-L254) | D9 | Built |
| I2 | Each environment's database is on an internal network of its own, which Docker gives no route out. Its app is on that network and on an edge network of its own. | [src/lib/project.ts L5-12](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L5-L12), [src/lib/project.ts L246-249](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L246-L249) | D9 | Built |
| I3 | Each environment's data is its own named volume. | [src/lib/project.ts L250](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L250) | D9 | Built |
| I4 | Each environment's database password is generated on the host (32 random bytes), kept in a file, and mounted only into that environment's containers as a Compose secret. It is never printed, and never an environment variable. | [src/lib/project.ts L186-193](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L186-L193), [src/lib/project.ts L204-251](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L204-L251) | D21 | Built |
| I5 | Apps publish their port on the host's loopback only. The proxy, on the host's network, is the only way in. | [src/lib/project.ts L229-230](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L229-L230), [src/lib/proxy.ts L82](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/proxy.ts#L82) | D18 | Built |
| I6 | The proxy listens on IPv4 only, so a global IPv6 address on the machine cannot put a project on the internet. | [src/lib/project.ts L335-336](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L335-L336) | D18 | Built |
| I7 | Prod's front door refuses every address range Docker hands out on the host, read from Docker when the door is written. So no container, dev or otherwise, reaches prod even the way a browser on the home network does. | [src/lib/project.ts L314-349](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L314-L349) | D18 | Built |
| I8 | That refusal has been checked on the test host's Docker, not yet on a real one, where the default bridge usually has a different subnet. | [STATE.md L78-112](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L78-L112) | D18 | Built |
| I9 | Probed from inside dev's app container on the test host: prod's containers do not resolve by name; prod's database and app time out by address; prod's app on the host's loopback refuses; prod's front door answers 403, by the host's address and by the LAN address; dev's own front door answers 200; and dev's database password differs from prod's. | [test/host/rule1-isolation.sh](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/test/host/rule1-isolation.sh), [reports/2026-09-27-brief-01.md L285-296](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/reports/2026-09-27-brief-01.md#L285-L296) | D18 | Built |
| I10 | The AI agent's container, which will work in dev, is planned. Today dev is edited by hand. | [CLAUDE.md L31-34](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L31-L34) | D28 | Planned |

## The release pipeline

`allvibe release <project>`, in [src/commands/release.ts L150-236](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L150-L236); the steps
as a user sees them are in [docs/walkthrough.md L307-351](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/walkthrough.md#L307-L351) (steps 12 and 13).

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| R1 | A release runs 13 steps, in order, and stops at the first that fails. The failure names the step and what would have to be true, and nothing after it runs. | [src/commands/release.ts L150-236](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L150-L236), [src/lib/steps.ts L1-5](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/steps.ts#L1-L5), [src/lib/steps.ts L60-100](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/steps.ts#L60-L100) | D25 | Built |
| R2 | Step 1: dev runs the commit being released, with nothing uncommitted, and answers its smoke check. | [src/commands/release.ts L151-170](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L151-L170) | D25 | Built |
| R3 | Step 2: the recovery key has been confirmed. | [src/commands/release.ts L171-183](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L171-L183) | D13, D25 | Built |
| R4 | Steps 3 to 5: the backup target is off this machine and writable; prod's database is running; an encrypted backup of prod is written to the target. | [src/commands/backup.ts L34-70](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L34-L70) | D22, D23 | Built |
| R5 | Steps 6 to 9: a restore check of that very backup. It is whole and decrypts, it restores into a scratch copy, and the app's own health check passes against the copy. | [src/commands/backup.ts L72-87](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L72-L87) | D23 | Built |
| R6 | Step 10: prod's new image is built from the commit through `git archive`, never from the working tree. | [src/lib/project.ts L286-310](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L286-L310), [src/commands/release.ts L199-209](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L199-L209) | D25 | Built |
| R7 | Steps 11 and 12: prod is deployed on the new version and answers its smoke check. | [src/commands/release.ts L62-92](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L62-L92), [src/commands/release.ts L210-221](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L210-L221) | D25 | Built |
| R8 | Step 13: the commit is tagged with the version, and the release is recorded with its commit, its backup and the version it replaced. | [src/commands/release.ts L222-235](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L222-L235) | D25 | Built |
| R9 | If step 11 or 12 fails, prod goes back to the version it ran before, automatically, keeping its data, and the release is recorded as failed. | [src/commands/release.ts L257-272](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L257-L272) | D25, D26 | Built |
| R10 | A crash loop counts as a failure at once, and the failure shows the line in which the app said what went wrong. | [src/commands/release.ts L62-81](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L62-L81) | D25 | Built |
| R11 | Version numbers are never reused, even after a rollback. | [src/lib/project.ts L129-133](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L129-L133) | D25 | Built |
| R12 | `--dry-run` runs every check and changes nothing. | [src/commands/release.ts L184-221](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L184-L221), [src/commands/release.ts L238-253](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L238-L253) | D25 | Built |
| R13 | Every run of every operation is recorded, with its steps and, on failure, the reason. | [src/lib/steps.ts L60-130](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/steps.ts#L60-L130) | D24 | Built |
| R14 | Tried on the test host: a change released with prod's entries intact; a release whose migration failed in prod, rolled back automatically with every entry; and a release stopped at the backup step with the backup disk gone, with nothing built, tagged or deployed. | [DECISIONS.md, D26](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d26-rollback-keeps-prods-data-and-restoring-data-is-a-separate-confirmed-choice), [docs/walkthrough.md L307-410](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/walkthrough.md#L307-L410) | D26 | Built |

The pipeline diagram draws R1 to R9 and nothing else.

## Backups

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| B1 | A backup goes only to a directory the suite can prove is off the machine, and it checks again before every backup, because a disk that was there yesterday may be unplugged today. | [src/lib/backup.ts L85-116](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L85-L116), [src/commands/backup.ts L34-43](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L34-L43) | D22 | Built |
| B2 | Off the machine means, as the kernel sees it: not on the root filesystem (which is also where an unplugged disk leaves its empty mount point); not on the filesystem that holds Docker's data; not on the same physical disk as either, found through partitions, LVM and LUKS; a real disk, or a network share (NFS, SMB and the like); and writable by the service user, proven by writing a file as it. | [src/lib/devices.ts L97-118](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/devices.ts#L97-L118), [src/lib/backup.ts L89-116](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L89-L116) | D22 | Built |
| B3 | Real disks have not been tried yet: on the test host, one mount point is declared a separate disk, and everything else still refuses. | [DECISIONS.md, D22](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d22-a-backup-target-must-be-provably-off-the-machine), [STATE.md L78-112](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L78-L112) | D14, D22 | Built |
| B4 | Every backup is encrypted to two keys: a host key, which stays on the machine and is what the daily restore check decrypts with, and a recovery key, whose private half the owner keeps off the machine. | [src/lib/keys.ts L1-13](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L1-L13), [src/lib/backup.ts L164-175](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L164-L175) | D13, D29 | Built |
| B5 | A backup is `pg_dump` in its custom format, run inside prod's own database container so client and server always match, and streamed straight into `age`. Nothing unencrypted is written to the target. | [src/lib/backup.ts L158-176](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L158-L176) | D23 | Built |
| B6 | It is written under a temporary name, flushed to disk, and only then renamed. A small manifest is written last: time, release, prod's entry count, checksum, both public keys and the database image. A backup without a manifest is incomplete. | [src/lib/backup.ts L125-149](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L125-L149), [src/lib/backup.ts L176-194](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L176-L194) | D23 | Built |
| B7 | Backups taken for a release are kept, and never pruned. Others go after 30 days, but never the newest three, and only files the suite named itself. | [src/lib/backup.ts L221-240](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L221-L240) | D23 | Built |
| B8 | A restore check verifies the checksum, and decrypts the whole file with the host key into a private temporary file, so a damaged backup fails before anything is restored. | [src/lib/backup.ts L280-290](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L280-L290) | D23 | Built |
| B9 | It restores into a scratch PostgreSQL of the same image, on a scratch internal network, and stops at the first error. | [src/lib/backup.ts L301-317](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L301-L317) | D23 | Built |
| B10 | It starts the version of the app the backup was taken from against the copy, and asks the app's own health check, which reads the data. It reports the entry count beside the count prod had when the backup was taken. | [src/lib/backup.ts L354-386](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L354-L386) | D23 | Built |
| B11 | It removes its containers, its network and the decrypted file, whatever happened. Nothing it creates shares a name, a network or a volume with prod. | [src/lib/backup.ts L256-278](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L256-L278), [src/commands/backup.ts L147-164](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L147-L164) | D23 | Built |
| B12 | Every day, for every project: a backup of prod, then a restore check of that very backup. One project's failure does not leave the others without theirs. A failure makes the service fail and shows up in `allvibe doctor`. | [src/commands/scheduled.ts L1-66](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/scheduled.ts#L1-L66), [src/commands/doctor.ts L202-216](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/doctor.ts#L202-L216) | D24 | Built |
| B13 | The daily run has so far only been started by hand; one that happens on its own at night has not been seen yet. | [STATE.md L78-112](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/STATE.md#L78-L112) | D24 | Built |

The backup diagram draws B4 to B11 and nothing else.

## Rollback and data

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| D1 | `allvibe rollback` goes back to the version prod ran when the current one was released, and changes only the code. Prod's data stays as it is, so nothing written since the release is lost. | [src/lib/project.ts L115-127](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L115-L127), [src/commands/release.ts L101-131](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L101-L131), [src/commands/release.ts L278-301](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L278-L301) | D26 | Built |
| D2 | Why: the usual reason to roll back is that the new code is wrong, and what people wrote since the release is real. | [DECISIONS.md, D26](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d26-rollback-keeps-prods-data-and-restoring-data-is-a-separate-confirmed-choice) | D26 | Built |
| D3 | Each migration runs in a transaction, so a migration that fails leaves the schema as it was. That is why the automatic rollback after a failed release kept every entry. | [templates/guestbook/server.js L49-74](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/templates/guestbook/server.js#L49-L74) | D26 | Built |
| D4 | If the older version cannot run on today's data, its smoke check fails, the rollback stops, and it names the other way: `--restore-data`. | [src/commands/release.ts L113-129](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L113-L129) | D26 | Built |
| D5 | `--restore-data` on its own changes nothing. It says what would be lost: the time the data goes back to, and how many entries prod has now against the backup. | [src/commands/release.ts L303-322](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L303-L322) | D26 | Built |
| D6 | With `--confirm-data-loss` as well, it first takes a backup of prod as it is, then empties prod's database and restores the backup taken just before the current version was released, then deploys the older version and checks it. Even a confirmed mistake can be undone from that first backup. | [src/commands/release.ts L324-348](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L324-L348), [src/lib/backup.ts L340-352](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L340-L352) | D26 | Built |
| D7 | A known gap: rolling back past a release whose migration succeeded runs the old code on a newer schema, and if the old code still answers its health check, the rollback counts as done. | [src/commands/release.ts L101-131](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L101-L131) | D31 | Built |
| D8 | Planned to close it: releases record their schema version; rollback explains, and offers `--restore-data`, when the database is newer than the version it goes back to; and the project template gets a rule that, within one release, migrations only add, never drop or rename. | [docs/roadmap.md L77-90](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L77-L90) | D31 | Planned |

## Secrets and keys

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| K1 | The tools read secrets by name, from the environment or from files with restricted permissions, and never prompt for a password. | [CLAUDE.md L48-51](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L48-L51), [src/commands/backup.ts L202-230](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L202-L230) | D13, D21 | Built |
| K2 | A project's database passwords are files, generated on the host, mounted only where they are needed (I4). | [src/lib/project.ts L186-193](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L186-L193) | D21 | Built |
| K3 | The host key is made at install with `age-keygen`, stays on the machine, and only the service user can read it. | [src/lib/keys.ts L11-37](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L11-L37), [install.sh L425-436](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L425-L436) | D13 | Built |
| K4 | The recovery key is made at install too. Its private half is written once, to a file only the service user can read, and is never printed. | [src/lib/keys.ts L39-45](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L39-L45), [src/lib/keys.ts L1-13](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L1-L13) | D13 | Built |
| K5 | The owner copies it off the machine and hands it back with `allvibe recovery-key confirm`, on standard input: the command refuses a terminal rather than ask. If it matches, the copy on the machine is deleted, and the owner's is the only one. | [src/commands/backup.ts L202-250](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L202-L250), [src/lib/keys.ts L64-76](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L64-L76) | D13 | Built |
| K6 | Until it is confirmed, every release is refused, and `allvibe doctor` reports it. Every 180 days, doctor asks to see it again. | [src/commands/release.ts L171-183](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L171-L183), [src/lib/keys.ts L19-20](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L19-L20), [src/commands/doctor.ts L202-216](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/doctor.ts#L202-L216) | D13 | Built |
| K7 | Restoring on a new machine needs the recovery key and nothing else. | [DECISIONS.md, D13](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d13-backups-are-encrypted-and-the-key-cannot-be-lost-unnoticed) | D13 | Built |
| K8 | The project's own repository is scanned for secrets on every push, over its whole history, and checked for details of anyone's infrastructure. | [.github/workflows/checks.yml](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/.github/workflows/checks.yml) | D6, D7 | Built |
| K9 | Planned: a key check before every push, for the apps people build. | [CLAUDE.md L31-34](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L31-L34) | D6 | Planned |
| K10 | Planned: once there is a web UI, the recovery key as a download and a printable recovery sheet. | [docs/roadmap.md L50-62](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L50-L62) | D29 | Planned |
| K11 | Planned: when a recovery key is lost, a new one for future backups, with a clear warning that older backups open only with the old key. | [docs/roadmap.md L64-75](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L64-L75) | D29 | Planned |

## Off-site backups

All of it is in [docs/roadmap.md L11-48](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L11-L48), and all of it is Planned.

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| O1 | Today a backup leaves the machine but usually not the house. That protects against the computer dying, not against a fire, a theft or water. | [docs/roadmap.md L15-19](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L15-L19) | D22 | Built |
| O2 | A backup target becomes a type, not a path: a local disk as today, an rclone remote, or S3-compatible storage. The backup format already works for any of them. | [docs/roadmap.md L23-26](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L23-L26) | | Planned |
| O3 | Several targets at once. A release still needs only the local backup; the off-site copy is sent in the background and raises an alert when it falls behind, so an internet outage never blocks a release. | [docs/roadmap.md L27-30](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L27-L30) | | Planned |
| O4 | Simplest first: two disks, rotated between home and somewhere else, with a reminder; cloud storage you already have, through rclone; S3-compatible object storage; and later, perhaps, a friend's machine. | [docs/roadmap.md L31-38](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L31-L38) | | Planned |
| O5 | Off-site credentials that can write but not delete, so a compromised machine or a misbehaving agent cannot destroy the off-site copies. | [docs/roadmap.md L39-40](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L39-L40) | | Planned |
| O6 | An occasional restore check of an off-site copy, downloaded and tested the same way as the local one. | [docs/roadmap.md L41-42](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L41-L42) | | Planned |
| O7 | The storage provider only ever sees encrypted files, because backups are encrypted on the machine before anything leaves it. | [docs/roadmap.md L43-45](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L43-L45), [src/lib/backup.ts L171-175](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L171-L175) | D13 | Planned |
| O8 | Keep the recovery key outside the house as well. After a fire, an off-site backup is useless if the only copy of the recovery key burned with the laptop. | [docs/roadmap.md L46-48](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L46-L48) | D29 | Planned |

The page names no storage provider; the roadmap does.

## What it does not protect against

| ID | The page says | Source | Decision | Status |
|---|---|---|---|---|
| L1 | A bug that passes the health check. A release checks that the new version starts and answers `/healthz`, which says the app is up and can read its database. A bug anywhere else is released. | [templates/guestbook/server.js L1-12](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/templates/guestbook/server.js#L1-L12), [src/lib/project.ts L366-378](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L366-L378) | D19, D25 | Built |
| L2 | A stolen computer. Prod's data is in a Docker volume on the computer's own disk, and the suite does not encrypt that disk: none of the installer's eleven steps does. Backups are encrypted, but the host key that opens them is on the same computer, so whoever takes the computer and its backup disk has both. | [install.sh L93-457](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L93-L457), [src/lib/project.ts L250](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L250), [src/lib/keys.ts L1-13](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L1-L13) | D13 | Built |
| L3 | A fire, a flood or a theft that takes the backup disk with the computer. Backups leave the machine, not the house, until off-site backups exist. | [docs/roadmap.md L15-19](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L15-L19) | D22 | Built |
| L4 | An app's own weaknesses. The suite does not add sign-in to an app or check the one it has, and the starter guestbook has none. Today nothing is published to the internet; publishing is planned, and an app published with weak sign-in will be as open as its sign-in. | [templates/guestbook/server.js L1-12](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/templates/guestbook/server.js#L1-L12), [CLAUDE.md L31-34](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L31-L34), [DECISIONS.md, D28](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d28-what-the-first-brief-deliberately-leaves-simple) | D18, D28 | Built |
| L5 | What was written since the last backup. The scheduled backup runs once a day, and a release takes one first; a disk that dies in between takes with it what was written since. | [install.sh L376-423](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/install.sh#L376-L423), [src/commands/release.ts L184-198](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/release.ts#L184-L198) | D24, D25 | Built |
| L6 | A restore check proves the app can read the restored copy, and compares the entry count. It does not compare every row. | [src/lib/backup.ts L354-386](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L354-L386) | D23 | Built |
| L7 | Two operations at the same time. Nothing locks one against another yet, so the nightly backup and a release started in the same minute would both run; nothing would be lost, but the work would be done twice. | [DECISIONS.md, D28](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/DECISIONS.md#d28-what-the-first-brief-deliberately-leaves-simple) | D28 | Built |

## The house rules

Rules 1 to 9 are quoted verbatim from [CLAUDE.md L42-63](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L42-L63). Each one's status
on the page is the status of what keeps it:

| ID | Rule | Kept by | Decision | Status |
|---|---|---|---|---|
| H1 | 1. The agent never reaches prod. | I1 to I9 | D9, D18 | Built |
| H2 | 2. No release without a fresh backup, restore-tested. | R4, R5, B1, B2 | D22, D23, D25 | Built |
| H3 | 3. The control panel is never exposed directly to the internet. | There is no panel yet; the rule is recorded ([CLAUDE.md L46-47](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L46-L47)) | D12 | Planned |
| H4 | 4. Secrets never appear on a command line, in output, in logs, in the repo or in a chat. | I4, K1 to K5 | D13, D21 | Built |
| H5 | 5. Everything a beginner needs to do must eventually be doable in a browser. | The web UI, S16 | D11 | Planned |
| H6 | 6. Every numbered item is tried by a human before it counts as done. | How the work is done, not a mechanism. It is why nothing is called done on the page. | | Built |
| H7 | 7. Stop at the first failure. | R1, [src/lib/steps.ts L60-100](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/steps.ts#L60-L100) | D17, D25 | Built |
| H8 | 8. Rollback never loses data silently. | D1, D5, D6 | D26 | Built |
| H9 | 9. Nothing is ever named "nocry". | [src/lib/project.ts L73-85](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L73-L85), [scripts/guard.mjs](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/scripts/guard.mjs) | D2 | Built |
| H10 | Rules 10 and 11 are about how the repository itself is kept: no details of anyone's infrastructure in it, and no rewriting of its history. | [CLAUDE.md L64-72](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/CLAUDE.md#L64-L72) | D7 | Built |

H6 is marked Built because the working rule exists and is applied: the page
calls nothing done, and says that nothing has been tried by the owner.

## Where the page says "never"

Only where something enforces it, and the enforcement is cited:

| Statement | Enforced by |
|---|---|
| I4: the password is never printed, and never an environment variable | [src/lib/project.ts L186-193](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L186-L193) writes it to a file and returns nothing; the compose file passes `*_PASSWORD_FILE`, never the value ([src/lib/project.ts L204-228](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L204-L228)) |
| R6: never from the working tree | [src/lib/project.ts L286-310](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L286-L310): the build's only input is `git archive` of the commit |
| R11: version numbers are never reused | [src/lib/project.ts L129-133](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L129-L133): the next version is the highest ever plus one |
| B7: release backups are never pruned, never the newest three | [src/lib/backup.ts L221-240](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/backup.ts#L221-L240): release backups are filtered out, and the newest three are sliced off |
| K1: never prompt for a password | [src/commands/backup.ts L224-230](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/commands/backup.ts#L224-L230): a terminal on standard input is refused |
| K4: the recovery key is never printed | [src/lib/keys.ts L32-45](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/keys.ts#L32-L45): `age-keygen -o` writes it to a file; nothing reads it for output |
| O3: an internet outage never blocks a release | Planned, and marked so; it is the plan's own requirement ([docs/roadmap.md L27-30](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L27-L30)) |
| D8: migrations never drop or rename within one release | Planned, and marked so ([docs/roadmap.md L77-90](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/docs/roadmap.md#L77-L90)) |
| House rules 1, 3, 4, 8 and 9 | Quoted verbatim; each rule's status is in the table above |

## Where the outline and the repository disagree

The outline in the brief asked for these; the product repository at
`148ccc5` does not support them as written, so the page does not say them:

1. **"One Postgres per project."** The repository has one per *environment*,
   so two per project (D10: "one database per environment";
   [src/lib/project.ts L204-215](https://github.com/allvibenocry/allvibenocry/blob/148ccc5a2ea02badc1dd86907f8dce27c14227eb/src/lib/project.ts#L204-L215)). The page says so (S6).
2. **"The key vault ... as Planned."** No key vault appears anywhere in the
   product repository. The key check before push does (K9). The page mentions
   only the key check. The main page shows a key vault; this page does not.
3. **"A stolen computer (disk encryption is the operating system's job, though
   backups are encrypted)."** The repository does not say whose job disk
   encryption is, and "backups are encrypted" is true but incomplete: the host
   key that decrypts them is on the same computer (D13). The page says what the
   suite does and does not do (L2).
4. **"An app the user publishes with weak sign-in."** Nothing can be published
   yet (D18, D28). The page describes publishing as planned, and the gap as the
   app's own sign-in (L4).
5. **Isolation "from the agent".** There is no agent container yet (CLAUDE.md,
   D28): what is isolated today is dev's containers from prod's, and that is
   what was probed (I9). The page says the agent is planned (I10).
