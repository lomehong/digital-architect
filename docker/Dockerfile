# ---- oh-my-pi（omp 官方版）------------------------------------------------
# 官方仓库：https://github.com/can1357/oh-my-pi（omp.sh）
# npm 包：@oh-my-pi/pi-coding-agent（内置预编译 platform natives，无需本地 Rust）
#
# 国内网络三处加速（全部可用 --build-arg 切回官方源）：
#   1. NODE_IMAGE  基础镜像——新机器可改用加速站前缀，如
#                  --build-arg NODE_IMAGE=docker.1ms.run/library/node:24-bookworm-slim
#   2. APT_MIRROR  Debian 源（默认阿里云；官方值 deb.debian.org）
#   3. NPM_REGISTRY npm 源（默认 npmmirror 淘宝；官方值 https://registry.npmjs.org）
# ----------------------------------------------------------------------------

ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}

# APT_MIRROR 不带协议——sed 会把源协议统一改为 https（HTTP 大文件易被 QoS 掐断）
ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG NPM_REGISTRY=https://registry.npmmirror.com

ENV PUID=1000
ENV PGID=1000
ENV TZ=Asia/Shanghai

# ---- Debian 源切换（两段式：http 先装 CA 证书 → 再切 https 防大文件 QoS）----
# 段1：只换 host、保持 http 协议——slim 镜像无 ca-certificates，https 握手必败；
#      先经 http 源装上 CA 证书（选不会被 QoS 的镜像源，tuna 教育网实测 52Mbps）。
RUN set -eux; \
    for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; do \
      [ -f "$f" ] && sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}|g" "$f" || true; \
    done; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# 段2：协议升级 https（HTTP 大文件易被运营商 QoS 掐断，实测清华 https 52Mbps vs http 1.3KB/s）
RUN set -eux; \
    for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; do \
      [ -f "$f" ] && sed -i "s|http://${APT_MIRROR}|https://${APT_MIRROR}|g" "$f" || true; \
    done; \
    apt-get update

# ---- 系统依赖 ---------------------------------------------------------------
# bash/shell、TLS、git/ssh 工作流、findutils 补 slim 缺失；jq/gosu 供 entrypoint。
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    ripgrep \
    findutils \
    sudo \
    gosu \
    jq \
    python3 \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# ---- 安装 Bun（omp 运行时）+ 官方 oh-my-pi ---------------------------------
# npm 源走 npmmirror；omp 包内 natives 以平台子包预编译分发，无需本地 Rust。
RUN npm config set registry "${NPM_REGISTRY}" --location=global \
 && npm install -g bun \
 && bun --version \
 && npm install -g @oh-my-pi/pi-coding-agent \
 && npm cache clean --force

# ---- 运行用户与目录 --------------------------------------------------------
RUN deluser node 2>/dev/null || true \
  && delgroup node 2>/dev/null || true \
  && groupadd -g $PUID pi \
  && useradd -m -u $PGID -g pi -s /bin/bash pi \
  && usermod -aG sudo pi

COPY entrypoint.sh /usr/local/bin/omp-entrypoint.sh
RUN chmod +x /usr/local/bin/omp-entrypoint.sh

# omp 配置根：/home/pi/.omp（models.yml / config.yml / agent/auth）
VOLUME  /home/pi/.omp
VOLUME  /workspace
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/omp-entrypoint.sh"]
CMD ["sleep", "infinity"]
