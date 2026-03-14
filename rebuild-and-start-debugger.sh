#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "[debugger mode] Rebuilding libs..."
npm run build:libs

echo "[debugger mode] Starting extension dev mode..."
export BUILD_MODE=debugger
npm run dev:ext
