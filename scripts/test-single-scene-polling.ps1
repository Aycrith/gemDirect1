#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Minimal test to reproduce scene-002 polling behavior
  
.DESCRIPTION
  Tests the exact polling loop code in isolation to identify why it hangs
#>

param(
  [string]$RunDir = "C:\Dev\gemDirect1\logs\test-polling-$(Get-Date -Format 'yyyyMMdd-HHmmss')",
  [string]$ComfyUrl = "http://127.0.0.1:8188",
  [int]$MaxWaitSeconds = 60,
  [int]$PollIntervalSeconds = 2
)

$ErrorActionPreference = 'Continue'

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Single Scene Polling Test" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Parameters:" -ForegroundColor Yellow
Write-Host "  RunDir: $RunDir"
Write-Host "  ComfyUrl: $ComfyUrl"
Write-Host "  MaxWait: ${MaxWaitSeconds}s"
Write-Host "  PollInterval: ${PollIntervalSeconds}s"
Write-Host ""

# Create run directory
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
$summaryFile = Join-Path $RunDir "test-summary.txt"

function Add-TestLog {
  param([string]$Message)
  $timestamp = Get-Date -Format 'HH:mm:ss'
  $line = "[$timestamp] $Message"
  Write-Host $line
  Add-Content -Path $summaryFile -Value $line -Encoding UTF8
}

# Copy Check-PromptStatus function from generate-scene-videos-wan2.ps1
function Check-PromptStatus {
  param(
    [string]$ComfyUrl,
    [string]$PromptId,
    [int]$TimeoutSec = 5
  )

  $historyUrl = "$ComfyUrl/history/$PromptId"
  try {
    $history = Invoke-RestMethod -Uri $historyUrl -TimeoutSec $TimeoutSec -ErrorAction Stop
    if ($history -and $history.PSObject.Properties.Name -contains $PromptId) {
      $promptHistory = $history.$PromptId

      # Check for exceptions (indicates execution failure)
      if ($promptHistory.exception_details) {
        return @{
          status = 'error'
          exception = $promptHistory.exception_details
          message = 'Prompt execution failed'
        }
      }

      # Check for outputs (indicates completion)
      if ($promptHistory.outputs) {
        return @{
          status = 'completed'
          outputs = $promptHistory.outputs
          message = 'Prompt execution completed'
        }
      }

      # Has history entry but no outputs or exception = still running or pending
      return @{
        status = 'running'
        message = 'Prompt execution in progress'
      }
    }
  } catch {
    Write-Warning "Failed to check prompt status at $historyUrl : $_"
    return @{
      status = 'unknown'
      error = $_.Exception.Message
      message = 'Unable to determine prompt status'
    }
  }

  return @{
    status = 'pending'
    message = 'Prompt not yet started'
  }
}

# Test with the actual scene-002 prompt ID from the failed run
$testPromptId = "517f0533-5e55-411b-b099-2233f01cafbd"
$sceneId = "scene-002"

Add-TestLog "Testing polling loop with prompt: $testPromptId"
Add-TestLog "This prompt should show 'completed' status immediately"
Add-TestLog ""

# EVENT-DRIVEN POLLING (exact copy from generate-scene-videos-wan2.ps1)
$videoFound = $false
$pollStart = Get-Date
$statusCheckInterval = $PollIntervalSeconds

Add-TestLog "Polling started (timeout=${MaxWaitSeconds}s, interval=${statusCheckInterval}s)"

# Poll execution status until completed, error, or timeout
$executionCompleted = $false
$executionError = $false
$errorMessage = ""
$iteration = 0

Add-TestLog "Entering while loop..."

while (((Get-Date) - $pollStart).TotalSeconds -lt $MaxWaitSeconds) {
  $iteration++
  $elapsed = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
  
  Add-TestLog "Poll iteration #$iteration (elapsed: ${elapsed}s)"
  
  try {
    Add-TestLog "  Calling Check-PromptStatus..."
    $status = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $testPromptId
    
    Add-TestLog "  Status returned: $($status.status)"
    Add-TestLog "  Message: $($status.message)"
    
    if ($status.status -eq 'completed') {
      $executionCompleted = $true
      Add-TestLog "  ✓ Completion detected! Breaking out of loop."
      break
    } elseif ($status.status -eq 'error') {
      $executionError = $true
      $errorMessage = $status.exception
      Add-TestLog "  ✗ Error detected: $errorMessage"
      break
    } elseif ($status.status -eq 'unknown') {
      Add-TestLog "  ⚠ Unknown status (API error), continuing..."
    } else {
      Add-TestLog "  → Status is '$($status.status)', continuing to poll..."
    }
  } catch {
    Add-TestLog "  ✗ Exception caught: $($_.Exception.Message)"
    Add-TestLog "  Exception type: $($_.Exception.GetType().Name)"
    Add-TestLog "  Stack trace: $($_.ScriptStackTrace)"
  }
  
  # Only sleep if we're not done
  if (-not $executionCompleted -and -not $executionError) {
    Add-TestLog "  Sleeping ${statusCheckInterval}s..."
    Start-Sleep -Seconds $statusCheckInterval
  }
}

Add-TestLog ""
Add-TestLog "Exited while loop after $iteration iterations"
Add-TestLog "  executionCompleted: $executionCompleted"
Add-TestLog "  executionError: $executionError"

# Check for timeout
if (-not $executionCompleted -and -not $executionError) {
  $finalElapsed = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
  Add-TestLog "✗ TIMEOUT after ${finalElapsed}s - execution did not complete"
} elseif ($executionCompleted) {
  Add-TestLog "✓ SUCCESS - Completion detected"
} elseif ($executionError) {
  Add-TestLog "✗ ERROR - Execution failed: $errorMessage"
}

Add-TestLog ""
Add-TestLog "Test completed. Summary saved to: $summaryFile"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Test Results" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Iterations: $iteration"
Write-Host "  Completed: $executionCompleted" -ForegroundColor $(if ($executionCompleted) { 'Green' } else { 'Red' })
Write-Host "  Error: $executionError"
Write-Host "  Summary: $summaryFile"
Write-Host ""

exit $(if ($executionCompleted) { 0 } else { 1 })
