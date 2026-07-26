# Sample Distribution Script
# Distributes 110 test samples across 8 folders for manual testing.
#
# Usage:
#   1. Close MixJam Electron
#   2. Run this script from the repo root:
#      pwsh -File scripts\distribute-samples.ps1
#   3. Launch MixJam, enter the Player, click Re-scan Sample Folder
#
# The 8 top-level folders are: Bass, Drums, FX, Synth, Vocal, Loop, Percussion, Atmosphere.
# Folder names become shared automatic tags during indexing.

param(
  [string]$SampleFolder = "tmp\test-samples"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root $SampleFolder

if (-not (Test-Path $target)) {
  Write-Error "Sample folder not found: $target"
  exit 1
}

# Folder distribution plan (110 samples):
#   Bass:       23 files (all BASS samples)
#   Synth:      18 files (all SYNTH samples)
#   FX:         12 files (all SPECIAL samples)
#   Atmosphere:  2 files (all SPHERE samples)
#   Loop:       14 files (COX001-COX014 DRUMLOOP)
#   Drums:      14 files (COX015-COX028 DRUMLOOP)
#   Percussion: 14 files (COX029-COX042 DRUMLOOP)
#   Vocal:      13 files (COX043-COX055 DRUMLOOP)

$folders = @{
  'Bass'        = @()
  'Synth'       = @()
  'FX'          = @()
  'Atmosphere'  = @()
  'Loop'        = @()
  'Drums'       = @()
  'Percussion'  = @()
  'Vocal'       = @()
}

# Collect all WAV files in the flat folder
$allFiles = Get-ChildItem -Path $target -File -Filter "*.wav" | Sort-Object Name

foreach ($file in $allFiles) {
  $name = $file.Name.ToUpper()

  if ($name -match '_BASS_') {
    $folders['Bass'] += $file
  }
  elseif ($name -match '_SYNTH_') {
    $folders['Synth'] += $file
  }
  elseif ($name -match '_SPECIAL_') {
    $folders['FX'] += $file
  }
  elseif ($name -match '_SPHERE_') {
    $folders['Atmosphere'] += $file
  }
  elseif ($name -match '_DRUMLOOP_') {
    # Distribute DRUMLOOP by COX number: COX001-014 -> Loop, 015-028 -> Drums,
    # 029-042 -> Percussion, 043-055 -> Vocal
    if ($name -match 'COX(\d+)') {
      $num = [int]$matches[1]
      if ($num -le 14) {
        $folders['Loop'] += $file
      }
      elseif ($num -le 28) {
        $folders['Drums'] += $file
      }
      elseif ($num -le 42) {
        $folders['Percussion'] += $file
      }
      else {
        $folders['Vocal'] += $file
      }
    }
    else {
      $folders['Loop'] += $file
    }
  }
}

# Create folders and move files.
$total = 0
foreach ($folderName in $folders.Keys | Sort-Object) {
  $files = $folders[$folderName]
  if ($files.Count -eq 0) {
    Write-Host "  $folderName`: 0 samples (empty)" -ForegroundColor DarkGray
    continue
  }

  $folderPath = Join-Path $target $folderName
  New-Item -ItemType Directory -Force -Path $folderPath | Out-Null

  foreach ($f in $files) {
    $dest = Join-Path $folderPath $f.Name
    Move-Item -Path $f.FullName -Destination $dest -Force
  }

  $total += $files.Count
  Write-Host "  $folderName`: $($files.Count) samples" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Moved $total samples into $($folders.Keys.Count) folders." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Launch MixJam, enter the Player" -ForegroundColor White
Write-Host "  2. Click Re-scan Sample Folder to re-index with the new folder layout" -ForegroundColor White
Write-Host "     (moved files are marked missing and re-added under their new paths)" -ForegroundColor Gray
