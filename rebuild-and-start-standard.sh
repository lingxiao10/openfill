#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "[standard mode] Rebuilding libs..."
npm run build:libs

echo "[standard mode] Starting extension dev mode..."
npm run dev:ext
