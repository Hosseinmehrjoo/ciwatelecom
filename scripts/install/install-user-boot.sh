#!/usr/bin/env bash
# Install / refresh the per-user systemd unit (no root required).
# Linger must be enabled so the unit runs after reboot without login:
#   loginctl enable-linger "$USER"
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LIB_DIR="$HOME/.local/lib/ciwa"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/ciwa"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/ciwa.service"

if [[ ! -x "$REPO/runtime/asterisk/sbin/asterisk" ]]; then
  echo "Asterisk binary missing in $REPO" >&2
  exit 1
fi

mkdir -p "$LIB_DIR" "$STATE_DIR" "$UNIT_DIR"
install -m 755 "$REPO/scripts/install/ciwa-boot.sh" "$LIB_DIR/ciwa-boot.sh"
install -m 755 "$REPO/scripts/install/ciwa-find-home.sh" "$LIB_DIR/ciwa-find-home.sh"
install -m 755 "$REPO/scripts/install/ciwa-watchdog.sh" "$LIB_DIR/ciwa-watchdog.sh"
printf '%s\n' "$REPO" > "$STATE_DIR/home"

cat > "$UNIT" <<EOF
[Unit]
Description=CIWA Telecom stack (Asterisk + panel + TFTP)
After=default.target
Wants=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=CIWA_STATE_DIR=$STATE_DIR
Environment=CIWA_BOOT_WAIT_SECONDS=480
Environment=CIWA_BOOT_POLL_SECONDS=3
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=$LIB_DIR/ciwa-boot.sh
ExecStop=/bin/bash -c 'HOME_DIR="\$(cat $STATE_DIR/home 2>/dev/null || true)"; if [[ -n "\$HOME_DIR" ]]; then docker compose -f "\$HOME_DIR/docker-compose.yml" --project-directory "\$HOME_DIR" stop || true; fi; docker stop ciwa-asterisk >/dev/null 2>&1 || true'
TimeoutStartSec=900
Restart=on-failure
RestartSec=20

[Install]
WantedBy=default.target
EOF

cat > "$UNIT_DIR/ciwa-watchdog.service" <<EOF
[Unit]
Description=CIWA AMI watchdog

[Service]
Type=oneshot
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=CIWA_STATE_DIR=$STATE_DIR
ExecStart=$LIB_DIR/ciwa-watchdog.sh
EOF

cat > "$UNIT_DIR/ciwa-watchdog.timer" <<EOF
[Unit]
Description=Run CIWA AMI watchdog every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable ciwa.service ciwa-watchdog.timer
loginctl enable-linger "$USER" >/dev/null 2>&1 || true
systemctl --user restart ciwa.service
systemctl --user restart ciwa-watchdog.timer
systemctl --user --no-pager --full status ciwa.service || true
systemctl --user --no-pager --full status ciwa-watchdog.timer || true

echo
echo "نصب شد. بعد از ری‌استارت، سرویس کاربری ciwa کل استک را بالا می‌آورد."
echo "وضعیت: systemctl --user status ciwa"
echo "نگهبان: systemctl --user status ciwa-watchdog.timer"
echo "لاگ:    journalctl --user -u ciwa -e"
echo
echo "برای نصب کامل و مسیر ثابت دیسک (پیشنهادی تحویل مشتری):"
echo "  sudo ./scripts/install/install-stable-mount.sh"
echo "  sudo ./scripts/install/install-boot-services.sh"
