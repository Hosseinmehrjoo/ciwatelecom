#!/usr/bin/env bash
# ONE-TIME (needs sudo): mount the project disk on a FIXED path so reboot never
# depends on udisks names like ntfs11 / ntfs12.
#
#   sudo ./scripts/install/install-stable-mount.sh
#
# After this, the project is always at: /media/ciwa/my-projects/telecom
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "با sudo اجرا کنید: sudo $0" >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MARKER="$REPO/runtime/asterisk/sbin/asterisk"
if [[ ! -x "$MARKER" ]]; then
  echo "این اسکریپت را از روی خود دیسک پروژه اجرا کنید (باینری Asterisk پیدا نشد)." >&2
  exit 1
fi

SOURCE="$(findmnt -no SOURCE --target "$REPO" 2>/dev/null || true)"
UUID="$(findmnt -no UUID --target "$REPO" 2>/dev/null || true)"
FSTYPE="$(findmnt -no FSTYPE --target "$REPO" 2>/dev/null || true)"
if [[ -z "$UUID" ]]; then
  echo "UUID پارتیشن پروژه پیدا نشد." >&2
  exit 1
fi

MOUNT_POINT=/media/ciwa
mkdir -p "$MOUNT_POINT"

# Prefer ntfs3 like the system already uses for "New Volume".
OPTS='defaults,uid=1000,gid=1000,dmask=0000,fmask=0000,iocharset=utf8,nofail,x-systemd.device-timeout=45'
if [[ "$FSTYPE" == fuseblk || "$FSTYPE" == ntfs ]]; then
  # Keep working even if ntfs3 driver option set differs.
  FSTYPE_LINE=ntfs3
else
  FSTYPE_LINE="$FSTYPE"
fi

FSTAB_LINE="UUID=$UUID $MOUNT_POINT $FSTYPE_LINE $OPTS 0 0"
if grep -q " $MOUNT_POINT " /etc/fstab 2>/dev/null; then
  sed -i "\| $MOUNT_POINT |d" /etc/fstab
fi
echo "$FSTAB_LINE" >> /etc/fstab

# Mount now (may already be mounted elsewhere — bind or remount to fixed path).
if ! findmnt "$MOUNT_POINT" >/dev/null 2>&1; then
  mount "$MOUNT_POINT" || mount -t "$FSTYPE_LINE" -o "$OPTS" "UUID=$UUID" "$MOUNT_POINT"
fi

STABLE="$MOUNT_POINT/my-projects/telecom"
if [[ ! -x "$STABLE/runtime/asterisk/sbin/asterisk" ]]; then
  echo "بعد از mount، مسیر $STABLE کامل نیست. ساختار دیسک را چک کنید." >&2
  exit 1
fi

mkdir -p /etc/ciwa /usr/local/lib/ciwa
printf '%s\n' "$STABLE" > /etc/ciwa/home
cat > /etc/ciwa/env <<EOF
CIWA_HOME=$STABLE
CIWA_STATE_DIR=/etc/ciwa
CIWA_BOOT_WAIT_SECONDS=480
EOF

install -m 755 "$STABLE/scripts/install/ciwa-boot.sh" /usr/local/lib/ciwa/ciwa-boot.sh
install -m 755 "$STABLE/scripts/install/ciwa-find-home.sh" /usr/local/lib/ciwa/ciwa-find-home.sh
install -m 644 "$STABLE/deploy/systemd/ciwa.service" /etc/systemd/system/ciwa.service

# Make the system unit wait for the fixed mount.
mkdir -p /etc/systemd/system/ciwa.service.d
cat > /etc/systemd/system/ciwa.service.d/override.conf <<EOF
[Unit]
RequiresMountsFor=$MOUNT_POINT
After=media-ciwa.mount local-fs.target docker.service
EOF

systemctl daemon-reload
systemctl enable docker.service ciwa.service
systemctl restart ciwa.service || true

echo
echo "==> مسیر ثابت: $STABLE"
echo "==> UUID=$UUID ($SOURCE)"
echo "==> fstab: $FSTAB_LINE"
echo
echo "از این به بعد بعد از ری‌استارت، اسم ntfsN مهم نیست."
echo "وضعیت: systemctl status ciwa"
echo "لاگ:    journalctl -u ciwa -e"
