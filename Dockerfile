# The site: static files, served by nginx as a non-root user (D3).
#
# Pinned by version **and** by digest: the version says what it is, the digest
# makes it true. A tag can be moved; a rebuild of the same commit must produce
# the same server, and an nginx upgrade is a change to this line, reviewed like
# any other. 1.30 is nginx's stable branch.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5

# The whole configuration, owned by root and so read-only to nginx's own user
# even before the filesystem is (D9). conf.d/ is not included by it.
COPY nginx/nginx.conf nginx/headers.conf nginx/csp.conf /etc/nginx/

# Everything served, and nothing else: .dockerignore admits only site/ and nginx/.
COPY site/ /srv/site/

# nginx, started directly. The image's entrypoint runs scripts that rewrite
# files under /etc/nginx at start (an IPv6 listen line, templates, worker
# tuning); none of it is wanted here, and on a read-only root filesystem it
# would fail. `docker run <image> -t` tests the configuration.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]

# uid 101 is the image's own unprivileged `nginx` user; restated so it is
# visible here. Port 8080, because a non-root process cannot bind below 1024.
USER 101:101
EXPOSE 8080

# Healthy means the page itself is served, not only that nginx answers.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
