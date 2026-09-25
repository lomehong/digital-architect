#!/usr/bin/env bash
# browser-acceptance 部署脚本（幂等）。命令序列源自 2026-09-25 Spike 实机执行记录。
# 用法: bash deploy.sh
# 环境变量: BA_ROOT（运行时根目录，默认 ~/.browser-acceptance）
#           HF_ENDPOINT（HF 直连不可用时设为 https://hf-mirror.com）
set -euo pipefail

BA_ROOT="${BA_ROOT:-$HOME/.browser-acceptance}"
JEV_COMMIT="1231850a0bf1a0c0341fe408ef1668dbbfdfac46"
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() { echo "==> $*"; }

# 平台差异：Windows venv 在 Scripts/，POSIX 在 bin/
vpy() { local v="$1"; if [ -x "$v/Scripts/python.exe" ]; then echo "$v/Scripts/python.exe"; else echo "$v/bin/python"; fi; }

step "1/5 laya 决策服务环境 ($BA_ROOT/venv)"
if [ ! -d "$BA_ROOT/venv" ]; then
  uv venv --python 3.12 "$BA_ROOT/venv"
  # 先装 CPU 版 torch，避免 Windows 默认拉 2.5GB CUDA 包
  uv pip install --python "$(vpy "$BA_ROOT/venv")" torch --index-url https://download.pytorch.org/whl/cpu
  uv pip install --python "$(vpy "$BA_ROOT/venv")" "laya[serve]==0.3.20" huggingface_hub
else
  echo "    已存在，跳过"
fi

step "2/5 jev-ultrafast（pin $JEV_COMMIT）"
if [ ! -d "$BA_ROOT/jev-ultrafast" ]; then
  git clone https://github.com/browser-use/jev-ultrafast.git "$BA_ROOT/jev-ultrafast"
  git -C "$BA_ROOT/jev-ultrafast" checkout "$JEV_COMMIT"
  (cd "$BA_ROOT/jev-ultrafast" && uv sync)
else
  echo "    已存在，跳过"
fi

step "3/5 应用端点补丁（仅 model.py）"
if git -C "$BA_ROOT/jev-ultrafast" diff --quiet -- jev_ultrafast/model.py; then
  git -C "$BA_ROOT/jev-ultrafast" apply "$PKG_DIR/patches/jev-model.patch"
else
  echo "    已打补丁，跳过"
fi

step "4/5 laya-browser 权重（v10s，sha256 校验）"
W="$BA_ROOT/laya-browser/v10s/model.safetensors"
WANT="b11217df18bf79cfcd4ab639caf1ae8652b91c9c44fcb9457fbe480237332335"
if [ -f "$W" ] && echo "$WANT  $W" | sha256sum -c - >/dev/null 2>&1; then
  echo "    已存在且 hash 一致，跳过"
else
  HF_HUB_DISABLE_XET=1 "$(vpy "$BA_ROOT/venv")" -m huggingface_hub.cli.hf download \
    cklxx/laya-browser --local-dir "$BA_ROOT/laya-browser"
  echo "$WANT  $W" | sha256sum -c -
fi

step "5/6 组件门禁：jev 离线测试"
(cd "$BA_ROOT/jev-ultrafast" && uv run pytest -q)

step "6/6 组件门禁：Laya 权重自检（verify.py，CPU 约 1-2 分钟）"
"$(vpy "$BA_ROOT/venv")" "$BA_ROOT/laya-browser/code/verify.py" "$BA_ROOT/laya-browser/v10s" | tail -4

echo
echo "部署完成。启动栈: bash start-stack.sh；验收任务: python run_acceptance.py -h"
