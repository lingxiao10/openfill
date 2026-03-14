#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Rebuilding libs..."
npm run build:libs

echo "Starting extension dev mode..."
npm run dev:ext
