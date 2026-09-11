/**
 * 架构师检查器工具（omp agent 级工具发现入口，v3.1 插件化）。
 *
 * 实现在独立外壳仓 omp-architect（本文件挂载于 /home/pi/.omp/agent/tools/architect/index.ts），
 * 以绝对路径引用（大脑仓挂 /opt/architect；omp-architect 为其子模块）。
 * 校验/评分纯函数在 packages/architect-core（单一事实源）。
 * export default factory → (api) => 工具数组；builder 缺失降级空数组，不炸宿主加载。
 */
export { default } from '/opt/architect/omp-architect/src/index.ts'
