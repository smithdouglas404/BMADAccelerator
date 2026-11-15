#!/bin/sh
# Adds the passwords for the memory services (Mem0 and Letta) to .env, once. They never leave this
# computer and are never printed. Safe to run again: existing values are kept.
set -e
cd "$(dirname "$0")/.."
touch .env
add() {
  grep -q "^$1=" .env || printf '%s="%s"\n' "$1" "$(openssl rand -hex 32)" >> .env
}
add MEM0_ADMIN_API_KEY
add MEM0_JWT_SECRET
add LETTA_SERVER_PASSWORD
echo "Memory passwords are in .env."
