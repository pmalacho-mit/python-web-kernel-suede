#!/usr/bin/env bash
set -euo pipefail

# Starts the container sweater-vest drives, wired so the pages it opens can
# actually run a kernel:
#
#   - The kernel needs SharedArrayBuffer, which a browser only exposes to a
#     cross-origin isolated page on an origin it trusts. Reaching the dev server
#     at its LAN address is not that, so the port is forwarded onto the
#     browser's own loopback address instead.
#   - Behind an intercepting proxy the browser also has to trust its CA, or the
#     workspaces that fetch Pyodide and its packages from a CDN load nothing.

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT="${PORT:-5173}"
CONTAINER="chromium-sweater-vest-$(hostname)"
IMAGE="browser-control-chromium:latest"
CONTEXT="sweater-vest-suede.browser-control-container-suede/docker"
PROXY_CA=/usr/local/share/ca-certificates/desolate-proxy.crt

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

if [ -f "$PROXY_CA" ]; then
  echo "Teaching the browser to trust $(basename "$PROXY_CA")"
  docker cp "$PROXY_CA" "$CONTAINER:/tmp/proxy-ca.crt" >/dev/null
  docker exec "$CONTAINER" bash -c '
    set -e
    command -v certutil >/dev/null 2>&1 ||
      { apt-get update -qq && apt-get install -y -qq libnss3-tools; } >/dev/null 2>&1
    mkdir -p "$HOME/.pki/nssdb"
    certutil -d sql:"$HOME/.pki/nssdb" -N --empty-password 2>/dev/null || true
    certutil -d sql:"$HOME/.pki/nssdb" -A -t "C,," -n proxy -i /tmp/proxy-ca.crt
  '
fi

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
