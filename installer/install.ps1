Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepositoryUri = [Uri]"https://github.com/Sponzey-com/Sponzey-Knowbee"
$VerifierSha256Win32Arm64 = "@@VERIFIER_SHA256_WIN32_ARM64@@"
$VerifierSha256Win32X64 = "@@VERIFIER_SHA256_WIN32_X64@@"
$TemporaryDirectory = $null
$JsonRequested = $args -contains "--json"

function Stop-Installer {
  param([Parameter(Mandatory = $true)][string]$Reason)
  throw [InvalidOperationException]::new($Reason)
}

function Read-InstallerOptions {
  param([Parameter(Mandatory = $true)][object[]]$Values)
  $Seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $Result = @{
    Version = "latest"; WithYeonjang = $false; Service = $true; Start = $true
    AddPath = $true; Browser = $true; NonInteractive = $false; DryRun = $false
    Json = $false; ManifestPath = $null; BundleDirectory = $null; Locale = "auto"
  }
  for ($Index = 0; $Index -lt $Values.Count; $Index++) {
    $Option = [string]$Values[$Index]
    if (-not $Seen.Add($Option)) { Stop-Installer "installer_option_duplicate" }
    switch ($Option) {
      "--version" {
        if (++$Index -ge $Values.Count) { Stop-Installer "installer_arguments_invalid" }
        $Result.Version = [string]$Values[$Index]
      }
      "--with-yeonjang" { $Result.WithYeonjang = $true }
      "--no-service" {
        if ($Seen.Contains("--no-start")) { Stop-Installer "installer_option_conflict" }
        $Result.Service = $false; $Result.Start = $false
      }
      "--no-start" {
        if ($Seen.Contains("--no-service")) { Stop-Installer "installer_option_conflict" }
        $Result.Start = $false
      }
      "--non-interactive" { $Result.NonInteractive = $true }
      "--add-path" {
        if ($Seen.Contains("--no-add-path")) { Stop-Installer "installer_option_conflict" }
        $Result.AddPath = $true
      }
      "--no-add-path" {
        if ($Seen.Contains("--add-path")) { Stop-Installer "installer_option_conflict" }
        $Result.AddPath = $false
      }
      "--dry-run" { $Result.DryRun = $true }
      "--json" { $Result.Json = $true }
      "--manifest" {
        if (++$Index -ge $Values.Count) { Stop-Installer "installer_arguments_invalid" }
        $Result.ManifestPath = [string]$Values[$Index]
      }
      "--bundle-dir" {
        if (++$Index -ge $Values.Count) { Stop-Installer "installer_arguments_invalid" }
        $Result.BundleDirectory = [string]$Values[$Index]
      }
      "--no-browser" { $Result.Browser = $false }
      "--locale" {
        if (++$Index -ge $Values.Count) { Stop-Installer "installer_arguments_invalid" }
        $Result.Locale = [string]$Values[$Index]
      }
      "--help" {
        if ($Values.Count -ne 1) { Stop-Installer "installer_option_conflict" }
        [Console]::Out.WriteLine("Usage: install.ps1 [--version VERSION] [--with-yeonjang] [--no-service|--no-start] [--non-interactive] [--add-path|--no-add-path] [--dry-run] [--json] [--manifest PATH --bundle-dir DIR] [--no-browser] [--locale auto|en|ko] [--help]")
        exit 0
      }
      default { Stop-Installer "installer_arguments_invalid" }
    }
  }
  if (($null -eq $Result.ManifestPath) -ne ($null -eq $Result.BundleDirectory)) {
    Stop-Installer "installer_offline_inputs_incomplete"
  }
  if ($Result.Locale -notin @("auto", "en", "ko")) { Stop-Installer "installer_locale_unsupported" }
  if ($Result.Json -and -not $Result.DryRun -and -not $Result.NonInteractive) {
    Stop-Installer "installer_json_requires_non_interactive"
  }
  return [PSCustomObject]$Result
}

function Test-TrustedDownloadUri {
  param([Parameter(Mandatory = $true)][Uri]$Uri)
  if ($Uri.Scheme -ne "https") {
    Stop-Installer "download_redirect_untrusted"
  }
  if ($Uri.Host -eq "github.com" -and $Uri.AbsolutePath.StartsWith("/Sponzey-com/Sponzey-Knowbee/releases/", [StringComparison]::Ordinal)) {
    return
  }
  if ($Uri.Host -eq "release-assets.githubusercontent.com") {
    return
  }
  Stop-Installer "download_redirect_untrusted"
}

function Get-ReleaseAsset {
  param(
    [Parameter(Mandatory = $true)][Uri]$Uri,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][long]$MaximumBytes
  )
  if ($MaximumBytes -le 0) {
    Stop-Installer "download_size_invalid"
  }

  $Handler = [Net.Http.HttpClientHandler]::new()
  $Handler.AllowAutoRedirect = $false
  $Client = [Net.Http.HttpClient]::new($Handler)
  $Client.Timeout = [TimeSpan]::FromMinutes(5)
  $Client.DefaultRequestHeaders.UserAgent.ParseAdd("Sponzey-Knowbee-Installer/1")
  try {
    $CurrentUri = $Uri
    for ($RedirectCount = 0; $RedirectCount -le 5; $RedirectCount++) {
      Test-TrustedDownloadUri $CurrentUri
      $Response = $Client.GetAsync($CurrentUri, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      try {
        $StatusCode = [int]$Response.StatusCode
        if ($StatusCode -ge 300 -and $StatusCode -lt 400) {
          if ($RedirectCount -eq 5 -or $null -eq $Response.Headers.Location) {
            Stop-Installer "download_redirect_invalid"
          }
          $Location = $Response.Headers.Location
          if (-not $Location.IsAbsoluteUri) {
            $Location = [Uri]::new($CurrentUri, $Location)
          }
          Test-TrustedDownloadUri $Location
          $CurrentUri = $Location
          continue
        }
        if (-not $Response.IsSuccessStatusCode) {
          Stop-Installer "download_failed"
        }
        if ($Response.Content.Headers.ContentLength.HasValue -and $Response.Content.Headers.ContentLength.Value -gt $MaximumBytes) {
          Stop-Installer "download_oversized"
        }

        $InputStream = $Response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $OutputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
          $Buffer = [byte[]]::new(65536)
          [long]$TotalBytes = 0
          while (($Read = $InputStream.Read($Buffer, 0, $Buffer.Length)) -gt 0) {
            $TotalBytes += $Read
            if ($TotalBytes -gt $MaximumBytes) {
              Stop-Installer "download_oversized"
            }
            $OutputStream.Write($Buffer, 0, $Read)
          }
          $OutputStream.Flush()
          if ($TotalBytes -eq 0) {
            Stop-Installer "download_empty"
          }
        }
        finally {
          $OutputStream.Dispose()
          $InputStream.Dispose()
        }
        return
      }
      finally {
        $Response.Dispose()
      }
    }
    Stop-Installer "download_redirect_invalid"
  }
  finally {
    $Client.Dispose()
    $Handler.Dispose()
  }
}

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Stream = [IO.File]::OpenRead($Path)
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($Hasher.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $Hasher.Dispose()
    $Stream.Dispose()
  }
}

function Copy-LocalAsset {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][long]$MaximumBytes
  )
  $Item = Get-Item -LiteralPath $Source -Force -ErrorAction Stop
  if ($Item -isnot [IO.FileInfo] -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Stop-Installer "offline_asset_unsafe"
  }
  $InputStream = [IO.File]::Open($Item.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($InputStream.Length -le 0 -or $InputStream.Length -gt $MaximumBytes) {
      Stop-Installer "offline_asset_oversized"
    }
    $OutputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $Buffer = [byte[]]::new(65536)
      [long]$TotalBytes = 0
      while (($Read = $InputStream.Read($Buffer, 0, $Buffer.Length)) -gt 0) {
        $TotalBytes += $Read
        if ($TotalBytes -gt $MaximumBytes) { Stop-Installer "offline_asset_oversized" }
        $OutputStream.Write($Buffer, 0, $Read)
      }
      $OutputStream.Flush()
      if ($TotalBytes -ne $InputStream.Length) { Stop-Installer "offline_asset_changed" }
    }
    finally { $OutputStream.Dispose() }
  }
  finally { $InputStream.Dispose() }
}

function Read-VerifierReceipt {
  param([Parameter(Mandatory = $true)][string[]]$Lines)
  $AllowedKeys = @(
    "manifest_sha256", "release_version", "node_version", "node_module_abi",
    "target", "archive", "name", "size_bytes", "sha256", "entrypoint", "staged_entrypoint"
  )
  $Receipt = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
  foreach ($Line in $Lines) {
    if ($Line -notmatch "^([a-z0-9_]+)=([^`r`n]*)$") {
      Stop-Installer "verifier_receipt_invalid"
    }
    $Key = $Matches[1]
    $Value = $Matches[2]
    if ($AllowedKeys -notcontains $Key -or $Receipt.ContainsKey($Key) -or $Value.Length -gt 4096) {
      Stop-Installer "verifier_receipt_invalid"
    }
    $Receipt.Add($Key, $Value)
  }
  foreach ($RequiredKey in @("release_version", "target", "name", "size_bytes", "sha256", "entrypoint")) {
    if (-not $Receipt.ContainsKey($RequiredKey) -or [string]::IsNullOrEmpty($Receipt[$RequiredKey])) {
      Stop-Installer "verifier_receipt_invalid"
    }
  }
  if ($Receipt["name"] -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]*$" -or $Receipt["size_bytes"] -notmatch "^[1-9][0-9]*$") {
    Stop-Installer "verifier_receipt_invalid"
  }
  if ($Receipt["entrypoint"] -notmatch "^[A-Za-z0-9._/-]+$" -or $Receipt["entrypoint"].Contains("..")) {
    Stop-Installer "verifier_receipt_invalid"
  }
  return $Receipt
}

try {
  $Options = Read-InstallerOptions $args
  if ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage") {
    Stop-Installer "powershell_language_mode_unsupported"
  }
  if (-not [Environment]::Is64BitOperatingSystem -or [Environment]::OSVersion.Version.Build -lt 22000) {
    Stop-Installer "host_os_version_unsupported"
  }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  switch ($Architecture) {
    "Arm64" {
      $Target = "win32-arm64"
      $VerifierSha256 = $VerifierSha256Win32Arm64
    }
    "X64" {
      $Target = "win32-x64"
      $VerifierSha256 = $VerifierSha256Win32X64
    }
    default { Stop-Installer "host_target_unsupported" }
  }

  if ($Options.Version -eq "latest") {
    $ReleasePath = "latest/download"
  }
  elseif ($Options.Version -match "^[0-9A-Za-z][0-9A-Za-z.+-]*$") {
    $ReleasePath = "download/v$($Options.Version.TrimStart('v'))"
  }
  else {
    Stop-Installer "installer_version_invalid"
  }

  if ($Options.DryRun) {
    if ($Options.Json) {
      [Console]::Out.WriteLine((@{
        status = "dry_run"; target = $Target; release = $Options.Version
        offline = ($null -ne $Options.ManifestPath); withYeonjang = $Options.WithYeonjang
        service = $Options.Service; start = $Options.Start; addPath = $Options.AddPath
        browser = $Options.Browser
      } | ConvertTo-Json -Compress))
    }
    else {
      Write-Host "Knowbee dry run: target=$Target release=$($Options.Version) offline=$($null -ne $Options.ManifestPath) yeonjang=$($Options.WithYeonjang) service=$($Options.Service) start=$($Options.Start) add-path=$($Options.AddPath) browser=$($Options.Browser)"
    }
    exit 0
  }

  if (-not $Options.Json) {
    Write-Host "Knowbee install summary: target=$Target release=$($Options.Version) profile=standard"
    Write-Host "Knowbee warning: unsigned_origin_unverified; publisher identity is not cryptographically authenticated."
  }
  if (-not $Options.NonInteractive) {
    $Answer = Read-Host "Continue? [y/N]"
    if ($Answer -notin @("y", "Y", "yes", "YES")) {
      Stop-Installer "user_cancelled"
    }
  }

  $TemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("knowbee-installer-" + [Guid]::NewGuid().ToString("N"))
  [IO.Directory]::CreateDirectory($TemporaryDirectory) | Out-Null
  $ManifestPath = Join-Path $TemporaryDirectory "installer-manifest.json"
  $VerifierPath = Join-Path $TemporaryDirectory "knowbee-installer-verify.exe"
  $ReceiptPath = Join-Path $TemporaryDirectory "verified-receipt"
  $ReleaseBase = [Uri]::new($RepositoryUri, "/Sponzey-com/Sponzey-Knowbee/releases/$ReleasePath/")
  if ($null -ne $Options.ManifestPath) {
    $BundleItem = Get-Item -LiteralPath $Options.BundleDirectory -Force -ErrorAction Stop
    if ($BundleItem -isnot [IO.DirectoryInfo] -or ($BundleItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      Stop-Installer "offline_bundle_directory_unsafe"
    }
    Copy-LocalAsset $Options.ManifestPath $ManifestPath 2097152
    Copy-LocalAsset (Join-Path $BundleItem.FullName "knowbee-installer-verify-$Target.exe") $VerifierPath 67108864
  }
  else {
    Get-ReleaseAsset ([Uri]::new($ReleaseBase, "installer-manifest.json")) $ManifestPath 2097152
    Get-ReleaseAsset ([Uri]::new($ReleaseBase, "knowbee-installer-verify-$Target.exe")) $VerifierPath 67108864
  }
  if ((Get-FileSha256 $VerifierPath) -cne $VerifierSha256) {
    Stop-Installer "verifier_digest_mismatch"
  }

  $ReceiptLines = @(& $VerifierPath --manifest $ManifestPath --target $Target --output-format shell)
  if ($LASTEXITCODE -ne 0) {
    Stop-Installer "manifest_verification_failed"
  }
  $Receipt = Read-VerifierReceipt $ReceiptLines
  if ($Receipt["target"] -cne $Target) {
    Stop-Installer "verifier_receipt_target_mismatch"
  }
  [long]$ArtifactSize = 0
  if (-not [long]::TryParse($Receipt["size_bytes"], [Globalization.NumberStyles]::None, [Globalization.CultureInfo]::InvariantCulture, [ref]$ArtifactSize) -or $ArtifactSize -le 0) {
    Stop-Installer "verifier_receipt_invalid"
  }

  if (-not $Options.Json) { Write-Host "Knowbee bootstrap verified: target=$Target release=$($Receipt['release_version']) artifact=$($Receipt['name'])" }
  $ArtifactPath = Join-Path $TemporaryDirectory $Receipt["name"]
  if ($null -ne $Options.ManifestPath) {
    Copy-LocalAsset (Join-Path $BundleItem.FullName $Receipt["name"]) $ArtifactPath $ArtifactSize
  }
  else {
    Get-ReleaseAsset ([Uri]::new($ReleaseBase, $Receipt["name"])) $ArtifactPath $ArtifactSize
  }
  $StagePath = Join-Path $TemporaryDirectory "stage"
  $ReceiptLines = @(& $VerifierPath --manifest $ManifestPath --target $Target --artifact $ArtifactPath --stage $StagePath --output-format shell)
  if ($LASTEXITCODE -ne 0) {
    Stop-Installer "artifact_staging_failed"
  }
  $Receipt = Read-VerifierReceipt $ReceiptLines
  if (-not $Receipt.ContainsKey("staged_entrypoint") -or $Receipt["staged_entrypoint"] -cne $Receipt["entrypoint"]) {
    Stop-Installer "verifier_receipt_entrypoint_mismatch"
  }
  [IO.File]::WriteAllLines($ReceiptPath, $ReceiptLines, [Text.UTF8Encoding]::new($false))
  $EntryPointPath = Join-Path $StagePath ($Receipt["staged_entrypoint"].Replace("/", [IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $EntryPointPath -PathType Leaf)) {
    Stop-Installer "install_entrypoint_invalid"
  }
  $ApplyArguments = @("installer", "apply", "--manifest", $ManifestPath, "--verified-receipt", $ReceiptPath, "--target", $Target)
  if ($Options.WithYeonjang) { $ApplyArguments += "--with-yeonjang" }
  if (-not $Options.Service) { $ApplyArguments += "--no-service" }
  elseif (-not $Options.Start) { $ApplyArguments += "--no-start" }
  if (-not $Options.AddPath) { $ApplyArguments += "--no-add-path" }
  if (-not $Options.Browser) { $ApplyArguments += "--no-browser" }
  if ($Options.Json) { $ApplyArguments += "--json" }
  & $EntryPointPath @ApplyArguments
  if ($LASTEXITCODE -ne 0) {
    Stop-Installer "install_application_failed"
  }
  if (-not $Options.Json) { Write-Host "Knowbee installation completed: target=$Target release=$($Receipt['release_version'])" }
}
catch {
  $ReasonCode = $_.Exception.Message
  if ($ReasonCode -notmatch "^[a-z0-9_.:-]{1,160}$") { $ReasonCode = "installer_failed" }
  if ($JsonRequested) {
    [Console]::Error.WriteLine((@{ status = "rejected"; reasonCode = $ReasonCode } | ConvertTo-Json -Compress))
  }
  else {
    [Console]::Error.WriteLine("Knowbee installer stopped: " + $ReasonCode)
  }
  exit 1
}
finally {
  if ($null -ne $TemporaryDirectory -and [IO.Directory]::Exists($TemporaryDirectory)) {
    [IO.Directory]::Delete($TemporaryDirectory, $true)
  }
}
