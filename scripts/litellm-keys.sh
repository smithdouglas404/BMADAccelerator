#!/bin/zsh
# Creates one LiteLLM virtual key per Studio agent (with its models and a monthly budget) and saves them, never printing a key,
# in the git-ignored .env.litellm.keys of the main checkout. Safe to run again: an agent that already has a key is skipped.
# Usage: scripts/litellm-keys.sh   (LiteLLM must be running on 127.0.0.1:4000)
set -eu
ROOT=${BACC_ROOT:-/Users/smithdouglas404/Projects/BMADAccelerator}
set -a; . "$ROOT/.env.litellm"; set +a
OUT="$ROOT/.env.litellm.keys"
umask 077
touch "$OUT"
URL=${LITELLM_URL:-http://127.0.0.1:4000}
make() { # alias envname budget models(json array)
  if grep -q "^$2=" "$OUT"; then echo "$1: already has a key"; return; fi
  body=$(printf '{"key_alias":"%s","max_budget":%s,"budget_duration":"30d","models":%s,"metadata":{"agent":"%s"}}' "$1" "$3" "$4" "$1")
  key=$(curl -s -m 30 "$URL/key/generate" -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H 'Content-Type: application/json' -d "$body" | python3 -I -c 'import json,sys;print(json.load(sys.stdin).get("key",""))')
  [ -n "$key" ] || { echo "$1: key was not created"; return 1; }
  echo "$2=$key" >> "$OUT"
  echo "$1: key created (budget \$$3 / 30 days)"
}
make "Document reader" LITELLM_KEY_DOCUMENT_READER 5  '["claude-haiku-5-5"]'
make "Speech cleaner"  LITELLM_KEY_SPEECH_CLEANER  2  '["claude-haiku-5-5"]'
make "Image maker"     LITELLM_KEY_IMAGE_MAKER     10 '["gpt-image-2"]'
make "Mem0"            LITELLM_KEY_MEM0            5  '["gpt-4.1-mini","text-embedding-3-small"]'
make "Letta"           LITELLM_KEY_LETTA           5  '["claude-sonnet-5-5","claude-haiku-5-5","gpt-4.1-mini"]'
make "Agent service"   LITELLM_KEY_AGENT_SERVICE   10 '["claude-sonnet-5-5","claude-haiku-5-5","gpt-4.1-mini"]'
make "Studio writers"  LITELLM_KEY_WRITERS         10 '["claude-sonnet-5-5","claude-haiku-5-5"]'
