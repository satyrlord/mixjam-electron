param(
  [Parameter(Mandatory = $true)]
  [string] $PortableExecutable,

  [Parameter(Mandatory = $true)]
  [string] $EvidencePath,

  [int] $TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $PortableExecutable -PathType Leaf)) {
  throw "Portable executable not found at $PortableExecutable."
}
if ($TimeoutSeconds -le 0) {
  throw 'TimeoutSeconds must be greater than zero.'
}

$evidenceDir = Split-Path -Parent $EvidencePath
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$probeId = [Guid]::NewGuid().ToString('N')
$userDataDir = Join-Path ([IO.Path]::GetTempPath()) "mixjam-portable-smoke-$probeId"
$baselinePids = [Collections.Generic.HashSet[int]]::new()
Get-Process | ForEach-Object { [void] $baselinePids.Add($_.Id) }

$startedAt = Get-Date
$bootstrapProcess = $null
$readyProcess = $null
$readyCommandLine = $null
$readyProcessId = $null
$readyProcessName = $null
$readyWindowTitle = $null
$readyWindowHandle = $null
$readyExecutablePath = $null
$probeFailure = $null
$cleanupFailures = [Collections.Generic.List[string]]::new()
$terminatedPids = [Collections.Generic.List[int]]::new()

function Get-ProbeProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
      -not $baselinePids.Contains([int] $_.ProcessId) -and
      $_.CommandLine -and
      $_.CommandLine.IndexOf($userDataDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })
}

try {
  New-Item -ItemType Directory -Path $userDataDir | Out-Null
  $argument = '--user-data-dir="{0}"' -f $userDataDir
  $hadElectronRunAsNode = Test-Path Env:ELECTRON_RUN_AS_NODE
  $electronRunAsNode = $env:ELECTRON_RUN_AS_NODE
  try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $bootstrapProcess = Start-Process -FilePath $PortableExecutable -ArgumentList $argument -PassThru
  } finally {
    if ($hadElectronRunAsNode) {
      $env:ELECTRON_RUN_AS_NODE = $electronRunAsNode
    } else {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }
  }
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline -and -not $readyProcess) {
    foreach ($candidate in (Get-ProbeProcesses)) {
      try {
        $process = Get-Process -Id ([int] $candidate.ProcessId) -ErrorAction Stop
        $process.Refresh()
        if (
          $process.ProcessName -eq 'MixJam Electron' -and
          $process.MainWindowHandle -ne [IntPtr]::Zero -and
          $process.Responding
        ) {
          $readyProcess = $process
          $readyCommandLine = $candidate.CommandLine
          $readyExecutablePath = $candidate.ExecutablePath
          break
        }
      } catch {
        # A short-lived helper may exit between the CIM and Process snapshots.
      }
    }
    if (-not $readyProcess) {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $readyProcess) {
    $observed = @(Get-ProbeProcesses | ForEach-Object {
        [ordered]@{
          processId = $_.ProcessId
          parentProcessId = $_.ParentProcessId
          name = $_.Name
          executablePath = $_.ExecutablePath
          commandLine = $_.CommandLine
        }
      })
    throw "The portable bootstrap did not produce a responsive MixJam Electron window within $TimeoutSeconds seconds. Observed scoped processes: $($observed | ConvertTo-Json -Compress -Depth 3)"
  }

  Start-Sleep -Seconds 1
  $readyProcess.Refresh()
  if (
    $readyProcess.HasExited -or
    $readyProcess.MainWindowHandle -eq [IntPtr]::Zero -or
    -not $readyProcess.Responding
  ) {
    throw 'The portable bootstrap window did not remain ready during the stability check.'
  }
  $readyProcessId = $readyProcess.Id
  $readyProcessName = $readyProcess.ProcessName
  $readyWindowTitle = $readyProcess.MainWindowTitle
  $readyWindowHandle = $readyProcess.MainWindowHandle.ToInt64()
} catch {
  $probeFailure = $_
} finally {
  if ($readyProcess -and -not $readyProcess.HasExited) {
    try {
      if ($readyProcess.CloseMainWindow()) {
        [void] $readyProcess.WaitForExit(5000)
      }
    } catch {
      # The scoped force-cleanup below handles a window that closed concurrently.
    }
  }

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $scopedProcesses = @(Get-ProbeProcesses)
    if ($scopedProcesses.Count -eq 0) {
      break
    }
    foreach ($scopedProcess in $scopedProcesses) {
      $processId = [int] $scopedProcess.ProcessId
      if ($terminatedPids.Contains($processId)) {
        continue
      }
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $terminatedPids.Add($processId)
      } catch {
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
          $cleanupFailures.Add("Could not stop scoped process ${processId}: $($_.Exception.Message)")
        }
      }
    }
    Start-Sleep -Milliseconds 250
  }

  if (@(Get-ProbeProcesses).Count -ne 0) {
    $cleanupFailures.Add('Scoped portable-bootstrap processes remained after cleanup.')
  }

  try {
    if (Test-Path -LiteralPath $userDataDir) {
      Remove-Item -LiteralPath $userDataDir -Recurse -Force
    }
  } catch {
    $cleanupFailures.Add("Could not remove probe user-data directory: $($_.Exception.Message)")
  }

  $extractionRemoved = $null
  if ($readyExecutablePath) {
    $extractionDir = Split-Path -Parent $readyExecutablePath
    $resolvedTempDir = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    $resolvedExtractionDir = [IO.Path]::GetFullPath($extractionDir).TrimEnd('\')
    $extractionParent = Split-Path -Parent $resolvedExtractionDir
    if (-not (Test-Path -LiteralPath $resolvedExtractionDir)) {
      $extractionRemoved = $true
    } elseif (
      $extractionParent.Equals($resolvedTempDir, [StringComparison]::OrdinalIgnoreCase) -and
      -not $resolvedExtractionDir.Equals($resolvedTempDir, [StringComparison]::OrdinalIgnoreCase) -and
      -not $resolvedExtractionDir.Equals($userDataDir, [StringComparison]::OrdinalIgnoreCase)
    ) {
      try {
        Remove-Item -LiteralPath $resolvedExtractionDir -Recurse -Force
        $extractionRemoved = -not (Test-Path -LiteralPath $resolvedExtractionDir)
      } catch {
        $extractionRemoved = $false
        $cleanupFailures.Add("Could not remove portable extraction directory: $($_.Exception.Message)")
      }
    } else {
      $extractionRemoved = $false
      $cleanupFailures.Add("Refused to remove untrusted portable extraction directory: $resolvedExtractionDir")
    }
  }

  $result = [ordered]@{
    artifact = (Resolve-Path -LiteralPath $PortableExecutable).Path
    startedAtUtc = $startedAt.ToUniversalTime().ToString('o')
    timeoutSeconds = $TimeoutSeconds
    bootstrapProcessId = if ($bootstrapProcess) { $bootstrapProcess.Id } else { $null }
    readyProcessId = $readyProcessId
    readyProcessName = $readyProcessName
    readyWindowTitle = $readyWindowTitle
    readyWindowHandle = $readyWindowHandle
    readyExecutablePath = $readyExecutablePath
    readyCommandLine = $readyCommandLine
    nativeWindowVerified = $null -eq $probeFailure -and $null -ne $readyProcess
    terminatedProcessIds = @($terminatedPids)
    userDataRemoved = -not (Test-Path -LiteralPath $userDataDir)
    extractionRemoved = $extractionRemoved
    cleanupFailures = @($cleanupFailures)
    failure = if ($probeFailure) { $probeFailure.Exception.Message } else { $null }
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
}

if ($probeFailure) {
  throw $probeFailure
}
if ($cleanupFailures.Count -ne 0) {
  throw "Portable-bootstrap cleanup failed: $($cleanupFailures -join '; ')"
}
