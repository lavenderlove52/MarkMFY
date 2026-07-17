@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   MarkMFY Windows Release Build
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install: https://nodejs.org/
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Rust/Cargo not found. Install: https://rustup.rs/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
) else (
  echo [1/3] node_modules exists, skip npm install
)

echo.
echo [2/3] Preparing NSIS toolchain (mirrors, long timeout)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-nsis.ps1"
if errorlevel 1 (
  echo [ERROR] NSIS setup failed. If GitHub is blocked, download manually:
  echo   1^) nsis-3.11.zip
  echo   2^) nsis_tauri_utils.dll
  echo See setup-nsis.ps1 header / README.
  pause
  exit /b 1
)

echo.
echo [3/3] Building release bundle...
echo.

call npm run pack
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Build failed, exit code %EXIT_CODE%
  pause
  exit /b %EXIT_CODE%
)

set "BUNDLE=%~dp0src-tauri\target\release\bundle"
set "RELEASE=%~dp0src-tauri\target\release"

echo ========================================
echo   BUILD OK
echo ========================================
echo.
echo Output root:
echo   %BUNDLE%
echo.
echo Artifacts:
echo   NSIS installer:  %BUNDLE%\nsis
echo   Portable exe:    %RELEASE%\markmfy.exe
echo.

if exist "%BUNDLE%\nsis\*.exe" (
  echo --- NSIS ---
  dir /b "%BUNDLE%\nsis\*.exe"
  echo.
)

echo Tip: send the .exe under nsis\ to others.
echo.
pause
exit /b 0
