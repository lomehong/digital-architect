# gate-guard-selftest.ps1 · Gate Guard 三态自测（隔离克隆中）
# 用法：pwsh -File scripts/gate-guard-selftest.ps1 （在父仓任意位置可跑）
# A 无保护变更 → PASS；B 触碰保护路径无标记 → FAIL；C 同改动带标记 → PASS
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSCommandPath
$tmp = Join-Path $env:TEMP ('gg-clean-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
git clone --no-local -q $repo $tmp
git -C $tmp config user.email t@t
git -C $tmp config user.name t
Copy-Item (Join-Path $repo 'scripts\gate-guard.mjs') (Join-Path $tmp 'scripts\gate-guard.mjs') -Force

function Invoke-Gate {
  param($label)
  Push-Location $tmp
  node (Join-Path $tmp 'scripts\gate-guard.mjs') 'HEAD~1' 'HEAD' 2>&1 | Select-Object -Last 2
  Write-Output "[$label exit: $LASTEXITCODE]"
  Pop-Location
}

Write-Output '=== A：无保护变更（纯 docs 提交）→ PASS ==='
Set-Content -Path (Join-Path $tmp 'docs\gg-probe.txt') -Value 'x'
git -C $tmp add docs/gg-probe.txt
git -C $tmp commit -q -m 'probe docs only'
Invoke-Gate 'A'

Write-Output '=== B：触碰保护路径、无标记 → FAIL ==='
Add-Content -Path (Join-Path $tmp 'packages\architect-core\src\lint.ts') -Value '// gg probe'
git -C $tmp add -A
git -C $tmp commit -q -m 'probe protected no marker'
Invoke-Gate 'B'

Write-Output '=== C：同改动 + Gate-Approved 标记 → PASS ==='
git -C $tmp commit -q --amend -m 'probe protected Gate-Approved: by owner'
Invoke-Gate 'C'

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Output 'selftest done'
