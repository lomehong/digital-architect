#!/usr/bin/env node
/**
 * pack.mjs — Model B / C1 打包：组装平台独立部署产物并产出 tarball（零依赖）。
 *
 * 产物 dist/ = server + public + contracts + heartbeat/seal + config 模板 + package.json
 * 部署 = 解包到任意机器 → node server.mjs --data <数据根> [--port ...]（无需大脑仓）
 * 独立部署配置放 <数据根>/config/（alert-rules.yml / data-roots.yml，config/ 内含起始模板）。
 *
 * 用法：node observatory/pack.mjs   （产物 observatory/dist/*.tgz）
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, 'dist')
rmSync(dist, { recursive: true, force: true })
mkdirSync(join(dist, 'public'), { recursive: true })
mkdirSync(join(dist, 'contracts'), { recursive: true })
mkdirSync(join(dist, 'config'), { recursive: true })

for (const f of ['server.mjs', 'yuyi-ingest.mjs', 'instance-beat.mjs', 'heartbeat.mjs', 'seal.mjs']) {
  copyFileSync(join(here, f), join(dist, f))
}
cpSync(join(here, 'public'), join(dist, 'public'), { recursive: true })
for (const f of ['validate.mjs', 'render-smoke.mjs']) copyFileSync(join(here, 'contracts', f), join(dist, 'contracts', f))
copyFileSync(join(here, 'alert-rules.yml'), join(dist, 'config', 'alert-rules.yml'))
writeFileSync(join(dist, 'config', 'data-roots.yml'), '# 治理地址簿（独立部署默认为空；taskRoot 须为本机视角路径，仅支持本地路径）\nroots: []\n')

writeFileSync(join(dist, 'package.json'), JSON.stringify({
  name: 'architect-observatory',
  version: '1.0.0',
  description: 'Architect Observatory — 架构师团队可观测性平面（独立部署包，零 npm 依赖）',
  type: 'module',
  private: true,
}, null, 2) + '\n')
writeFileSync(join(dist, 'README.md'), `# Architect Observatory（独立部署包）

启动：node server.mjs --data <数据根> --port 8787 [--tasks <台账目录>]... [--host <addr> --admin-token <令牌> --yufu-url <御符地址>]
看板：http://127.0.0.1:8787
配置：<数据根>/config/{alert-rules.yml, data-roots.yml}（本包 config/ 为起始模板，复制到数据根后修改）
审计封印：node seal.mjs（--verify 校验）
回归自检：node contracts/render-smoke.mjs
说明：知识库/评审队列/台账为同宿主优化——独立部署时经 --tasks 指定或留空降级；多宿主实例一律经认证 HTTP 上报（见设计文档 §7.4 上报认证）。
`)

execSync('npm pack', { cwd: dist, stdio: 'inherit' })
console.log('[pack] 完成：dist/ 与 dist/architect-observatory-1.0.0.tgz')
