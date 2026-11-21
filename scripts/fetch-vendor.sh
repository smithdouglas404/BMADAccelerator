#!/usr/bin/env bash
# Downloads the pinned ECC skills library, Anthropic's design skill and the Inngest AgentKit docs into
# vendor/. The Studio copies what each product needs into its workspace.
set -euo pipefail
cd "$(dirname "$0")/.."
# Our own copy of ECC (private, smithdouglas404/eccsmith, imported from the public project at the same commit).
# If it cannot be reached without a sign-in (a Docker build has none), the build falls back to the public project at the
# same pinned commit, which has identical ECC content; the Studio's own skills come from this repo's studio-skills/.
ECC_REPO="${ECC_REPO:-https://github.com/smithdouglas404/eccsmith}"
ECC_UPSTREAM="https://github.com/affaan-m/everything-claude-code"
ECC_SHA="${ECC_SHA:-d2ef2680594f9a17526a6e1a2e18b3d242c5d17b}"
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
  # A private repo needs a token: ECC_GITHUB_TOKEN (read-only) goes in a request header, never in the URL, a log or a file.
  local auth=()
  if [ -n "${ECC_GITHUB_TOKEN:-}" ] && [ "$repo" = "$ECC_REPO" ]; then
    auth=(-c "http.extraHeader=Authorization: Basic $(printf 'x-access-token:%s' "$ECC_GITHUB_TOKEN" | base64 -w0)")
  fi
  git "${auth[@]}" -C "$dest" fetch -q --depth 1 origin "$sha"
  git -C "$dest" checkout -q FETCH_HEAD
  rm -rf "$dest/.git"
  echo "$sha" > "$dest/.pinned"
}

GIT_TERMINAL_PROMPT=0 fetch "$ECC_REPO" "$ECC_SHA" vendor/ecc 2>/dev/null \
  || { echo "our ECC copy is not reachable from here; using the public ECC at the same commit"; fetch "$ECC_UPSTREAM" "$ECC_SHA" vendor/ecc; }
fetch "$ANTHROPIC_SKILLS_REPO" "$ANTHROPIC_SKILLS_SHA" vendor/anthropic
fetch "$AGENTKIT_REPO" "$AGENTKIT_SHA" vendor/agentkit
echo "vendor ready: ECC ${ECC_SHA:0:7}, Anthropic skills ${ANTHROPIC_SKILLS_SHA:0:7}, AgentKit ${AGENTKIT_SHA:0:7}"
