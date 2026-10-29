#!/usr/bin/env bash
# Read-only TFTP for Cisco 7942 / 7962. Phones request SEP<MAC>.cnf.xml from UDP/69.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="$REPO/tftp"
PORT="${CIWA_TFTP_PORT:-69}"
mkdir -p "$ROOT"

if [[ ! -e "$ROOT/dialplan.xml" ]]; then
  echo "No dialplan.xml yet. Save a Cisco extension in the panel first." >&2
fi

echo "Serving $ROOT on UDP ${PORT}"
echo "DHCP option 150 must be this server's LAN address."
echo "Copy the SIP42 firmware files (*.loads, *.sbn, *.zz) into $ROOT"
exec node "$REPO/backend/services/asterisk/tftpServer.js" "$ROOT" "$PORT"
