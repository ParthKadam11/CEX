#!/usr/bin/env bash
# Run once on the VPS (needs sudo): restore paperdesk nginx vhosts + harden gateway.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENABLED=/etc/nginx/sites-enabled

sudo ln -sfn "$ROOT/paperdesk.conf" "$ENABLED/paperdesk.conf"
sudo ln -sfn "$ROOT/gateway-paperdesk.conf" "$ENABLED/gateway-paperdesk.conf"
# legacy samples already linked; papertrade-gw.conf is edited in place via the symlink

sudo nginx -t
sudo systemctl reload nginx
echo "nginx reloaded
