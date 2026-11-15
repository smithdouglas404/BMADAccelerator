#!/usr/bin/env bash
# Downloads the pinned BMAD Method v7 skills, the Test Architect (TEA) and Creative
# Intelligence Suite (CIS) modules, and the ECC skills library into vendor/.
# BMAD runs unmodified: these folders are copied as-is into each use case's workspace.
set -euo pipefail
cd "$(dirname "$0")/.."
BMAD_REPO="https://github.com/bmad-code-org/BMAD-METHOD"
BMAD_SHA="${BMAD_SHA:-e435a22574fe55722841086e5566420178b98df3}"
TEA_REPO="https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise"
TEA_SHA="${TEA_SHA:-5cbb9b416e120993affcc704505e58af4f213dfb}"
CIS_REPO="https://github.com/bmad-code-org/bmad-module-creative-intelligence-suite"
CIS_SHA="${CIS_SHA:-658e71030be808181c1031f5461ee3613e7ff530}"
ECC_REPO="https://github.com/affaan-m/everything-claude-code"
ECC_SHA="${ECC_SHA:-d2ef2680594f9a17526a6e1a2e18b3d242c5d17b}"
# Anthropic's official skills (Apache 2.0): Generate uses frontend-design.
ANTHROPIC_SKILLS_REPO="https://github.com/anthropics/skills"
ANTHROPIC_SKILLS_SHA="${ANTHROPIC_SKILLS_SHA:-1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064}"

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

fetch "$BMAD_REPO" "$BMAD_SHA" vendor/bmad
fetch "$TEA_REPO" "$TEA_SHA" vendor/tea
fetch "$CIS_REPO" "$CIS_SHA" vendor/cis
fetch "$ECC_REPO" "$ECC_SHA" vendor/ecc
fetch "$ANTHROPIC_SKILLS_REPO" "$ANTHROPIC_SKILLS_SHA" vendor/anthropic
echo "vendor ready: BMAD ${BMAD_SHA:0:7}, TEA ${TEA_SHA:0:7}, CIS ${CIS_SHA:0:7}, ECC ${ECC_SHA:0:7}, Anthropic skills ${ANTHROPIC_SKILLS_SHA:0:7}"
