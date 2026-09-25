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

# ---- 安装 Bun（omp 运行时）+ 官方 oh-my-pi + GitHub CLI --------------------
# npm 源走 npmmirror；omp 包内 natives 以平台子包预编译分发，无需本地 Rust。
# gh 供 omp github 工具与 archify 源码证据场景；下载域可经 ARG 切加速前缀。
ARG GH_VERSION=2.95.0
ARG GH_DOWNLOAD_BASE=https://github.com/cli/cli/releases/download
RUN npm config set registry "${NPM_REGISTRY}" --location=global \
 && npm install -g bun \
 && bun --version \
 && npm install -g @oh-my-pi/pi-coding-agent \
 && npm cache clean --force \
 && curl -fsSL "${GH_DOWNLOAD_BASE}/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" -o /tmp/gh.tgz \
 && tar -xzf /tmp/gh.tgz -C /tmp \
 && mv "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
 && rm -rf /tmp/gh.tgz "/tmp/gh_${GH_VERSION}_linux_amd64" \
 && gh --version

# ---- 运行用户与目录 --------------------------------------------------------
RUN deluser node 2>/dev/null || true \
  && delgroup node 2>/dev/null || true \
  && groupadd -g $PUID pi \
  && useradd -m -u $PGID -g pi -s /bin/bash pi \
  && usermod -aG sudo pi

# ---- Graphify 代码图谱 CLI（codebase-graph-* 技能依赖）---------------------
# AST 建图本地跑（tree-sitter）；语义提取可选、走会话自身模型。ARG 可覆盖版本与 PyPI 源。
# 同层装 uv（browser-acceptance 能力包依赖：jev 需 Python>=3.12，uv 负责托管解释器与 venv）
ARG GRAPHIFY_VERSION=0.9.19
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --break-system-packages --no-cache-dir -i "${PIP_INDEX_URL}" "graphifyy==${GRAPHIFY_VERSION}" uv \
  && graphify --version && uv --version

# ---- Chromium 系统依赖（omp 内置浏览器 eval prelude 的运行时底座）------------
# omp 自带 browser.open/browser 工具（browser.enabled 默认开），驱动 ~/.cache/ms-playwright
# 的 chromium；无显示环境下仍需整套 glib/nss/atk/X11/pango/alsa 共享库——缺一则 exit=127。
# 该清单对齐 Playwright bookworm 官方依赖集（headless 充分集）。
# 追加 chromium 本体（browser-acceptance 能力包：CDP --remote-debugging-port 驱动，headless 运行）。
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
     libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 libx11-6 libx11-xcb1 \
     libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxtst6 libxi6 \
     libgbm1 libpango-1.0-0 libcairo2 libasound2 fonts-liberation \
     chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chromium --version

COPY entrypoint.sh /usr/local/bin/omp-entrypoint.sh
RUN chmod +x /usr/local/bin/omp-entrypoint.sh

# omp 配置根：/home/pi/.omp（models.yml / config.yml / agent/auth）
VOLUME  /home/pi/.omp
VOLUME  /workspace
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/omp-entrypoint.sh"]
CMD ["sleep", "infinity"]
