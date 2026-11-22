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
  # One run at a time: two builds at once starve the Podman machine.
  if [ -f "$HOME_DIR/.nasiko-pid" ] && kill -0 "$(cat "$HOME_DIR/.nasiko-pid" 2>/dev/null)" 2>/dev/null; then
    echo "Already running (process $(cat "$HOME_DIR/.nasiko-pid")). Not starting a second one. Check it with:  bash $0 check"
    exit 0
  fi
  rm -f "$RESULT"; : > "$OUT"
  NASIKO_DETACHED=1 nohup bash "$0" >>"$OUT" 2>&1 < /dev/null &
  disown 2>/dev/null || true
  echo "Started. You can close this window. To see how far it got:  bash $0 check"
  exit 0
fi

echo $$ > "$HOME_DIR/.nasiko-pid"
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
# The Studio has the Nasiko code, but the two Nasiko files (start script and compose file) may be older: refresh just those two. No Studio rebuild.
if ! grep -q "NASIKO_CARGO_JOBS" "$APP/scripts/nasiko-up.sh" 2>/dev/null || ! grep -q "MCP_ALLOW_PRIVATE_URLS" "$APP/docker-compose.nasiko.yml" 2>/dev/null; then
  RAW="https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator/refs/heads/$BRANCH"
  curl -fsSL "$RAW/scripts/nasiko-up.sh" -o "$APP/scripts/nasiko-up.sh.new" && curl -fsSL "$RAW/docker-compose.nasiko.yml" -o "$APP/docker-compose.nasiko.yml.new" \
    && mv "$APP/scripts/nasiko-up.sh.new" "$APP/scripts/nasiko-up.sh" && mv "$APP/docker-compose.nasiko.yml.new" "$APP/docker-compose.nasiko.yml" \
    || fail "I couldn't download the newest Nasiko files from GitHub."
  echo "Refreshed the Nasiko start script and compose file."
fi
echo "The Studio has the Nasiko pieces and answers on localhost:3000."

say "Step 2: Podman"
command -v podman >/dev/null || fail "podman isn't installed."
# Never start or create a machine here: use the one that is already running (this laptop's is "podman-smith").
podman info >/dev/null 2>&1 || fail "Podman isn't answering. Start Podman Desktop and run this again."
MACH=$(podman machine list --format '{{.Name}}|{{.Running}}' 2>/dev/null | tr -d '*' | awk -F'|' '$2=="true"{print $1; exit}')
[ -n "$MACH" ] || MACH=$(podman system connection list --format '{{.Name}} {{.Default}}' 2>/dev/null | awk '$2=="true"{sub(/-root$/,"",$1); print $1; exit}')
[ -n "$MACH" ] || fail "I can't tell which Podman machine is running. Send Claude the output of: podman machine list"
echo "Podman machine in use: $MACH"
mssh() { podman machine ssh "$MACH" "$@"; }
podman compose version >/dev/null 2>&1 || fail "'podman compose' isn't available."
# The container socket INSIDE Podman's machine. Our 12 agents run in the Studio, so Nasiko doesn't need it; if none is found an empty file stands in.
SOCK=$(mssh 'ls /run/user/*/podman/podman.sock /run/podman/podman.sock 2>/dev/null | head -1' 2>/dev/null | tr -d '\r' | head -1)
[ -n "$SOCK" ] || SOCK=/dev/null
echo "Container socket: $SOCK"
if lsof -nP -iTCP:8480 -sTCP:LISTEN >/dev/null 2>&1 && ! podman ps --format '{{.Ports}}' | grep -q ':8480->'; then
  fail "Something else on this laptop uses port 8480."
fi

# A server image built on the Mac (arm64) can be loaded instead of compiling here: put nasiko-server-arm64.tar.gz in ~/Downloads (AirDrop it), or set NASIKO_IMAGE_FILE.
IMGFILE="${NASIKO_IMAGE_FILE:-$HOME/Downloads/nasiko-server-arm64.tar.gz}"
if [ -f "$IMGFILE" ]; then
  say "Loading the prebuilt Nasiko server image ($IMGFILE). Nothing is compiled on this laptop"
  gunzip -c "$IMGFILE" | podman load >>"$OUT" 2>&1 || fail "The image file didn't load. See $OUT."
  podman image exists localhost/bacc-nasiko-server:latest || podman image exists bacc-nasiko-server:latest || fail "The loaded file didn't contain bacc-nasiko-server. Ask Claude to re-export it."
  export NASIKO_NO_BUILD=1
  if ! curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1; then
    ( cd "$APP" && podman compose up -d >>"$OUT" 2>&1 ); for _ in $(seq 1 60); do curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1 && break; sleep 5; done
  fi
else
# Memory first. Nasiko's server compile needs about 3 GB by itself; with the Studio running in the same machine it needs ~6 GB.
  # Raise the machine to 8 GB (or as much as leaves 4 GB for macOS), once. This restarts the machine, so the Studio is brought back right after.
  HOSTMB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1048576 ))
  WANT=8192; [ "$HOSTMB" -gt 0 ] && [ $((HOSTMB - 4096)) -lt "$WANT" ] && WANT=$((HOSTMB - 4096))
  CURMB=$(podman machine inspect "$MACH" --format '{{.Resources.Memory}}' 2>/dev/null | head -1)
  echo "This Mac: ${HOSTMB} MB. Podman machine $MACH: ${CURMB:-?} MB. Target: ${WANT} MB."
  if [ -n "$CURMB" ] && [ "$CURMB" -lt "$WANT" ] 2>/dev/null && [ "$WANT" -ge 6000 ]; then
    say "Raising $MACH from ${CURMB} MB to ${WANT} MB (restarts the machine; the Studio comes back right after)"
    podman machine stop "$MACH" >>"$OUT" 2>&1
    podman machine set --memory "$WANT" "$MACH" >>"$OUT" 2>&1 || echo "(could not change the memory: see above)"
    podman machine start "$MACH" >>"$OUT" 2>&1 || fail "The Podman machine did not start again. Run: podman machine start $MACH"
    sleep 10
    CURMB=$(podman machine inspect "$MACH" --format '{{.Resources.Memory}}' 2>/dev/null | head -1)
    echo "Machine memory now: ${CURMB:-?} MB"
  fi
  # The Studio first: it should be answering before and after any build.
  if ! curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1; then
    echo "Starting the Studio (podman compose up -d)..."
    ( cd "$APP" && podman compose up -d >>"$OUT" 2>&1 )
    for _ in $(seq 1 60); do curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1 && break; sleep 5; done
  fi
  curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1 && echo "The Studio answers on localhost:3000." || echo "(The Studio is not answering yet; continuing with Nasiko anyway. Check later: bash ~/SocraStudio/bin/socra.sh check)"
  # Compile jobs: 2 with 6 GB or more, otherwise 1.
  if [ -n "$CURMB" ] && [ "$CURMB" -ge 6000 ] 2>/dev/null; then JOBS=2; else JOBS=1; fi
  export NASIKO_CARGO_JOBS="${NASIKO_CARGO_JOBS:-$JOBS}"
  echo "Building Nasiko with $NASIKO_CARGO_JOBS compile job(s)."
  
fi

say "Step 3: starting Nasiko"
cd "$APP" || fail "no $APP"
CA="$APP/corp-ca.pem"
[ -f "$CA" ] || echo "(no corp-ca.pem found; if the build fails with a certificate error, that is why)"
run_nasiko() {
  NASIKO_COMPOSE="podman compose" \
  NASIKO_DOCKER_SOCK="$SOCK" \
  NASIKO_EXTRA_HOST="nasiko.local:127.0.0.1" \
  NASIKO_CA_FILE="$CA" \
  NASIKO_CARGO_JOBS="${NASIKO_CARGO_JOBS:-}" \
  NASIKO_URL_FROM_STUDIO="http://host.containers.internal:8480" \
  STUDIO_FOR_NASIKO="http://host.containers.internal:3000" \
  bash scripts/nasiko-up.sh 2>&1 | tee "$HOME_DIR/nasiko-build.txt"
  return "${PIPESTATUS[0]}"
}
diag() {
  echo "--- Podman's machine: disk and storage"
  mssh 'df -h /var /var/lib/containers 2>/dev/null; echo; dmesg 2>/dev/null | grep -iE "i/o error|overlay|ext4|xfs|no space" | tail -n 8' 2>&1 | tail -n 25
  podman system df 2>&1 | head -n 8
}

# Podman's machine sometimes refuses to mount a build container with "overlayfs: Cannot mount volatile when upperdir has an unseen error.
# Sync upperdir fs to clear state" (shows up as "input/output error"). Syncing the machine's disk clears it, so do that before every try.
flush() { mssh 'sync; sync' >/dev/null 2>&1; }
if ! { flush; run_nasiko; }; then
  if grep -qi "input/output error\|no space left" "$HOME_DIR/nasiko-build.txt"; then
    say "Podman's storage reported an error. Syncing its disk and trying again"
    diag
    flush; podman builder prune -f >/dev/null 2>&1 || true
    if ! { flush; run_nasiko; }; then
      say "Still failing. Restarting the Podman machine $MACH (the Studio goes down for a minute and comes back), then trying again"
      podman machine stop "$MACH" >/dev/null 2>&1; sleep 5; podman machine start "$MACH" >/dev/null 2>&1; sleep 15
      ( cd "$APP" && podman compose up -d >/dev/null 2>&1 ) || echo "(could not restart the Studio; run: bash ~/SocraStudio/bin/socra.sh check)"
      for _ in $(seq 1 30); do curl -fsS --max-time 5 http://localhost:3000 >/dev/null 2>&1 && break; sleep 5; done
      run_nasiko || { diag; fail "Nasiko did not come up. The last output is in $HOME_DIR/nasiko-build.txt. Send it to Claude."; }
    fi
  else
    fail "Nasiko did not come up. The last output is in $HOME_DIR/nasiko-build.txt. Send it to Claude."
  fi
fi

say "Done"
if curl -fsS --max-time 5 http://localhost:8480/health >/dev/null 2>&1; then
  echo "ok: Nasiko answers on http://localhost:8480; open Settings > Enterprise Harness in the Studio." | tee "$RESULT"
else
  fail "Nasiko is not answering on 8480."
fi
