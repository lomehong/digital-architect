#!/usr/bin/env bash
# 停止验收栈：只杀 stack.pids 登记的 pid（suite-build-lessons:41 纪律），然后删除登记文件。
# Windows 注（2026-09-25 实测踩中）：Git Bash 的 $! 是 MSYS pid，taskkill 只认 Windows pid，
# 直接喂会报 not found 且被吞——必须经 `ps -W` 换算 WINPID 列再 taskkill //T 整树终止；POSIX 走 kill。
set -euo pipefail
BA_ROOT="${BA_ROOT:-$HOME/.browser-acceptance}"
[ -f "$BA_ROOT/stack.pids" ] || { echo "无登记文件，无需停止"; exit 0; }
while read -r pid; do
  [ -n "$pid" ] || continue
  if command -v taskkill >/dev/null 2>&1; then
    winpid="$(ps -W 2>/dev/null | awk -v p="$pid" '$1==p {print $4; exit}')"
    if [ -n "$winpid" ]; then
      taskkill //PID "$winpid" //T //F >/dev/null 2>&1 || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  else
    kill "$pid" 2>/dev/null || true
  fi
done < "$BA_ROOT/stack.pids"
# Chrome 补刀（2026-09-25 实测踩中）：chrome.exe 启动后会重生成主进程，bash 记录的原 pid 链失效
# （ps -W 已无原 MSYS pid 行）——按本栈专属标记（remote-debugging-port + chrome-profile）清扫整树。
# 主人日常 Chrome 不开远程调试（suite-build-lessons:9），不会误伤。
if command -v taskkill >/dev/null 2>&1 && command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command \
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -match 'remote-debugging-port' -and \$_.CommandLine -match 'chrome-profile' } | ForEach-Object { taskkill /PID \$_.ProcessId /T /F 2>\$null }" \
    >/dev/null 2>&1 || true
fi
rm -f "$BA_ROOT/stack.pids"
echo "stack stopped"
