#!/usr/bin/env bash
# Puts Nasiko (the Studio's agent runtime, Settings > Enterprise Harness) on THIS laptop, under Podman, and registers the Studio's agents in it.
#   bash nasiko-on-laptop.sh          start (runs in the background; output in ~/SocraStudio/nasiko-run.txt)
#   bash nasiko-on-laptop.sh check    show how far it got
# It does NOT touch the Mac Studio. On this laptop it (1) updates the Studio's code to the branch that carries the Nasiko pieces if it
# doesn't have them yet (same update the Settings > Update button does, from a different branch), (2) starts Nasiko as its own Podman
# project on port 8480, (3) fills in Settings > Enterprise Harness and registers the agents. Keys and data stay as they are.
set -uo pipefail
HOME_DIR="$HOME/SocraStudio"
APP="$HOME_DIR/BMADAccelerator"
OUT="$HOME_DIR/nasiko-run.txt"
RESULT="$HOME_DIR/.nasiko-result"
BRANCH="${NASIKO_STUDIO_BRANCH:-claude/project-thread-gnd38w}"

if [ "${1:-}" = "check" ]; then
  echo "== result: $(cat "$RESULT" 2>/dev/null || echo 'not finished')"
  echo "== Nasiko answering: $(curl -fsS --max-time 5 http://localhost:8480/health >/dev/null 2>&1 && echo yes || echo no)"
  echo "== Studio answering: $(curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1 && echo yes || echo no)"
  echo "== last lines:"; tail -n 25 "$OUT" 2>/dev/null
  exit 0
fi

# Run in the background so closing Terminal doesn't stop it.
if [ -z "${NASIKO_DETACHED:-}" ]; then
  [ -d "$HOME_DIR" ] || { echo "~/SocraStudio isn't here, so the Studio isn't installed on this laptop yet."; exit 1; }
  rm -f "$RESULT"; : > "$OUT"
  NASIKO_DETACHED=1 nohup bash "$0" >>"$OUT" 2>&1 < /dev/null &
  disown 2>/dev/null || true
  echo "Started. You can close this window. To see how far it got:  bash $0 check"
  exit 0
fi

fail() { echo; echo "STOPPED: $*"; echo "failed: $*" > "$RESULT"; exit 1; }
say() { echo; echo "=== $* ($(date +%H:%M:%S))"; }

say "Step 1: the Studio's code"
if [ ! -f "$APP/scripts/nasiko-up.sh" ] || ! grep -q "NASIKO_CA_FILE" "$APP/scripts/nasiko-up.sh" 2>/dev/null || ! grep -q studio_base "$APP/src/app/api/nasiko/sync/route.ts" 2>/dev/null; then
  [ -f "$HOME_DIR/bin/socra.sh" ] || fail "~/SocraStudio/bin/socra.sh is missing, so I can't update the Studio. Run the Studio's own update line first."
  echo "This Studio doesn't have the Nasiko pieces yet. Updating it from branch $BRANCH (the same update as Settings > Update; your data and keys stay)."
  SOCRA_BRANCH="$BRANCH" bash "$HOME_DIR/bin/socra.sh" update >>"$OUT" 2>&1 || true
  for _ in $(seq 1 150); do   # up to 25 minutes
    sleep 10
    if [ -f "$APP/scripts/nasiko-up.sh" ] && ! pgrep -f "socra.sh" >/dev/null 2>&1 \
       && curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1; then break; fi
  done
  [ -f "$APP/scripts/nasiko-up.sh" ] && curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1 \
    || fail "The Studio update didn't finish in 25 minutes. Run: bash ~/SocraStudio/bin/socra.sh check"
fi
echo "The Studio has the Nasiko pieces and answers on localhost:3000."

say "Step 2: Podman"
command -v podman >/dev/null || fail "podman isn't installed."
podman machine start >/dev/null 2>&1 || true
podman info >/dev/null 2>&1 || fail "Podman isn't answering. Start Podman Desktop (or: podman machine start) and run this again."
podman compose version >/dev/null 2>&1 || fail "'podman compose' isn't available."
# The container socket INSIDE Podman's machine. Our 12 agents run in the Studio, so Nasiko doesn't need it; if none is found an empty file stands in.
SOCK=$(podman machine ssh 'ls /run/user/*/podman/podman.sock /run/podman/podman.sock 2>/dev/null | head -1' 2>/dev/null | tr -d '\r' | head -1)
[ -n "$SOCK" ] || SOCK=/dev/null
echo "Container socket: $SOCK"
if lsof -nP -iTCP:8480 -sTCP:LISTEN >/dev/null 2>&1 && ! podman ps --format '{{.Ports}}' | grep -q ':8480->'; then
  fail "Something else on this laptop uses port 8480."
fi

say "Step 3: Nasiko (the first build takes several minutes: it compiles Nasiko's server)"
cd "$APP" || fail "no $APP"
CA="$APP/corp-ca.pem"
[ -f "$CA" ] || echo "(no corp-ca.pem found; if the build fails with a certificate error, that is why)"
NASIKO_COMPOSE="podman compose" \
NASIKO_DOCKER_SOCK="$SOCK" \
NASIKO_EXTRA_HOST="nasiko.local:127.0.0.1" \
NASIKO_CA_FILE="$CA" \
NASIKO_URL_FROM_STUDIO="http://host.containers.internal:8480" \
STUDIO_FOR_NASIKO="http://host.containers.internal:3000" \
bash scripts/nasiko-up.sh || fail "Nasiko did not come up. See the lines above."

say "Done"
if curl -fsS --max-time 5 http://localhost:8480/health >/dev/null 2>&1; then
  echo "ok: Nasiko answers on http://localhost:8480; open Settings > Enterprise Harness in the Studio." | tee "$RESULT"
else
  fail "Nasiko is not answering on 8480."
fi
