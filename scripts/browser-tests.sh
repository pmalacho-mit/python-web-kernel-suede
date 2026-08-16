#!/usr/bin/env bash
set -euo pipefail

# Runs the sweater-vest report against a dev server that is already running.
# See browser-container.sh for why the browser reaches it over loopback.

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT="${PORT:-5173}"

./scripts/browser-container.sh

npm run report -- --server "http://localhost:$PORT" --closet /tests "$@"
