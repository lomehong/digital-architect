---
title: 浏览器 E2E 验收能力 Spike 与集成教训（jev-ultrafast + 本地 Laya）
domain: architect-capability
source:
  origin: 2026-09-25 Spike 实机执行 + 方案 docs/designs/2026-09-25-浏览器E2E验收-技术方案.md
  ref: browser-acceptance/ 能力包（pins.yaml 为供应链权威）
confirmed: 2026-09-25
status: 待审核
owner: 主人
---

# 浏览器 E2E 验收能力：Spike 与集成教训

> 背景：为架构师 Agent 增加「像人一样打开浏览器做验收」的能力。栈 = jev-ultrafast（MIT，浏览器循环+守卫）
+ 本地 Laya 决策服务（Apache-2.0，cklxx/laya-browser v10s 权重替代 TypeSafe 云 API）+ 独立 Chrome（CDP）。
运行命令、端口、目录一律以 `browser-acceptance/README.md` 与 `pins.yaml` 为准；本条目只沉淀**教训与判据**。

## 能力基线（2026-09-25 实测，CPU；复跑入口 `suite.py`）

- 导航/筛选/表单点击类：5 任务 ×3 轮 = **15/15 全过**（中位 13.1s/任务）；
- 搜索框打字、视口外分页（需先滚动）：**0/6 全败**——已知限制，与上游 16 任务套件同桶；
- 复合任务失败方式受控：连续 3 步页面无变化 → blocked，不死循环、不乱点；
- CPU 决策延迟 0.9–3.2s/步（65 选项时 3.1s）；GPU 参考值 17–23ms/步（上游自测，本机未复现）。

**判据**：验收目标编写规避「打字搜索」「视口外元素」两类；这两类场景需求要么改写为导航式表述，要么等
DAgger 二轮微调（上游管线公开，单卡 1–2h，登记为后续优化项 U8）。

## 集成要点

1. **协议兼容是真实的**：Laya 的 `/v1/systemone` 与 jev 调用的 TypeSafe 端点同格式；集成补丁为 jev `model.py`
   **单 hunk**（`choose()` 的 `TYPESAFE_BASE_URL` 端点与密钥容错），补丁文件即 pin 对象
   （`browser-acceptance/patches/jev-model.patch`）。上游官方补丁的第二个 hunk（`TEXT_MODEL_EXTRA_JSON`）
   **不采纳**：pin commit 的 `field_text()` 原生支持 `TEXT_MODEL_BASE_URL`/`TEXT_MODEL`/`TEXT_MODEL_REASONING`
   环境变量，DeepSeek 直连无需该扩展（2026-09-25 实施评审纠正：此前登记为「两处」与实物不符）；
   上游补丁包里的 uv.lock 镜像改动同样不采纳。
2. **zero-shot 不可用**：Laya 基础 checkpoint 对浏览器决策是随机水平（上游实测 0/16），必须用微调权重
   v10s/v10；微调最大改进点是**输入格式**（元素表从 state 移入选项列表），不是数据量。
3. **选项预算**：Laya 单问选项约 254 短标签上限；`systemone_server.py` 的 MAXOPT 分块粗筛（两轮前向）
   已解决 jev 最多 250 候选的溢出问题，集成时勿绕过该服务直连 `laya.predict`。
4. **DONE 必须独立校验**：模型选 DONE 只改状态不证明成功（jev 架构如此设计）；运行器强制 `--expect-*`
   校验（URL/标题/页面文本），截图只做附件证据（与 evidence-strength-vs-conclusion 一致）。

## 环境坑（Windows + 内网）

5. **HF 下载**：直连 huggingface.co SSL 中断时走 `HF_ENDPOINT=https://hf-mirror.com` 且必须
   `HF_HUB_DISABLE_XET=1`（镜像不支持 xet 协议，否则 CAS 401）；下载后按 pins.yaml 的 sha256 校验权重。
6. **Windows 端口双绑**：Python `HTTPServer` 默认 `allow_reuse_address`，Windows 上**两个进程可同绑一个端口**
   ——重启栈前必须先按登记 pid 停旧实例，否则健康检查命中旧进程、新进程静默闲置（实测踩中）。
7. **CPU torch 先装**：Windows 上直接装 laya 会拉 2.5GB CUDA 版 torch；先经 pytorch CPU 索引装 torch 再装
   laya（deploy.sh 已固化该顺序）。
8. **venv 不通用**：jev 循环要 `browser_harness`，laya 服务要 `torch`——两个 venv 各管各的，运行器必须用
   jev venv 的 python（实测拿错 venv 即 ModuleNotFoundError）。
9. **不扰主人浏览器**：独立 `--user-data-dir` + `--remote-debugging-port`；主人日常 Chrome 未开远程调试时
   browser-harness daemon 起不来是预期行为，不是故障——用独立实例而非去开主人浏览器的调试开关。
