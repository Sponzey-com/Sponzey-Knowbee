$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "The Yeonjang Windows MQTT gate must run on Windows."
}

$gitBash = Join-Path $env:ProgramFiles "Git\bin\bash.exe"
if (-not (Test-Path -LiteralPath $gitBash -PathType Leaf)) {
  throw "Git Bash is required for the shared Yeonjang MQTT gate."
}
if ([string]::IsNullOrWhiteSpace($env:YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID)) {
  throw "Set YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID to an exact local camera device ID."
}

$env:KNOWBEE_YEONJANG_GATE_SCRIPT = Join-Path $PSScriptRoot "run-yeonjang-independent-mqtt-gate.sh"
$env:YEONJANG_LIVE_DEVICE_GATE = "1"

& $gitBash -lc '"$(cygpath -u "$KNOWBEE_YEONJANG_GATE_SCRIPT")"'
if ($LASTEXITCODE -ne 0) {
  throw "The shared Yeonjang Windows MQTT gate failed with exit code $LASTEXITCODE."
}
