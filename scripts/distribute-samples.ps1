# Sample Distribution Script
# Distributes 110 test samples across 8 category folders for manual testing.
#
# Usage:
#   1. Close MixJam Electron
#   2. Run this script from the repo root:
#      pwsh -File scripts\distribute-samples.ps1
#   3. Launch MixJam, enter the Player, click Re-scan Sample Folder
#
# The 8 root categories are: Bass, Drums, FX, Synth, Vocal, Loop, Percussion, Atmosphere
# Each sample belongs to exactly one category (folder).
# Sub-folders within a category become subcategories.

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

# Category distribution plan (110 samples):
#   Bass:       23 files (all BASS samples)
#   Synth:      18 files (all SYNTH samples)
#   FX:         12 files (all SPECIAL samples)
#   Atmosphere:  2 files (all SPHERE samples)
#   Loop:       14 files (COX001-COX014 DRUMLOOP)
#   Drums:      14 files (COX015-COX028 DRUMLOOP)
#   Percussion: 14 files (COX029-COX042 DRUMLOOP)
#   Vocal:      13 files (COX043-COX055 DRUMLOOP)

$categories = @{
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
    $categories['Bass'] += $file
  }
  elseif ($name -match '_SYNTH_') {
    $categories['Synth'] += $file
  }
  elseif ($name -match '_SPECIAL_') {
    $categories['FX'] += $file
  }
  elseif ($name -match '_SPHERE_') {
    $categories['Atmosphere'] += $file
  }
  elseif ($name -match '_DRUMLOOP_') {
    # Distribute DRUMLOOP by COX number: COX001-014 -> Loop, 015-028 -> Drums,
    # 029-042 -> Percussion, 043-055 -> Vocal
    if ($name -match 'COX(\d+)') {
      $num = [int]$matches[1]
      if ($num -le 14) {
        $categories['Loop'] += $file
      }
      elseif ($num -le 28) {
        $categories['Drums'] += $file
      }
      elseif ($num -le 42) {
        $categories['Percussion'] += $file
      }
      else {
        $categories['Vocal'] += $file
      }
    }
    else {
      $categories['Loop'] += $file
    }
  }
}

# Create category folders and move files
$total = 0
foreach ($cat in $categories.Keys | Sort-Object) {
  $files = $categories[$cat]
  if ($files.Count -eq 0) {
    Write-Host "  $cat`: 0 samples (empty)" -ForegroundColor DarkGray
    continue
  }

  $catDir = Join-Path $target $cat
  New-Item -ItemType Directory -Force -Path $catDir | Out-Null

  foreach ($f in $files) {
    $dest = Join-Path $catDir $f.Name
    Move-Item -Path $f.FullName -Destination $dest -Force
  }

  $total += $files.Count
  Write-Host "  $cat`: $($files.Count) samples" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Moved $total samples into $($categories.Keys.Count) category folders." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Launch MixJam, enter the Player" -ForegroundColor White
Write-Host "  2. Click Re-scan Sample Folder to re-index with the new folder layout" -ForegroundColor White
Write-Host "     (moved files are marked missing and re-added under their new paths)" -ForegroundColor Gray
