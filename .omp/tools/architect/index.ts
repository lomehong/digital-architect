/**
 * 架构师检查器工具（omp CustomTool 发现入口）。
 *
 * 实现在 dsh-architect submodule（单一事实源，决策 D9/D10）：
 * 本文件只是转发模块，让 omp 的项目级工具发现（.omp/tools/<name>/index.ts）
 * 命中 submodule 内的适配器。export default factory → (api) => 工具数组。
 */
export { default } from '../../../dsh-architect/src/omp.ts'
