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

# 3. start the server in the background
echo "• starting visual-feedback server (root: $ROOT, port: $PORT)"
# setsid fully detaches the server into its own session, so it survives the parent
# shell exiting (e.g. devcontainer postStartCommand finishing, or a one-shot run).
setsid node "$TOOL_DIR/serve.js" --root "$ROOT" --port "$PORT" </dev/null >/tmp/vf-dev-serve.log 2>&1 &
sleep 1.5

# 4. best-effort: make the port public (needs gh 'codespace' scope; ok if it fails)
if [ -n "${CODESPACE_NAME:-}" ]; then
  if env -u GITHUB_TOKEN -u GH_TOKEN gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    echo "• port $PORT set PUBLIC"
  else
    echo "• (couldn't auto-public port $PORT — keep it Private and sign into GitHub on your phone, or toggle in the Ports panel)"
  fi
fi

# 5. compute the forwarded URL
DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
if [ -n "${CODESPACE_NAME:-}" ]; then
  URL="https://${CODESPACE_NAME}-${PORT}.${DOMAIN}/ferry.html?comment=1"
else
  URL="http://localhost:${PORT}/ferry.html?comment=1"
fi

echo
echo "  ▶ $URL"
echo
# 6. scannable QR right in the terminal (falls back silently if qrcode missing)
node -e "require('qrcode').toString(process.argv[1],{type:'terminal',small:true},(e,s)=>{if(!e)console.log(s)})" "$URL" 2>/dev/null || true
echo "Ready. Triple-tap on the page to summon the comment tools."
