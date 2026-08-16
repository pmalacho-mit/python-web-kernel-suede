#!/usr/bin/env bash
set -euo pipefail

# The kernel needs SharedArrayBuffer, which a browser only exposes to a
# cross-origin isolated page on an origin it trusts. The report drives a browser
# in a sibling container, which would otherwise reach this dev server over plain
# HTTP at its LAN address — an origin no browser trusts. Forwarding the port
# onto the browser's own loopback address turns it into one that is trusted.

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT="${PORT:-5173}"
CONTAINER="chromium-sweater-vest-$(hostname)"
IMAGE="browser-control-chromium:latest"
CONTEXT="sweater-vest-suede.browser-control-container-suede/docker"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE"
  docker build -t "$IMAGE" --build-arg BROWSER=chromium "$CONTEXT"
fi

GATEWAY="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"

echo "Starting $CONTAINER with localhost:$PORT forwarded to $GATEWAY:$PORT"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" "$IMAGE" bash -c "tail -f /dev/null" >/dev/null

docker exec -d "$CONTAINER" node -e "
const net = require('net');
net
  .createServer((browser) => {
    const server = net.connect($PORT, '$GATEWAY');
    browser.pipe(server);
    server.pipe(browser);
    browser.on('error', () => {});
    server.on('error', () => {});
  })
  .listen($PORT, '127.0.0.1');
"

reachable() {
  docker exec "$CONTAINER" node -e "
    fetch('http://localhost:$PORT/').then(() => process.exit(0), () => process.exit(1));
  " >/dev/null 2>&1
}

for _ in $(seq 1 30); do
  reachable && break
  sleep 1
done

reachable || {
  echo "The dev server is not reachable from the browser container." >&2
  echo "Start it with 'npm run dev' and try again." >&2
  exit 1
}

npm run report -- --server "http://localhost:$PORT" --closet /tests "$@"
