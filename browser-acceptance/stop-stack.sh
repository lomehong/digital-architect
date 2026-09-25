#!/usr/bin/env bash
# 停止验收栈：只杀 stack.pids 登记的 pid（suite-build-lessons:41 纪律），然后删除登记文件。
# Windows 注：Git Bash 的 kill 只杀直接进程，Chrome/daemon 的子进程树会残留——
# MSYS 环境一律走 taskkill /T（整树），POSIX 用 kill 进程组。
set -euo pipefail
BA_ROOT="${BA_ROOT:-$HOME/.browser-acceptance}"
[ -f "$BA_ROOT/stack.pids" ] || { echo "无登记文件，无需停止"; exit 0; }
while read -r pid; do
  [ -n "$pid" ] || continue
  if command -v taskkill >/dev/null 2>&1; then
    taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
  fi
done < "$BA_ROOT/stack.pids"
rm -f "$BA_ROOT/stack.pids"
echo "stack stopped"
