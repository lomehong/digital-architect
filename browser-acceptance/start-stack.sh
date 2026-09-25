#!/usr/bin/env bash
# 启动验收栈：独立浏览器（CDP）+ 本地 Laya systemone 服务 + fixture 静态服务。
# 纪律：独立 user-data-dir，不触碰日常浏览器；pid 登记到 $BA_ROOT/stack.pids，stop-stack.sh 只杀登记 pid。
# 平台：Linux 容器用 apt 版 chromium（无显示自动 headless + --no-sandbox）；Windows 用本机 Chrome。
set -euo pipefail
BA_ROOT="${BA_ROOT:-$HOME/.browser-acceptance}"
CDP_PORT="${BA_CDP_PORT:-9222}"
S1_PORT="${BA_S1_PORT:-8791}"
FIXTURE_PORT="${BA_FIXTURE_PORT:-8901}"
START_DIR="$PWD"

vpy() { local v="$1"; if [ -x "$v/Scripts/python.exe" ]; then echo "$v/Scripts/python.exe"; else echo "$v/bin/python"; fi; }
LPY="$(vpy "$BA_ROOT/venv")"

if [ -z "${CHROME_EXE:-}" ]; then
  for c in chromium chromium-browser google-chrome; do
    command -v "$c" >/dev/null 2>&1 && CHROME_EXE="$c" && break
  done
  CHROME_EXE="${CHROME_EXE:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
fi
CHROME_FLAGS=""
[ -z "${DISPLAY:-}" ] && CHROME_FLAGS="--headless=new --no-sandbox --disable-dev-shm-usage"

: > "$BA_ROOT/stack.pids"

# shellcheck disable=SC2086
"$CHROME_EXE" $CHROME_FLAGS --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$BA_ROOT/chrome-profile" --no-first-run --no-default-browser-check about:blank &
echo $! >> "$BA_ROOT/stack.pids"

cd "$BA_ROOT/laya-browser/code/apps"
LAYA_FAST=0 "$LPY" systemone_server.py "$S1_PORT" "$BA_ROOT/laya-browser/v10s" 12 \
  > "$BA_ROOT/systemone.log" 2>&1 &
echo $! >> "$BA_ROOT/stack.pids"

cd "$BA_ROOT/jev-ultrafast/jev_ultrafast/static"
"$LPY" -m http.server "$FIXTURE_PORT" --bind 127.0.0.1 > "$BA_ROOT/fixture.log" 2>&1 &
echo $! >> "$BA_ROOT/stack.pids"
cd "$START_DIR"

echo "等待服务就绪..."
for i in $(seq 1 60); do
  curl -s --max-time 2 "http://127.0.0.1:$S1_PORT/" >/dev/null 2>&1 && \
  curl -s --max-time 2 "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1 && \
  curl -s --max-time 2 "http://127.0.0.1:$FIXTURE_PORT/fixture.html" >/dev/null 2>&1 && break
  sleep 2
done
curl -s --max-time 3 "http://127.0.0.1:$S1_PORT/" | head -c 120; echo
echo "stack up. pid 登记: $BA_ROOT/stack.pids"
