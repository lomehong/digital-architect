#!/usr/bin/env node
/**
 * seal.mjs — 不可变审计归档（哈希链封印），闭合 RR-2。
 *
 * 语义：
 *   对每一天的全部事件文件（obs/events/**）计算内容摘要，写入哈希链封印记录；
 *   封印**只增不改**（append-only），链上每条记录含前一条的摘要 → 任何历史篡改/删除都可检出。
 *   同一日可多次封印（当日事件仍在增长）：每次封印记录当时的摘要与文件数，
 *   校验时以**最近一次**封印为准比对当前内容 → 「封印后被改动」可检出。
 *
 * 用法：
 *   node seal.mjs [--root <obs 根>]            封印所有存在事件的日期
 *   node seal.mjs --verify [--root <obs 根>]   校验哈希链与内容一致性（exit 1 = 不一致）
 */
import { readFileSync, readdirSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const VERIFY = args.includes('--verify')
const OBS = (() => {
  const i = args.indexOf('--root')
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : join(ROOT, 'obs')
})()
const EVENTS = join(OBS, 'events')
const ARCHIVE = join(OBS, 'archive')
const SEALS_FILE = join(ARCHIVE, 'seals.ndjson')

function listEventFiles() {
  const out = []
  if (!existsSync(EVENTS)) return out
  for (const inst of readdirSync(EVENTS)) {
    const dir = join(EVENTS, inst)
    let names = []
    try { names = readdirSync(dir) } catch { continue }
    for (const f of names) if (f.endsWith('.ndjson')) out.push({ rel: `${inst}/${f}`, abs: join(dir, f) })
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

/** 按日期分组；对每组计算 sha256（文件路径 + 内容依序拼接），返回 { day, files, bytes, sha256 } */
function digestByDay() {
  const groups = {}
  for (const f of listEventFiles()) {
    const day = (f.rel.match(/(\d{4}-\d{2}-\d{2})\.ndjson$/) || [])[1] ?? 'unknown'
    ;(groups[day] = groups[day] || []).push(f)
  }
  return Object.keys(groups).sort().map((day) => {
    const h = createHash('sha256')
    let bytes = 0
    for (const f of groups[day]) {
      const content = readFileSync(f.abs)
      bytes += content.length
      h.update(f.rel)
      h.update('\u0000')
      h.update(content)
    }
    return { day, files: groups[day].length, bytes, sha256: h.digest('hex') }
  })
}

function readSeals() {
  if (!existsSync(SEALS_FILE)) return []
  return readFileSync(SEALS_FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

function seal() {
  mkdirSync(ARCHIVE, { recursive: true })
  const seals = readSeals()
  const prev = seals.length > 0 ? seals[seals.length - 1].chainSha : 'GENESIS'
  const today = new Date().toISOString().slice(0, 10)
  const includeToday = args.includes('--include-today')
  const all = digestByDay()
  const digests = all.filter((d) => d.day !== today || includeToday)
  if (digests.length === 0) {
    console.log(`[seal] 无可封印事件（仅当日 ${today} 有事件；闭日封印默认跳过当日，如需时点密封用 --include-today）`)
    return
  }
  let prevChain = prev
  const appended = []
  for (const d of digests) {
    // closed = 封印时该日已结束（严格不可变）；当日封印为检查点（允许增长，检出删除/截断）
    const closed = d.day < today
    const chain = createHash('sha256').update(prevChain).update('|').update(d.day).update('|').update(d.sha256).digest('hex')
    const rec = { ts: new Date().toISOString(), day: d.day, closed, files: d.files, bytes: d.bytes, sha256: d.sha256, prevSha: prevChain, chainSha: chain }
    appendFileSync(SEALS_FILE, JSON.stringify(rec) + '\n')
    prevChain = chain
    appended.push(rec)
    console.log(`[seal] ${d.day}${closed ? '（闭日·严格）' : '（当日·检查点）'}: ${d.files} 文件 / ${d.bytes} 字节 → sha256 ${d.sha256.slice(0, 16)}…`)
  }
  const snapDir = join(ARCHIVE, 'snapshot-' + new Date().toISOString().replace(/[:.]/g, '-'))
  mkdirSync(snapDir, { recursive: true })
  writeFileSync(join(snapDir, 'manifest.json'), JSON.stringify({ ts: new Date().toISOString(), obs: OBS, seals: appended }, null, 2))
  console.log(`[seal] 已记 ${appended.length} 条封印；清单 ${snapDir}\\manifest.json`)
}

function verify() {
  const seals = readSeals()
  if (seals.length === 0) { console.log('[verify] 无封印记录（先跑 node seal.mjs）'); process.exit(1) }
  const problems = []
  const notes = []
  // 1) 链完整性
  let prev = 'GENESIS'
  for (const s of seals) {
    if (s.prevSha !== prev) problems.push(`链断裂：${s.day} 记录的 prevSha 与上一条 chainSha 不符`)
    const expect = createHash('sha256').update(prev).update('|').update(s.day).update('|').update(s.sha256).digest('hex')
    if (expect !== s.chainSha) problems.push(`链摘要不符：${s.day}（记录 ${s.chainSha.slice(0, 12)}… 期望 ${expect.slice(0, 12)}…）`)
    prev = s.chainSha
  }
  // 2) 内容一致性（每日以最近一次封印为准）
  const latest = {}
  for (const s of seals) latest[s.day] = s
  const now = {}
  for (const d of digestByDay()) now[d.day] = d
  for (const day of Object.keys(latest)) {
    const sealed = latest[day]
    const cur = now[day]
    if (!cur) { problems.push(`内容缺失：${day} 的封印存在但事件文件已不存在（被删除）`); continue }
    if (cur.sha256 === sealed.sha256) continue
    if (sealed.closed) {
      problems.push(`闭日内容被改动：${day}（封印 ${sealed.sha256.slice(0, 12)}… 当前 ${cur.sha256.slice(0, 12)}…，文件数 ${sealed.files}→${cur.files}）`)
    } else if (cur.bytes < sealed.bytes) {
      problems.push(`当日内容缩水（删除/截断）：${day}（封印 ${sealed.bytes} 字节 → 当前 ${cur.bytes} 字节）`)
    } else {
      notes.push(`当日 ${day} 在检查点后增长：${sealed.bytes} → ${cur.bytes} 字节（正常；闭日时会严格校验）`)
    }
  }
  for (const n of notes) console.log(`[verify] 提示：${n}`)
  if (problems.length > 0) {
    console.error(`[verify] FAIL（${seals.length} 条封印）`)
    for (const p of problems) console.error(`[verify]   - ${p}`)
    process.exit(1)
  }
  console.log(`[verify] PASS：${seals.length} 条封印，链完整，闭日内容严格一致，当日无非预期缩水`)
}

if (VERIFY) verify()
else seal()
