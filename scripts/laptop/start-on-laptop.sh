#!/bin/bash
# Socra · Working Backwards Studio, on a laptop with Podman (macOS).
#
# Run it from Terminal with one line (Doug's laptop):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator/claude/project-thread-i43blx/scripts/laptop/start-on-laptop.sh)"
#   To get the newest version later (keeps your data):  add " - update" after the closing quote of that line.
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

HOME_DIR="$HOME/SocraStudio"
APP="$HOME_DIR/BMADAccelerator"
DATA="$HOME_DIR/data"
LOG="$HOME_DIR/setup.log"
mkdir -p "$HOME_DIR"
export COMPOSE_PROJECT_NAME=bmadaccelerator

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*"; osascript -e "display dialog \"$*\" buttons {\"OK\"} with title \"Socra Studio\" with icon stop" >/dev/null 2>&1; exit 1; }
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

# ---------- 1. the data package ----------
say "Step 1 of 6: finding your data package"
if [ ! -f "$DATA/studio-code.tar.gz" ]; then
  PKG=""
  for c in "$HOME/Downloads"/socra-laptop-data*.zip; do [ -f "$c" ] && PKG="$c"; done
  for c in "$HOME/Downloads"/socra-laptop-data*/; do [ -f "$c/studio-code.tar.gz" ] && PKG="$c"; done
  [ -n "$PKG" ] || fail "I couldn't find socra-laptop-data.zip in your Downloads folder. Download it from the Claude thread, then run this again."
  mkdir -p "$DATA"
  if [ -d "$PKG" ]; then cp "$PKG"/* "$DATA"/
  else unzip -o -j -q "$PKG" -d "$DATA" || fail "The data package didn't unzip. Download it again, then run this again."; fi
fi
for f in studio-code.tar.gz databases.sql.gz workspaces.tar.gz; do
  [ -f "$DATA/$f" ] || fail "The data package is missing $f. Download it again, then run this again."
done
echo "Found it."

# ---------- 2. Podman ----------
say "Step 2 of 6: getting Podman ready"
command -v podman >/dev/null 2>&1 || for p in /opt/podman/bin /opt/homebrew/bin /usr/local/bin; do [ -x "$p/podman" ] && export PATH="$p:$PATH"; done
command -v podman >/dev/null 2>&1 || fail "I can't find Podman on this laptop. Install Podman Desktop from podman-desktop.io, open it once, then run this again."

TOTAL_MB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 ))
WANT_MB=8192; [ "$TOTAL_MB" -lt 16384 ] && WANT_MB=$(( TOTAL_MB / 2 ))
if ! podman machine inspect >/dev/null 2>&1; then
  echo "Creating Podman's Linux machine (one time, a few minutes)..."
  podman machine init --cpus 4 --memory "$WANT_MB" --disk-size 100 >>"$LOG" 2>&1 || fail "Podman couldn't create its machine. Details are in $LOG."
fi
MEM=$(podman machine inspect --format '{{.Resources.Memory}}' 2>/dev/null | head -1)
if [ -n "$MEM" ] && [ "$MEM" -lt 6144 ] && [ "$WANT_MB" -gt "$MEM" ]; then
  echo "Giving Podman more memory ($MEM MB is too little for the Studio build)..."
  podman machine stop >>"$LOG" 2>&1
  podman machine set --memory "$WANT_MB" --cpus 4 >>"$LOG" 2>&1
fi
if ! podman info >/dev/null 2>&1; then
  podman machine start >>"$LOG" 2>&1
  podman info >/dev/null 2>&1 || fail "Podman's machine didn't start. Open Podman Desktop, start the machine there, then run this again."
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
  NEW_SHA=$(curl -fsS --max-time 20 "https://api.github.com/repos/smithdouglas404/BMADAccelerator/branches/$CODE_BRANCH" | perl -0777 -ne 'print $1 if /"commit"\s*:\s*\{\s*"sha"\s*:\s*"([0-9a-f]{40})"/')
  [ -n "$NEW_SHA" ] || NEW_SHA="refs/heads/$CODE_BRANCH"
  rm -rf "$APP.new"; mkdir -p "$APP.new"
  curl -fsSL "https://codeload.github.com/smithdouglas404/BMADAccelerator/tar.gz/$NEW_SHA" \
    | tar -xzf - -C "$APP.new" --strip-components=1 2>>"$LOG" \
    && [ -f "$APP.new/docker-compose.yml" ] || fail "I couldn't download the newest version. Check the internet connection and run this again."
  [ -f "$APP/.env" ] && cp "$APP/.env" "$APP.new/.env"
  rm -rf "$APP.previous"; [ -d "$APP" ] && mv "$APP" "$APP.previous"   # the last version, kept in case you need to go back
  mv "$APP.new" "$APP"
else
  mkdir -p "$APP"
  [ -f "$APP/.env" ] && cp "$APP/.env" "$HOME_DIR/.env.keep"
  tar -xzf "$DATA/studio-code.tar.gz" -C "$APP" 2>>"$LOG" || fail "The code didn't unpack. Details are in $LOG."
  [ -f "$HOME_DIR/.env.keep" ] && mv "$HOME_DIR/.env.keep" "$APP/.env"
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
podman machine ssh "sudo sh -c 'cat > /etc/pki/ca-trust/source/anchors/corp-ca.pem && update-ca-trust'" < "$CA" >>"$LOG" 2>&1 \
  || echo "(Couldn't add the certificates to Podman's machine; carrying on.)"
CA_ENV="NODE_EXTRA_CA_CERTS=/etc/ssl/corp-ca.pem SSL_CERT_FILE=/etc/ssl/corp-ca.pem REQUESTS_CA_BUNDLE=/etc/ssl/corp-ca.pem CURL_CA_BUNDLE=/etc/ssl/corp-ca.pem GIT_SSL_CAINFO=/etc/ssl/corp-ca.pem PIP_CERT=/etc/ssl/corp-ca.pem"
for D in . agent-service memory/mem0; do
  cp "$CA" "$APP/$D/corp-ca.pem" 2>/dev/null
  F="$APP/$D/Dockerfile"
  grep -q "corp-ca.pem" "$F" || awk -v env="$CA_ENV" '{print} /^FROM /{print "COPY corp-ca.pem /etc/ssl/corp-ca.pem"; print "ENV " env}' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
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

type S = { state: 'idle' | 'running' | 'done' | 'failed'; installed: string; latest: string; step: string; log: string }
const U = 'http://localhost:3099'

export function UpdatePanel() {
  const [s, setS] = useState<S | null>(null)
  const [down, setDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  const read = useCallback(async () => {
    try {
      const r = await fetch(`${U}/status`, { cache: 'no-store' })
      setS((await r.json()) as S); setDown(false)
    } catch { setDown(true) }
  }, [])
  useEffect(() => {
    void read()
    timer.current = window.setInterval(() => { void read() }, 3000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [read])

  const start = async () => {
    setBusy(true)
    try { await fetch(`${U}/update`, { method: 'POST', headers: { 'X-Socra': '1' } }); await read() } catch { setDown(true) }
    setBusy(false)
  }

  const short = (x: string) => (x ? x.slice(0, 7) : 'unknown')
  const current = s && s.installed && s.latest && s.installed === s.latest
  return (
    <div className="studio-settings-grid">
      <section className="studio-card">
        <div className="stack-header"><div><p className="eyebrow">Update</p><h3>Stay on the <em>same version</em> as the Mac Studio</h3></div><RefreshCw size={16} /></div>
        {down && <p className="studio-muted">The updater on this laptop is not answering. If you just restarted the laptop, wait a minute. Otherwise run the setup line in Terminal once more.</p>}
        {!down && !s && <p className="studio-muted">Checking for a new version…</p>}
        {s && <div className="studio-list">
          <div className="studio-list-row"><div className="studio-row-main"><strong>On this laptop</strong><small>version {short(s.installed)}</small></div></div>
          <div className="studio-list-row"><div className="studio-row-main"><strong>Newest (Mac Studio, on GitHub)</strong><small>version {short(s.latest)}</small></div><span className={current ? 'studio-ok' : 'studio-warn'}>{current ? 'up to date' : 'update available'}</span></div>
          {s.state === 'running' && <div className="studio-list-row"><div className="studio-row-main"><strong>Updating…</strong><small>{s.step || 'Starting'}. The Studio goes offline for a few minutes while it restarts; this page keeps checking.</small></div></div>}
          {s.state === 'done' && <div className="studio-list-row"><div className="studio-row-main"><strong>Updated</strong><small>Reload the page to use the new version. Your use cases, memory and keys are unchanged.</small></div><span className="studio-ok">done</span></div>}
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
  s{(import \{ JevValue \} from \x27\./jev\x27\n)}{$1import { UpdatePanel } from \x27./updatepanel\x27\n};
  s{\| \x27jev\x27>}{| \x27jev\x27 | \x27update\x27>};
  s{t === \x27jev\x27\)}{t === \x27jev\x27 || t === \x27update\x27)};
  s{\[\x27jev\x27, \x27Jev\x27\]\]}{[\x27jev\x27, \x27Jev\x27], [\x27update\x27, \x27Update\x27]]};
  s{(\{tab === \x27jev\x27 && <JevValue />\})}{$1\n        {tab === \x27update\x27 && <UpdatePanel />}};
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
podman compose restart app >>"$LOG" 2>&1   # restart so the generated apps start again with the fixes
for i in $(seq 1 90); do curl -fs -o /dev/null http://localhost:3000 2>/dev/null && break; sleep 2; done
curl -fs -o /dev/null http://localhost:3000 2>/dev/null || fail "The Studio is starting slowly. Wait a minute and open http://localhost:3000. Details are in $LOG."
[ "$MODE" = "update" ] && [ -n "${NEW_SHA:-}" ] && printf '%s\n' "${NEW_SHA#refs/heads/}" > "$HOME_DIR/.version"

# The updater behind Settings > Update: a tiny local service (127.0.0.1:3099 only), started by macOS at login.
# Not reinstalled while it is the one running this update.
if [ -z "${SOCRA_UPDATER:-}" ]; then
  mkdir -p "$HOME_DIR/bin" "$HOME/Library/LaunchAgents"
  curl -fsSL --max-time 30 "https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator/claude/project-thread-i43blx/scripts/laptop/start-on-laptop.sh" -o "$HOME_DIR/bin/socra.sh.new" \
    && grep -q "Socra" "$HOME_DIR/bin/socra.sh.new" && mv "$HOME_DIR/bin/socra.sh.new" "$HOME_DIR/bin/socra.sh"
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
my $SCRIPT_URL = "https://raw.githubusercontent.com/smithdouglas404/BMADAccelerator/claude/project-thread-i43blx/scripts/laptop/start-on-laptop.sh";
my @ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000");
$ENV{PATH} = "/opt/podman/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

my $srv = IO::Socket::INET->new(LocalAddr => '127.0.0.1', LocalPort => 3099, Proto => 'tcp', Listen => 5, ReuseAddr => 1)
  or die "updater: cannot listen on 127.0.0.1:3099: $!\n";
$SIG{CHLD} = sub { 1 while waitpid(-1, WNOHANG) > 0 };

my ($latest, $latest_at) = ('', 0);
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
sub status_json {
  my $state = running() ? 'running' : (slurp($RES) =~ /^(done|failed)/ ? $1 : 'idle');
  my $log = slurp($LOG); $log =~ s/\e\[[0-9;]*m//g;
  my @steps = ($log =~ /^(Step \d of \d:[^\n]*)/mg);
  my @lines = grep { /\S/ } split /\n/, $log; my $tail = join("\n", @lines > 12 ? @lines[-12..-1] : @lines);
  my $inst = slurp($VER); $inst =~ s/\s//g;
  return '{"state":' . jstr($state) . ',"installed":' . jstr($inst) . ',"latest":' . jstr(latest_sha()) .
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
}
PERL
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
[ -t 0 ] && open http://localhost:3000
say "Done. The Studio is on http://localhost:3000 with your use cases."
echo "After a restart, if localhost:3000 does not open: start the machine in Podman Desktop, then run this same line again (no pop-ups, your data stays)."
