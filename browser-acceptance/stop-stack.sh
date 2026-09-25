#!/usr/bin/env bash
# 停止验收栈：只杀 stack.pids 登记的 pid（suite-build-lessons:41 纪律），然后删除登记文件。
set -euo pipefail
BA_ROOT="${BA_ROOT:-$HOME/.browser-acceptance}"
[ -f "$BA_ROOT/stack.pids" ] || { echo "无登记文件，无需停止"; exit 0; }
while read -r pid; do
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
done < "$BA_ROOT/stack.pids"
rm -f "$BA_ROOT/stack.pids"
echo "stack stopped"
