@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   MarkMFY 一键启动（开发模式）
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

where cargo >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Rust/Cargo，请先安装：https://rustup.rs/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] 首次运行，正在安装 npm 依赖...
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败
    pause
    exit /b 1
  )
) else (
  echo [1/2] 依赖已存在，跳过 npm install
)

echo.
echo [2/2] 编译并启动（前端/ Rust 有改动会自动重新编译）...
echo 关闭本窗口即可退出应用。
echo.

call npm run tauri dev
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
  echo.
  echo [错误] 启动失败，退出码 %EXIT_CODE%
  pause
)

exit /b %EXIT_CODE%
