#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "[1/3] Starting debug log server..."
node debug-log-server.js &
DEBUG_SERVER_PID=$!
echo "  Debug log server PID: $DEBUG_SERVER_PID"

cleanup() {
  echo "Stopping debug log server (PID $DEBUG_SERVER_PID)..."
  kill "$DEBUG_SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "[2/3] Rebuilding libs..."
npm run build:libs

echo "[3/3] Starting extension dev mode..."
echo ""
echo "====================================================="
echo "  Debug log server: http://localhost:7373"
echo "  Logs written to:  debug.log (project root)"
echo "  Clear logs:       GET http://localhost:7373/clear"
echo "====================================================="
echo ""
npm run dev:ext
