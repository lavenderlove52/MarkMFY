# Pre-download Tauri NSIS toolchain (avoids tauri build GitHub timeout).
# Usage: .\setup-nsis.ps1
# Cache dir: %LOCALAPPDATA%\tauri\NSIS

$ErrorActionPreference = "Stop"

$NsisUrl = "https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip"
$NsisSha1 = "EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D"
$UtilsUrl = "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"
$UtilsSha1 = "75197FEE3C6A814FE035788D1C34EAD39349B860"

$Mirrors = @(
  "",
  "https://ghproxy.net/",
  "https://mirror.ghproxy.com/",
  "https://gitmirror.com/",
  "https://gh.ddlc.top/"
)

$TauriRoot = Join-Path $env:LOCALAPPDATA "tauri"
$NsisDir = Join-Path $TauriRoot "NSIS"
$TempDir = Join-Path $env:TEMP "markmfy-nsis-setup"
$TimeoutSec = 600

function Get-Sha1([string]$Path) {
  return (Get-FileHash -Path $Path -Algorithm SHA1).Hash.ToUpperInvariant()
}

function Download-File([string]$Url, [string]$OutFile) {
  New-Item -ItemType Directory -Force -Path (Split-Path $OutFile) | Out-Null
  if (Test-Path $OutFile) { Remove-Item -Force $OutFile }

  foreach ($prefix in $Mirrors) {
    $fullUrl = if ([string]::IsNullOrEmpty($prefix)) { $Url } else { "$prefix$Url" }
    Write-Host "  Trying: $fullUrl" -ForegroundColor DarkGray
    try {
      # curl.exe usually handles slow GitHub better than Invoke-WebRequest
      $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
      if ($curl) {
        & curl.exe -L --connect-timeout 30 --max-time $TimeoutSec --retry 3 --retry-delay 2 -o $OutFile $fullUrl
        if ($LASTEXITCODE -eq 0 -and (Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 0)) {
          return
        }
      } else {
        Invoke-WebRequest -Uri $fullUrl -OutFile $OutFile -TimeoutSec $TimeoutSec -UseBasicParsing
        if ((Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 0)) {
          return
        }
      }
    } catch {
      Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
  }
  throw "Download failed after trying all mirrors: $Url"
}

function Assert-Sha1([string]$Path, [string]$Expected) {
  $actual = Get-Sha1 $Path
  if ($actual -ne $Expected.ToUpperInvariant()) {
    throw "SHA1 mismatch for $Path`n  expected $Expected`n  actual   $actual"
  }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Tauri NSIS toolchain" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Target: $NsisDir"
Write-Host ""

$markerOk = Join-Path $NsisDir "makensis.exe"
$utilsOk = Join-Path $NsisDir "Plugins\x86-unicode\additional\nsis_tauri_utils.dll"
if ((Test-Path $markerOk) -and (Test-Path $utilsOk)) {
  try {
    Assert-Sha1 $utilsOk $UtilsSha1
    Write-Host "[OK] NSIS toolchain already present." -ForegroundColor Green
    exit 0
  } catch {
    Write-Host "[WARN] Existing NSIS cache invalid, re-downloading..." -ForegroundColor Yellow
  }
}

if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
New-Item -ItemType Directory -Force -Path $TauriRoot | Out-Null

Write-Host "[1/3] Downloading nsis-3.11.zip ..." -ForegroundColor Yellow
$zipPath = Join-Path $TempDir "nsis-3.11.zip"
Download-File $NsisUrl $zipPath
Assert-Sha1 $zipPath $NsisSha1
Write-Host "  SHA1 OK" -ForegroundColor Green

Write-Host "[2/3] Extracting ..." -ForegroundColor Yellow
if (Test-Path $NsisDir) { Remove-Item -Recurse -Force $NsisDir }
Expand-Archive -Path $zipPath -DestinationPath $TauriRoot -Force
$extracted = Join-Path $TauriRoot "nsis-3.11"
if (-not (Test-Path $extracted)) {
  throw "Extracted folder not found: $extracted"
}
Rename-Item -Path $extracted -NewName "NSIS"

Write-Host "[3/3] Downloading nsis_tauri_utils.dll ..." -ForegroundColor Yellow
$utilsDir = Join-Path $NsisDir "Plugins\x86-unicode\additional"
New-Item -ItemType Directory -Force -Path $utilsDir | Out-Null
$dllPath = Join-Path $utilsDir "nsis_tauri_utils.dll"
Download-File $UtilsUrl $dllPath
Assert-Sha1 $dllPath $UtilsSha1
Write-Host "  SHA1 OK" -ForegroundColor Green

Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[OK] NSIS ready at: $NsisDir" -ForegroundColor Green
Write-Host "Now run build.bat / .\build.ps1"
