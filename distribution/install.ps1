param([string]$Version = "1.0.0")
$ErrorActionPreference = "Stop"
if ($Version -notmatch '^\d+(\.\d+)*$') { throw "Version must contain only dot-separated numbers." }

$Repository = "https://github.com/siddharthg2309/privacyguard-extension"
$Archive = "privacy-guard-cli-$Version.tgz"
$BaseUrl = "$Repository/releases/download/v$Version"
$InstallDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "privacy-guard-install-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $InstallDirectory | Out-Null
try {
  Invoke-WebRequest -Uri "$BaseUrl/$Archive" -OutFile (Join-Path $InstallDirectory $Archive)
  Invoke-WebRequest -Uri "$BaseUrl/SHA256SUMS" -OutFile (Join-Path $InstallDirectory "SHA256SUMS")
  $ChecksumLine = Get-Content (Join-Path $InstallDirectory "SHA256SUMS") | Where-Object { $_ -match "  $([regex]::Escape($Archive))$" }
  if (-not $ChecksumLine) { throw "Release checksum is missing." }
  $Expected = ($ChecksumLine -split '\s+')[0].ToLowerInvariant()
  $Actual = (Get-FileHash -Algorithm SHA256 (Join-Path $InstallDirectory $Archive)).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) { throw "Release checksum verification failed." }
  npm install --global (Join-Path $InstallDirectory $Archive)
  aiprivacy doctor
} finally {
  Remove-Item -Recurse -Force $InstallDirectory -ErrorAction SilentlyContinue
}
