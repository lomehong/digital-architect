/**
 * architect-core · 宿主中立核心（唯一事实源）。
 *
 * 本包只含**纯函数**（不落盘、不联网、零宿主依赖）：
 * - coverage：方案六维度+五问覆盖检查
 * - digest：需求准入六项覆盖检查
 * - lint：知识库机械校验（R1~R9，含设备路径禁止入库）
 * - kbcollect：知识库快照采集（唯一允许 fs 的模块，供 CLI 与宿主外壳共用）
 *
 * 宿主外壳（dsh-architect = dsh 插件；omp-architect = omp 插件）只做**注册与呈现**，
 * 禁止复制本包逻辑——校验/评分语义变更一律改这里，两外壳随版本跟进。
 *
 * @module architect-core
 */
export * from "./coverage.js";
export * from "./digest.js";
export * from "./lint.js";
export * from "./kbcollect.js";
