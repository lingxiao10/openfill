#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "[standard mode] Building extension..."
npm run build:ext

echo "Copying zip to .output..."
mkdir -p .output
for f in packages/extension/.output/*.zip; do
  [ -f "$f" ] || continue
  cp -f "$f" .output/
  echo "Copied: $(basename "$f")"
done

echo ""
echo "Done! ZIP is in: $(pwd)/.output/"

if command -v open &>/dev/null; then
  open .output
elif command -v xdg-open &>/dev/null; then
  xdg-open .output
fi
