#!/bin/bash
# Prepare a Claude Code on the web session that works in this repository.
#
# The MCP server needs no build here: .mcp.json launches the committed bundle
# at server/index.js, which `npm run check:bundle` keeps equal to src/. This
# hook installs the dev dependencies so the gate (`npm run verify`) can run.
#
# When this repository is installed as a plugin, the plugin's own definition in
# .claude-plugin/plugin.json replaces the `kie-ai` entry in .mcp.json, and the
# plugin's hook (hooks/hooks.json) runs instead of this one.
set -euo pipefail

# Remote (Claude Code on the web) only. A local checkout installs on demand.
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

# Tell the reader why the MCP server may still not connect, since the hook
# cannot supply a secret: the key is set on the environment, not in the repo.
if [ -z "${KIE_AI_API_KEY:-}" ]; then
  echo "NOTE: KIE_AI_API_KEY is not set on this environment, so the kie-ai MCP" >&2
  echo "      server will not start. Set it in the Claude Code environment's" >&2
  echo "      variables." >&2
fi
