#!/bin/sh
# Prints the Studio's current public address for assistants on the web (Meta Muse, claude.ai).
# Start it first:  docker compose --profile public up -d
cd "$(dirname "$0")/.." || exit 1
url=$(docker compose --profile public logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
if [ -z "$url" ]; then echo "No public address yet. Run: docker compose --profile public up -d   then try again in 20 seconds." >&2; exit 1; fi
echo "$url"
echo "MCP connector:  $url/api/mcp"
echo "REST / OpenAPI: $url/api/v1/openapi.json"
