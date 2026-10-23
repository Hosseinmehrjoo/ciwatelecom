# Build CIWA Asterisk from the mounted/copied core source.
# Source is provided at build context from a host-side copy under runtime/docker-src
# so core/asterisk itself is never used as Docker build context mutations target.

FROM debian:bookworm AS build
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config autoconf automake libtool \
    libedit-dev libncurses5-dev libxml2-dev libsqlite3-dev \
    libssl-dev uuid-dev wget curl ca-certificates file \
    libblocksruntime-dev python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/asterisk
COPY asterisk/ /usr/src/asterisk/

RUN ./configure \
      --prefix=/opt/ciwa-asterisk \
      --sysconfdir=/opt/ciwa-asterisk/etc \
      --localstatedir=/opt/ciwa-asterisk/var \
      --with-jansson-bundled \
      --with-pjproject-bundled \
      --disable-xmldoc \
 && make menuselect.makeopts \
 && menuselect/menuselect --disable BUILD_NATIVE menuselect.makeopts || true \
 && menuselect/menuselect --disable-category MENUSELECT_CORE_SOUNDS menuselect.makeopts || true \
 && menuselect/menuselect --disable-category MENUSELECT_MOH menuselect.makeopts || true \
 && menuselect/menuselect --disable-category MENUSELECT_EXTRA_SOUNDS menuselect.makeopts || true \
 && make -j$(nproc) \
 && make install

FROM debian:bookworm-slim
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    libedit2 libxml2 libsqlite3-0 libssl3 libjansson4 libncurses6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/ciwa-asterisk /opt/ciwa-asterisk
ENV PATH="/opt/ciwa-asterisk/sbin:$PATH"
VOLUME ["/etc/asterisk", "/var/lib/asterisk", "/var/log/asterisk", "/var/spool/asterisk"]
EXPOSE 5038/tcp 5060/udp 5060/tcp 10000-10100/udp
ENTRYPOINT ["/opt/ciwa-asterisk/sbin/asterisk"]
CMD ["-f", "-C", "/etc/asterisk/asterisk.conf"]
