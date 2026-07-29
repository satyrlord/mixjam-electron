#!/usr/bin/env pwsh
# This script controls a human-only reproduction loop.
# Copy this file and replace each example prompt.
# The agent runs this script.
# The user follows each terminal instruction.

function step {
  param([string]$message)
  Write-Host "`n>>> $message"
  Read-Host "    [Press Enter after the action]" | Out-Null
}

function capture {
  param([string]$varName, [string]$question)
  Write-Host "`n>>> $question"
  $answer = Read-Host "    > "
  Set-Variable -Name $varName -Value $answer -Scope 1
}

# Replace the prompts below.

step "Perform the exact action that triggers the reported symptom."
capture OBSERVED "Did the reported symptom occur? Enter yes or no."
capture DETAILS "Enter the exact error, result, timing, or visible state."

Write-Host "`n--- Captured result ---"
Write-Host "OBSERVED=$OBSERVED"
Write-Host "DETAILS=$DETAILS"
