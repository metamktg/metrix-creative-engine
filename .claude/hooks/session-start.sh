#!/bin/bash
# Build the MCP server so `dist/index.js` exists before the session starts.
#
# Why this is needed: .mcp.json points the `kie-ai` MCP server at `dist/index.js`,
# which is gitignored because it is a build artifact. Without this hook a fresh
# web session has no built server, the MCP connection fails, and every kie-*
# skill is dead on arrival with a confusing "module not found".
set -euo pipefail

# Remote (Claude Code on the web) only. A local checkout builds on demand.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# pnpm is not guaranteed in the container. corepack ships with Node and is the
# cheapest way to get the version this repo pins in packageManager.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || npm install -g pnpm >/dev/null 2>&1
fi

pnpm install --prefer-offline
pnpm run build

# Tell the reader why the MCP server may still not connect, since the hook
# cannot supply a secret: the key is set on the environment, not in the repo.
if [ -z "${KIE_AI_API_KEY:-}" ]; then
  echo "NOTE: KIE_AI_API_KEY is not set on this environment, so the kie-ai MCP" >&2
  echo "      server will start but every tool call will fail with 401." >&2
  echo "      Set it in the Claude Code environment's variables." >&2
fi
