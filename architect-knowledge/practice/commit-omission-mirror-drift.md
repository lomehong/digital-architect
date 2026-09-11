---
title: 提交遗漏致镜像/权威倒挂——G3 副本校验首次实战拦截
domain: methodology
source:
  origin: digital-architect 任务 TB-1789090210188-ralyn 执行实录（2026-09-11，主人已确认）
  ref: docs/designs/2026-09-11-评审口径统一与机制收口-技术方案.md §2/§5；commit fef1bc2
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# 提交遗漏致镜像/权威倒挂——G3 副本校验首次实战拦截

## 事故经过

G1~G5 整改执行中（2026-09-11），提交 e1913b5 将 `architect-review` SKILL 的两处镜像
（`.claude/skills/`、`.omp/skills/`）加入了暂存，**却遗漏权威源 `skills/architect-review/SKILL.md` 本身**，
造成「镜像新、权威旧」倒挂。本地全量验证（测试 47 绿、lint PASS、副本校验通过）均未发现——
因为本地工作树里三份都是新的；根仓推送到 GitHub 后，CI 在 fresh checkout 环境运行
`check-skills-sync.mjs` 立即红灯，fresh clone 复现锁定根因，fef1bc2 修复后 CI 转绿。

## 教训

1. **本地全绿 ≠ 仓库正确**：工作树校验会被未提交/漏提交的工作副本掩盖；只有 fresh checkout
   （CI/fresh clone）才等价于他人视角。多副本资产的校验必须以仓库内容为准跑一遍。
2. **多目标提交按清单核对路径**：一次 commit 涉及「权威源 + N 处镜像」时，漏 add 权威源
   会产生方向相反的静默漂移；提交前 `git status` 应为空是硬纪律。
3. **机制首次实战即回本**：G3 校验脚本接入 CI 后首个 run 就拦截了建立它的那次变更——
   机制优先于人工的直接例证。

## 处置

- fef1bc2 修复提交；run fef1bc2 CI 绿；主人已确认任务落定（2026-09-11）。
- 本条目按漂移回写流程以 `待审核` 入库，主人确认后升级 `已确认`。
