#!/bin/bash
# =============================================================================
#  oh-my-pi（omp 官方版）— entrypoint：root 起步，按 PUID/PGID 降权执行
#  配置根：/home/pi/.omp（models.yml / config.yml / agent/auth.json）
# =============================================================================
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
echo "[supervisor] Target UID=${PUID}, GID=${PGID}"

# ── fail-fast：密钥校验（2026-09-11 事故驱动，TB-1789102220672-cuxhc 试点）──
# 动机：.env 被占位符顶掉/被覆盖时容器仍「正常启动」，故障延迟到模型调用才以 401 暴露。
# 此处在启动期拒绝；**绝不回显密钥值**（只报状态）。
# 判定：仅当为空或以 PLACEHOLDER 开头时拒绝，其余一律放行（宁可漏判，不误杀）。
if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "[supervisor][FATAL] DEEPSEEK_API_KEY 未配置（空值）——拒绝启动。" >&2
  echo "[supervisor][FATAL] 请在 docker/.env 填入真实密钥后重试：docker compose up -d" >&2
  exit 1
fi
case "${DEEPSEEK_API_KEY}" in
  [Pp][Ll][Aa][Cc][Ee][Hh][Oo][Ll][Dd][Ee][Rr]*)
    echo "[supervisor][FATAL] DEEPSEEK_API_KEY 仍是占位符（以 PLACEHOLDER 开头）——拒绝启动。" >&2
    echo "[supervisor][FATAL] 请在 docker/.env 填入真实密钥后重试：docker compose up -d" >&2
    exit 1
    ;;
esac
echo "[supervisor] Credential check: OK（密钥已配置，未回显）"

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

# ── GitHub 凭证（GH_TOKEN → gh CLI 原生识别；git 私有仓经 credential helper 免密）──
# GH_TOKEN 属按需增强：缺失仅 WARN 显式降级（不阻断启动）；占位符同 FATAL 判定（防占位符顶掉真值的事故模式）
if [ -z "${GH_TOKEN:-}" ]; then
  echo "[supervisor] Note: GH_TOKEN 未配置——gh/git 私有仓访问将 401（按需增强，不阻断启动）"
else
  case "${GH_TOKEN}" in
    [Pp][Ll][Aa][Cc][Ee][Hh][Oo][Ll][Dd][Ee][Rr]*)
      echo "[supervisor][FATAL] GH_TOKEN 仍是占位符——拒绝启动（请在 docker/.env 填入真实 token）。" >&2
      exit 1
      ;;
  esac
  echo "[supervisor] GitHub credential: OK（token 未回显）"
fi
# 幂等配置 pi 用户的 git credential helper（gh 读 GH_TOKEN env，token 不落盘）
gosu "${USER_NAME}" git config --global credential.helper '!/usr/local/bin/gh auth git-credential' 2>/dev/null || true

echo "[supervisor] Starting: gosu pi $*"
exec gosu "${USER_NAME}" "$@"
