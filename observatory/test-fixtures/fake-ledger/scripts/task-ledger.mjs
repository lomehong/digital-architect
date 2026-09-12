#!/usr/bin/env node
/**
 * 隔离台账脚本（测试夹具）——治理端点合法路径的端到端测试**只能**指向它，
 * 绝不指向真实台账。用法与 scripts/task-ledger.mjs 同名同参，只回显不落盘。
 */
const args = process.argv.slice(2)
console.log(`✓ fake-ledger（隔离夹具，不落盘）: node task-ledger.mjs ${args.join(' ')}`)
