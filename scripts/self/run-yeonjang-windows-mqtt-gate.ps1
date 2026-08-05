$ErrorActionPreference = "Stop"

$isWindowsHost = $env:OS -eq "Windows_NT"
if (Test-Path variable:IsWindows) {
  $isWindowsHost = $IsWindows
}
if (-not $isWindowsHost) {
  throw "The Yeonjang Windows MQTT gate must run on Windows."
}

$gitBash = Join-Path $env:ProgramFiles "Git\bin\bash.exe"
if (-not (Test-Path -LiteralPath $gitBash -PathType Leaf)) {
  throw "Git Bash is required for the shared Yeonjang MQTT gate."
}
if ([string]::IsNullOrWhiteSpace($env:YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID)) {
  throw "Set YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID to an exact local camera device ID."
}

$gateScript = Join-Path $PSScriptRoot "run-yeonjang-independent-mqtt-gate.sh"
$env:YEONJANG_LIVE_DEVICE_GATE = "1"

$shortGateScript = & $env:ComSpec /d /c "for %I in (`"$gateScript`") do @echo %~sI"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($shortGateScript)) {
  throw "Unable to resolve the Windows short path for the shared Yeonjang MQTT gate."
}
$bashCommand = 'gate=$(cygpath -u $1); exec $gate'
$previousErrorActionPreference = $ErrorActionPreference
$gateExitCode = $null
try {
  # Windows PowerShell 5.1 promotes a native process's ordinary stderr (for
  # example Cargo's `Compiling ...` progress) to NativeCommandError when the
  # surrounding script uses Stop. Preserve the stream and judge the gate only
  # by the native process exit contract.
  $ErrorActionPreference = "Continue"
  & $gitBash -lc $bashCommand "knowbee-gate" $shortGateScript
  $gateExitCode = $LASTEXITCODE
}
finally {
  $ErrorActionPreference = $previousErrorActionPreference
}
if ($gateExitCode -ne 0) {
  throw "The shared Yeonjang Windows MQTT gate failed with exit code $gateExitCode."
}
