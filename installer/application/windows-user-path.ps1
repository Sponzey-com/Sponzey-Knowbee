[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Apply", "Restore")]
  [string]$Operation,
  [Parameter(Mandatory = $true)][string]$LauncherDirectory,
  [Parameter()][AllowEmptyString()][string]$PreviousPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
  $Target = [EnvironmentVariableTarget]::User
  if ($Operation -eq "Restore") {
    [Environment]::SetEnvironmentVariable("Path", $PreviousPath, $Target)
    [Console]::Out.WriteLine('{"status":"rolled_back"}')
    exit 0
  }
  $PreviousPath = [Environment]::GetEnvironmentVariable("Path", $Target)
  if ($null -eq $PreviousPath) { $PreviousPath = "" }
  $Present = @($PreviousPath.Split(';') | Where-Object { $_.TrimEnd('\\') -ieq $LauncherDirectory.TrimEnd('\\') }).Count -gt 0
  if (-not $Present) {
    $NewPath = $(if ([string]::IsNullOrEmpty($PreviousPath)) { $LauncherDirectory } else { "$PreviousPath;$LauncherDirectory" })
    if ($NewPath.Length -gt 32767) { throw [InvalidOperationException]::new("installer_windows_path_oversized") }
    [Environment]::SetEnvironmentVariable("Path", $NewPath, $Target)
  }
  [Console]::Out.WriteLine((@{
    status = "configured"
    changed = (-not $Present)
    previousPath = $PreviousPath
  } | ConvertTo-Json -Compress))
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
