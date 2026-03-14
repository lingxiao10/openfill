#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Starting extension dev mode..."
npm run dev:ext
