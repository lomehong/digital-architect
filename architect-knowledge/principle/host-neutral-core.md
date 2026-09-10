---
title: 宿主中立核心与适配边缘
domain: methodology
source:
  origin: digital-architect 决策 D9（主人 2026-09-10 指示：方案需同时支持 dsh 与 oh-my-pi）
  ref: ../../adapters/README.md；与 suite-federation-principles 同构（核心不动、适配显式、降级保守）
confirmed: 2026-09-10
status: 已确认
owner: 主人
---

# 宿主中立核心与适配边缘

## 原则

架构师 Agent 的三类核心资产——**知识库（architect-knowledge/）、流程（SKILL）、产出规范（templates/）**——是宿主中立的：它们只规定流程语义、装载路径与验收纪律，不引用任何宿主的专有工具名与机制。

宿主特定机制一律收敛到 `adapters/<host>.md`（一个宿主一个文件），覆盖五个面：**宿主判别、决策门、任务执行、记忆沉淀、挂载与工具**。

## 为什么（从联邦原则同构推出）

- 知识与流程的价值不随宿主更迭而失效——绑死单一宿主等于把组织资产锁进厂商格式；
- 与套件联邦原则同构：核心功能在任何兄弟宿主缺席时完整可用，宿主能力是**可选增强**，缺席显式降级且收敛保守侧；
- 与方法论三支柱一致：Skill（流程）与 Harness（宿主执行轨道）本来就分属两层，混写会导致流程知识随宿主升级而漂移。

## 执行细则

1. **SKILL 只出现三类宿主指涉**：适配层引用（`adapters/`）、按宿主分列的映射表（如流水线决策门表）、显式标注「不适用」的宿主红线检查；
2. **宿主判别失败即停**：按会话可用工具判别宿主，判别不了问主人，不得在错误假设下继续；
3. **降级收敛保守侧**：宿主缺某机制（如 omp 无账本）→ 治理类动作一律停止问主人，不得静默放行；
4. **验收语义跨宿主不变**：自报 ≠ 完成，主人确认才落定——这是流程语义，不是宿主机制，任何适配不得弱化；
5. **新增宿主只写适配文件**：若适配新宿主需要改 SKILL 正文，说明流程语义本身在变——先按机制优先原则修核心，再写适配。

## 已有宿主

| 宿主 | 适配文件 | 检查工具来源 |
|---|---|---|
| dsh（DeepSeek Harness / digital-twin 套件） | `adapters/dsh.md` | dsh-architect 插件（cordis tools.register） |
| oh-my-pi（omp，pi 分支终端 Agent） | `adapters/oh-my-pi.md` | dsh-architect 仓 `./omp` 导出（CustomToolFactory，同一组纯函数） |
