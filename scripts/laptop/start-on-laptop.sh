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
  rm -rf "$APP.new"; mkdir -p "$APP.new"
  curl -fsSL "https://codeload.github.com/smithdouglas404/BMADAccelerator/tar.gz/refs/heads/$CODE_BRANCH" \
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
cat > "$APP/docker-compose.override.yml" <<'YML'
services:
  letta:
    volumes:
      - ./corp-ca.pem:/etc/ssl/corp-ca.pem:ro
    environment:
      SSL_CERT_FILE: /etc/ssl/corp-ca.pem
      REQUESTS_CA_BUNDLE: /etc/ssl/corp-ca.pem
      NODE_EXTRA_CA_CERTS: /etc/ssl/corp-ca.pem
YML

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
if ! has_env CLAUDE_CODE_OAUTH_TOKEN && ask_yes "Sign in with your Claude plan now? A sign-in page opens; approve it there. (This is what runs Socra, the agents and Generate.)"; then
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
for i in $(seq 1 90); do curl -fsS -o /dev/null http://localhost:3000 && break; sleep 2; done
curl -fsS -o /dev/null http://localhost:3000 || fail "The Studio is starting slowly. Wait a minute and open http://localhost:3000. Details are in $LOG."
open http://localhost:3000
say "Done. The Studio is on http://localhost:3000 with your use cases."
echo "After a restart, if localhost:3000 does not open: start the machine in Podman Desktop, then run this same line again (no pop-ups, your data stays)."
