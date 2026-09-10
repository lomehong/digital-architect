#!/bin/bash
# =============================================================================
#  oh-my-pi（omp 官方版）— entrypoint：root 起步，按 PUID/PGID 降权执行
#  配置根：/home/pi/.omp（models.yml / config.yml / agent/auth.json）
# =============================================================================
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
echo "[supervisor] Target UID=${PUID}, GID=${PGID}"

USER_NAME="pi"
GROUP_NAME="pi"

if id pi >/dev/null 2>&1; then
  CURRENT_UID=$(id -u pi)
  CURRENT_GID=$(id -g pi)
  if [ "${CURRENT_GID}" != "${PGID}" ]; then
    groupmod -g "${PGID}" pi 2>/dev/null || true
    echo "[supervisor] Changed pi group GID: ${CURRENT_GID} → ${PGID}"
  fi
  if [ "${CURRENT_UID}" != "${PUID}" ]; then
    usermod -u "${PUID}" -g "${PGID}" pi 2>/dev/null || true
    echo "[supervisor] Changed pi user UID: ${CURRENT_UID} → ${PUID}"
  fi
fi

echo "[supervisor] Fix ownership: /home/pi/.omp /workspace"
mkdir -p /home/pi/.omp
chown -R "${PUID}:${PGID}" /home/pi/.omp 2>/dev/null || true
if [ -d /workspace ]; then
  chown "${PUID}:${PGID}" /workspace 2>/dev/null || echo "[supervisor] Note: /workspace ownership unchanged" >&2
fi

echo "[supervisor] Starting: gosu pi $*"
exec gosu "${USER_NAME}" "$@"
