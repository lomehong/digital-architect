# ---- Stage 1: Base image ------------------------------------------------
# Use the latest LTS slim image for a small footprint.
FROM node:24-bookworm-slim

ENV PUID=1000
ENV PGID=1000

# ---- Stage 2: Install system dependencies --------------------------------
# pi's built-in tools need: bash (shell), ca-certificates (TLS/HTTPS),
# git (version control), ripgrep (fast text search / rg tool).
# findutils provides 'find' (absent in slim images).
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
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# ---- Stage 3: Install pi ------------------------------------------------
# --ignore-scripts is safe: pi does not need post-install scripts for
# normal npm installations.
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent \
 && npm install -g @blackbelt-technology/pi-agent-dashboard \
 && npm install -g @studyzy/openspec-cn \
 && ln -s openspec-cn /usr/local/bin/openspec \
 && npm cache clean --force 

# ---- Stage 4: Prepare runtime user & directories ------------------------
# Remove the pre-existing `node` user so it doesn't conflict when the
# entrypoint creates the pi user with the requested PUID/PGID.
RUN deluser node 2>/dev/null || true \
  && delgroup node 2>/dev/null || true \
  && groupadd -g $PUID pi \
  && useradd -m -u $PGID -g pi -s /bin/bash pi \
  && usermod -aG sudo pi

# ---- Stage 6: Install entrypoint script ----------------------------------
COPY entrypoint.sh /usr/local/bin/pi-entrypoint.sh
RUN chmod +x /usr/local/bin/pi-entrypoint.sh

ENV TZ=Asia/Shanghai
ENV PI_DASHBOARD_HOST=0.0.0.0
ENV PI_GATEWAY_BIND=0.0.0.0

# ---- Stage 7: Final configuration ----------------------------------------
VOLUME  /home/pi/.pi
VOLUME  /workspace
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/pi-entrypoint.sh"]
CMD ["pi-dashboard"]