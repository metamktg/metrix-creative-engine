#!/usr/bin/env bash
# Create metamktg/metrix-creative-engine on GitHub and push this repo to it.
#
# Why this script exists: the Claude Code session that built this repo runs
# behind a proxy that only allows repository-scoped GitHub API calls, against
# repositories the session is already bound to. Creating a NEW repository is
# blocked there no matter what permissions the user grants, so the final step
# has to run from a machine with your own credentials. This is that step.
#
# Safe to re-run: it will not clobber an existing repository, and it refuses to
# push over a remote that already has commits unless you pass --force-existing.

set -euo pipefail

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }

# Check we are in a repo BEFORE running any git command, so a wrong directory
# gives this message rather than a raw "fatal: not a git repository".
git rev-parse --git-dir >/dev/null 2>&1 || die "run this from inside the repository (no .git here)"

OWNER="${OWNER:-metamktg}"
REPO="${REPO:-metrix-creative-engine}"
VISIBILITY="${VISIBILITY:-private}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
FORCE_EXISTING="${1:-}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  die "you have uncommitted changes. Commit or stash them first."
fi

echo "About to publish:"
echo "  repository : $OWNER/$REPO ($VISIBILITY)"
echo "  branch     : $BRANCH"
echo "  commits    : $(git rev-list --count HEAD)"
echo

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Using the gh CLI."
  if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
    echo "Repository already exists."
    if [ -n "$(gh api "repos/$OWNER/$REPO/commits" --jq 'length' 2>/dev/null || echo 0)" ] \
       && [ "$(gh api "repos/$OWNER/$REPO/commits" --jq 'length' 2>/dev/null || echo 0)" != "0" ] \
       && [ "$FORCE_EXISTING" != "--force-existing" ]; then
      die "$OWNER/$REPO already has commits. Re-run with --force-existing if you really mean to push over it."
    fi
  else
    echo "Creating $OWNER/$REPO ..."
    gh repo create "$OWNER/$REPO" "--$VISIBILITY" \
      --description "MCP server and Claude Code skills for generating ad creative through Kie.ai" \
      --disable-wiki
  fi
else
  # Fallback: a classic PAT with the `repo` scope, from https://github.com/settings/tokens
  [ -n "${GITHUB_TOKEN:-}" ] || die "no usable gh CLI login, and GITHUB_TOKEN is not set.
Either run 'gh auth login', or export a personal access token with the 'repo' scope:
  export GITHUB_TOKEN=ghp_xxx"

  echo "Using GITHUB_TOKEN against the REST API."
  private=true; [ "$VISIBILITY" = "public" ] && private=false
  code=$(curl -sS -o /tmp/ghcreate.json -w '%{http_code}' \
    -X POST https://api.github.com/user/repos \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$REPO\",\"private\":$private,\"has_wiki\":false,\"auto_init\":false,\"description\":\"MCP server and Claude Code skills for generating ad creative through Kie.ai\"}")
  case "$code" in
    201) echo "Created $OWNER/$REPO." ;;
    422) echo "Repository already exists, continuing." ;;
    *)   cat /tmp/ghcreate.json >&2; die "repository creation failed (HTTP $code)" ;;
  esac
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$OWNER/$REPO.git"
else
  git remote add origin "https://github.com/$OWNER/$REPO.git"
fi

echo "Pushing $BRANCH ..."
git push -u origin "$BRANCH"

echo
echo "Done: https://github.com/$OWNER/$REPO"
echo
echo "Next:"
echo "  pnpm install && pnpm run build"
echo "  cp .env.example .env      # add your key from https://kie.ai/api-key"
echo "  mkdir -p ~/.claude/skills && ln -s \"\$(pwd)/skills/\"* ~/.claude/skills/"
