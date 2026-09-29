#!/usr/bin/env bash
# Run once on the VPS (needs sudo): restore paperdesk nginx vhosts + harden edges.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENABLED=/etc/nginx/sites-enabled
CONFD=/etc/nginx/conf.d

sudo ln -sfn "$ROOT/paperdesk.conf" "$ENABLED/paperdesk.conf"
sudo ln -sfn "$ROOT/gateway-paperdesk.conf" "$ENABLED/gateway-paperdesk.conf"
sudo cp -f "$ROOT/logs-paperdesk.conf" "$CONFD/logs-paperdesk.conf"

sudo nginx -t
sudo systemctl reload nginx
echo "nginx reloaded"
