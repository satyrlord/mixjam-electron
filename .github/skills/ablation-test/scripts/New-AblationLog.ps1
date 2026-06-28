[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Slug,

    [string]$Validation,

    [string[]]$CandidateGroup = @(),

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-AblationSlug {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $normalized = $Value.ToLowerInvariant()
    $normalized = [System.Text.RegularExpressions.Regex]::Replace($normalized, "[^a-z0-9]+", "-")
    $normalized = $normalized.Trim("-")

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        throw "Slug must contain at least one letter or number."
    }

    return $normalized
}

$safeSlug = ConvertTo-AblationSlug -Value $Slug
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$tmpDirectory = Join-Path $repoRoot "tmp"
$outputPath = Join-Path $tmpDirectory ("ablation-{0}.md" -f $safeSlug)

if ((Test-Path -LiteralPath $outputPath) -and -not $Force) {
    throw "Ablation log already exists: $outputPath. Pass -Force to overwrite it."
}

New-Item -ItemType Directory -Path $tmpDirectory -Force | Out-Null

$validationLine = if ([string]::IsNullOrWhiteSpace($Validation)) {
    "<command or manual repro>"
}
else {
    $Validation.Trim()
}

$candidateGroupLines = if ($CandidateGroup.Count -gt 0) {
    ($CandidateGroup | ForEach-Object { "- $_" }) -join [Environment]::NewLine
}
else {
    @(
        "- <group-1>",
        "- <group-2>"
    ) -join [Environment]::NewLine
}

$today = Get-Date -Format "yyyy-MM-dd"

$content = @"
# Ablation Log: $safeSlug

- Created: $today
- Focus window or event ids:
- Stash id:
- Restart required: yes/no
- Build output freshness verified: yes/no/not-applicable

## Validation Loop

```text
$validationLine
```

## Candidate Groups

$candidateGroupLines

## Runs

### Run 1

- Included groups:
- Excluded groups:
- Result: PASS/FAIL
- Observation:
- Inference:
- Next step:

## Final Result

- Root cause:
- Minimal fix set:
- Unnecessary groups:
- Confidence: high/medium/low
- Residual risk:
"@

Set-Content -LiteralPath $outputPath -Value $content
Write-Output $outputPath