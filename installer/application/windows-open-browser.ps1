[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^http://127\.0\.0\.1:18888/$')]
  [string]$Uri
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Start-Process -FilePath $Uri
