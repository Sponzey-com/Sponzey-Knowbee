[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Register", "Inspect", "Stop")]
  [string]$Operation,
  [Parameter(Mandatory = $true)]
  [ValidateSet("Start", "RegisterOnly")]
  [string]$StartMode,
  [Parameter(Mandatory = $true)][string]$TaskName,
  [Parameter(Mandatory = $true)][string]$Execute,
  [Parameter(Mandatory = $true)][string]$Application,
  [Parameter(Mandatory = $true)][string]$WorkingDirectory,
  [Parameter(Mandatory = $true)][string]$UserId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Result {
  param([Parameter(Mandatory = $true)][hashtable]$Value)
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress -Depth 4))
}

try {
  $ExpectedArguments = '"' + $Application + '" serve'
  if ($Operation -eq "Stop") {
    $Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $Existing) {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Write-Result @{ status = "stopped" }
    exit 0
  }

  if ($Operation -eq "Register") {
    $Action = New-ScheduledTaskAction -Execute $Execute -Argument $ExpectedArguments -WorkingDirectory $WorkingDirectory
    $Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
    $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Principal $Principal -Settings $Settings -Force | Out-Null
    if ($StartMode -eq "Start") {
      Start-ScheduledTask -TaskName $TaskName
    }
  }

  $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $ObservedAction = @($Task.Actions)[0]
  if (
    $ObservedAction.Execute -cne $Execute -or
    $ObservedAction.Arguments -cne $ExpectedArguments -or
    $ObservedAction.WorkingDirectory -cne $WorkingDirectory -or
    $Task.Principal.UserId -cne $UserId -or
    $Task.Principal.LogonType.ToString() -ne "Interactive" -or
    $Task.Principal.RunLevel.ToString() -ne "Limited"
  ) {
    throw [InvalidOperationException]::new("installer_windows_service_identity_mismatch")
  }
  if ($Operation -eq "Inspect" -and $StartMode -eq "Start" -and $Task.State.ToString() -ne "Running") {
    throw [InvalidOperationException]::new("installer_windows_service_inactive")
  }
  if ($StartMode -eq "RegisterOnly" -and $Task.State.ToString() -eq "Running") {
    throw [InvalidOperationException]::new("installer_windows_service_unexpectedly_active")
  }
  Write-Result @{
    status = $(if ($Operation -eq "Register" -or $StartMode -eq "RegisterOnly") { "registered" } else { "active" })
    taskName = $TaskName
    execute = $ObservedAction.Execute
    arguments = @($Application, "serve")
    workingDirectory = $ObservedAction.WorkingDirectory
    principal = @{
      userId = $Task.Principal.UserId
      logonType = "InteractiveToken"
      runLevel = "Limited"
    }
  }
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
