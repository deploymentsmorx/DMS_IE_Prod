param(
  [string]$ApiUrl = "http://localhost:3001/api"
)

$ErrorActionPreference = "Stop"
$desktop = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path (Split-Path -Parent $desktop) "frontend"
$ui = Join-Path $desktop "ui"

Write-Host "DMS API URL: $ApiUrl"

@{ apiUrl = $ApiUrl } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $desktop "config.json")

if (-not (Test-Path $frontend)) {
  throw "Frontend folder not found: $frontend"
}

if (Test-Path $ui) {
  Remove-Item $ui -Recurse -Force
}
Copy-Item $frontend $ui -Recurse

Push-Location $desktop
try {
  if (-not (Test-Path (Join-Path $desktop "node_modules"))) {
    npm install
  }
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  npx electron-builder --win nsis portable
}
finally {
  Pop-Location
}

$setup = Join-Path $desktop "dist-exe\SmorX-DMS-Setup.exe"
$portable = Join-Path $desktop "dist-exe\SmorX-DMS-Portable.exe"
if (Test-Path $setup) { Write-Host "Installer: $setup" }
if (Test-Path $portable) { Write-Host "Portable:  $portable" }
if (-not (Test-Path $setup) -and -not (Test-Path $portable)) {
  Write-Host "Build finished. Check $desktop\dist-exe"
}
