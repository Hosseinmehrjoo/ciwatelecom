#!/usr/bin/env bash
# Resolve CIWA project root even when the NTFS volume remounts as ntfsN after reboot.
set -euo pipefail

STATE_DIR="${CIWA_STATE_DIR:-/etc/ciwa}"
STATE_FILE="$STATE_DIR/home"
MARKER="runtime/asterisk/sbin/asterisk"

is_home() {
  local candidate="$1"
  [[ -n "$candidate" \
    && -x "$candidate/$MARKER" \
    && -f "$candidate/docker-compose.yml" \
    && -d "$candidate/backend" \
    && -d "$candidate/config/asterisk" ]] || return 1
  # Reject empty Docker stub dirs on the root filesystem.
  local size
  size="$(du -sb "$candidate/runtime/asterisk" 2>/dev/null | awk '{print $1}')"
  [[ -n "$size" && "$size" -gt 1000000 ]]
}

candidates=()

# Stable product paths first (sold installs + fixed UUID mount).
candidates+=(
  /opt/ciwa
  /media/ciwa/my-projects/telecom
  /media/ciwa/telecom
  /srv/ciwa
)

if [[ -n "${CIWA_HOME:-}" ]]; then
  candidates+=("$CIWA_HOME")
fi
if [[ -f "$STATE_FILE" ]]; then
  candidates+=("$(tr -d '\r\n' < "$STATE_FILE")")
fi
user_state="${XDG_STATE_HOME:-$HOME/.local/state}/ciwa/home"
if [[ -f "$user_state" ]]; then
  candidates+=("$(tr -d '\r\n' < "$user_state")")
fi

# When this script still lives inside the repo (scripts/install/...), use that tree.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == install && "$(basename "$(dirname "$SCRIPT_DIR")")" == scripts ]]; then
  candidates+=("$(cd "$SCRIPT_DIR/../.." && pwd)")
fi

# Search only telecom trees — never strip path segments by hand.
while IFS= read -r path; do
  candidates+=("${path%/$MARKER}")
done < <(
  find /media /mnt /opt /srv \
    \( -path '*/my-projects/telecom/runtime/asterisk/sbin/asterisk' \
       -o -path '*/telecom/runtime/asterisk/sbin/asterisk' \) \
    -type f 2>/dev/null | head -40
)

seen=""
for candidate in "${candidates[@]}"; do
  [[ -n "$candidate" ]] || continue
  case " $seen " in
    *" $candidate "*) continue ;;
  esac
  seen+=" $candidate"
  if is_home "$candidate"; then
    printf '%s\n' "$candidate"
    exit 0
  fi
done

echo "CIWA home not found (looking for $MARKER)" >&2
exit 1
