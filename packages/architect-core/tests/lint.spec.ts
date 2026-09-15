import { describe, expect, it } from 'vitest'
import { devicePathHits, lintKnowledge, relativePathCandidates, type KnowledgeSnapshot } from '../src/lint.ts'
import { detectIsolatedKb, lintKnowledgeAt } from '../src/kbcollect.ts'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** 达标快照：1 条已确认 + 1 条待审核（队列与索引齐）。 */
function goodSnapshot(): KnowledgeSnapshot {
  return {
    entries: [
      { path: 'meta/a.md', fields: { title: 'A', domain: 'dsh-ecosystem', 'source.origin': 'o', 'source.ref': 'https://example.com', confirmed: '2026-09-10', status: '已确认', owner: '主人' } },
      { path: 'principle/b.md', fields: { title: 'B', domain: 'methodology', 'source.origin': 'o', 'source.ref': 'docs/x.md', confirmed: '2026-09-10', status: '待审核', owner: '主人' } },
    ],
    reviewQueue: [{ file: 'principle/b.md' }],
    indexes: [
      { dir: 'meta', rows: [{ file: 'a.md', status: '已确认' }] },
      { dir: 'principle', rows: [{ file: 'b.md', status: '待审核' }] },
    ],
  }
}

describe('lintKnowledge 达标路径', () => {
  it('好快照零错误通过，stats 正确；相对路径 ref 缺省核查出 R7 warning', () => {
    const r = lintKnowledge(goodSnapshot())
    expect(r.pass).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0].rule).toBe('R7')
    expect(r.warnings[0].path).toBe('principle/b.md')
    expect(r.stats).toEqual({ entries: 2, confirmed: 1, pending: 1 })
  })

  it('仅有 warnings（未核查的相对路径 ref）不阻断通过', () => {
    const r = lintKnowledge(goodSnapshot())
    expect(r.pass).toBe(true)
    expect(r.warnings.every(w => w.rule === 'R7')).toBe(true)
  })

  it('空快照返回零错误空警告（检查器不得抛错）', () => {
    const r = lintKnowledge({ entries: [], reviewQueue: [], indexes: [] })
    expect(r.pass).toBe(true)
    expect(r.stats.entries).toBe(0)
  })

  it('null/undefined 字段不抛错', () => {
    const r = lintKnowledge(undefined as unknown as KnowledgeSnapshot)
    expect(r.pass).toBe(true)
  })
})

describe('lintKnowledge 破坏样本（八类逐一检出）', () => {
  it('①缺必填字段 → R1', () => {
    const s = goodSnapshot()
    delete (s.entries[0].fields as Record<string, string>)['source.origin']
    const r = lintKnowledge(s)
    expect(r.errors.some(i => i.rule === 'R1' && i.path === 'meta/a.md' && i.message.includes('source.origin'))).toBe(true)
    expect(r.pass).toBe(false)
  })

  it('②status 非法 → R2', () => {
    const s = goodSnapshot()
    ;(s.entries[0].fields as Record<string, string>).status = '草稿'
    const r = lintKnowledge(s)
    expect(r.errors.some(i => i.rule === 'R2')).toBe(true)
  })

  it('③confirmed 日期格式坏 → R3', () => {
    const s = goodSnapshot()
    ;(s.entries[0].fields as Record<string, string>).confirmed = '2026/09/10'
    const r = lintKnowledge(s)
    expect(r.errors.some(i => i.rule === 'R3')).toBe(true)
  })

  it('④队列引用不存在/非待审核条目 → R4', () => {
    const s = goodSnapshot()
    s.reviewQueue = [{ file: 'meta/ghost.md' }, { file: 'meta/a.md' }]
    const r = lintKnowledge(s)
    // 三条：ghost 不存在 + a 非待审核 + 原 b（待审核）因队列被替换而漏登——双向一致性各自独立触发
    expect(r.errors.filter(i => i.rule === 'R4')).toHaveLength(3)
    expect(r.errors.some(i => i.rule === 'R4' && i.message.includes('不存在的条目'))).toBe(true)
    expect(r.errors.some(i => i.rule === 'R4' && i.message.includes('非待审核条目'))).toBe(true)
    expect(r.errors.some(i => i.rule === 'R4' && i.message.includes('未登记 review-queue'))).toBe(true)
  })

  it('⑤待审核条目漏登队列 → R4', () => {
    const s = goodSnapshot()
    s.reviewQueue = []
    const r = lintKnowledge(s)
    expect(r.errors.some(i => i.rule === 'R4' && i.message.includes('未登记 review-queue'))).toBe(true)
  })

  it('⑥index 缺行/引用不存在/状态漂移 → R5', () => {
    const s = goodSnapshot()
    s.indexes = [
      { dir: 'meta', rows: [{ file: 'ghost.md', status: '已确认' }] },
      { dir: 'principle', rows: [{ file: 'b.md', status: '已确认' }] },
    ]
    const r = lintKnowledge(s)
    expect(r.errors.some(i => i.rule === 'R5' && i.message.includes('未登记所在目录'))).toBe(true)
    expect(r.errors.some(i => i.rule === 'R5' && i.message.includes('引用不存在的条目'))).toBe(true)
    expect(r.errors.some(i => i.rule === 'R5' && i.message.includes('不一致'))).toBe(true)
  })

  it('⑦owner 为空 → R6', () => {
    const s = goodSnapshot()
    ;(s.entries[0].fields as Record<string, string>).owner = ' '
    const r = lintKnowledge(s)
    expect(r.errors.some(i => i.rule === 'R6')).toBe(true)
  })

  it('⑧refExists=false 升 R7 error；true 消音；undefined 保持 warning', () => {
    const s = goodSnapshot()
    const rFalse = lintKnowledge(s, { refExists: () => false })
    expect(rFalse.errors.some(i => i.rule === 'R7')).toBe(true)
    expect(rFalse.pass).toBe(false)
    const rTrue = lintKnowledge(s, { refExists: () => true })
    expect(rTrue.errors.filter(i => i.rule === 'R7')).toHaveLength(0)
    expect(rTrue.warnings).toEqual([])
  })
})

describe('路径归一与候选提取', () => {
  it('反斜杠与 ./ 前缀归一后可匹配（R4/R5 跨平台）', () => {
    const s = goodSnapshot()
    s.entries[1].path = 'principle\\b.md'
    const r = lintKnowledge(s)
    expect(r.errors.filter(i => i.rule === 'R4' || i.rule === 'R5')).toHaveLength(0)
  })

  it('relativePathCandidates 只收相对路径形态', () => {
    expect(relativePathCandidates('https://mp.weixin.qq.com/s/abc（含 8 张图）')).toEqual([])
    expect(relativePathCandidates('../../adapters/README.md；与 suite 同构（核心不动）')).toEqual(['../../adapters/README.md'])
    expect(relativePathCandidates('§0/§1.2/§9')).toEqual([])
    expect(relativePathCandidates('docs/designs/2026-09-10-x.md')).toEqual(['docs/designs/2026-09-10-x.md'])
  })
})

describe('R9 设备路径检出（禁止入库）', () => {
  it('红样本：Windows 盘符路径与家目录路径被检出', () => {
    expect(devicePathHits('路径 E:\\code\\dsh 与 C:/Users/alice/x')).toContain('E:\\code\\dsh')
    expect(devicePathHits('家目录 C:\\Users\\lome\\AppData\\Local')).toContain('C:\\Users\\lome\\AppData\\Local')
    expect(devicePathHits('设备前缀 \\\\?\\C:\\very\\long')).not.toEqual([])
    expect(devicePathHits('盘符带空格 E:\\Development\\Code\\nodejs').length).toBe(1)
  })

  it('绿样本：URL/仓库地址、容器路径、环境变量、相对路径不误伤', () => {
    expect(devicePathHits('仓库 github.com/lomehong/digital-architect 与 https://example.com/a')).toEqual([])
    expect(devicePathHits('容器路径 /opt/architect、/workspace、/home/pi/.omp')).toEqual([])
    expect(devicePathHits('变量 $DSH_HOME 与相对路径 architect-knowledge/principle/')).toEqual([])
    expect(devicePathHits('正文引用 见 docs/designs/x.md 与 http://127.0.0.1:3088/dsh-memory/entries')).toEqual([])
  })

  it('R9 命中即 error 阻断（frontmatter 值或正文任一路径）', () => {
    const snap = goodSnapshot()
    snap.entries[0] = { ...snap.entries[0], body: '正文里写了 E:\\code\\nodejs\\dsh 这个设备路径' }
    const r = lintKnowledge(snap)
    expect(r.pass).toBe(false)
    expect(r.errors.some(e => e.rule === 'R9' && e.path === 'meta/a.md')).toBe(true)
  })

  it('R9 不检缺省 body（向后兼容）', () => {
    const r = lintKnowledge(goodSnapshot())
    expect(r.errors.some(e => e.rule === 'R9')).toBe(false)
  })
})

describe('queueLenient（快照上下文）', () => {
  const snap = () => ({
    entries: [{ path: 'principle/x.md', fields: { title: 'X', domain: 'd', 'source.origin': 'o', 'source.ref': 'https://e.com', confirmed: '2026-09-11', status: '待审核', owner: '主人' } }],
    reviewQueue: [],
    indexes: [],
  })
  it('缺省：待审核未登记 queue/index → R4+R5 error', () => {
    const r = lintKnowledge(snap())
    expect(r.pass).toBe(false)
    expect(r.errors.filter(e => e.rule === 'R4' || e.rule === 'R5').length).toBe(2)
  })
  it('queueLenient: R4/R5 降级为 warning，pass=true', () => {
    const r = lintKnowledge(snap(), { queueLenient: true })
    expect(r.pass).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings.filter(w => w.rule === 'R4' || w.rule === 'R5').length).toBe(2)
  })
})

/** fs 夹具：合成「父目录 + KB 根」结构。opts 控制 .git / docs / KB 完整性。 */
function kbFixture(opts: { git?: boolean; docs?: boolean; dirs?: string[] } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'kbproof-'))
  const kb = join(parent, 'architect-knowledge')
  for (const d of opts.dirs ?? ['meta', 'principle', 'scenario', 'practice', 'reference']) mkdirSync(join(kb, d), { recursive: true })
  // 一条已确认条目，ref 指向不存在的 KB 外路径（触发 R7 的探针样本）
  const entry = ['---', 'title: T', 'domain: dsh-ecosystem', 'source:', '  origin: o', '  ref: docs/designs/nope.md', 'confirmed: 2026-09-14', 'status: 已确认', 'owner: 主人', '---', '', '# T'].join('\n')
  writeFileSync(join(kb, 'principle', 't.md'), entry)
  writeFileSync(join(kb, 'principle', 'index.md'), '# principle\n\n| 条目 | 定位 | 状态 |\n|---|---|---|\n| [t.md](t.md) | t | 已确认 |\n')
  if (opts.git) mkdirSync(join(parent, '.git'))
  if (opts.docs) mkdirSync(join(parent, 'docs'))
  return { parent, kb }
}

describe('隔离上下文感知（detectIsolatedKb + lintKnowledgeAt）', () => {
  it('A 隔离上下文（无 .git 父目录 ∧ 五类目录齐 ∧ 无 docs/）→ R7 降 warning，pass=true', () => {
    const { kb } = kbFixture()
    expect(detectIsolatedKb(kb)).toBe(true)
    const r = lintKnowledgeAt(kb)
    expect(r.isolated).toBe(true)
    expect(r.pass).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings.some(w => w.rule === 'R7')).toBe(true)
  })
  it('B 真实仓（父目录有 .git）→ 恒 hard（负向轴：不误降级）', () => {
    const { kb } = kbFixture({ git: true })
    expect(detectIsolatedKb(kb)).toBe(false)
    const r = lintKnowledgeAt(kb)
    expect(r.isolated).toBe(false)
    expect(r.pass).toBe(false)
    expect(r.errors.some(e => e.rule === 'R7')).toBe(true)
  })
  it('C 既有 .snapshot 标记 → 隔离（既有机制不回归）', () => {
    const { kb } = kbFixture({ git: true })
    writeFileSync(join(kb, '.snapshot'), 'snapshot: true\n')
    const r = lintKnowledgeAt(kb)
    expect(r.isolated).toBe(true)
    expect(r.pass).toBe(true)
  })
  it('D 负向轴：无 .git 但有 docs/ → 恒 hard', () => {
    const { kb } = kbFixture({ docs: true })
    expect(detectIsolatedKb(kb)).toBe(false)
    expect(lintKnowledgeAt(kb).errors.some(e => e.rule === 'R7')).toBe(true)
  })
  it('E 负向轴：KB 不完整（缺一类目录）→ 不判隔离', () => {
    const { kb } = kbFixture({ dirs: ['principle'] })
    expect(detectIsolatedKb(kb)).toBe(false)
  })
  it('F 显式覆盖双向生效：isolated:false 在 A 夹具恒 hard；isolated:true 在 B 夹具转 soft', () => {
    const { kb: kbA } = kbFixture()
    expect(lintKnowledgeAt(kbA, process.cwd(), { isolated: false }).errors.some(e => e.rule === 'R7')).toBe(true)
    const { kb: kbB } = kbFixture({ git: true })
    const r = lintKnowledgeAt(kbB, process.cwd(), { isolated: true })
    expect(r.isolated).toBe(true)
    expect(r.pass).toBe(true)
  })
  it('G 独立开关：refExistsSoft 与 queueLenient 可分别覆盖（Gap-4）', () => {
    const { kb } = kbFixture()
    // 隔离上下文但显式 refExistsSoft:false → R7 仍 hard；queueLenient:false → 队列仍 hard
    const r = lintKnowledgeAt(kb, process.cwd(), { isolated: true, refExistsSoft: false })
    expect(r.errors.some(e => e.rule === 'R7')).toBe(true)
  })
})