#!/usr/bin/env bash
# Run the built Asterisk binary inside a container with matching libs.
# IMPORTANT: restart policy is "no". Docker must NOT auto-start this after reboot
# while the data disk is still missing (NTFS remounts as ntfsN). ciwa-boot.sh
# is responsible for starting Asterisk once the project path is real.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="${CIWA_ASTERISK_NAME:-ciwa-asterisk}"
BASE_IMAGE="${CIWA_BUILD_BASE_IMAGE:-postgres:16}"
PREFIX="$REPO/runtime/asterisk"
CONF_DIR="$REPO/config/asterisk"
VAR_LIB="$REPO/runtime/asterisk-var/lib"
SPOOL="$REPO/runtime/asterisk-var/spool"
RUNDIR="$REPO/runtime/asterisk-var/run"
LOGDIR="$REPO/logs/asterisk"

# After power loss the NTFS volume can appear a few seconds after Docker starts.
for _ in $(seq 1 90); do
  if [[ -x "$PREFIX/sbin/asterisk" ]]; then
    break
  fi
  sleep 1
done
if [[ ! -x "$PREFIX/sbin/asterisk" ]]; then
  echo "Missing $PREFIX/sbin/asterisk — disk not mounted or build missing (scripts/install/build-asterisk-docker.sh)" >&2
  exit 1
fi

# Refuse to start against an empty stub directory created by Docker on the root fs.
size="$(du -sb "$PREFIX" 2>/dev/null | awk '{print $1}')"
if [[ -z "$size" || "$size" -lt 1000000 ]]; then
  echo "Asterisk prefix looks empty ($PREFIX size=${size:-0}). Wrong mount point?" >&2
  exit 1
fi

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

mkdir -p "$VAR_LIB" "$SPOOL" "$RUNDIR" "$LOGDIR"
chmod -R a+rX "$CONF_DIR" || true
chmod -R a+rwX "$REPO/runtime/asterisk-var" "$LOGDIR" || true

if ss -ltn | awk '$4 ~ /:5038$/ {found=1} END{exit !found}'; then
  echo "==> port 5038 busy; attempting to free"
  fuser -k 5038/tcp 2>/dev/null || true
  sleep 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null
fi

echo "==> starting $NAME as ${HOST_UID}:${HOST_GID} (restart=no; boot script owns lifecycle)"
docker run -d \
  --name "$NAME" \
  --network host \
  --user "${HOST_UID}:${HOST_GID}" \
  --restart no \
  -e LD_LIBRARY_PATH=/opt/ciwa-asterisk/lib \
  -v "$PREFIX:/opt/ciwa-asterisk:ro" \
  -v "$CONF_DIR:/etc/asterisk:rw" \
  -v "$VAR_LIB:/var/lib/asterisk:rw" \
  -v "$SPOOL:/var/spool/asterisk:rw" \
  -v "$REPO/storage/recordings:/var/spool/asterisk/monitor:rw" \
  -v "$RUNDIR:/var/run/asterisk:rw" \
  -v "$LOGDIR:/var/log/asterisk:rw" \
  --entrypoint /opt/ciwa-asterisk/sbin/asterisk \
  "$BASE_IMAGE" \
  -f -g -C /etc/asterisk/asterisk.conf

sleep 4
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Container exited:" >&2
  docker logs "$NAME" 2>&1 | tail -120 >&2 || true
  exit 1
fi

docker exec -e LD_LIBRARY_PATH=/opt/ciwa-asterisk/lib "$NAME" \
  /opt/ciwa-asterisk/sbin/asterisk -C /etc/asterisk/asterisk.conf -rx "core show version"

echo "==> $NAME is running (AMI 0.0.0.0:5038)"
