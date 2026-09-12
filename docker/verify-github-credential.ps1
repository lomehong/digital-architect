<#
.SYNOPSIS
  校验 omp 容器的 GitHub 凭证（GH_TOKEN）是否已正确接入。
.DESCRIPTION
  检查四层：① .env 是否已填 ② 容器内 env 是否注入 ③ gh 是否认到 token ④ git 私有仓是否免密。
  只报状态，**绝不回显 token 值**。
.EXAMPLE
  .\verify-github-credential.ps1
#>
$ErrorActionPreference = 'Continue'
$dockerDir = $PSScriptRoot
$envFile = Join-Path $dockerDir '.env'
$ok = $true

Write-Host '== ① .env 配置 ==' -ForegroundColor Cyan
if (-not (Test-Path $envFile)) { Write-Host '  ✗ .env 不存在' -ForegroundColor Red; $ok = $false }
else {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*GH_TOKEN\s*=' } | Select-Object -First 1
  if (-not $line) { Write-Host '  ✗ .env 无 GH_TOKEN 行（取消注释骨架并填值）' -ForegroundColor Red; $ok = $false }
  else {
    $val = ($line -split '=', 2)[1].Trim()
    if ([string]::IsNullOrWhiteSpace($val)) { Write-Host '  ✗ GH_TOKEN 为空' -ForegroundColor Red; $ok = $false }
    elseif ($val -match '^(?i)placeholder') { Write-Host '  ✗ GH_TOKEN 仍是占位符' -ForegroundColor Red; $ok = $false }
    else { Write-Host "  ✓ GH_TOKEN 已配置（长度 $($val.Length)，值不回显）" -ForegroundColor Green }
  }
}

Write-Host '== ② 容器内注入 ==' -ForegroundColor Cyan
$injected = docker exec oh-my-pi bash -c 'if [ -n "$GH_TOKEN" ]; then echo "len=${#GH_TOKEN}"; else echo "EMPTY"; fi' 2>&1
if ($injected -match '^len=\d+') { Write-Host "  ✓ 已注入（$injected）" -ForegroundColor Green }
else { Write-Host "  ✗ 未注入（$injected）——compose environment 需含 GH_TOKEN 并重建容器" -ForegroundColor Red; $ok = $false }

Write-Host '== ③ gh 凭据识别 ==' -ForegroundColor Cyan
$ghStatus = docker exec -u pi oh-my-pi gh auth status 2>&1 | Out-String
if ($ghStatus -match 'GH_TOKEN|Logged in') { Write-Host '  ✓ gh 识别到凭据' -ForegroundColor Green; ($ghStatus -split "`n" | Select-Object -First 4) | ForEach-Object { "    $($_.Trim())" } }
else { Write-Host '  ✗ gh 未识别凭据' -ForegroundColor Red; $ok = $false }

Write-Host '== ④ 私有仓免密（git credential helper）==' -ForegroundColor Cyan
$probe = docker exec -u pi oh-my-pi git ls-remote https://github.com/lomehong/digital-architect.git HEAD 2>&1 | Out-String
if ($probe -match 'refs/heads|HEAD') { Write-Host '  ✓ 私有仓可免密访问' -ForegroundColor Green }
else { Write-Host "  ✗ 访问失败：$(($probe -split "`n" | Select-Object -First 1).Trim())" -ForegroundColor Red; $ok = $false }

Write-Host ''
if ($ok) { Write-Host '结论：GitHub 凭证接入完整 ✅' -ForegroundColor Green }
else { Write-Host '结论：仍有缺口（见上方 ✗ 项）' -ForegroundColor Yellow }
