#!/usr/bin/env bash
# If AMI is down, rediscover the project and run boot again.
set -euo pipefail

LIB_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOT="$LIB_DIR/ciwa-boot.sh"

ami_ok() {
  ss -ltn 2>/dev/null | awk '$4 ~ /:5038$/ {found=1} END{exit !found}' || return 1
  python3 - <<'PY' 2>/dev/null
import socket
try:
    s = socket.create_connection(("127.0.0.1", 5038), 1.5)
    s.settimeout(1.5)
    s.recv(200)
    s.sendall(b"Action: Login\r\nUsername: ciwa\r\nSecret: ciwa\r\n\r\n")
    data = s.recv(400).decode(errors="ignore")
    s.close()
    raise SystemExit(0 if "Success" in data else 1)
except Exception:
    raise SystemExit(1)
PY
}

if ami_ok; then
  exit 0
fi

logger -t ciwa-watchdog -- "AMI down — running boot"
bash "$BOOT"
