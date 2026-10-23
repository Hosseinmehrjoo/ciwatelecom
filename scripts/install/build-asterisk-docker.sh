#!/usr/bin/env bash
# Build Asterisk from core/asterisk inside an already-local container image.
# core/asterisk is mounted read-only; no source edits.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO/core/asterisk"
PREFIX="$REPO/runtime/asterisk"
BUILD="$REPO/runtime/src-build"
BASE_IMAGE="${CIWA_BUILD_BASE_IMAGE:-postgres:16}"

mkdir -p "$PREFIX" "$BUILD" "$REPO/runtime/asterisk-var" "$REPO/logs/asterisk"
rm -rf "$BUILD/asterisk"

if [[ ! -f "$SRC/configure" ]]; then
  echo "missing $SRC/configure" >&2
  exit 1
fi

echo "==> building with local image $BASE_IMAGE"
docker run --rm \
  --network host \
  -v "$SRC:/src:ro" \
  -v "$BUILD:/build" \
  -v "$PREFIX:/prefix" \
  -e DEBIAN_FRONTEND=noninteractive \
  "$BASE_IMAGE" \
  bash -lc '
    set -euo pipefail
    apt-get update
    apt-get install -y --no-install-recommends \
      build-essential pkg-config autoconf automake libtool \
      libedit-dev libncurses5-dev libxml2-dev libsqlite3-dev \
      libssl-dev uuid-dev wget curl ca-certificates file \
      libblocksruntime-dev python3
    rm -rf /build/asterisk
    mkdir -p /build /prefix
    cp -a /src /build/asterisk
    cd /build/asterisk
    ./configure \
      --prefix=/prefix \
      --sysconfdir=/prefix/etc \
      --localstatedir=/prefix/var \
      --with-jansson-bundled \
      --with-pjproject-bundled \
      --disable-xmldoc
    make menuselect.makeopts
    if [[ -x menuselect/menuselect ]]; then
      menuselect/menuselect --disable BUILD_NATIVE menuselect.makeopts || true
      menuselect/menuselect --disable-category MENUSELECT_CORE_SOUNDS menuselect.makeopts || true
      menuselect/menuselect --disable-category MENUSELECT_MOH menuselect.makeopts || true
      menuselect/menuselect --disable-category MENUSELECT_EXTRA_SOUNDS menuselect.makeopts || true
    fi
    make -j"$(nproc)"
    make install
    /prefix/sbin/asterisk -V
  '

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
echo "==> fixing ownership to ${HOST_UID}:${HOST_GID}"
docker run --rm --user root \
  -v "$PREFIX:/prefix" \
  -v "$BUILD:/build" \
  "$BASE_IMAGE" \
  bash -lc "chown -R ${HOST_UID}:${HOST_GID} /prefix /build || true"

# Free host build tree after install
rm -rf "$BUILD/asterisk"
echo "==> installed to $PREFIX"
"$PREFIX/sbin/asterisk" -V || true
