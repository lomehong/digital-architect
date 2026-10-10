#!/usr/bin/env pwsh
<#
link-skills.ps1 — 技能发现根链接铺装与健康检查（bootstrap）
方案: docs/designs/2026-10-10-技能发现根链接化收敛-技术方案.md §2.1
用法:
  .\link-skills.ps1                # link 模式（默认）：铺装/修复全部发现根链接（幂等）
  .\link-skills.ps1 -Check        # 只验证不修复（fail-closed，CI 用）
  .\link-skills.ps1 -Mode copy    # 物理复制兜底（给不跟随链接的宿主）
边界语义（评审缺口 7①，上游先例）:
  - 目标位置已是实体目录（旧镜像）→ 先移除再建链（幂等重建含此步）；
  - 发现根本身是指向仓内 skills/ 的链接 → bail 拒绝执行（防自污染）。
退出码: 0=pass 1=fail 2=内部错误（对齐 gate-guard 三值语义）。
#>
param(
  [switch]$Check,
  [ValidateSet('link', 'copy')][string]$Mode = 'link',
  [string]$Roots = '.claude/skills,.omp/skills,.dsh/skills',
  [string]$Repo = ''
)
$ErrorActionPreference = 'Stop'
if (-not $Repo) { $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$src = Join-Path $Repo 'skills'
$rootList = $Roots.Split(',') | ForEach-Object { $_.Trim().Replace('\', '/') } | Where-Object { $_ }

# 防自污染: 发现根不得位于权威源内部
$srcFull = (Resolve-Path $src).Path
foreach ($r in $rootList) {
  $full = Join-Path $Repo ($r.Replace('/', '\'))
  if ($full -like "$srcFull*") { Write-Host "BAILOUT: 发现根 '$r' 位于权威源 skills/ 内部（自污染）"; exit 2 }
}

function Get-SkillNames {
  Get-ChildItem $src -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') } | Select-Object -ExpandProperty Name
}

$problems = @()
$skills = Get-SkillNames
$fixed = 0

foreach ($root in $rootList) {
  $rootDir = Join-Path $Repo ($root.Replace('/', '\'))
  foreach ($name in $skills) {
    $link = Join-Path $rootDir $name
    $target = Join-Path $src $name

    if ($Check) {
      $ok = $false
      if (Test-Path (Join-Path $link 'SKILL.md')) {
        try {
          $real = (Get-Item $link -Force).Target
          if (-not $real) { $real = $link }
          $resolvedLink = (Resolve-Path -LiteralPath $real).Path
          $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
          $ok = $resolvedLink -ieq $resolvedTarget
        } catch { $ok = $false }
      }
      if (-not $ok) { $problems += "缺失/断链: $root/$name" }
      continue
    }

    if ($Mode -eq 'copy') {
      if (Test-Path $link) { Remove-Item $link -Recurse -Force }
      Copy-Item $target $link -Recurse -Force
      $fixed++
      continue
    }

    # link 模式
    if (Test-Path $link) {
      $item = Get-Item $link -Force
      if ($item.LinkType) {
        $cur = $item.Target
        $same = $false
        if ($cur) {
          try {
            $rc = (Resolve-Path -LiteralPath $cur).Path
            $rt = (Resolve-Path -LiteralPath $target).Path
            $same = $rc -ieq $rt
          } catch { $same = $false }
        }
        if ($same) { continue }   # 已指向正确 → 跳过
      }
      Remove-Item $link -Recurse -Force   # 断链/指错 → 移除重建
    }
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    $fixed++
  }
}

if ($Check) {
  if ($problems.Count) { $problems | ForEach-Object { Write-Host "MISSING/BROKEN: $_" }; exit 1 }
  Write-Host "LINK HEALTH PASS: $($rootList.Count) 根 × $($skills.Count) 技能"
  exit 0
}
Write-Host "bootstrap 完成（mode=$Mode, 变更点 $fixed）"
exit 0
