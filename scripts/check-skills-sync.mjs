#!/usr/bin/env node
/**
 * check-skills-sync.mjs — 技能发现根链接健康检查（2026-10-10 改造）。
 *
 * 历史：原名「SKILL 三副本一致性校验」（母包 G3，2026-09-11）——.claude/.omp 双物理镜像随
 * 「技能发现根链接化收敛」方案退役（docs/designs/2026-10-10-技能发现根链接化收敛-技术方案.md §2.2），
 * 本脚本改造为**链接健康检查**：逐根逐技能断言「发现根/<name> 存在、可解析至 skills/<name>、SKILL.md 可读」。
 * 发现根链接由 scripts/link-skills.ps1|.sh bootstrap 维护（本脚本只验证不修复，fail-closed）。
 *
 * 用法: node scripts/check-skills-sync.mjs [--selftest]
 * 退出码: 0=pass 1=fail 2=内部错误（对齐 gate-guard 三值语义）。
 * 治理: 本脚本自身纳入 gate-guard PROTECTED（2026-10-10 主人拍板）——改造本脚本的提交需 Gate-Approved。
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOTS = ['.claude/skills', '.omp/skills', '.dsh/skills']
const repo = process.cwd()
const src = path.join(repo, 'skills')

function skillNames() {
  return readdirSync(src).filter(n => {
    try { return existsSync(path.join(src, n, 'SKILL.md')) } catch { return false }
  })
}

function healthProblems() {
  const problems = []
  const names = skillNames()
  for (const root of ROOTS) {
    for (const name of names) {
      const link = path.join(repo, root.replace(/\//g, path.sep), name)
      if (!existsSync(path.join(link, 'SKILL.md'))) {
        problems.push(`缺失/断链: ${root}/${name}`)
        continue
      }
      try {
        const rl = realpathSync(link)
        const rt = realpathSync(path.join(src, name))
        if (path.relative(rl, rt) !== '') problems.push(`指错: ${root}/${name} → ${rl}`)
      } catch {
        problems.push(`不可解析: ${root}/${name}`)
      }
    }
  }
  return problems
}

function selftest() {
  const t = path.join(tmpdir(), `skill-links-selftest-${Date.now()}`)
  try {
    const canon = path.join(t, 'skills', 'demo')
    const rootDir = path.join(t, 'roots', 'r1')
    mkdirSync(canon, { recursive: true })
    writeFileSync(path.join(canon, 'SKILL.md'), 'demo')
    mkdirSync(rootDir, { recursive: true })
    symlinkSync(canon, path.join(rootDir, 'demo'), 'junction')
    const link = path.join(rootDir, 'demo')
    const green = existsSync(path.join(link, 'SKILL.md')) &&
      path.relative(realpathSync(link), realpathSync(canon)) === ''
    rmSync(canon, { recursive: true, force: true })   // 拆目标——链接应转断（红态）
    const red = !existsSync(path.join(link, 'SKILL.md'))
    rmSync(t, { recursive: true, force: true })
    if (green && red) { console.log('SELFTEST GREEN（链接健康断言红绿两态均验证）'); return }
    console.error(`SELFTEST 异常: green=${green} red=${red}`)
    process.exit(2)
  } catch (e) {
    console.error('SELFTEST 异常:', e.message)
    process.exit(2)
  }
}

if (process.argv.includes('--selftest')) { selftest(); }

const problems = healthProblems()
if (problems.length === 0) {
  console.log(`链接健康检查 PASS: ${ROOTS.length} 根 × ${skillNames().length} 技能（链接全存在、全解析、全可达）`)
  process.exit(0)
}
problems.forEach(p => console.error('FAIL: ' + p))
console.error(`链接健康检查 FAIL（${problems.length} 处）——运行 scripts/link-skills bootstrap 修复`)
process.exit(1)
