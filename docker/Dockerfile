# ---- oh-my-pi（omp 官方版）------------------------------------------------
# 官方仓库：https://github.com/can1357/oh-my-pi（omp.sh）
# npm 包：@oh-my-pi/pi-coding-agent（内置预编译 platform natives，无需本地 Rust）
# 基础镜像复用本地 node:24-bookworm-slim（已经 1ms 加速站拉取）。
FROM node:24-bookworm-slim

ENV PUID=1000
ENV PGID=1000
ENV TZ=Asia/Shanghai

# omp 运行依赖：bash/shell、ca-certificates、git、ripgrep/glob 有内置 Rust 实现
# 但 git/ssh 等外部工具仍是工作流一部分；findutils 补 slim 镜像缺失。
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

# ---- 安装官方 oh-my-pi -----------------------------------------------------
# omp 运行时为 Bun（官方推荐 bun ≥ 1.3.14）；经 npm 装官方 bun 分发，再装 omp 包
# （natives 以平台子包预编译分发，无需本地 Rust）。
RUN npm install -g bun \
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
