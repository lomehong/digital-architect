#!/usr/bin/env node
/**
 * task-ledger.mjs —— 任务面（Task Surface）契约的 omp 宿主实现（文件台账）。
 *
 * 契约出处：architect-knowledge/principle/task-and-memory-surface.md（宿主无关五操作 + 四态状态机 + 四不变量）。
 * 落点：<目标项目>/.architect/tasks/<taskId>.yaml（git 管理、跨会话可查）。
 *
 * 命令：new / claim / report / confirm / list / archive / --validate / --selftest
 * 纪律：非法跳步一律拒绝并给出允许的下一步；解析/校验异常 exit 非 0，**绝不静默绿**；
 *       密钥类敏感值不入台账。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const STATUS = { PENDING: '待执行', RUNNING: '执行中', REVIEW: '待确认', DONE: '已落定' }
const TRANSITIONS = {
  claim: { from: [STATUS.PENDING], to: STATUS.RUNNING },
  report: { from: [STATUS.RUNNING], to: STATUS.REVIEW },
  confirm: { from: [STATUS.REVIEW], to: STATUS.DONE },
  reject: { from: [STATUS.REVIEW], to: STATUS.RUNNING },
}
const FIELDS = ['id', 'title', 'level', 'status', 'root', 'createdAt', 'claimedBy', 'reportedAt', 'reportSummary', 'confirmedBy', 'confirmedVia', 'confirmedAt', 'archived']

// ── 极简 YAML 读写（本契约固定形状：扁平标量 + events 字符串列表；未知形状一律报错）──
function esc(v) { return String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n') }
function unesc(v) { return v.replace(/\\n/g, '\n').replace(/\\\\/g, '\\') }

export function serialize(task) {
  const lines = []
  for (const k of FIELDS) if (task[k] !== undefined && task[k] !== '') lines.push(`${k}: ${esc(task[k])}`)
  lines.push('events:')
  for (const e of task.events ?? []) lines.push(`  - ${esc(e)}`)
  return lines.join('\n') + '\n'
}

export function parse(text) {
  const task = { events: [] }
  let inEvents = false
  for (const raw of String(text).split(/\r?\n/)) {
    if (raw.trim() === '') continue
    if (/^events:\s*$/.test(raw)) { inEvents = true; continue }
    const ev = raw.match(/^\s+-\s?(.*)$/)
    if (inEvents && ev) { task.events.push(unesc(ev[1])); continue }
    const kv = raw.match(/^([A-Za-z][A-Za-z0-9_]*):\s?(.*)$/)
    if (!kv) throw new Error(`台账格式非法（无法解析行）：${raw}`)
    inEvents = false
    task[kv[1]] = unesc(kv[2])
  }
  if (!task.id) throw new Error('台账缺少 id 字段')
  if (!Object.values(STATUS).includes(task.status)) throw new Error(`台账 status 非法：${task.status}`)
  return task
}

/** 状态机守卫：非法跳步 → 抛错并给出允许动作。 */
export function assertTransition(task, op) {
  const t = TRANSITIONS[op]
  if (!t) throw new Error(`未知操作：${op}`)
  if (!t.from.includes(task.status)) {
    const allowed = Object.entries(TRANSITIONS).filter(([, v]) => v.from.includes(task.status)).map(([k]) => k)
    throw new Error(`非法跳步：任务 ${task.id} 当前「${task.status}」，不允许 ${op}；当前允许：${allowed.join('、') || '（无——已落定，需先 reject 或归档）'}`)
  }
  return t.to
}

function stamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19) }
function ledgerDir(root) { return join(root, '.architect', 'tasks') }
function taskPath(root, id) { return join(ledgerDir(root), `${id}.yaml`) }
function load(root, id) {
  const p = taskPath(root, id)
  if (!existsSync(p)) throw new Error(`台账不存在：${p}（先执行 new）`)
  return parse(readFileSync(p, 'utf8'))
}
function save(root, task, op, by) {
  task.events = [...(task.events ?? []), `${stamp()} | ${op} | by=${by}`]
  mkdirSync(ledgerDir(root), { recursive: true })
  writeFileSync(taskPath(root, task.id), serialize(task))
}

export function run(argv) {
  const [cmd, ...rest] = argv
  const opt = (name, def = '') => {
    const i = rest.indexOf(`--${name}`)
    return i >= 0 && rest[i + 1] !== undefined ? rest[i + 1] : def
  }
  const root = opt('root', process.cwd())
  const by = opt('by', process.env.USER || process.env.USERNAME || 'unknown')
  const id = opt('id', '')

  switch (cmd) {
    case 'new': {
      const title = opt('title')
      if (!opt('id') || !title) throw new Error('new 需要 --id 与 --title')
      const level = opt('level', 'L1')
      const accept = opt('accept')
      const task = {
        id, title, level, status: STATUS.PENDING, root,
        createdAt: stamp(),
        events: [`${stamp()} | create | by=${by} | level=${level}${accept ? ' | accept=' + accept : ''}`],
      }
      const p = taskPath(root, id)
      if (existsSync(p)) throw new Error(`台账已存在：${p}`)
      mkdirSync(ledgerDir(root), { recursive: true })
      writeFileSync(p, serialize(task))
      console.log(`已立项 ${id}（${STATUS.PENDING}）→ ${p}`)
      return 0
    }
    case 'claim': case 'report': case 'confirm': case 'reject': {
      const task = load(root, id)
      const to = assertTransition(task, cmd)
      if (cmd === 'confirm') {
        const cBy = opt('confirmed-by')
        const cVia = opt('confirmed-via')
        if (!cBy) throw new Error('confirm 必须带 --confirmed-by（主人标识）——契约不变量②：确认只能由主人发起')
        if (!cVia) throw new Error('confirm 必须带 --confirmed-via（确认来源：ask 交互/消息引用）——不得无来源确认')
        task.confirmedBy = cBy; task.confirmedVia = cVia; task.confirmedAt = stamp()
      }
      if (cmd === 'report') {
        task.reportedAt = stamp()
        task.reportSummary = opt('summary', task.reportSummary || '（未填摘要）')
      }
      if (cmd === 'claim') task.claimedBy = by
      task.status = to
      save(root, task, cmd, by)
      console.log(`${id} → ${to}`)
      return 0
    }
    case 'archive': {
      const task = load(root, id)
      if (task.status !== STATUS.DONE && !opt('force')) {
        throw new Error(`仅「${STATUS.DONE}」可归档（当前「${task.status}」）；确需归档请显式 --force 并在 note 说明`)
      }
      task.archived = stamp()
      save(root, task, 'archive', by)
      console.log(`${id} 已归档`)
      return 0
    }
    case 'list': {
      const dir = ledgerDir(root)
      if (!existsSync(dir)) { console.log('（无台账目录）'); return 0 }
      const rows = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort()
      for (const f of rows) {
        const t = parse(readFileSync(join(dir, f), 'utf8'))
        console.log(`${t.id}\t${t.status}\t${t.level ?? ''}\t${t.title}${t.archived ? '\t[已归档]' : ''}`)
      }
      return 0
    }
    case '--validate': {
      const roots = []
      for (let i = 0; i < rest.length; i++) if (rest[i] === '--root') roots.push(rest[i + 1])
      if (roots.length === 0) roots.push(process.cwd())
      let n = 0, bad = 0
      for (const r of roots) {
        const dir = ledgerDir(r)
        if (!existsSync(dir)) { console.log(`跳过（无台账目录）：${dir}`); continue }
        for (const f of readdirSync(dir).filter(f => f.endsWith('.yaml'))) {
          const p = join(dir, f)
          try {
            const t = parse(readFileSync(p, 'utf8'))
            const base = f.replace(/\.ya?ml$/, '')
            if (t.id !== base) throw new Error(`文件名与 id 不一致（${base} vs ${t.id}）`)
            if (t.status === STATUS.DONE && !t.confirmedBy) throw new Error('已落定但缺少 confirmedBy')
            n++
          } catch (e) { bad++; console.error(`✗ ${p}：${e.message}`) }
        }
      }
      if (bad > 0) { console.error(`台账校验失败：${bad} 处`); return 1 }
      console.log(`台账校验通过：${n} 条`)
      return 0
    }
    case '--selftest': return selftest()
    default:
      console.log('用法：task-ledger.mjs new|claim|report|confirm|reject|list|archive|--validate|--selftest [--root <dir>] [--id <id>] [--title ...] [--summary ...] [--confirmed-by ...] [--confirmed-via ...] [--force]')
      return cmd === undefined || cmd === '--help' || cmd === 'help' ? 0 : 1
  }
}

function expectThrow(fn, needle) {
  let threw = false
  try { fn() } catch (e) {
    threw = true
    if (!e.message.includes(needle)) throw new Error(`错误信息不含「${needle}」：${e.message}`)
  }
  if (!threw) throw new Error(`应拒绝但通过了：${needle}`)
}

function selftest() {
  // ── 绿态：完整合法生命周期 ──
  const dir = mkdtempSync(join(tmpdir(), 'task-ledger-'))
  const r = (...a) => run([...a, '--root', dir])
  r('new', '--id', 'T-1', '--title', '自测任务', '--level', 'L1', '--accept', '可验收条目A')
  r('claim', '--id', 'T-1', '--by', 'tester')
  r('report', '--id', 'T-1', '--by', 'tester', '--summary', '完成X')
  expectThrow(() => r('archive', '--id', 'T-1'), '仅「已落定」可归档')
  r('confirm', '--id', 'T-1', '--by', 'tester', '--confirmed-by', 'master', '--confirmed-via', 'ask#1')
  r('archive', '--id', 'T-1')
  const done = parse(readFileSync(join(ledgerDir(dir), 'T-1.yaml'), 'utf8'))
  if (done.status !== STATUS.DONE || done.confirmedBy !== 'master' || !done.archived) throw new Error('绿态生命周期未达已落定/归档')
  if (run(['--validate', '--root', dir]) !== 0) throw new Error('绿态台账校验未通过')
  rmSync(dir, { recursive: true, force: true })

  // ── 红态：非法跳步 / 缺确认来源 / 已落定后不可回退 ──
  const dir2 = mkdtempSync(join(tmpdir(), 'task-ledger-red-'))
  const r2 = (...a) => run([...a, '--root', dir2])
  r2('new', '--id', 'T-2', '--title', '跳步样本')
  expectThrow(() => r2('report', '--id', 'T-2', '--summary', 'x'), '非法跳步')       // 未 claim
  expectThrow(() => r2('confirm', '--id', 'T-2', '--confirmed-by', 'm', '--confirmed-via', 'v'), '非法跳步')
  r2('claim', '--id', 'T-2', '--by', 'tester')
  expectThrow(() => r2('confirm', '--id', 'T-2', '--confirmed-by', 'm', '--confirmed-via', 'v'), '非法跳步') // 未 report
  r2('report', '--id', 'T-2', '--by', 'tester', '--summary', 'y')
  expectThrow(() => r2('confirm', '--id', 'T-2', '--confirmed-via', 'ask#2'), '必须带 --confirmed-by')       // 无主人标识
  expectThrow(() => r2('confirm', '--id', 'T-2', '--confirmed-by', 'master'), '必须带 --confirmed-via')      // 无来源
  r2('confirm', '--id', 'T-2', '--by', 'tester', '--confirmed-by', 'master', '--confirmed-via', 'ask#2')
  expectThrow(() => r2('reject', '--id', 'T-2'), '非法跳步')                                  // 已落定不可回退
  expectThrow(() => r2('claim', '--id', 'T-2'), '非法跳步')
  rmSync(dir2, { recursive: true, force: true })

  // ── 损坏台账必须被 --validate 抓住（不静默绿）──
  const dir3 = mkdtempSync(join(tmpdir(), 'task-ledger-bad-'))
  mkdirSync(ledgerDir(dir3), { recursive: true })
  writeFileSync(join(ledgerDir(dir3), 'T-bad.yaml'), 'id: T-bad\ntitle: x\nlevel: L1\nstatus: 已落定\n')
  const code = run(['--validate', '--root', dir3])
  rmSync(dir3, { recursive: true, force: true })
  if (code === 0) throw new Error('--validate 应对「已落定但缺 confirmedBy」报错')

  console.log('selftest 通过（绿：立项→认领→自报→确认→归档 + 校验；红：4 类跳步/缺来源/归档前置/损坏台账）')
  return 0
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('task-ledger.mjs')) {
  try { process.exit(run(process.argv.slice(2))) } catch (e) { console.error(`✗ ${e.message}`); process.exit(1) }
}
