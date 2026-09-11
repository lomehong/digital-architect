#!/usr/bin/env node
/**
 * kb-harvest.mjs —— 生产态知识写回的收割工具（开发态执行；principle/production-writeback-pipeline.md）。
 *
 * 用法：
 *   node scripts/kb-harvest.mjs --from <目标项目根> [--kb <大脑知识库根>] [--dry-run] [--selftest]
 *
 * 行为：扫描 <from>/.architect/knowledge/candidates/*.md → 逐条校验（复用 core lint，R1~R9 同源）→
 *       合格条目按 kb_target 复制进大脑 practice/ 或 reference/（status 改 待审核）→
 *       候选移入 candidates/harvested/ 并记 harvested 日期（防重复收割）。
 * 纪律：坏条目拒绝收割并留报告（exit 1）；解析失败绝不静默绿；--selftest 红绿夹具自证。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// 大脑仓内核心构建产物（harvest 是开发态工具；运行前 npm --prefix packages/architect-core run build）
const core = require(require.resolve('../packages/architect-core/lib/kbcollect.js'))
const lint = require(require.resolve('../packages/architect-core/lib/lint.js'))

function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) if ((lines[i] ?? '').trim() === '---') { end = i; break }
  if (end < 0) return null
  const f = {}
  let nested = null
  for (let i = 1; i < end; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const flat = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (flat) { nested = flat[2].trim() === '' ? flat[1] : null; if (nested === null) f[flat[1]] = flat[2].trim(); continue }
    const sub = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/)
    if (sub && nested !== null) { f[`${nested}.${sub[1]}`] = sub[2].trim(); continue }
    return null
  }
  return f
}

function mktempRoot() {
  const d = join(tmpdir(), 'kb-harvest-' + Math.random().toString(36).slice(2, 8))
  mkdirSync(d, { recursive: true })
  return d
}

function run(argv) {
  const opt = (name, def = '') => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def }
  if (argv[0] === '--selftest') return selftest()
  const from = opt('--from')
  const kb = opt('--kb', 'architect-knowledge')
  const dry = argv.includes('--dry-run')
  if (!from) { console.error('✗ --from <目标项目根> 必填'); return 1 }
  const candDir = resolve(from, '.architect', 'knowledge', 'candidates')
  if (!existsSync(candDir)) { console.log(`跳过（无候选目录）：${candDir}`); return 0 }
  const kbRoot = resolve(process.cwd(), kb)
  const refExists = core.makeRefExists(kbRoot)
  const files = readdirSync(candDir).filter(f => f.endsWith('.md') && !f.startsWith('.'))
  const harvestedDir = join(candDir, 'harvested')
  let copied = 0, rejected = 0, skipped = 0
  const report = []
  for (const f of files) {
    const p = join(candDir, f)
    let text; try { text = readFileSync(p, 'utf8') } catch (e) { rejected++; report.push(`✗ ${f}：读取失败 ${e.message}`); continue }
    const fm = parseFrontmatter(text)
    if (fm === null) { rejected++; report.push(`✗ ${f}：frontmatter 无法解析`); continue }
    if ((fm.harvested ?? '') !== '') { skipped++; continue }
    if ((fm.status ?? '') !== '候选-生产') { rejected++; report.push(`✗ ${f}：status 非「候选-生产」`); continue }
    const entry = { path: `candidates/${f}`, fields: { title: fm.title ?? '', domain: fm.domain ?? '', 'source.origin': fm['source.origin'] ?? '', 'source.ref': fm['source.ref'] ?? '', confirmed: fm.confirmed ?? '', status: '待审核', owner: fm.owner ?? '' }, body: text }
    // 合成 queue/index 满足 R4/R5（库级结构规则不适用于单条候选）——harvest 只评条目级规则
    const r = lint.lintKnowledge({ entries: [entry], reviewQueue: [{ file: entry.path }], indexes: [{ dir: 'candidates', rows: [{ file: f, status: '待审核' }] }] }, { refExists })
    if (!r.pass) { rejected++; report.push(`✗ ${f}：lint 未过 — ${r.errors.map(e => `[${e.rule}] ${e.message}`).join('；')}`); continue }
    const target = (fm.kb_target ?? 'practice') === 'reference' ? 'reference' : 'practice'
    const destDir = join(kbRoot, target)
    let destName = f; let n = 1
    while (existsSync(join(destDir, destName))) { destName = f.replace(/\.md$/, `-${n++}.md`) }
    if (!dry) {
      mkdirSync(destDir, { recursive: true })
      mkdirSync(harvestedDir, { recursive: true })
      writeFileSync(join(destDir, destName), text.replace(/^status: 候选-生产$/m, 'status: 待审核'))
      writeFileSync(join(harvestedDir, f), text.replace(/^status: 候选-生产$/m, 'status: 候选-生产\nharvested: ' + new Date().toISOString().slice(0, 10)))
      rmSync(p)
    }
    copied++
    report.push(`✓ ${f} → ${target}/${destName}${dry ? '（dry-run）' : ''}`)
  }
  console.log(report.join('\n'))
  console.log(`收割 ${copied}｜拒绝 ${rejected}｜跳过(harvested) ${skipped}${dry ? '｜dry-run' : ''}`)
  return rejected > 0 ? 1 : 0
}

function expect(cond, message) { if (!cond) throw new Error(message) }

function selftest() {
  const tmp = mktempRoot()
  try {
    const proj = join(tmp, 'proj'); const kb = join(tmp, 'kb')
    for (const d of ['meta', 'practice', 'reference']) { mkdirSync(join(kb, d), { recursive: true }); writeFileSync(join(kb, d, 'index.md'), '| 条目 | 定位 | 状态 |\n|---|---|---|\n') }
    const cand = join(proj, '.architect', 'knowledge', 'candidates')
    mkdirSync(cand, { recursive: true })
    writeFileSync(join(cand, '2026-09-11-good.md'), ['---', 'title: 生产经验A', 'domain: dsh-ecosystem', 'kb_target: practice', 'source:', '  origin: 生产实测', '  ref: https://example.com/a', 'confirmed: 2026-09-11', 'status: 候选-生产', 'owner: 架构师(omp)', '---', '', '# 生产经验A'].join('\n'))
    writeFileSync(join(cand, '2026-09-11-bad.md'), ['---', 'title: 坏条目', 'domain: dsh-ecosystem', 'kb_target: reference', 'source:', '  origin: x', '  ref: E:\\bad\\path.md', 'confirmed: 2026-09-11', 'status: 候选-生产', 'owner: 架构师(omp)', '---', '', '# 坏'].join('\n'))
    const code = run(['--from', proj, '--kb', kb])
    expect(code === 1, '含坏条目时退出码应为 1')
    expect(existsSync(join(kb, 'practice', '2026-09-11-good.md')), 'good 应收割进 practice 且 status 改待审核')
    expect(readFileSync(join(kb, 'practice', '2026-09-11-good.md'), 'utf8').includes('status: 待审核'), '收割副本 status 应为待审核')
    expect(readFileSync(join(cand, 'harvested', '2026-09-11-good.md'), 'utf8').includes('harvested:'), '候选应标记 harvested')
    expect(!existsSync(join(kb, 'reference', '2026-09-11-bad.md')), 'bad 不应被收割')
    expect(existsSync(join(cand, '2026-09-11-bad.md')), 'bad 原件应留在候选区')
    const code2 = run(['--from', proj, '--kb', kb])
    expect(code2 === 1, '坏条目永久留在候选区，每轮再拒（exit 1）')
    expect(!existsSync(join(kb, 'practice', '2026-09-11-good-1.md')), 'good 已 harvested，不应重复收割出副本')
    expect(existsSync(join(cand, '2026-09-11-bad.md')), 'bad 留在候选区待人工处理')
    // dry-run 不落盘（坏条目仍在 → exit 1，但 good 不落盘）
    writeFileSync(join(cand, '2026-09-11-dry.md'), readFileSync(join(cand, 'harvested', '2026-09-11-good.md'), 'utf8').replace(/^harvested: .*/m, '').replace('status: 候选-生产', 'status: 候选-生产'))
    const code3 = run(['--from', proj, '--kb', kb, '--dry-run'])
    expect(!existsSync(join(kb, 'practice', '2026-09-11-dry.md')), 'dry-run 不应落盘')
    console.log('selftest 通过（收割 good / 拒收 bad / harvested 防重复 / dry-run 不落盘）')
    return 0
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('kb-harvest.mjs')) {
  process.exit(run(process.argv.slice(2)))
}
