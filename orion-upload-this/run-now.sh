#!/usr/bin/env bash
set -e
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         Orion Browser v2             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

if ! command -v node &>/dev/null; then
  echo "  ERROR: Node.js not found."
  echo "  Install from https://nodejs.org then re-run."
  exit 1
fi
echo "  Node: $(node --version)"

if [ ! -f "node_modules/.bin/electron" ] && [ ! -f "node_modules/electron/dist/electron" ]; then
  echo ""
  echo "  First run — downloading Electron (~100MB)..."
  npm install --prefer-offline
fi

echo ""
echo "  Launching Orion..."
echo ""
npx electron .
