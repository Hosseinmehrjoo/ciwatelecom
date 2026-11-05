#!/usr/bin/env bash
# Bring the whole CIWA stack up after power loss / reboot.
# Waits for the data disk, rediscovers the project path, recreates Asterisk with
# fresh bind mounts, then starts docker compose (API, UI, DB, TFTP).
set -euo pipefail

STATE_DIR="${CIWA_STATE_DIR:-/etc/ciwa}"
STATE_FILE="$STATE_DIR/home"
LOG_TAG="ciwa-boot"
WAIT_SECONDS="${CIWA_BOOT_WAIT_SECONDS:-480}"
SLEEP_SECONDS="${CIWA_BOOT_POLL_SECONDS:-3}"

log() {
  echo "[$LOG_TAG] $*"
  logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true
}

find_home() {
  local finder
  finder="$(cd "$(dirname "$0")" && pwd)/ciwa-find-home.sh"
  bash "$finder"
}

wait_for_home() {
  local deadline=$((SECONDS + WAIT_SECONDS))
  local home=""
  while (( SECONDS < deadline )); do
    if home="$(find_home 2>/dev/null)"; then
      printf '%s\n' "$home"
      return 0
    fi
    log "waiting for CIWA data disk... ($((deadline - SECONDS))s left)"
    # Stop broken Asterisk that Docker may have started against an empty stub path.
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx ciwa-asterisk; then
      docker rm -f ciwa-asterisk >/dev/null 2>&1 || true
    fi
    sleep "$SLEEP_SECONDS"
  done
  find_home
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "docker is not installed"
    exit 1
  fi
  if ! timeout 5 docker info >/dev/null 2>&1; then
    if [[ "${EUID:-$(id -u)}" -eq 0 ]] && command -v systemctl >/dev/null 2>&1; then
      log "starting docker"
      systemctl start docker || true
    fi
  fi
  local tries=0
  until timeout 5 docker info >/dev/null 2>&1; do
    tries=$((tries + 1))
    if (( tries > 90 )); then
      log "docker daemon did not become ready"
      exit 1
    fi
    sleep 1
  done
}

save_home() {
  local home="$1"
  if mkdir -p "$STATE_DIR" 2>/dev/null && printf '%s\n' "$home" > "$STATE_FILE" 2>/dev/null; then
    chmod 644 "$STATE_FILE" 2>/dev/null || true
  fi
  local user_state="${XDG_STATE_HOME:-$HOME/.local/state}/ciwa"
  mkdir -p "$user_state"
  printf '%s\n' "$home" > "$user_state/home"
}

asterisk_mount_ok() {
  local home="$1"
  local source
  source="$(docker inspect ciwa-asterisk --format '{{range .Mounts}}{{if eq .Destination "/opt/ciwa-asterisk"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
  [[ "$source" == "$home/runtime/asterisk" ]]
}

stack_mount_ok() {
  local home="$1"
  local source
  source="$(docker inspect telecom-api-1 --format '{{range .Mounts}}{{if eq .Destination "/app/config"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
  [[ "$source" == "$home/config" ]]
}

ami_listening() {
  ss -ltn 2>/dev/null | awk '$4 ~ /:5038$/ {found=1} END{exit !found}'
}

ami_login_ok() {
  python3 - <<'PY' 2>/dev/null
import socket
try:
    s = socket.create_connection(("127.0.0.1", 5038), 2)
    s.settimeout(2)
    s.recv(200)
    s.sendall(b"Action: Login\r\nUsername: ciwa\r\nSecret: ciwa\r\n\r\n")
    data = s.recv(500).decode(errors="ignore")
    s.close()
    raise SystemExit(0 if "Success" in data else 1)
except Exception:
    raise SystemExit(1)
PY
}

start_asterisk() {
  local home="$1"
  local script="$home/scripts/install/start-asterisk.sh"
  chmod +x "$script" 2>/dev/null || true
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx ciwa-asterisk \
    && asterisk_mount_ok "$home" \
    && ami_listening \
    && ami_login_ok; then
    log "Asterisk already healthy on $home — skipping recreate"
    return 0
  fi
  log "starting Asterisk from $home"
  bash "$script"
}

start_stack() {
  local home="$1"
  if stack_mount_ok "$home" \
    && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx telecom-api-1 \
    && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx telecom-web-1; then
    log "compose stack already healthy on $home — ensuring services are up"
    docker compose -f "$home/docker-compose.yml" --project-directory "$home" up -d
    return 0
  fi
  log "starting docker compose stack from $home"
  docker compose -f "$home/docker-compose.yml" --project-directory "$home" up -d --force-recreate --remove-orphans
}

wait_for_ami() {
  local tries=0
  while (( tries < 45 )); do
    if ami_listening && ami_login_ok; then
      log "AMI is accepting logins on 5038"
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done
  log "WARNING: AMI is not healthy yet"
  return 1
}

main() {
  log "boot sequence started"
  ensure_docker
  local home
  home="$(wait_for_home)"
  save_home "$home"
  export CIWA_HOME="$home"
  log "CIWA_HOME=$home"
  start_asterisk "$home"
  start_stack "$home"
  wait_for_ami || true
  log "boot sequence finished"
}

main "$@"
