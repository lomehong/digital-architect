#!/usr/bin/env bash
# link-skills.sh — 技能发现根链接铺装与健康检查（POSIX，CI ubuntu 与 POSIX 宿主）
# 语义同 link-skills.ps1（方案 §2.1）；链接用相对路径 ../../skills/<name>（可移植）。
# 用法:
#   bash link-skills.sh            # link 模式（默认）
#   bash link-skills.sh --check   # 只验证不修复（fail-closed）
#   bash link-skills.sh --mode copy
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/skills"
MODE=link; CHECK=0
case "${1:-}" in
  --check) CHECK=1; MODE=check ;;
  --mode) MODE="${2:-copy}"; shift 2 2>/dev/null || true ;;
esac

# 防自污染: 发现根不得位于权威源内部
for r in .claude/skills .omp/skills .dsh/skills; do
  rp="$(cd "$REPO" && realpath -m "$r" 2>/dev/null || echo "$REPO/$r")"
  sp="$(cd "$REPO/skills" && pwd -P)"
  case "$rp" in "$sp"*) echo "BAILOUT: 发现根 '$r' 位于权威源内部（自污染）" >&2; exit 2 ;; esac
done

SKILLS="$(ls "$SRC")"
FAIL=0; FIXED=0

for r in .claude/skills .omp/skills .dsh/skills; do
  mkdir -p "$REPO/$r"
  for name in $SKILLS; do
    link="$REPO/$r/$name"; target="$SRC/$name"
    if [ "$CHECK" = 1 ]; then
      if [ ! -e "$link/SKILL.md" ]; then echo "MISSING/BROKEN: $r/$name"; FAIL=1
      else
        rl="$(realpath "$link")"; rt="$(realpath "$target")"
        [ "$rl" = "$rt" ] || { echo "指错: $r/$name -> $rl"; FAIL=1; }
      fi
      continue
    fi
    if [ "$MODE" = copy ]; then
      rm -rf "$link"; cp -r "$target" "$link"; FIXED=$((FIXED+1)); continue
    fi
    # link 模式: 实体目录→先移除；指向正确→跳过；断链/指错→重建
    if [ -L "$link" ]; then
      rl="$(realpath "$link" 2>/dev/null || true)"; rt="$(realpath "$target")"
      [ "$rl" = "$rt" ] && continue
      rm -f "$link"
    elif [ -e "$link" ]; then
      rm -rf "$link"   # 实体目录（旧镜像）→移除再建链
    fi
    ln -sfn "../../skills/$name" "$link"; FIXED=$((FIXED+1))
  done
done

if [ "$CHECK" = 1 ]; then
  if [ "$FAIL" = 1 ]; then echo "LINK HEALTH FAIL"; exit 1; fi
  echo "LINK HEALTH PASS: 3 根链接健康"; exit 0
fi
echo "bootstrap 完成（mode=$MODE, 变更点 $FIXED）"
