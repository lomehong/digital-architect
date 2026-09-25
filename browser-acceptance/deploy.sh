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
vbin() { local v="$1" n="$2"; if [ -x "$v/Scripts/$n.exe" ]; then echo "$v/Scripts/$n.exe"; else echo "$v/bin/$n"; fi; }

step "1/6 laya 决策服务环境 ($BA_ROOT/venv)"
[ -x "$(vpy "$BA_ROOT/venv")" ] || uv venv --clear --python 3.12 "$BA_ROOT/venv"
# torch 源可配：默认 pytorch.org CPU 索引（~200MB 小轮）；慢网环境设 TORCH_INDEX 为 PyPI 镜像
# （如 tuna simple——注意其 Linux 轮会带 CUDA 依赖，体积大数倍但国内速度快）
if ! "$(vpy "$BA_ROOT/venv")" -c "import torch" 2>/dev/null; then
  uv pip install --python "$(vpy "$BA_ROOT/venv")" torch --index-url "${TORCH_INDEX:-https://download.pytorch.org/whl/cpu}"
fi
if ! "$(vpy "$BA_ROOT/venv")" -c "import laya" 2>/dev/null; then
  uv pip install --python "$(vpy "$BA_ROOT/venv")" --index-url "${PIP_INDEX_URL:-https://pypi.org/simple}" \
    "laya[serve]==0.3.20" huggingface_hub
fi

step "2/6 jev-ultrafast（pin $JEV_COMMIT）"
if [ ! -d "$BA_ROOT/jev-ultrafast" ]; then
  git clone https://github.com/browser-use/jev-ultrafast.git "$BA_ROOT/jev-ultrafast"
  git -C "$BA_ROOT/jev-ultrafast" checkout "$JEV_COMMIT"
  (cd "$BA_ROOT/jev-ultrafast" && uv sync)
else
  echo "    已存在，跳过"
fi

step "3/6 应用端点补丁（仅 model.py）"
if git -C "$BA_ROOT/jev-ultrafast" diff --quiet -- jev_ultrafast/model.py; then
  git -C "$BA_ROOT/jev-ultrafast" apply "$PKG_DIR/patches/jev-model.patch"
else
  echo "    已打补丁，跳过"
fi

step "4/6 laya-browser 权重（v10s，sha256 校验）"
W="$BA_ROOT/laya-browser/v10s/model.safetensors"
WANT="b11217df18bf79cfcd4ab639caf1ae8652b91c9c44fcb9457fbe480237332335"
if [ -f "$W" ] && echo "$WANT  $W" | sha256sum -c - >/dev/null 2>&1; then
  echo "    已存在且 hash 一致，跳过"
else
  HF_HUB_DISABLE_XET=1 "$(vbin "$BA_ROOT/venv" hf)" download \
    cklxx/laya-browser --local-dir "$BA_ROOT/laya-browser"
  echo "$WANT  $W" | sha256sum -c -
fi

step "5/6 组件门禁：jev 离线测试"
(cd "$BA_ROOT/jev-ultrafast" && uv run pytest -q)

step "6/6 组件门禁：Laya 权重自检（verify.py，CPU 约 1-2 分钟）"
"$(vpy "$BA_ROOT/venv")" "$BA_ROOT/laya-browser/code/verify.py" "$BA_ROOT/laya-browser/v10s" | tail -4

echo
echo "部署完成。启动栈: bash start-stack.sh；验收任务: python run_acceptance.py -h"
