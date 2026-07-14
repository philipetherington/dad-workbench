#!/usr/bin/env bash
# Workbench — development.
#
# Starts the Vite dev server and, once it is actually answering on :5173,
# opens the app in Electron. Ctrl-C stops both.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

export ELECTRON_START_URL="http://localhost:5173"

exec npx concurrently \
  --kill-others \
  --success first \
  --names "vite,app" \
  --prefix-colors "yellow,magenta" \
  "npm run dev" \
  "npx wait-on -t 60000 http://localhost:5173 && npx electron ."
