# browser-acceptance —— 架构师 Agent 真实浏览器端到端验收能力

> 落定方案：`docs/designs/2026-09-25-浏览器E2E验收-技术方案.md`（评审 56/60 复核通过，主人 2026-09-25 确认）。
> 定位：探索式**验收**能力（像人一样打开浏览器操作系统），不是确定性脚本回归框架（Playwright 类提案另议，互补不替代）。

## 架构

```
architect-implement 验证清单（验收类条目）
  → run_acceptance.py（--allow-host 白名单强制 + --expect-* 独立校验强制）
    → jev-ultrafast 循环 ──决策──→ 本地 Laya systemone 服务（127.0.0.1 环回）
      │                  └──文本──→ DeepSeek 端点（仅 TYPE_TEXT；DEEPSEEK_API_KEY 环境变量授钥）
      └── CDP ──→ 独立 Chrome 实例（独立 user-data-dir，不触碰日常浏览器）
  → 证据落盘 $BA_ROOT/evidence/（trace.json + verdict.json）→ 自报 → 主人 confirm
```

全链路无数据出域：决策模型本地（Laya v10s，Apache-2.0），文本走已批准的 DeepSeek 端点，浏览器为本机独立实例。供应链锁定见 `pins.yaml`。

## 部署

```bash
# 前置：uv、git、Chrome；DEEPSEEK_API_KEY 在环境中（仅含打字任务需要）
export BA_ROOT=~/.browser-acceptance        # 可选，运行时根目录
bash deploy.sh                               # 幂等；装环境、拉 pin 版本、下权重、跑组件门禁
bash start-stack.sh                          # 起 Chrome(9222) + systemone(8791) + fixture(8901)
bash stop-stack.sh                           # 只杀登记 pid
```

HF 直连不可用时：`HF_ENDPOINT=https://hf-mirror.com bash deploy.sh`（脚本已内置禁 xet）。

## 使用

```bash
PY="$BA_ROOT/jev-ultrafast/.venv/Scripts/python.exe"   # POSIX: .venv/bin/python

# 单条验收任务（写路径白名单 + 独立校验均为强制参数）
"$PY" run_acceptance.py --url <隔离环境URL> --goal "<自然语言验收目标>" \
    --allow-host <主机白名单> --expect-url-contains <预期URL片段>

# 端点契约测试
"$PY" contract_test.py

# 基线回归（REPEATS=3 与基线口径一致）
REPEATS=3 "$PY" suite.py
```

## 验收基线（2026-09-25 实测，CPU；证据：[evidence/](evidence/README.md)）

| 类别 | 基线 | 套件口径 |
|---|---|---|
| 导航/筛选/表单点击类 | 15/15（5 任务×3 轮） | 必须全过，不过即回归 |
| 本地 fixture 纯点击 | 成功（20s） | 必须过 |
| 本地 fixture 复合任务 | blocked（守卫正确拦截） | 必须不过——过了说明守卫被破坏 |
| 搜索框打字、视口外分页 | 0/6（已知限制） | 失败不判红；通过则报告改进 |

已知限制根源：jev DOM 快照只收**可见**控件（视口外元素不在动作空间）；TYPE_TEXT 操作选择弱（上游 16 任务套件同桶失败）。编写验收目标时规避这两类，或等 DAgger 二轮微调（管线公开，单卡 1–2h，后续优化项）。

## 红线（不可协商）

1. **写路径隔离**：`--allow-host` 只许隔离环境/夹具；运行器启动即打印「成功将改变的对象」声明；生产系统写操作验收禁止（suite-build-lessons:42）。
2. **DONE 不算证据**：每条验收必须带 `--expect-*` 独立校验；截图/轨迹是附件证据，结论必须可复跑（evidence-strength-vs-conclusion:27-29）。
3. **不常驻、不自启、不隐藏窗口**（suite-build-lessons:44）；进程只杀登记 pid。
4. **验收语义不变**：本能力产出是自报证据，主人 confirm 才落定。
5. 密码字段不可见（jev 设计）；不做登录态突破/验证码绕过。
6. 升级任何 pin 组件后必须复跑 `suite.py` 基线。

## 与既有能力的关系

- `dsh-browser`（Lum1104，采集桥）：并存分工——采集归它，验收归本能力（主人 2026-09-25 拍板）；
- `dsh-regression`（会话回归）：驱动真实会话做回归，与本能力（浏览器 UI 验收）不同层面，互不依赖；
- architect-implement：本能力是其验证覆盖维度的新执行手段，登记见 SKILL.md「浏览器验收任务」节。
