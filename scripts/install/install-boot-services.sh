#!/usr/bin/env bash
# Install systemd unit so CIWA comes back fully after power loss / reboot.
# Run once with sudo from the project tree:
#   sudo ./scripts/install/install-boot-services.sh
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "این اسکریپت را با sudo اجرا کنید." >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LIB_DIR=/usr/local/lib/ciwa
STATE_DIR=/etc/ciwa
UNIT_SRC="$REPO/deploy/systemd/ciwa.service"
UNIT_DST=/etc/systemd/system/ciwa.service

if [[ ! -x "$REPO/runtime/asterisk/sbin/asterisk" ]]; then
  echo "Asterisk binary missing in $REPO — first run scripts/install/build-asterisk-docker.sh" >&2
  exit 1
fi
if [[ ! -f "$UNIT_SRC" ]]; then
  echo "missing $UNIT_SRC" >&2
  exit 1
fi

mkdir -p "$LIB_DIR" "$STATE_DIR"
install -m 755 "$REPO/scripts/install/ciwa-boot.sh" "$LIB_DIR/ciwa-boot.sh"
install -m 755 "$REPO/scripts/install/ciwa-find-home.sh" "$LIB_DIR/ciwa-find-home.sh"
install -m 644 "$UNIT_SRC" "$UNIT_DST"

# Remember the current project path; boot rediscovers if the disk remounts as ntfsN.
printf '%s\n' "$REPO" > "$STATE_DIR/home"
cat > "$STATE_DIR/env" <<EOF
CIWA_HOME=$REPO
CIWA_STATE_DIR=$STATE_DIR
CIWA_BOOT_WAIT_SECONDS=300
EOF
chmod 644 "$STATE_DIR/home" "$STATE_DIR/env"

systemctl enable docker >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl enable ciwa.service

echo "==> installed ciwa.service"
echo "    home: $REPO"
echo "    lib:  $LIB_DIR"
echo "==> starting stack now"
systemctl restart ciwa.service
systemctl --no-pager --full status ciwa.service || true

echo
echo "بعد از هر ری‌استارت سرور، سرویس ciwa خودش بالا می‌آید."
echo "وضعیت: systemctl status ciwa"
echo "لاگ:    journalctl -u ciwa -e"
echo
echo "اگر sudo ندارید، همین کار با سرویس کاربری هم انجام می‌شود:"
echo "  systemctl --user status ciwa"
echo "  journalctl --user -u ciwa -e"
echo "و باید linger فعال باشد: loginctl show-user \"\$USER\" -p Linger"
