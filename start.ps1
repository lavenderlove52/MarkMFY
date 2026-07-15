# MarkMFY 一键启动（开发模式）
# 用法：右键“使用 PowerShell 运行”，或在终端执行 .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MarkMFY 一键启动（开发模式）" -ForegroundColor Cyan
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
  Write-Host "[1/2] 首次运行，正在安装 npm 依赖..." -ForegroundColor Yellow
  npm install
} else {
  Write-Host "[1/2] 依赖已存在，跳过 npm install" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/2] 编译并启动（前端/Rust 有改动会自动重新编译）..." -ForegroundColor Yellow
Write-Host "关闭本窗口即可退出应用。" -ForegroundColor DarkGray
Write-Host ""

npm run tauri dev
