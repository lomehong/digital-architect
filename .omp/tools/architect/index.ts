/**
 * 架构师检查器工具（omp 项目级工具发现入口，v3 遗留兼容）。
 *
 * v3 起大脑/现场解耦：容器内本仓挂 /opt/architect（ro），工具经 agent 级
 * /home/pi/.omp/agent/tools（docker/agent-tools）以绝对路径转发，本文件仅当
 * 本仓自身被当作 omp workspace 时的兼容入口。
 */
export { default } from '/opt/architect/dsh-architect/src/omp.ts'
