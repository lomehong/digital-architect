/**
 * 架构师检查器工具（omp agent 级工具发现入口，v3 大脑/现场解耦）。
 *
 * 实现在 dsh-architect submodule（单一事实源，决策 D9/D10）；
 * 本文件挂载于 /home/pi/.omp/agent/tools/architect/index.ts（agent 级，不随 workspace 切换），
 * 以绝对路径引用大脑仓挂载点 /opt/architect。
 * export default factory → (api) => 工具数组；builder 缺失降级空数组，不炸宿主加载。
 */
export { default } from '/opt/architect/dsh-architect/src/omp.ts'
