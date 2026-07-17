# MarkMFY 打包（Windows Release）
# 用法：双击 build.bat，或在终端执行 .\build.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MarkMFY 打包（Windows Release）" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 未找到 Node.js，请先安装：https://nodejs.org/" -ForegroundColor Red
  exit 1
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 未找到 Rust/Cargo，请先安装：https://rustup.rs/" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[1/3] 首次打包，正在安装 npm 依赖..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "[1/3] 依赖已存在，跳过 npm install" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/3] 准备 NSIS 工具链（支持镜像、加长超时）..." -ForegroundColor Yellow
& "$PSScriptRoot\setup-nsis.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "[3/3] 正在构建 Release 安装包..." -ForegroundColor Yellow
Write-Host ""

npm run pack
if ($LASTEXITCODE -ne 0) {
  Write-Host "[错误] 打包失败，退出码 $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

$bundle = Join-Path $PSScriptRoot "src-tauri\target\release\bundle"
$release = Join-Path $PSScriptRoot "src-tauri\target\release"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  打包成功" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "输出根目录：" -ForegroundColor Cyan
Write-Host "  $bundle"
Write-Host ""
Write-Host "常用产物："
Write-Host "  NSIS 安装包（推荐分发）：  $bundle\nsis\"
Write-Host "  绿色 exe：                $release\markmfy.exe"
Write-Host ""

$nsis = Join-Path $bundle "nsis"
if (Test-Path $nsis) {
  Write-Host "--- NSIS ---" -ForegroundColor DarkGray
  Get-ChildItem -Path $nsis -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.FullName)" }
  Write-Host ""
}

Write-Host "提示：把 nsis 目录下的 .exe 发给其他人即可安装。" -ForegroundColor DarkGray
