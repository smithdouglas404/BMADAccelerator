#!/bin/bash
# Socra · Working Backwards Studio, on a laptop with Podman (macOS).
#
# Run it from Terminal with one line (Doug's laptop). Each line saves this script on the laptop first, then runs it:
#   mkdir -p ~/SocraStudio/bin && curl -fsSL <this file's address> -o ~/SocraStudio/bin/socra.new && mv ~/SocraStudio/bin/socra.new ~/SocraStudio/bin/socra.sh && bash ~/SocraStudio/bin/socra.sh [update|check|logs]
#   (nothing)  set up / start the Studio       update  newest Studio code from GitHub, rebuild, keep your data
#   check      one screen: last result, versions, is localhost:3000 answering?       logs  what each app's start log says
# From the second run on, the work happens in the background, so closing the window does not stop it.
#
# What it does, start to finish, with nothing typed:
#   1. Finds the data package you downloaded (socra-laptop-data.zip, in Downloads).
#   2. Makes sure Podman's Linux machine is running with enough memory.
#   3. Puts the Studio's code (the same version as the Mac Studio) in ~/SocraStudio/BMADAccelerator.
#   4. Asks for keys in pop-ups (never shown, never pasted into chat) and signs in to your Claude plan.
#   5. Builds everything and loads your use cases, documents, memory and agent personas from the Mac Studio.
#   6. Starts the Studio on http://localhost:3000 (generated apps on 4100-4129, same as the Mac) and opens it.
# Safe to run again: data is loaded only the first time, keys you already gave are kept.
set -uo pipefail
# "update" (bash -c "$(curl …)" - update): get the newest Studio code from GitHub (branch mac-studio, the
# version the Mac Studio runs), rebuild and restart. Your use cases, documents, memory and keys stay as they are.
MODE="${1:-}"
CODE_BRANCH="${SOCRA_BRANCH:-mac-studio}"
# Release of THIS script (the laptop fixes). Settings > Update compares it with the newest one on GitHub.
SCRIPT_REV="12"

HOME_DIR="$HOME/SocraStudio"

# Which Podman machine is Doug's? Never create a second one when one exists. Order: SOCRA_MACHINE, the saved
# choice (~/SocraStudio/.machine), a machine that is running the Studio's containers, any running machine,
# the default machine, the only machine. Sets PM_NAME ("" = no machine at all) and points podman at it.
pick_machine() {
  PM_NAME=""
  command -v podman >/dev/null 2>&1 || return 0
  local names n saved
  names=$(podman machine list --format '{{.Name}}' 2>/dev/null | sed 's/\*$//' | sed '/^$/d')
  [ -z "$names" ] && return 0
  saved=$(cat "$HOME_DIR/.machine" 2>/dev/null | tr -d '[:space:]')
  for n in "${SOCRA_MACHINE:-}" "$saved"; do
    [ -n "$n" ] && echo "$names" | grep -qx "$n" && PM_NAME="$n" && break
  done
  if [ -z "$PM_NAME" ]; then
    for n in $names; do
      if podman --connection "$n" ps -a --format '{{.Names}}' 2>/dev/null | grep -q '^bmadaccelerator-'; then PM_NAME="$n"; break; fi
    done
  fi
  if [ -z "$PM_NAME" ]; then
    PM_NAME=$(podman machine list --format '{{.Name}}|{{.Running}}' 2>/dev/null | sed 's/\*|/|/' | awk -F'|' '$2=="true"{print $1; exit}')
  fi
  if [ -z "$PM_NAME" ]; then
    PM_NAME=$(podman machine list --format '{{.Name}}|{{.Default}}' 2>/dev/null | sed 's/\*|/|/' | awk -F'|' '$2=="true"{print $1; exit}')
  fi
  [ -z "$PM_NAME" ] && PM_NAME=$(echo "$names" | head -1)
  mkdir -p "$HOME_DIR" && echo "$PM_NAME" > "$HOME_DIR/.machine"
  podman system connection default "$PM_NAME" >/dev/null 2>&1 || true
  export CONTAINER_CONNECTION="$PM_NAME"
}
command -v podman >/dev/null 2>&1 || for p in /opt/podman/bin /opt/homebrew/bin /usr/local/bin; do [ -x "$p/podman" ] && export PATH="$p:$PATH"; done
pick_machine
APP="$HOME_DIR/BMADAccelerator"
DATA="$HOME_DIR/data"
LOG="$HOME_DIR/setup.log"
mkdir -p "$HOME_DIR"
export COMPOSE_PROJECT_NAME=bmadaccelerator

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { FAIL_MSG="$*"; printf '\n\033[31m%s\033[0m\n' "$*"; osascript -e "display dialog \"$*\" buttons {\"OK\"} with title \"Socra Studio\" with icon stop" >/dev/null 2>&1; exit 1; }
popup_secret() { # $1 prompt; prints the answer, empty if skipped
  osascript <<EOF 2>/dev/null
try
  set r to display dialog "$1" default answer "" with hidden answer buttons {"Skip", "Save"} default button "Save" with title "Socra Studio"
  if button returned of r is "Save" then return text returned of r
end try
return ""
EOF
}
ask_yes() { # $1 question; returns 0 for yes
  local b; b=$(osascript -e "button returned of (display dialog \"$1\" buttons {\"Not now\", \"Yes\"} default button \"Yes\" with title \"Socra Studio\")" 2>/dev/null)
  [ "$b" = "Yes" ]
}
set_env() { # name value: writes into .env without printing it
  touch "$APP/.env"
  grep -v "^$1=" "$APP/.env" > "$APP/.env.tmp" || true
  printf '%s="%s"\n' "$1" "$2" >> "$APP/.env.tmp"
  mv "$APP/.env.tmp" "$APP/.env"; chmod 600 "$APP/.env"
}
has_env() { grep -q "^$1=\"..*\"" "$APP/.env" 2>/dev/null; }

diagnose() {
  local OUT="$HOME_DIR/diagnose.txt"
  {
    echo "== Socra diagnose, $(date) =="
    echo "laptop fixes release: $(cat "$HOME_DIR/.script-rev" 2>/dev/null || echo older); Studio version: $(cat "$HOME_DIR/.version" 2>/dev/null || echo not recorded)"
    echo; echo "== containers =="
    podman ps -a --format '{{.Names}}  {{.Status}}' 2>&1 | sort
    echo; echo "== memory =="
    podman machine inspect "$PM_NAME" --format 'Podman machine memory (MB): {{.Resources.Memory}}' 2>&1 | head -1
    podman exec bmadaccelerator-app-1 sh -c 'free -m | head -2' 2>&1
    echo; echo "== the Studio app's settings =="
    podman exec bmadaccelerator-app-1 sh -c 'echo "npm certificate file: ${npm_config_cafile:-NOT SET}"; echo "start every app at boot: ${BACC_NO_RESUME_PREVIEWS:-yes}"; ls -ld /home/node/.npm /data/workspaces; id' 2>&1
    echo; echo "== products (name | port | build running | builds) =="
    podman exec bmadaccelerator-db-1 psql -U bacc -d bacc -At -F ' | ' -c 'SELECT slug, "previewPort", "generateBusy", "generateCount" FROM "UseCase" ORDER BY "updatedAt" DESC' 2>&1 | head -30
    echo; echo "== each app's start log (last lines) =="
    podman exec bmadaccelerator-app-1 sh -c 'n=0; for f in /data/workspaces/*/studio/preview.log; do [ -f "$f" ] || continue; n=1; echo "--- $f"; tail -n 15 "$f"; done; [ $n = 0 ] && echo "no app has tried to start yet"' 2>&1 | head -160
    echo; echo "== Studio log (last lines) =="
    podman logs --tail 40 bmadaccelerator-app-1 2>&1
  } > "$OUT" 2>&1
  cat "$OUT"
  echo; echo "This was also saved in $OUT"
}
if [ "$MODE" = "logs" ]; then
  for p in /opt/podman/bin /opt/homebrew/bin /usr/local/bin; do [ -x "$p/podman" ] && export PATH="$p:$PATH"; done
  command -v podman >/dev/null 2>&1 || { echo "I can't find Podman."; exit 1; }
  diagnose
  exit 0
fi

if [ "$MODE" = "check" ]; then
  for p in /opt/podman/bin /opt/homebrew/bin /usr/local/bin; do [ -x "$p/podman" ] && export PATH="$p:$PATH"; done
  RES=$(cat "$HOME_DIR/.last-result" 2>/dev/null || echo "nothing recorded yet")
  VER=$(cat "$HOME_DIR/.version" 2>/dev/null || true); REL=$(cat "$HOME_DIR/.script-rev" 2>/dev/null || echo "older")
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://localhost:3000 2>/dev/null || true); CODE=${CODE:-000}
  UP=no; [ "$CODE" -ge 200 ] 2>/dev/null && [ "$CODE" -lt 400 ] && UP=yes
  RUNNING=no; ps -axo command | grep -v grep | grep "SocraStudio/bin/socra.sh" | grep -vq "socra.sh check\|socra.sh logs" && RUNNING=yes
  PM=no; podman info >/dev/null 2>&1 && PM=yes
  HELPER=no; curl -fs --max-time 4 http://127.0.0.1:3099/status >/dev/null 2>&1 && HELPER=yes
  echo "== Socra check, $(date) =="
  echo "Last update or setup:        $RES"
  echo "Studio version here:         ${VER:0:7}${VER:+ }(laptop fixes release $REL; newest release is $SCRIPT_REV)"
  echo "Podman machine running:      $PM"
  echo "localhost:3000 answering:    $UP (code $CODE)"
  echo "Update button's helper:      $HELPER"
  echo "An update is running now:    $RUNNING"
  echo; echo "-- last lines of the last run --"; tail -n 12 "$HOME_DIR/last-run.txt" 2>/dev/null | cut -c1-200
  echo
  if [ "$RUNNING" = yes ]; then echo "VERDICT: an update is still running. Wait, then run this check again."
  elif [ "$UP" = yes ] && [ "${RES%% *}" = "done" ]; then echo "VERDICT: all good. The Studio is up and the last update finished."
  elif [ "$UP" = yes ]; then echo "VERDICT: the Studio is up, but the last update did not finish. Run the update line again."
  elif [ "$PM" = no ]; then echo "VERDICT: Podman's machine is stopped. Open Podman Desktop, start the machine, then run the update line again."
  else echo "VERDICT: the Studio is not answering. Run the update line again; if this check says the same after that, send me this screen."
  fi
  exit 0
fi

# From the second run on (or any update), the work runs in the background in its own session: closing the window,
# or Terminal restarting, no longer stops it. Its output goes to last-run.txt and the outcome to .last-result.
if [ -z "${SOCRA_DETACHED:-}" ] && [ -z "${SOCRA_UPDATER:-}" ] && [ -f "$0" ] && { [ "$MODE" = "update" ] || [ -f "$HOME_DIR/.data-loaded" ]; }; then
  RUNLOG="$HOME_DIR/last-run.txt"; : > "$RUNLOG"
  echo "running since $(date)" > "$HOME_DIR/.last-result"
  SOCRA_DETACHED=1 perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' nohup bash "$0" "$@" >> "$RUNLOG" 2>&1 < /dev/null &
  CHILD=$!
  echo "Working in the background. If this window closes, it keeps going."
  echo "To see how it is going at any time: bash $HOME_DIR/bin/socra.sh check"
  tail -n +1 -f "$RUNLOG" & TAILP=$!
  while kill -0 "$CHILD" 2>/dev/null; do sleep 1; done
  sleep 1; kill "$TAILP" 2>/dev/null
  echo; echo "RESULT: $(cat "$HOME_DIR/.last-result")"
  exit 0
fi
on_exit() {
  if [ -n "${SOCRA_OK:-}" ]; then echo "done at $(date)" > "$HOME_DIR/.last-result"
  else echo "FAILED at $(date): ${FAIL_MSG:-it stopped unexpectedly (see $HOME_DIR/last-run.txt and $LOG)}" > "$HOME_DIR/.last-result"; fi
}
trap on_exit EXIT

# ---------- 1. the data package ----------
say "Step 1 of 6: finding your data package"
if [ -f "$HOME_DIR/.data-loaded" ] && [ -f "$APP/docker-compose.yml" ]; then
  echo "Already set up on this laptop."
elif [ ! -f "$DATA/studio-code.tar.gz" ]; then
  PKG=""
  for c in "$HOME/Downloads"/socra-laptop-data*.zip; do [ -f "$c" ] && PKG="$c"; done
  for c in "$HOME/Downloads"/socra-laptop-data*/; do [ -f "$c/studio-code.tar.gz" ] && PKG="$c"; done
  [ -n "$PKG" ] || fail "I couldn't find socra-laptop-data.zip in your Downloads folder. Download it from the Claude thread, then run this again."
  mkdir -p "$DATA"
  if [ -d "$PKG" ]; then cp "$PKG"/* "$DATA"/
  else unzip -o -j -q "$PKG" -d "$DATA" || fail "The data package didn't unzip. Download it again, then run this again."; fi
fi
if [ ! -f "$HOME_DIR/.data-loaded" ] || [ ! -f "$APP/docker-compose.yml" ]; then
  for f in studio-code.tar.gz databases.sql.gz workspaces.tar.gz; do
    [ -f "$DATA/$f" ] || fail "The data package is missing $f. Download it again, then run this again."
  done
  echo "Found it."
fi

# ---------- 2. Podman ----------
say "Step 2 of 6: getting Podman ready"
command -v podman >/dev/null 2>&1 || for p in /opt/podman/bin /opt/homebrew/bin /usr/local/bin; do [ -x "$p/podman" ] && export PATH="$p:$PATH"; done
command -v podman >/dev/null 2>&1 || fail "I can't find Podman on this laptop. Install Podman Desktop from podman-desktop.io, open it once, then run this again."

TOTAL_MB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 ))
WANT_MB=8192; [ "$TOTAL_MB" -lt 16384 ] && WANT_MB=$(( TOTAL_MB / 2 ))
pick_machine
if [ -z "$PM_NAME" ]; then
  echo "No Podman machine found; creating one (one time, a few minutes)..."
  podman machine init --cpus 4 --memory "$WANT_MB" --disk-size 100 >>"$LOG" 2>&1 || fail "Podman couldn't create its machine. Details are in $LOG."
  pick_machine
else
  echo "Using your Podman machine: $PM_NAME"
fi
MEM=$(podman machine inspect "$PM_NAME" --format '{{.Resources.Memory}}' 2>/dev/null | head -1)
if [ -n "$MEM" ] && [ "$MEM" -lt 6144 ] && [ "$WANT_MB" -gt "$MEM" ]; then
  echo "Giving Podman more memory ($MEM MB is too little for the Studio build)..."
  podman machine stop "$PM_NAME" >>"$LOG" 2>&1
  podman machine set "$PM_NAME" --memory "$WANT_MB" --cpus 4 >>"$LOG" 2>&1
fi
if ! podman info >/dev/null 2>&1; then
  podman machine start "$PM_NAME" >>"$LOG" 2>&1
  podman info >/dev/null 2>&1 || fail "Podman's machine ($PM_NAME) didn't start. Open Podman Desktop, start it there, then run this again."
fi

# A compose tool for "podman compose". The Studio's file needs Docker Compose (podman-compose skips its
# "wait until setup finished" steps), so use Docker Compose: the one Podman already has, or fetch it here.
if ! podman compose version 2>/dev/null | grep -qi "docker compose"; then
  echo "Adding the compose tool..."
  mkdir -p "$HOME_DIR/bin"
  ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && ARCH=aarch64
  curl -fsSL -o "$HOME_DIR/bin/docker-compose" "https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-darwin-$ARCH" \
    || fail "I couldn't download the compose tool. Check the internet connection and run this again."
  chmod +x "$HOME_DIR/bin/docker-compose"
  export PODMAN_COMPOSE_PROVIDER="$HOME_DIR/bin/docker-compose"
  podman compose version 2>/dev/null | grep -qi "docker compose" || fail "The compose tool didn't work. Details are in $LOG."
fi
# 3000 must be free (the Studio never moves off it).
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && ! podman ps --format '{{.Ports}}' | grep -q ':3000->'; then
  fail "Something else on this laptop is already using port 3000. Quit it (Docker Desktop, another dev server) and run this again."
fi
echo "Podman is ready."

# ---------- 3. the code ----------
say "Step 3 of 6: putting the Studio's code in place"
if [ "$MODE" = "update" ]; then
  echo "Getting the newest version from GitHub ($CODE_BRANCH)..."
  NEW_SHA=$(curl -fs --max-time 20 "https://api.github.com/repos/smithdouglas404/BMADAccelerator/branches/$CODE_BRANCH" | perl -0777 -ne 'print $1 if /"commit"\s*:\s*\{\s*"sha"\s*:\s*"([0-9a-f]{40})"/')
  [ -n "$NEW_SHA" ] || NEW_SHA="refs/heads/$CODE_BRANCH"
  rm -rf "$APP.new"; mkdir -p "$APP.new"
  curl -fsSL "https://codeload.github.com/smithdouglas404/BMADAccelerator/tar.gz/$NEW_SHA" \
    | tar -xzf - -C "$APP.new" --strip-components=1 2>>"$LOG" \
    && [ -f "$APP.new/docker-compose.yml" ] || fail "I couldn't download the newest version. Check the internet connection and run this again."
  [ -f "$APP/.env" ] && cp "$APP/.env" "$APP.new/.env"
  rm -rf "$APP.previous"; [ -d "$APP" ] && mv "$APP" "$APP.previous"   # the last version, kept in case you need to go back
  mv "$APP.new" "$APP"
elif [ -f "$APP/docker-compose.yml" ]; then
  echo "The Studio's code is already here, so I keep it (it may be newer than the first copy)."
else
  mkdir -p "$APP"
  [ -f "$APP/.env" ] && cp "$APP/.env" "$HOME_DIR/.env.keep"
  tar -xzf "$DATA/studio-code.tar.gz" -C "$APP" 2>>"$LOG" || fail "The code didn't unpack. Details are in $LOG."
  [ -f "$HOME_DIR/.env.keep" ] && mv "$HOME_DIR/.env.keep" "$APP/.env"
  printf '%s\n' "bc82c0ab3806417ab3310366bca1842f031e5b22" > "$HOME_DIR/.version"   # the first copy came from this Mac Studio version
fi
cd "$APP" || exit 1
sh scripts/memory-secrets.sh >/dev/null
echo "Code is in $APP."

# ---------- 3b. work networks that inspect secure connections ----------
# Many company networks (Zscaler and similar) re-sign secure connections with their own certificate.
# Containers don't know that certificate, so npm, pip and the model APIs fail with
# "self-signed certificate in certificate chain". Take every certificate this Mac trusts and give it
# to Podman's machine, to each build, and to the running services.
CA="$APP/corp-ca.pem"
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain /Library/Keychains/System.keychain > "$CA" 2>>"$LOG"
security find-certificate -a -p "$HOME/Library/Keychains/login.keychain-db" >> "$CA" 2>>"$LOG"
grep -q "BEGIN CERTIFICATE" "$CA" || fail "I couldn't read this Mac's certificates. Details are in $LOG."
podman machine ssh "$PM_NAME" "sudo sh -c 'cat > /etc/pki/ca-trust/source/anchors/corp-ca.pem && update-ca-trust'" < "$CA" >>"$LOG" 2>&1 \
  || echo "(optional certificate step for Podman's own machine did not apply; image downloads work without it)" >>"$LOG"
CA_ENV="NODE_EXTRA_CA_CERTS=/etc/ssl/corp-ca.pem SSL_CERT_FILE=/etc/ssl/corp-ca.pem REQUESTS_CA_BUNDLE=/etc/ssl/corp-ca.pem CURL_CA_BUNDLE=/etc/ssl/corp-ca.pem GIT_SSL_CAINFO=/etc/ssl/corp-ca.pem PIP_CERT=/etc/ssl/corp-ca.pem"
for D in . agent-service memory/mem0; do
  cp "$CA" "$APP/$D/corp-ca.pem" 2>/dev/null
  F="$APP/$D/Dockerfile"
  if ! grep -q "corp-ca.pem" "$F"; then
    awk -v env="$CA_ENV" '{print} /^FROM /{print "COPY corp-ca.pem /etc/ssl/corp-ca.pem"; print "ENV " env}' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
  fi
done
# uv (the Python installer in the Studio image) can't check the work network's certificate (its signature
# type isn't supported), so on this laptop markitdown, the only Python tool the Studio runs, comes from pip.
perl -0pi -e 's{RUN uv python install[^\n]*\\\n[^\n]*\n}{RUN apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/* \\\n    && python3 -m venv /opt/uv-tools/markitdown && /opt/uv-tools/markitdown/bin/pip install --no-cache-dir "markitdown[pptx,docx,xlsx,xls,pdf]" \\\n    && ln -sf /opt/uv-tools/markitdown/bin/markitdown /usr/local/bin/markitdown && mkdir -p /opt/uv-python && chmod -R a+rX /opt/uv-tools /opt/uv-python\n}' "$APP/Dockerfile"
grep -q "uv python install" "$APP/Dockerfile" && fail "I couldn't adjust the build for this network. Details are in $LOG."
# Letta is used as published, so it gets the certificates at run time.
# Generated apps (previews) get a stripped-down environment that keeps only npm_config_* settings, so npm gets
# the certificates through npm_config_cafile; without it every preview's npm install is refused on this network.
cat > "$APP/docker-compose.override.yml" <<'YML'
services:
  app:
    environment:
      npm_config_cafile: /etc/ssl/corp-ca.pem
      # By default the Studio restarts every product's app at once on each boot (npm install + build for all of
      # them, four at a time). On a laptop that buries the one you opened. Here an app starts when you open it.
      BACC_NO_RESUME_PREVIEWS: "1"
  letta:
    volumes:
      - ./corp-ca.pem:/etc/ssl/corp-ca.pem:ro
    environment:
      SSL_CERT_FILE: /etc/ssl/corp-ca.pem
      REQUESTS_CA_BUNDLE: /etc/ssl/corp-ca.pem
      NODE_EXTRA_CA_CERTS: /etc/ssl/corp-ca.pem
YML

# ---------- 3c. the Update tab (laptop only) ----------
# Settings > Update talks to the small updater on this laptop (127.0.0.1:3099). Added to the downloaded code
# here, until the Mac Studio's version carries it itself.
if ! grep -q "UpdatePanel" "$APP/src/studio/settings.tsx" 2>/dev/null; then
cat > "$APP/src/studio/updatepanel.tsx" <<'TSX'
'use client'
// Settings > Update (laptop only). Talks to the small updater running on this laptop (127.0.0.1:3099), which pulls
// the newest Studio from GitHub (branch mac-studio, the version the Mac Studio runs), rebuilds and restarts it.
// Use cases, documents, memory, keys and the Claude sign-in stay as they are.
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type S = { state: 'idle' | 'running' | 'done' | 'failed'; installed: string; latest: string; scriptInstalled: string; scriptLatest: string; step: string; log: string }
const U = 'http://localhost:3099'

export function UpdatePanel() {
  const [s, setS] = useState<S | null>(null)
  const [fails, setFails] = useState(0)
  const down = fails >= 5
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  const read = useCallback(async () => {
    try {
      const r = await fetch(`${U}/status`, { cache: 'no-store' })
      setS((await r.json()) as S); setFails(0)
    } catch { setFails((n) => n + 1) }
  }, [])
  useEffect(() => {
    void read()
    timer.current = window.setInterval(() => { void read() }, 3000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [read])

  const start = async () => {
    setBusy(true)
    try { await fetch(`${U}/update`, { method: 'POST', headers: { 'X-Socra': '1' } }); await read() } catch { setFails((n) => n + 1) }
    setBusy(false)
  }

  const short = (x: string) => (x ? x.slice(0, 7) : 'not recorded')
  const studioCurrent = Boolean(s && s.installed && s.latest && s.installed === s.latest)
  const setupCurrent = Boolean(s && s.scriptInstalled && s.scriptLatest && s.scriptInstalled === s.scriptLatest)
  const current = studioCurrent && setupCurrent
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Update</p><h3>Stay on the <em>same version</em> as the Mac Studio</h3></div><RefreshCw size={16} /></div>
        <p className="studio-muted">Nothing here updates by itself. When a line below says an update is available, press Update now.</p>
        {down && <p className="studio-muted">The updater on this laptop is not answering. If you just restarted the laptop, wait a minute. Otherwise run the setup line in Terminal once more.</p>}
        {!down && !s && <p className="studio-muted">Checking for a new version…</p>}
        {s && <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>Studio (what the Mac Studio runs)</strong><small>This laptop: {short(s.installed)}. Newest: {short(s.latest)}.</small></div><span className={studioCurrent ? 'studio-ok' : 'studio-warn'}>{studioCurrent ? 'up to date' : 'update available'}</span></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Laptop fixes (setup, certificates, apps)</strong><small>This laptop: {s.scriptInstalled ? `release ${s.scriptInstalled}` : 'older release'}. Newest: {s.scriptLatest ? `release ${s.scriptLatest}` : 'not known'}.</small></div><span className={setupCurrent ? 'studio-ok' : 'studio-warn'}>{setupCurrent ? 'up to date' : 'update available'}</span></div>
          {s.state === 'running' && <div className="studio-list-row"><div className="studio-row-main"><strong>Updating…</strong><small>{s.step || 'Starting'}. The Studio goes offline for a few minutes while it restarts; this page keeps checking.</small></div></div>}
          {s.state === 'done' && <div className="studio-list-row"><div className="studio-row-main"><strong>Updated</strong><small>Reload the page to use the new version. Your use cases, memory and keys are unchanged. Each product&apos;s app needs a few minutes the first time you open it here (it downloads its packages).</small></div><span className="studio-ok">done</span></div>}
          {s.state === 'failed' && <div className="studio-list-row"><div className="studio-row-main"><strong>The update stopped</strong><small>Nothing was lost: your data and keys are untouched, and the previous version is kept. Send this to Claude: {s.step}</small><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{s.log}</pre></div><span className="studio-warn">failed</span></div>}
        </div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" className="button" disabled={busy || down || !s || s.state === 'running'} onClick={() => { void start() }}>
            {s?.state === 'running' ? 'Updating…' : current ? 'Update anyway' : 'Update now'}
          </button>
          {s?.state === 'done' && <button type="button" className="button button-quiet" onClick={() => window.location.reload()}>Reload</button>}
        </div>
      </section>
    </div>
  )
}
TSX
perl -0pi -e '
  s{^(import )}{import { UpdatePanel } from \x27./updatepanel\x27\n$1}m unless /^import[^\n]*\bUpdatePanel\b/m;
  s{(useState<[^>]*?)>\(\x27models\x27\)}{$1 | \x27update\x27>(\x27models\x27)};
  s{(if \(t === \x27[a-z]+\x27(?: \|\| t === \x27[a-z]+\x27)*)\) setTab}{$1 || t === \x27update\x27) setTab};
  s{(\[\x27[a-z]+\x27, \x27[^\x27]*\x27\])\] as const\)}{$1, [\x27update\x27, \x27Update\x27]] as const)};
  s{(\{tab === \x27models\x27 &&)}{\{tab === \x27update\x27 && <UpdatePanel />\}\n        $1};
' "$APP/src/studio/settings.tsx"
grep -q "<UpdatePanel />" "$APP/src/studio/settings.tsx" && grep -q "import { UpdatePanel }" "$APP/src/studio/settings.tsx" \
  || { echo "(Couldn't add the Update tab to this version; updates still work from Terminal.)"; rm -f "$APP/src/studio/updatepanel.tsx"; }
fi

# ---------- 4. keys, through pop-ups ----------
say "Step 4 of 6: keys (pop-up windows)"
if ! has_env OPENAI_API_KEY; then
  K=$(popup_secret "OpenAI key, needed for the agents' memory (Mem0 and Letta). It stays on this laptop. Paste it here:")
  [ -n "$K" ] || fail "The OpenAI key is needed for the agents' memory. Run this again when you have it."
  set_env OPENAI_API_KEY "$K"; unset K
fi
if ! has_env ANTHROPIC_API_KEY; then
  K=$(popup_secret "Anthropic API key (optional: used only when your Claude plan hits its limit). Paste it, or press Skip:")
  [ -n "$K" ] && set_env ANTHROPIC_API_KEY "$K"; unset K
fi
if ! has_env CLAUDE_CODE_OAUTH_TOKEN && [ -t 0 ] && ask_yes "Sign in with your Claude plan now? A sign-in page opens; approve it there. (This is what runs Socra, the agents and Generate.)"; then
  T=$(mktemp -t claude-plan)
  printf '\e[8;40;260t'; export COLUMNS=260
  echo "A browser page opens. Sign in with your Claude account and approve. If it asks for a code, it shows one to paste back here."
  if command -v claude >/dev/null 2>&1; then script -q "$T" claude setup-token
  elif command -v npx >/dev/null 2>&1; then script -q "$T" npx -y @anthropic-ai/claude-code setup-token
  else
    echo "(Running the sign-in inside Podman. Cmd-click the link it prints to open it.)"
    script -q "$T" podman run --rm -it -v "$CA:/etc/ssl/corp-ca.pem:ro" -e NODE_EXTRA_CA_CERTS=/etc/ssl/corp-ca.pem docker.io/library/node:22-bookworm-slim npx -y @anthropic-ai/claude-code setup-token
  fi
  TOKEN="$(perl -0777 -ne '
    s/\e\[[0-9;?]*[A-Za-z]//g; s/\e\][^\a]*\a//g; s/\r//g; s/[\x00-\x08\x0b-\x1f]//g;
    s/([A-Za-z0-9_-])[ \t]*\n[ \t]*(?=[A-Za-z0-9_-])/$1/g;
    my @all = /(sk-ant-oat[A-Za-z0-9_-]+)/g; my ($best) = sort { length($b) <=> length($a) } @all;
    $best = $1 if $best && $best =~ /^(sk-ant-oat.{85,}?AA)(?=[A-Z][a-z])/; print $best if $best;' "$T")"
  rm -f "$T"
  printf '\033c'  # clear the window so the sign-in token doesn't stay on screen
  if [ "${#TOKEN}" -ge 90 ]; then set_env CLAUDE_CODE_OAUTH_TOKEN "$TOKEN"; set_env BACC_CLAUDE_AUTH plan; echo "Signed in to your Claude plan."
  else echo "The plan sign-in didn't finish. (Details: the last lines above.)"; echo "The Studio still starts; you can sign in later by running this again."; fi
  unset TOKEN
fi
has_env CLAUDE_CODE_OAUTH_TOKEN || has_env ANTHROPIC_API_KEY || echo "Note: no Claude sign-in yet, so Socra can't answer until you run this again and sign in."

# ---------- 5. build and load your data ----------
say "Step 5 of 6: building (the first time takes 20-40 minutes; the laptop may get warm)"
podman compose build >>"$LOG" 2>&1 || fail "The build stopped. Details are in $LOG (the last lines say why)."

if [ ! -f "$HOME_DIR/.data-loaded" ]; then
  echo "Loading your use cases from the Mac Studio..."
  podman compose up -d db >>"$LOG" 2>&1
  for i in $(seq 1 60); do podman compose exec -T db pg_isready -U bacc >/dev/null 2>&1 && break; sleep 2; done
  gunzip -c "$DATA/databases.sql.gz" | podman compose exec -T db psql -q -U bacc -d postgres >>"$LOG" 2>&1
  N=$(podman compose exec -T db psql -At -U bacc -d bacc -c 'SELECT count(*) FROM "UseCase"' 2>/dev/null | tr -d '[:space:]')
  [ -n "$N" ] && [ "$N" != "0" ] || fail "Your data didn't load into the database. Details are in $LOG."
  echo "$N use cases loaded."
  # Keys saved on the Mac's Settings page are locked to the Mac. Drop them here; this laptop uses the keys you just gave.
  podman compose exec -T db psql -q -U bacc -d bacc -c 'DELETE FROM "StoredKey"' >>"$LOG" 2>&1
  echo "Loading your documents and generated apps..."
  podman compose run --rm --no-deps -T --user root --entrypoint sh app -c 'tar -C /data/workspaces -xzf - && chown -R node:node /data/workspaces' < "$DATA/workspaces.tar.gz" >>"$LOG" 2>&1 \
    || fail "Your documents didn't load. Details are in $LOG."
  if [ -f "$DATA/mem0-history.tar.gz" ]; then
    podman compose run --rm --no-deps -T --entrypoint sh mem0 -c 'tar -C /app/history -xzf -' < "$DATA/mem0-history.tar.gz" >>"$LOG" 2>&1
  fi
  touch "$HOME_DIR/.data-loaded"
fi

# ---------- 6. start ----------
say "Step 6 of 6: starting the Studio"
podman compose up -d >>"$LOG" 2>&1 || fail "The Studio didn't start. Details are in $LOG."
# npm's download cache and the agents' session folder are volumes Podman creates as root; the Studio runs as
# "node", so generated apps couldn't install. Hand them to node (safe to repeat).
podman compose exec -T -u root app sh -c 'chown -R node:node /home/node/.npm /home/node/.claude /data/workspaces' >>"$LOG" 2>&1
# The version is recorded as soon as the new code is built and started.
[ "$MODE" = "update" ] && [ -n "${NEW_SHA:-}" ] && printf '%s\n' "${NEW_SHA#refs/heads/}" > "$HOME_DIR/.version"
# "Done" only when the Studio really answers: two good answers in a row, up to 4 minutes.
echo "Waiting for the Studio to answer on localhost:3000 (it can take a minute or two)..."
GOOD=0
for i in $(seq 1 120); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000 2>/dev/null || true)
  if [ "${CODE:-000}" -ge 200 ] 2>/dev/null && [ "${CODE:-000}" -lt 400 ]; then GOOD=$((GOOD+1)); [ "$GOOD" -ge 2 ] && break; else GOOD=0; fi
  sleep 2
done
[ "$GOOD" -ge 2 ] || fail "The Studio did NOT answer on localhost:3000 after 4 minutes. It may still be starting. Wait a few minutes and run the check line; if it still says not answering, send me that screen."

# The updater behind Settings > Update: a tiny local service (127.0.0.1:3099 only), started by macOS at login.
# Its file is refreshed on every run (a running updater notices and restarts itself); the login service is set up
# only from a normal run, never while the updater itself is running this update.
mkdir -p "$HOME_DIR/bin" "$HOME/Library/LaunchAgents"
curl -fsSL --max-time 30 "https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator/claude/project-thread-i43blx/scripts/laptop/start-on-laptop.sh" -o "$HOME_DIR/bin/socra.sh.new" \
  && grep -q "^SCRIPT_REV=" "$HOME_DIR/bin/socra.sh.new" && mv "$HOME_DIR/bin/socra.sh.new" "$HOME_DIR/bin/socra.sh"
  cat > "$HOME_DIR/bin/updater.pl" <<'PERL'
#!/usr/bin/perl
# Socra Studio updater for the laptop. Runs on the laptop itself (not in Podman), started by launchd.
# Listens only on 127.0.0.1:3099. The Studio's Settings > Update tab talks to it:
#   GET  /status  -> {"state":"idle|running|done|failed","installed":"<sha>","latest":"<sha>","step":"...","log":"..."}
#   POST /update  -> starts the update (header X-Socra: 1 required), answers at once; poll /status.
# The update itself is ~/SocraStudio/bin/socra.sh update (the same script as the setup line).
use strict; use warnings;
use IO::Socket::INET;
use POSIX ":sys_wait_h";

my $HOME = $ENV{HOME};
my $DIR  = "$HOME/SocraStudio";
my $LOG  = "$DIR/update.log";
my $PIDF = "$DIR/.update.pid";
my $RES  = "$DIR/.update.result";
my $VER  = "$DIR/.version";
my $SREV = "$DIR/.script-rev";
my $STARTED = (stat($0))[9] // 0;   # when this file last changed; a newer file means "restart me"
my $SCRIPT_URL = "https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator/claude/project-thread-i43blx/scripts/laptop/start-on-laptop.sh";
my @ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000");
$ENV{PATH} = "/opt/podman/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

my $srv = IO::Socket::INET->new(LocalAddr => '127.0.0.1', LocalPort => 3099, Proto => 'tcp', Listen => 5, ReuseAddr => 1)
  or die "updater: cannot listen on 127.0.0.1:3099: $!\n";
$SIG{CHLD} = sub { 1 while waitpid(-1, WNOHANG) > 0 };

my ($latest, $latest_at, $slatest, $slatest_at) = ('', 0, '', 0);
sub slurp { my $f = shift; open(my $h, '<', $f) or return ''; local $/; my $s = <$h>; close $h; $s // '' }
sub jstr { my $s = shift // ''; $s =~ s/\\/\\\\/g; $s =~ s/"/\\"/g; $s =~ s/\r//g; $s =~ s/\n/\\n/g; $s =~ s/\t/  /g; $s =~ s/[\x00-\x1f]//g; "\"$s\"" }
sub running { my $p = slurp($PIDF); $p =~ s/\D//g; return ($p && kill(0, $p)) ? $p : 0 }
sub latest_sha {
  if (time - $latest_at > 60) {
    my $j = `curl -fsS --max-time 10 https://api.github.com/repos/smithdouglas404/BMADAccelerator/branches/mac-studio 2>/dev/null`;
    if ($j =~ /"commit"\s*:\s*\{\s*"sha"\s*:\s*"([0-9a-f]{40})"/) { $latest = $1; $latest_at = time }
  }
  $latest
}
sub latest_script_rev {
  if (time - $slatest_at > 60) {
    my $t = `curl -fsS --max-time 10 '$SCRIPT_URL' 2>/dev/null`;
    if ($t =~ /^SCRIPT_REV="?(\d+)"?/m) { $slatest = $1; $slatest_at = time }
  }
  $slatest
}
sub status_json {
  my $state = running() ? 'running' : (slurp($RES) =~ /^(done|failed)/ ? $1 : 'idle');
  my $log = slurp($LOG); $log =~ s/\e\[[0-9;]*m//g;
  my @steps = ($log =~ /^(Step \d of \d:[^\n]*)/mg);
  my @lines = grep { /\S/ } split /\n/, $log; my $tail = join("\n", @lines > 12 ? @lines[-12..-1] : @lines);
  my $inst = slurp($VER); $inst =~ s/\s//g;
  my $sinst = slurp($SREV); $sinst =~ s/\s//g;
  return '{"state":' . jstr($state) . ',"installed":' . jstr($inst) . ',"latest":' . jstr(latest_sha()) .
         ',"scriptInstalled":' . jstr($sinst) . ',"scriptLatest":' . jstr(latest_script_rev()) .
         ',"step":' . jstr(@steps ? $steps[-1] : '') . ',"log":' . jstr($tail) . '}';
}
sub start_update {
  return 0 if running();
  unlink $RES;
  my $pid = fork();
  return 0 unless defined $pid;
  if ($pid == 0) {
    POSIX::setsid();
    $ENV{SOCRA_UPDATER} = 1;
    open(STDIN, '<', '/dev/null'); open(STDOUT, '>', $LOG); open(STDERR, '>&', \*STDOUT);
    # Fresh copy of the script first, so fixes to the updater reach the laptop too.
    system("curl -fsSL --max-time 30 '$SCRIPT_URL' -o '$DIR/bin/socra.sh.new' && mv '$DIR/bin/socra.sh.new' '$DIR/bin/socra.sh'");
    my $rc = system('/bin/bash', "$DIR/bin/socra.sh", 'update');
    open(my $r, '>', $RES); print $r ($rc == 0 ? "done\n" : "failed\n"); close $r;
    unlink $PIDF; POSIX::_exit(0);
  }
  open(my $p, '>', $PIDF); print $p "$pid\n"; close $p;
  return 1;
}

while (1) {
  my $c = $srv->accept or next;   # a finished update interrupts accept(); just wait again
  $c->autoflush(1);
  local $SIG{ALRM} = sub { die "timeout\n" }; alarm 5;
  my ($req, %h) = ('');
  eval {
    $req = <$c> // '';
    while (my $l = <$c>) { last if $l =~ /^\r?\n$/; $h{lc $1} = $2 if $l =~ /^([^:]+):\s*(.*?)\r?$/ }
    1;
  };
  alarm 0;
  my ($m, $path) = $req =~ /^(\w+)\s+(\S+)/ ? ($1, $2) : ('', '');
  my $origin = $h{origin} // '';
  my $cors = (grep { $_ eq $origin } @ORIGINS)
    ? "Access-Control-Allow-Origin: $origin\r\nAccess-Control-Allow-Methods: GET, POST\r\nAccess-Control-Allow-Headers: X-Socra\r\nVary: Origin\r\n" : '';
  my ($code, $body) = (404, '{"error":"not found"}');
  if ($m eq 'OPTIONS') { ($code, $body) = (204, '') }
  elsif ($m eq 'GET' && $path eq '/status') { ($code, $body) = (200, status_json()) }
  elsif ($m eq 'POST' && $path eq '/update') {
    if (($h{'x-socra'} // '') ne '1' || ($origin && !$cors)) { ($code, $body) = (403, '{"error":"not allowed"}') }
    else { my $ok = start_update(); ($code, $body) = ($ok ? 202 : 409, $ok ? '{"started":true}' : '{"error":"an update is already running"}') }
  }
  my %txt = (200 => 'OK', 202 => 'Accepted', 204 => 'No Content', 403 => 'Forbidden', 404 => 'Not Found', 409 => 'Conflict');
  print $c "HTTP/1.1 $code $txt{$code}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n${cors}Content-Length: " . length($body) . "\r\nConnection: close\r\n\r\n$body";
  close $c;
  # A finished update may have replaced this file with a newer one: start it, same port, no waiting for the next login.
  exec($^X, $0) if !running() && ((stat($0))[9] // 0) != $STARTED;
}
PERL
printf '%s\n' "$SCRIPT_REV" > "$HOME_DIR/.script-rev"
if [ -z "${SOCRA_UPDATER:-}" ]; then
  PL="$HOME/Library/LaunchAgents/com.socra.studio-updater.plist"
  cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.socra.studio-updater</string>
  <key>ProgramArguments</key><array><string>/usr/bin/perl</string><string>$HOME_DIR/bin/updater.pl</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>AbandonProcessGroup</key><true/>
  <key>StandardErrorPath</key><string>$HOME_DIR/updater.err</string>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/com.socra.studio-updater" >/dev/null 2>&1
  launchctl bootstrap "gui/$(id -u)" "$PL" >>"$LOG" 2>&1
  sleep 2
  curl -fs --max-time 5 http://127.0.0.1:3099/status >/dev/null 2>&1 && echo "Update button ready: Settings > Update." \
    || echo "(The Update button's helper didn't start; updates still work from Terminal.)"
fi
if [ -t 0 ] || { [ -n "${SOCRA_DETACHED:-}" ] && [ -z "${SOCRA_UPDATER:-}" ]; }; then open http://localhost:3000; fi
SOCRA_OK=1
VER=$(cat "$HOME_DIR/.version" 2>/dev/null || true)
say "Done. The Studio is answering on http://localhost:3000 (version ${VER:0:7}, laptop fixes release $SCRIPT_REV)."
echo "To check at any time: bash $HOME_DIR/bin/socra.sh check"
echo "After a restart, if localhost:3000 does not open: start the machine in Podman Desktop, then run the update line again (no pop-ups, your data stays)."
