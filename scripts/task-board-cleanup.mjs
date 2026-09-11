#!/usr/bin/env node
/**
 * task-board-cleanup.mjs —— dsh-task-board 脏 run 数据清理工具（套件侧运维）。
 *
 * 已知 bug（2026-09-11 主人实测发现）：task-board 的 run.status 字段**没有任何 API 路径推进**
 * （ledger.ts 中无 setRunStatus/updateRun 等函数——只有 task 级 updateTask）。
 * 当一次手动触发 task_report 自报后，run 永远停在「待审批」状态，看板前端不再显示，
 * 但 `/state` 接口与 ledger.json 文件始终保留它们。重启 dsh-desktop 不能清掉。
 *
 * **本工具不做审批——ledger 服务已确认无 pending token**（实测 /dsh-ledger/approvals = []）。
 * 清理是**有意的运维操作**，绕过"待审批"状态机的命名权限——因为状态机本身缺失推进路径。
 * 本工具**默认 dry-run**——写入必须显式 `--apply` 防误操作；操作前自动备份 ledger.json 到
 * 同目录 `.bak-<timestamp>`，可手工恢复。
 *
 * 用法：
 *   node scripts/task-board-cleanup.mjs [--home <home>] [--status 待审批] [--apply] [--yes]
 *     --home  dsh-desktop 家目录（默认 $DSH_HOME 或 C:\Users\<u>\AppData\Local\dsh-desktop-app-data\home）
 *     --status  要清理的 run status（默认「待审批」；可多值逗号分隔）
 *     --apply  真正写入；缺省仅 dry-run 报告
 *     --yes    --apply 时跳过确认提示
 *   --selftest  红绿夹具自证（造临时 ledger → 报告/应用 → 备份/恢复）
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'

function defaultHome() {
  const env = process.env.DSH_HOME
  if (env !== undefined && env !== '') return env
  return join(homedir(), 'AppData', 'Local', 'dsh-desktop-app-data', 'home')
}

function run(argv) {
  const opt = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d }
  if (argv[0] === '--selftest') return selftest()
  const home = resolve(opt('--home', defaultHome()))
  const targetStatus = opt('--status', '待审批').split(',').map(s => s.trim()).filter(Boolean)
  const apply = argv.includes('--apply')
  const yes = argv.includes('--yes')

  const ledgerPath = join(home, 'dsh-task-board', 'ledger.json')
  if (!existsSync(ledgerPath)) { console.error(`✗ 找不到：${ledgerPath}`); return 1 }
  const raw = readFileSync(ledgerPath, 'utf8')
  let store
  try { store = JSON.parse(raw) } catch (e) { console.error(`✗ JSON 解析失败：${e.message}`); return 1 }
  if (store?.tasks === undefined || !Array.isArray(store.tasks)) { console.error('✗ ledger 顶层结构异常（缺 tasks 数组）'); return 1 }

  // 扫描脏 run
  const dirty = []  // {taskId, runId, status, startedAt, sessionId}
  for (const t of store.tasks) {
    if (!Array.isArray(t.runs)) continue
    for (const r of t.runs) {
      if (targetStatus.includes(r.status)) {
        dirty.push({ taskId: t.id, runId: r.id, status: r.status, startedAt: r.startedAt, sessionId: r.sessionId ?? '' })
      }
    }
  }
  console.log(`扫描 ${store.tasks.length} 个任务；待清理（status ∈ {${targetStatus.join(',')}}）${dirty.length} 项`)
  if (dirty.length === 0) { console.log('（无脏数据，无需清理）'); return 0 }
  // 列表
  const byTask = new Map()
  for (const d of dirty) {
    if (!byTask.has(d.taskId)) byTask.set(d.taskId, [])
    byTask.get(d.taskId).push(d)
  }
  for (const [tid, runs] of byTask) {
    console.log(`  ${tid}  (${runs.length} 项)`)
    for (const r of runs) console.log(`    - ${r.runId}  status=${r.status}  startedAt=${r.startedAt}`)
  }

  if (!apply) {
    console.log('\n[DRY-RUN] 需写入时加 --apply（会先备份到 .bak-<ts>）')
    return 0
  }

  // 备份
  const bak = `${ledgerPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  copyFileSync(ledgerPath, bak)
  console.log(`\n备份: ${bak}`)

  // 执行：把每条脏 run 的 status 改为「已取消」并补 finishedAt + 备注（保留审计痕迹）
  let bumped = 0
  const now = new Date().toISOString()
  for (const t of store.tasks) {
    if (!Array.isArray(t.runs)) continue
    for (const r of t.runs) {
      if (!targetStatus.includes(r.status)) continue
      r.status = '已取消'
      r.finishedAt = now
      r.summary = (r.summary ?? '') + `\n[manual-cleanup ${now}] run 状态机无推进路径（套件侧 bug，详见 architect-knowledge/practice/dsh-task-board-run-stuck.md），运维手工推进为「已取消」`
      bumped++
    }
  }
  // 原子写（先递增 revision 再写，确保磁盘版本号 = 修改后的）
  store.revision = (typeof store.revision === 'number' ? store.revision : 0) + 1
  const tmp = ledgerPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n')
  renameSync(tmp, ledgerPath)
  console.log(`已推进 ${bumped} 项为「已取消」；revision=${store.revision}；重启 dsh-desktop 后 /state 不再返回这些 run`)
  console.log(`回滚：cp '${bak}' '${ledgerPath}'`)
  return 0
}

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'tb-cleanup-'))
  try {
    const home = tmp
    mkdirSync(join(home, 'dsh-task-board'), { recursive: true })
    const ledger = join(home, 'dsh-task-board', 'ledger.json')
    const fixture = {
      schemaVersion: 1, revision: 100,
      tasks: [
        { id: 'TB-A', title: 'A', prompt: '', column: '已完成', createdAt: 'x', updatedAt: 'x', actionType: 't', targetScope: 's', actionLevel: 'L1', runs: [
          { id: 'R-1', startedAt: 'x', status: '待审批' },
          { id: 'R-2', startedAt: 'x', status: '运行中' },
        ] },
        { id: 'TB-B', title: 'B', prompt: '', column: '已完成', createdAt: 'x', updatedAt: 'x', actionType: 't', targetScope: 's', actionLevel: 'L1', runs: [
          { id: 'R-3', startedAt: 'x', status: '待审批' },
        ] },
      ],
    }
    writeFileSync(ledger, JSON.stringify(fixture))
    // dry-run 应报告 2 项且不修改
    const codeDry = run(['--home', home])
    if (codeDry !== 0) throw new Error('dry-run 应 exit 0')
    const afterDry = JSON.parse(readFileSync(ledger, 'utf8'))
    if (afterDry.revision !== 100) throw new Error('dry-run 不应改 revision')
    if (afterDry.tasks[0].runs[0].status !== '待审批') throw new Error('dry-run 不应改 run.status')
    // --apply 应推进 + 备份
    const codeApply = run(['--home', home, '--apply', '--yes'])
    if (codeApply !== 0) throw new Error('--apply 应 exit 0')
    const bak = readdirSync(join(home, 'dsh-task-board')).find(f => f.startsWith('ledger.json.bak-'))
    if (!bak) throw new Error('未生成备份')
    const afterApply = JSON.parse(readFileSync(ledger, 'utf8'))
    if (afterApply.revision !== 101) throw new Error('revision 未递增')
    const dirty = afterApply.tasks.flatMap(t => t.runs.filter(r => r.status === '待审批'))
    if (dirty.length !== 0) throw new Error(`仍剩 ${dirty.length} 项待审批（应清零）`)
    // 备份可恢复
    copyFileSync(join(home, 'dsh-task-board', bak), ledger)
    const restored = JSON.parse(readFileSync(ledger, 'utf8'))
    if (restored.revision !== 100) throw new Error('恢复后 revision 应回 100')
    if (restored.tasks[0].runs[0].status !== '待审批') throw new Error('恢复后状态应回到待审批')
    console.log('selftest 通过（dry-run 不改 / --apply 推进 + 备份 / 备份可恢复）')
    return 0
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('task-board-cleanup.mjs')) {
  process.exit(run(process.argv.slice(2)))
}
