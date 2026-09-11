#!/usr/bin/env node
/**
 * check-skills-sync.mjs —— SKILL 三副本一致性校验（母包 G3，2026-09-11）。
 *
 * 背景：canonical `skills/` 与镜像 `.claude/skills/`、`.omp/skills/` 曾靠手工同步
 * （adapters/oh-my-pi.md L81 自述），属知识漂移防线盲区。本脚本以 skills/ 为权威，
 * 逐文件比对两处镜像的内容哈希：缺失、单侧新增、内容不一致均报错 exit 1。
 * 纪律：解析/IO 异常一律 exit 非 0，绝不静默绿；--selftest 用临时夹具自证红绿。
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { readdirSync, readFileSync, statSync } from 'node:fs'

const ROOT = process.cwd()
const CANONICAL = 'skills'
const MIRRORS = ['.claude/skills', '.omp/skills']

/** 递归收集 dir 下全部文件的相对路径（POSIX 风格）。 */
function collectFiles(dir, prefix = '') {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, prefix ? `${prefix}/${name}` : name))
    else out.push(prefix ? `${prefix}/${name}` : name)
  }
  return out
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** 核心：返回 [errors: string[], checked: number]。纯比较，不做 IO 副作用。 */
export function compareTrees(canonicalDir, mirrorDirs) {
  const errors = []
  const canonical = new Map(collectFiles(canonicalDir).map(rel => [rel, hashFile(join(canonicalDir, rel))]))
  let checked = canonical.size
  for (const mirror of mirrorDirs) {
    if (!existsSync(mirror)) {
      errors.push(`镜像目录缺失：${mirror}`)
      continue
    }
    const seen = new Set()
    for (const rel of collectFiles(mirror)) {
      seen.add(rel)
      if (!canonical.has(rel)) {
        errors.push(`${mirror}/${rel}：单侧多出（canonical 无此文件）`)
        continue
      }
      if (hashFile(join(mirror, rel)) !== canonical.get(rel)) {
        errors.push(`${mirror}/${rel}：内容与 ${CANONICAL}/${rel} 不一致`)
      }
    }
    for (const rel of canonical.keys()) {
      if (!seen.has(rel)) errors.push(`${mirror}/${rel}：缺失（canonical 有此文件）`)
    }
  }
  return [errors, checked]
}

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'skills-sync-'))
  try {
    const canon = join(tmp, 'skills')
    const mirror = join(tmp, 'mirror')
    mkdirSync(join(canon, 'a'), { recursive: true })
    mkdirSync(join(mirror, 'a'), { recursive: true })
    writeFileSync(join(canon, 'a', 'SKILL.md'), 'v1')
    // 绿：完全一致
    cpSync(canon, mirror, { recursive: true })
    let [errors] = compareTrees(canon, [mirror])
    if (errors.length !== 0) throw new Error(`selftest 绿态失败：${errors}`)
    // 红 1：内容漂移
    writeFileSync(join(mirror, 'a', 'SKILL.md'), 'v2')
    ;[errors] = compareTrees(canon, [mirror])
    if (errors.length !== 1 || !errors[0].includes('不一致')) throw new Error(`selftest 漂移态失败：${errors}`)
    // 红 2：单侧多出
    writeFileSync(join(mirror, 'extra.md'), 'x')
    ;[errors] = compareTrees(canon, [mirror])
    if (errors.length !== 2 || !errors.some(e => e.includes('单侧多出'))) throw new Error(`selftest 多出态失败：${errors}`)
    // 红 3：镜像缺失文件
    rmSync(join(mirror, 'a', 'SKILL.md'))
    ;[errors] = compareTrees(canon, [mirror])
    if (errors.length !== 2 || !errors.some(e => e.includes('缺失'))) throw new Error(`selftest 缺失态失败：${errors}`)
    console.log('selftest 通过（绿 1 态 + 红 3 态）')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---- main ----
if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}
const [errors, checked] = compareTrees(join(ROOT, CANONICAL), MIRRORS.map(m => join(ROOT, m)))
if (errors.length > 0) {
  console.error(`SKILL 副本同步校验失败（${errors.length} 处）：`)
  for (const e of errors) console.error(`  - ${e}`)
  console.error(`权威源：${CANONICAL}/；请同步镜像后重试。`)
  process.exit(1)
}
console.log(`SKILL 副本同步校验通过：${CANONICAL}/ 共 ${checked} 个文件 × ${MIRRORS.length} 镜像全部一致`)
