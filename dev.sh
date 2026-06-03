#!/usr/bin/env bash
# claude-visual-feedback — one-command dev/resume.
#
#   bash dev.sh [project-root] [port]
#
# Starts the comment+screenshot dev server (idempotent), forwards the port,
# best-effort sets it public, and prints the URL + a scannable terminal QR.
#
# This is also the script the starter-template devcontainer will call from
# postStartCommand, so the same automation works on a fresh Codespace.
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-/workspaces/seattle-ferry-tracker}"
PORT="${2:-3000}"

cd "$TOOL_DIR"

# 1. deps (no-op once installed)
if [ ! -d node_modules/playwright ]; then
  echo "• installing node deps…"; npm install >/tmp/vf-dev-npm.log 2>&1 || true
fi

# 2. stop any existing server on the port (target the PID, not a name pattern)
PID="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
if [ -n "$PID" ]; then echo "• stopping existing server on :$PORT (pid $PID)"; kill $PID 2>/dev/null || true; sleep 1; fi

# 3. start the server in the background, then verify it actually comes up.
# setsid fully detaches the server into its own session, so it survives the parent
# shell exiting (e.g. devcontainer postStartCommand finishing, or a one-shot run).
# --out writes comments INTO the served project (not the tool dir), so each repo's
# own Claude sees its own .vf-comments.json in its own workspace.
start_server() {
  setsid node "$TOOL_DIR/serve.js" --root "$ROOT" --port "$PORT" --out "$ROOT/.vf-comments.json" </dev/null >/tmp/vf-dev-serve.log 2>&1 &
}
echo "• starting visual-feedback server (root: $ROOT, port: $PORT)"
start_server
# On a fresh Codespace the first detached launch can get reaped before it settles,
# so health-check the port and relaunch once if nothing is listening yet. curl
# returns 0 as soon as the server answers HTTP (even a 404), non-zero if refused.
UP=""
for attempt in 1 2 3 4 5 6 7 8; do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then UP=1; break; fi
  if [ "$attempt" = 4 ]; then echo "• server not up yet — relaunching once"; start_server; fi
  sleep 1
done
if [ -n "$UP" ]; then echo "• server listening on :$PORT"; else echo "• WARNING: server did not come up — see /tmp/vf-dev-serve.log"; fi

# 4. auto-publish the port. Needs a token with 'codespace' scope. Set a Codespaces
#    secret VF_GH_PAT (a PAT with the codespace scope) and it works automatically in
#    every Codespace — like the Figma secret. Falls back to the stored gh login.
if [ -n "${CODESPACE_NAME:-}" ]; then
  PUB=""
  # gh exits 0 even on failure, and the port tunnel may not be ready the instant the
  # server starts — so attempt + VERIFY, retrying while the tunnel comes up.
  for attempt in 1 2 3 4 5 6; do
    if [ -n "${VF_GH_PAT:-}" ]; then
      GH_TOKEN="$VF_GH_PAT" gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
      if GH_TOKEN="$VF_GH_PAT" gh codespace ports -c "$CODESPACE_NAME" 2>/dev/null | grep -E "(^|[[:space:]])$PORT[[:space:]]" | grep -q public; then PUB=1; fi
    else
      env -u GITHUB_TOKEN -u GH_TOKEN gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
      if env -u GITHUB_TOKEN -u GH_TOKEN gh codespace ports -c "$CODESPACE_NAME" 2>/dev/null | grep -E "(^|[[:space:]])$PORT[[:space:]]" | grep -q public; then PUB=1; fi
    fi
    if [ -n "$PUB" ]; then break; fi
    sleep 4
  done
  if [ -n "$PUB" ]; then echo "• port $PORT PUBLIC"; else echo "• port $PORT not public (no VF_GH_PAT secret, or port not forwarded yet)"; fi
fi

# 5. compute the forwarded URL. Detect the project's entry page instead of
#    hardcoding a filename: index.html wins, else a lone *.html at the root,
#    else the bare URL (a fresh project may not have a page yet).
ENTRY=""
if [ -f "$ROOT/index.html" ]; then
  ENTRY="index.html"
else
  shopt -s nullglob
  HTMLS=("$ROOT"/*.html)
  shopt -u nullglob
  if [ "${#HTMLS[@]}" -eq 1 ]; then ENTRY="$(basename "${HTMLS[0]}")"; fi
fi
if [ -n "$ENTRY" ]; then PATHQ="/${ENTRY}?comment=1"; else PATHQ="/?comment=1"; fi

DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
if [ -n "${CODESPACE_NAME:-}" ]; then
  URL="https://${CODESPACE_NAME}-${PORT}.${DOMAIN}${PATHQ}"
else
  URL="http://localhost:${PORT}${PATHQ}"
fi

echo
echo "  ▶ $URL"
[ -z "$ENTRY" ] && echo "  (no .html page at the project root yet — add one, then reload this URL with that filename)"
echo
# 6. scannable QR right in the terminal (falls back silently if qrcode missing)
node -e "require('qrcode').toString(process.argv[1],{type:'terminal',small:true},(e,s)=>{if(!e)console.log(s)})" "$URL" 2>/dev/null || true
echo "Ready. Triple-tap on the page to summon the comment tools."
