param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]] $Command
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageDir = Join-Path $repoRoot 'dist-electron'
$evidenceDir = Join-Path $repoRoot 'tmp/package-smoke/windows'
$packagedExecutable = Join-Path $packageDir 'win-unpacked/MixJam Electron.exe'
$bootstrapEvidence = Join-Path $evidenceDir 'portable-bootstrap.json'
$bootstrapProbe = Join-Path $repoRoot 'tests/electron/probe-windows-portable-bootstrap.ps1'

$portableArtifacts = @(Get-ChildItem -LiteralPath $packageDir -File -Filter '*.exe')
if ($portableArtifacts.Count -ne 1) {
  throw "Expected exactly one portable EXE in $packageDir; found $($portableArtifacts.Count)."
}
if (-not (Test-Path -LiteralPath $packagedExecutable -PathType Leaf)) {
  throw "Expected packaged Windows executable at $packagedExecutable."
}

$portable = $portableArtifacts[0]
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
$signature = Get-AuthenticodeSignature -LiteralPath $portable.FullName
$metadata = [ordered]@{
  osVersion = [Environment]::OSVersion.VersionString
  processorArchitecture = $env:PROCESSOR_ARCHITECTURE
  processorIdentifier = $env:PROCESSOR_IDENTIFIER
  artifact = $portable.FullName
  sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $portable.FullName).Hash
  length = $portable.Length
  signatureStatus = $signature.Status.ToString()
  signer = $signature.SignerCertificate.Subject
  portableBootstrapPath = $portable.FullName
  portableBootstrapEvidence = $bootstrapEvidence
  portableBootstrapNativeWindowVerified = $false
  deepSmokeLaunchPath = $packagedExecutable
}
$metadataPath = Join-Path $evidenceDir 'metadata.json'
$metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

& $bootstrapProbe -PortableExecutable $portable.FullName -EvidencePath $bootstrapEvidence
$metadata.portableBootstrapNativeWindowVerified = $true
$metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

$env:MIXJAM_PACKAGED_EXECUTABLE = $packagedExecutable
Remove-Item Env:MIXJAM_ELECTRON_NO_SANDBOX -ErrorAction SilentlyContinue
if ($Command.Count -eq 1) {
  & $Command[0]
} else {
  & $Command[0] $Command[1..($Command.Count - 1)]
}
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
