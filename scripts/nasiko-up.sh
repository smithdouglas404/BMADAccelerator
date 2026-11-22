#!/usr/bin/env bash
# Starts your own Nasiko (open source) beside the Studio and connects the Studio to it. Safe to run again.
#  - fetches the pinned Nasiko source into vendor/nasiko
#  - creates .env.nasiko once, with fresh random passwords and keys (never commit it)
#  - starts Nasiko as its own Docker project on ONE host port, 8480 (set NASIKO_PORT to change it)
#  - fills in Settings > Nasiko and registers the Studio's agents (needs the Studio running on localhost:3000)
# It never touches the Studio's containers or its ports.
set -euo pipefail
cd "$(dirname "$0")/.."

NASIKO_REPO="https://github.com/Nasiko-Labs/nasiko"
NASIKO_SHA="${NASIKO_SHA:-0ed4b3d9d8484e1d759d29dd9673ce55af6ed5d9}"
PORT="${NASIKO_PORT:-8480}"
STUDIO="${STUDIO_LOCAL_URL:-http://localhost:3000}"
# How the Studio's container reaches Nasiko (Docker Desktop: host.docker.internal; Podman: host.containers.internal).
FROM_STUDIO="${NASIKO_URL_FROM_STUDIO:-http://host.docker.internal:${PORT}}"
# Docker by default; on Podman set NASIKO_COMPOSE="podman compose" (and NASIKO_DOCKER_SOCK to the Podman socket).
COMPOSE="${NASIKO_COMPOSE:-docker compose}"

dest=vendor/nasiko
if [ ! -f "$dest/.pinned" ] || [ "$(cat "$dest/.pinned")" != "$NASIKO_SHA" ]; then
  rm -rf "$dest" && mkdir -p "$dest"
  git -C "$dest" init -q
  git -C "$dest" remote add origin "$NASIKO_REPO"
  git -C "$dest" fetch -q --depth 1 origin "$NASIKO_SHA"
  git -C "$dest" checkout -q FETCH_HEAD
  rm -rf "$dest/.git"
  echo "$NASIKO_SHA" > "$dest/.pinned"
fi

# Small container machines (a laptop's 4 GB Podman machine): compile Nasiko's server with fewer parallel jobs so the build isn't killed for memory.
if [ -n "${NASIKO_CARGO_JOBS:-}" ] && grep -q "CARGO_BUILD_JOBS" "$dest/server/Dockerfile"; then
  perl -pi -e "s/CARGO_BUILD_JOBS=\\d+/CARGO_BUILD_JOBS=$NASIKO_CARGO_JOBS/" "$dest/server/Dockerfile"
elif [ -n "${NASIKO_CARGO_JOBS:-}" ]; then
  awk -v j="$NASIKO_CARGO_JOBS" '{print} /^FROM rust:/{print "ENV CARGO_BUILD_JOBS=" j}' "$dest/server/Dockerfile" > "$dest/server/Dockerfile.tmp" && mv "$dest/server/Dockerfile.tmp" "$dest/server/Dockerfile"
fi

# Work networks that re-sign secure connections (Zscaler and similar): give the build the certificates in NASIKO_CA_FILE.
if [ -n "${NASIKO_CA_FILE:-}" ] && [ -f "$NASIKO_CA_FILE" ] && ! grep -q "corp-ca.pem" "$dest/server/Dockerfile"; then
  cp "$NASIKO_CA_FILE" "$dest/corp-ca.pem"
  awk '{print} /^FROM /{print "COPY corp-ca.pem /etc/ssl/corp-ca.pem"; print "ENV NODE_EXTRA_CA_CERTS=/etc/ssl/corp-ca.pem SSL_CERT_FILE=/etc/ssl/corp-ca.pem CARGO_HTTP_CAINFO=/etc/ssl/corp-ca.pem REQUESTS_CA_BUNDLE=/etc/ssl/corp-ca.pem CURL_CA_BUNDLE=/etc/ssl/corp-ca.pem GIT_SSL_CAINFO=/etc/ssl/corp-ca.pem"}' "$dest/server/Dockerfile" > "$dest/server/Dockerfile.tmp" && mv "$dest/server/Dockerfile.tmp" "$dest/server/Dockerfile"
fi

if [ ! -f .env.nasiko ]; then
  umask 077
  {
    echo "NASIKO_PORT=$PORT"
    echo "NASIKO_ADMIN_USER=admin"
    echo "NASIKO_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24)"
    echo "NASIKO_DB_PASSWORD=$(openssl rand -hex 16)"
    echo "NASIKO_S3_SECRET=$(openssl rand -hex 16)"
    echo "NASIKO_SECRETS_KEY=$(openssl rand -base64 32)"
    echo "NASIKO_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
    echo "NASIKO_AGENT_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
  } > .env.nasiko
  echo "Created .env.nasiko with fresh passwords."
fi

$COMPOSE -p bacc-nasiko -f docker-compose.nasiko.yml --env-file .env.nasiko up -d --build

printf "Waiting for Nasiko on port %s" "$PORT"
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1; then echo " up."; break; fi
  printf "."; sleep 2
done
curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1 || { echo; echo "Nasiko did not answer. Read why with: $COMPOSE -p bacc-nasiko -f docker-compose.nasiko.yml logs server"; exit 1; }

# Connect the Studio (the password goes straight from the file to the Studio over this computer's own loopback).
if curl -fsS "$STUDIO/api/nasiko" >/dev/null 2>&1; then
  set -a; . ./.env.nasiko; set +a
  body=$(printf '{"url":"%s","username":"%s","password":"%s"}' "$FROM_STUDIO" "$NASIKO_ADMIN_USER" "$NASIKO_ADMIN_PASSWORD")
  curl -fsS -X PUT -H 'Content-Type: application/json' -d "$body" "$STUDIO/api/nasiko" | sed 's/"cipher":"[^"]*"//' | head -c 400; echo
  echo "Registering the Studio's agents in Nasiko..."
  curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"studio_base\":\"${STUDIO_FOR_NASIKO:-http://host.docker.internal:3000}\"}" "$STUDIO/api/nasiko/sync" | head -c 600; echo
else
  echo "The Studio is not answering on $STUDIO, so it was not connected. Open Settings > Nasiko once it is running."
fi
echo "Nasiko: http://localhost:${PORT}  (sign in as the admin user; its password is in .env.nasiko)"
