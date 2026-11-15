#!/bin/bash
# Double-click this file (in Finder) to run the accelerator's agents on your own Claude plan.
# It signs you in, saves the sign-in token into .env without showing it, and restarts the app.
cd "$(dirname "$0")/.." || exit 1
set -e

echo "Step 1 of 3: a browser opens. Sign in with your Claude account and approve."
echo "When this window shows a long token starting with sk-ant-oat, copy it."
echo
if command -v claude >/dev/null 2>&1; then claude setup-token; else npx -y @anthropic-ai/claude-code setup-token; fi
echo
echo "Step 2 of 3: paste the token below and press Return (it won't show while you paste)."
read -r -s -p "Token: " TOKEN
echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then echo "No token pasted. Nothing changed."; read -r -p "Press Return to close."; exit 1; fi

touch .env
grep -v -e '^CLAUDE_CODE_OAUTH_TOKEN=' -e '^BACC_CLAUDE_AUTH=' .env > .env.tmp || true
printf 'CLAUDE_CODE_OAUTH_TOKEN="%s"\nBACC_CLAUDE_AUTH="plan"\n' "$TOKEN" >> .env.tmp
mv .env.tmp .env
unset TOKEN

echo "Step 3 of 3: restarting the accelerator on your plan..."
docker compose up -d app
echo
echo "Done. The agents, Generate and document reviews now use your Claude plan."
read -r -p "Press Return to close this window."
