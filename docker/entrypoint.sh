#!/bin/bash
# =============================================================================
#  oh-my-little-pi — entrypoint.sh
#  Supervisor entrypoint: runs as root, drops privileges to PUID/PGID.
# =============================================================================
set -e

# ------------------------------------------------------------------
#  Step 1: Resolve PUID / PGID and adjust the pi user
# ------------------------------------------------------------------
# The Dockerfile creates a `pi` user at build time with UID/GID 10000.
# If the operator requests different PUID/PGID (e.g. to match the host
# user's IDs for file ownership on mounted volumes), we modify the
# existing `pi` user in place rather than creating a new user.
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

# ------------------------------------------------------------------
#  Step 2: Fix ownership on pi home
# ------------------------------------------------------------------
echo "[supervisor] Solve pi home ownership"
chown -R "${PUID}:${PGID}" /home/pi/.pi 2>/dev/null || true

# ------------------------------------------------------------------
#  Step 3: Fix ownership on workspace
# ------------------------------------------------------------------
echo "[supervisor] Solve workspace ownership"
if [ -d /workspace ]; then
  chown "${PUID}:${PGID}" /workspace 2>/dev/null || echo "[supervisor] Note: /workspace is read-only" >&2
fi

# ------------------------------------------------------------------
#  Step 4: Inject env into config
# ------------------------------------------------------------------
echo "[supervisor] Inject dashboard configs"
CFG_FILE=/home/pi/.pi/dashboard/config.json
if [[ ! -d /home/pi/.pi/dashboard ]]; then
  mkdir -p /home/pi/.pi/dashboard
fi
if [[ ! -s ${CFG_FILE} ]]; then
  echo "{}" > ${CFG_FILE}
fi
function set_str {
  path=$1
  val=$2
  if [[ ! -z "$val" ]]; then
    cat ${CFG_FILE} | jq "${path} = \"${val}\"" > ${CFG_FILE}.tmp
    mv ${CFG_FILE}.tmp ${CFG_FILE}
  fi
}
set_str ".trustedNetworks[0]" "$PI_DASHBOARD_TRUSTNETWORK"
cat ${CFG_FILE}

echo "[supervisor] Starting pi-dashboard..."
exec gosu "${USER_NAME}" "$@"