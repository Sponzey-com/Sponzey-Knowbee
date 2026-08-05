param(
  [Parameter(Mandatory = $true)]
  [string]$BinaryPath
)

$ErrorActionPreference = "Stop"

if (-not [System.IO.Path]::IsPathRooted($BinaryPath) -or -not (Test-Path -LiteralPath $BinaryPath -PathType Leaf)) {
  throw "windows_singleton_binary_unavailable"
}

$existing = @(Get-Process -Name "knowbee-yeonjang" -ErrorAction SilentlyContinue)
if ($existing.Count -ne 0) {
  throw "windows_singleton_preexisting_runtime"
}

$fixtureName = "knowbee-singleton-$([guid]::NewGuid().ToString('N'))"
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) $fixtureName
$alternateBinary = Join-Path $fixtureRoot "alternate-yeonjang.exe"
$alternateConfig = Join-Path $fixtureRoot "alternate-config"
$first = $null

function New-ClaimantProcess([string]$Executable, [string]$Arguments) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.Arguments = $Arguments
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  return $process
}

function Invoke-BoundedClaimant([string]$Executable, [string]$Arguments) {
  $process = New-ClaimantProcess $Executable $Arguments
  try {
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(5000)) {
      $process.Kill($true)
      throw "windows_singleton_claimant_timeout"
    }
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      ErrorText = $process.StandardError.ReadToEnd()
    }
  }
  finally {
    $process.Dispose()
  }
}

function Assert-DuplicateOutcome($Result) {
  if ($Result.ExitCode -eq 0 -or $Result.ErrorText -notmatch "already_running" -or $Result.ErrorText -match "AlreadyRunning") {
    throw "windows_singleton_duplicate_contract_failed"
  }
}

try {
  New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
  New-Item -ItemType Directory -Path $alternateConfig | Out-Null
  Copy-Item -LiteralPath $BinaryPath -Destination $alternateBinary
  Set-Content -LiteralPath (Join-Path $alternateConfig "settings.json") -Encoding UTF8 -Value '{"schema_version":1,"instance_id":"different-instance"}'

  $first = New-ClaimantProcess $BinaryPath "--stdio"
  Start-Sleep -Milliseconds 750
  if ($first.HasExited) {
    throw "windows_singleton_first_claimant_exited"
  }

  Assert-DuplicateOutcome (Invoke-BoundedClaimant $BinaryPath "--stdio")
  Assert-DuplicateOutcome (Invoke-BoundedClaimant $alternateBinary "--stdio-authenticated")
  Assert-DuplicateOutcome (Invoke-BoundedClaimant $BinaryPath "--managed --config-root `"$alternateConfig`"")

  $active = @(Get-Process -Name "knowbee-yeonjang" -ErrorAction SilentlyContinue).Count
  if ($active -ne 1) {
    throw "windows_singleton_active_count_invalid"
  }

  $first.StandardInput.Close()
  if (-not $first.WaitForExit(5000)) {
    $first.Kill($true)
    throw "windows_singleton_first_shutdown_timeout"
  }
  if ($first.ExitCode -ne 0) {
    throw "windows_singleton_first_shutdown_failed"
  }
  $first.Dispose()
  $first = $null

  $reacquired = Invoke-BoundedClaimant $alternateBinary "--stdio"
  if ($reacquired.ExitCode -ne 0) {
    throw "windows_singleton_reacquire_failed"
  }
  if (@(Get-Process -Name "knowbee-yeonjang" -ErrorAction SilentlyContinue).Count -ne 0) {
    throw "windows_singleton_final_count_invalid"
  }

  Write-Output "windows_singleton_smoke=pass;duplicates=3;reacquire=pass"
}
finally {
  if ($null -ne $first) {
    if (-not $first.HasExited) {
      $first.Kill($true)
      [void]$first.WaitForExit(5000)
    }
    $first.Dispose()
  }
  if ((Split-Path -Leaf $fixtureRoot) -like "knowbee-singleton-*") {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
