#!/bin/bash
# Double-click this file (in Finder) to run the accelerator's agents on your own Claude plan.
# It signs you in, saves the sign-in token into .env without showing it, and restarts the app.
cd "$(dirname "$0")/.." || exit 1

LOG="$(mktemp -t claude-plan)"
trap 'rm -f "$LOG"' EXIT

echo "Step 1 of 2: a browser opens. Sign in with your Claude account and approve."
echo
if command -v claude >/dev/null 2>&1; then CMD=(claude setup-token); else CMD=(npx -y @anthropic-ai/claude-code setup-token); fi
# Record what setup-token prints so the token can be picked up without copying it by hand.
script -q "$LOG" "${CMD[@]}"

# Find the token, joining it back together where the window wrapped it onto several lines.
TOKEN="$(perl -0777 -ne '
  s/\e\[[0-9;?]*[A-Za-z]//g; s/\e\][^\a]*\a//g; s/\r//g;
  s/([A-Za-z0-9_-])[ \t]*\n[ \t]*(?=[A-Za-z0-9_-])/$1/g;
  print $1 if /(sk-ant-oat[A-Za-z0-9_-]+)/;' "$LOG")"

if [ "${#TOKEN}" -lt 90 ]; then
  echo
  echo "I couldn't pick up the whole token by myself. Select the full token above (it can run"
  echo "over two lines and ends where the text stops), press Cmd+C, then paste it here."
  read -r -s -p "Token (hidden): " TOKEN
  echo
  TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
fi
if [ "${#TOKEN}" -lt 90 ]; then
  echo "That token looks too short (${#TOKEN} characters), so nothing was changed. Run this again."
  read -r -p "Press Return to close."; exit 1
fi

touch .env
grep -v -e '^CLAUDE_CODE_OAUTH_TOKEN=' -e '^BACC_CLAUDE_AUTH=' .env > .env.tmp || true
printf 'CLAUDE_CODE_OAUTH_TOKEN="%s"\nBACC_CLAUDE_AUTH="plan"\n' "$TOKEN" >> .env.tmp
mv .env.tmp .env
unset TOKEN

echo "Step 2 of 2: restarting the accelerator on your plan..."
docker compose up -d app
echo
echo "Done. The agents, Generate and document reviews now use your Claude plan."
read -r -p "Press Return to close this window."
