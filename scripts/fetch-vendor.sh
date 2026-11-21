#!/usr/bin/env bash
# Downloads the pinned ECC skills library, Anthropic's design skill and the Inngest AgentKit docs into
# vendor/. The Studio copies what each product needs into its workspace.
set -euo pipefail
cd "$(dirname "$0")/.."
ECC_REPO="https://github.com/affaan-m/everything-claude-code"
# ECC main as of Nov 19 2026 (VERSION 2.2.3, MIT). To update: change the SHA and run this script;
# scripts/ecc-catalog.mjs then rebuilds the list the Skills screen shows from the pinned copy.
ECC_SHA="${ECC_SHA:-4adeee6732a12d1540f49a4d50a38ce8c97f9a53}"
# Anthropic's official skills (Apache 2.0): Generate uses frontend-design.
ANTHROPIC_SKILLS_REPO="https://github.com/anthropics/skills"
ANTHROPIC_SKILLS_SHA="${ANTHROPIC_SKILLS_SHA:-1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064}"
# Inngest AgentKit (Apache 2.0), release @inngest/agent-kit@0.13.2: the standard agentic harness for
# prototypes. Its docs and examples are the library the agents and Generate read.
AGENTKIT_REPO="https://github.com/inngest/agent-kit"
AGENTKIT_SHA="${AGENTKIT_SHA:-2320d07c6a86b9933d14b3cefd5fd44046e3ec17}"

fetch() { # repo sha dest
  local repo="$1" sha="$2" dest="$3"
  if [ -f "$dest/.pinned" ] && [ "$(cat "$dest/.pinned")" = "$sha" ]; then return; fi
  rm -rf "$dest" && mkdir -p "$dest"
  git -C "$dest" init -q
  git -C "$dest" remote add origin "$repo"
  git -C "$dest" fetch -q --depth 1 origin "$sha"
  git -C "$dest" checkout -q FETCH_HEAD
  rm -rf "$dest/.git"
  echo "$sha" > "$dest/.pinned"
}

fetch "$ECC_REPO" "$ECC_SHA" vendor/ecc
node scripts/ecc-catalog.mjs "$ECC_REPO" "$ECC_SHA"
fetch "$ANTHROPIC_SKILLS_REPO" "$ANTHROPIC_SKILLS_SHA" vendor/anthropic
fetch "$AGENTKIT_REPO" "$AGENTKIT_SHA" vendor/agentkit
echo "vendor ready: ECC ${ECC_SHA:0:7}, Anthropic skills ${ANTHROPIC_SKILLS_SHA:0:7}, AgentKit ${AGENTKIT_SHA:0:7}"
