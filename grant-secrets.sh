#!/usr/bin/env bash
# claude-visual-feedback — grant a repo access to ALL your personal Codespaces secrets.
#
#   bash grant-secrets.sh [owner/repo]      # defaults to the current git repo
#
# Why this exists: a brand-new repo's Codespace can't grant itself secret access
# (its only tokens are the repo-scoped GITHUB_TOKEN and — once granted — VF_GH_PAT;
# neither can manage your account secrets on first boot). So the grant must run from
# a context that holds your account login. This script does it in one step and is
# FUTURE-PROOF: it enumerates every secret you have, so new secrets are included
# automatically without editing anything.
#
# Run it from a Codespace where you've done `gh auth login` (e.g. your main one).
# Needs the `codespace:secrets` scope; the script checks and tells you if it's missing.
set -euo pipefail

# Resolve the target repo (arg, else current git remote → owner/repo).
REPO="${1:-}"
if [ -z "$REPO" ]; then
  REPO="$(git config --get remote.origin.url 2>/dev/null \
    | sed -E 's#(\.git)?$##; s#^.*github\.com[:/]##')"
fi
[ -z "$REPO" ] && { echo "usage: bash grant-secrets.sh owner/repo"; exit 1; }

# Drop the auto-injected Codespace token (repo-scoped, can't manage account secrets)
# and use your full `gh auth login`.
GH() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }

# Verify the login can actually manage Codespaces secrets.
if ! GH api user/codespaces/secrets >/dev/null 2>&1; then
  echo "✗ Your gh login here can't manage Codespaces secrets (missing 'codespace:secrets' scope,"
  echo "  or you're not logged in on this Codespace)."
  echo "  Fix:  gh auth login                                  # if not logged in"
  echo "        gh auth refresh -h github.com -s codespace:secrets"
  echo "  …or just run this from your main Codespace, which is already logged in."
  exit 1
fi

REPO_ID="$(GH api "repos/$REPO" --jq .id 2>/dev/null || true)"
[ -z "$REPO_ID" ] && { echo "✗ couldn't resolve repo '$REPO' (typo, or login can't see it)"; exit 1; }
echo "• repo: $REPO (id $REPO_ID)"

SECRETS="$(GH api user/codespaces/secrets --jq '.secrets[].name')"
[ -z "$SECRETS" ] && { echo "• you have no Codespaces secrets yet — nothing to grant."; exit 0; }

echo "• granting access to every Codespaces secret:"
GRANTED=0
while IFS= read -r S; do
  [ -z "$S" ] && continue
  if GH api -X PUT "user/codespaces/secrets/$S/repositories/$REPO_ID" >/dev/null 2>&1; then
    echo "    ✓ $S"; GRANTED=$((GRANTED+1))
  else
    echo "    ✗ $S (failed)"
  fi
done <<< "$SECRETS"

echo "• done — granted $GRANTED secret(s)."
echo "  Restart this repo's Codespace once (Stop + Start) so the secrets inject and"
echo "  the port auto-publishes on boot."
