#!/usr/bin/env bash
# Build Asterisk from core/asterisk into runtime/ without editing source files.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO/core/asterisk"
PREFIX="$REPO/runtime/asterisk"
VARDIR="$REPO/runtime/asterisk-var"
JOBS="$(nproc)"

if [[ ! -f "$SRC/configure" ]]; then
  echo "missing $SRC/configure" >&2
  exit 1
fi

mkdir -p "$PREFIX" "$VARDIR" "$REPO/logs/asterisk" "$REPO/config/asterisk"

cd "$SRC"

echo "==> configure"
./configure \
  --prefix="$PREFIX" \
  --sysconfdir="$PREFIX/etc" \
  --localstatedir="$VARDIR" \
  --with-jansson-bundled \
  --with-pjproject-bundled \
  --disable-xmldoc

echo "==> menuselect defaults (non-interactive)"
make menuselect.makeopts
if [[ -x menuselect/menuselect ]]; then
  menuselect/menuselect \
    --enable BEST_CODEC \
    --disable BUILD_NATIVE \
    --disable-category MENUSELECT_CORE_SOUNDS \
    --disable-category MENUSELECT_MOH \
    --disable-category MENUSELECT_EXTRA_SOUNDS \
    menuselect.makeopts || true
fi

echo "==> make -j${JOBS}"
make -j"${JOBS}"

echo "==> make install (to $PREFIX)"
make install

echo "==> done"
"$PREFIX/sbin/asterisk" -V || true
