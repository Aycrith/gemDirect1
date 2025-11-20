#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Diagnose polling loop hang in scene-002 from run 20251119-200955

.DESCRIPTION
  Investigates why the polling loop failed to detect completion despite:
  - ComfyUI history showing status: success
  - Video file existing at scene-002_00001_.mp4 (5.2 MB)
  - Video created at 20:13:30 (208s after polling started at 20:10:02)
#>

$ErrorActionPreference = 'Continue'

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Polling Loop Hang Diagnostic - Scene 002" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Key facts from the failed run
$runDir = "C:\Dev\gemDirect1\logs\20251119-200955"
$promptId = "517f0533-5e55-411b-b099-2233f01cafbd"
$sceneId = "scene-002"
$comfyUrl = "http://127.0.0.1:8188"
$pollStart = [DateTime]::Parse("2025-11-19 20:10:02")
$videoCreated = [DateTime]::Parse("2025-11-19 20:13:30")
$maxWaitSeconds = 360

Write-Host "RUN DETAILS:" -ForegroundColor Yellow
Write-Host "  Run directory: $runDir"
Write-Host "  Scene ID:      $sceneId"
Write-Host "  Prompt ID:     $promptId"
Write-Host "  Polling start: $($pollStart.ToString('HH:mm:ss'))"
Write-Host "  Video created: $($videoCreated.ToString('HH:mm:ss'))"
Write-Host "  Generation:    $([math]::Round(($videoCreated - $pollStart).TotalSeconds, 0))s"
Write-Host "  Max timeout:   ${maxWaitSeconds}s"
Write-Host ""

# Test 1: ComfyUI API Availability
Write-Host "TEST 1: ComfyUI Server Health" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
try {
  $systemStats = Invoke-RestMethod -Uri "$comfyUrl/system_stats" -TimeoutSec 5
  Write-Host "  ✓ Server responding" -ForegroundColor Green
  Write-Host "    VRAM Used: $([math]::Round($systemStats.devices[0].vram_used / 1MB, 0)) MB"
  Write-Host "    VRAM Free: $([math]::Round($systemStats.devices[0].vram_free / 1MB, 0)) MB"
} catch {
  Write-Host "  ✗ Server not responding: $_" -ForegroundColor Red
  exit 1
}
Write-Host ""

# Test 2: History API Response
Write-Host "TEST 2: History API Response Format" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
try {
  $historyUrl = "$comfyUrl/history/$promptId"
  Write-Host "  URL: $historyUrl"
  
  $history = Invoke-RestMethod -Uri $historyUrl -TimeoutSec 5
  $hasPromptKey = $history.PSObject.Properties.Name -contains $promptId
  
  Write-Host "  Response type: $($history.GetType().Name)"
  Write-Host "  Top-level keys: $($history.PSObject.Properties.Name -join ', ')"
  Write-Host "  Contains prompt ID key: $hasPromptKey" -ForegroundColor $(if ($hasPromptKey) { 'Green' } else { 'Red' })
  
  if ($hasPromptKey) {
    $ph = $history.$promptId
    Write-Host ""
    Write-Host "  Prompt history structure:"
    Write-Host "    Keys: $($ph.PSObject.Properties.Name -join ', ')"
    Write-Host "    Status: $($ph.status.status_str)" -ForegroundColor Cyan
    Write-Host "    Completed: $($ph.status.completed)" -ForegroundColor Cyan
    Write-Host "    Has outputs: $($null -ne $ph.outputs)" -ForegroundColor Cyan
    Write-Host "    Has exception: $($null -ne $ph.exception_details)" -ForegroundColor $(if ($ph.exception_details) { 'Red' } else { 'Green' })
    
    if ($ph.outputs) {
      Write-Host ""
      Write-Host "  Output structure:" -ForegroundColor Yellow
      foreach ($nodeId in $ph.outputs.PSObject.Properties.Name) {
        $output = $ph.outputs.$nodeId
        Write-Host "    Node $nodeId :"
        if ($output.images) {
          foreach ($img in $output.images) {
            Write-Host "      - $($img.filename) (subfolder: $($img.subfolder), type: $($img.type))"
          }
        }
      }
    }
  } else {
    Write-Host "  ✗ CRITICAL: Prompt ID not in response!" -ForegroundColor Red
  }
} catch {
  Write-Host "  ✗ History API error: $_" -ForegroundColor Red
  Write-Host "  Exception type: $($_.Exception.GetType().Name)"
  Write-Host "  Stack trace: $($_.ScriptStackTrace)"
}
Write-Host ""

# Test 3: Replicate Check-PromptStatus Function
Write-Host "TEST 3: Check-PromptStatus Function Logic" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

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

Write-Host "  Testing Check-PromptStatus with scene-002 prompt..."
try {
  $status = Check-PromptStatus -ComfyUrl $comfyUrl -PromptId $promptId
  Write-Host "    Status: $($status.status)" -ForegroundColor $(
    switch ($status.status) {
      'completed' { 'Green' }
      'error' { 'Red' }
      'unknown' { 'Yellow' }
      default { 'Cyan' }
    }
  )
  Write-Host "    Message: $($status.message)"
  
  if ($status.status -eq 'completed') {
    Write-Host "  ✓ Function correctly detects completion" -ForegroundColor Green
  } elseif ($status.status -eq 'error') {
    Write-Host "  ! Execution failed with error:" -ForegroundColor Red
    Write-Host "    $($status.exception)"
  } else {
    Write-Host "  ✗ Function NOT detecting completion (status: $($status.status))" -ForegroundColor Red
  }
} catch {
  Write-Host "  ✗ Exception during status check: $_" -ForegroundColor Red
  Write-Host "    Type: $($_.Exception.GetType().Name)"
  Write-Host "    Stack: $($_.ScriptStackTrace)"
}
Write-Host ""

# Test 4: Video File Verification
Write-Host "TEST 4: Video File Existence" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
$videoPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-002_00001_.mp4"
if (Test-Path $videoPath) {
  $file = Get-Item $videoPath
  Write-Host "  ✓ Video file exists" -ForegroundColor Green
  Write-Host "    Path:     $($file.FullName)"
  Write-Host "    Size:     $([math]::Round($file.Length/1MB, 2)) MB"
  Write-Host "    Created:  $($file.CreationTime)"
  Write-Host "    Modified: $($file.LastWriteTime)"
  
  $generationTime = ($file.CreationTime - $pollStart).TotalSeconds
  Write-Host "    Time to generate: $([math]::Round($generationTime, 0))s after polling started"
} else {
  Write-Host "  ✗ Video file not found: $videoPath" -ForegroundColor Red
}
Write-Host ""

# Test 5: Polling Loop Simulation
Write-Host "TEST 5: Simulate Polling Loop (5 iterations)" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "  Simulating polling behavior with 2s intervals..."
Write-Host ""

for ($i = 1; $i -le 5; $i++) {
  Write-Host "  Poll #$i : " -NoNewline -ForegroundColor Cyan
  
  try {
    $status = Check-PromptStatus -ComfyUrl $comfyUrl -PromptId $promptId
    
    $statusColor = switch ($status.status) {
      'completed' { 'Green' }
      'error' { 'Red' }
      'running' { 'Yellow' }
      'pending' { 'Cyan' }
      'unknown' { 'Magenta' }
      default { 'White' }
    }
    
    Write-Host "$($status.status)" -ForegroundColor $statusColor -NoNewline
    Write-Host " - $($status.message)"
    
    if ($status.status -eq 'completed') {
      Write-Host "    ✓ Loop would EXIT here - completion detected!" -ForegroundColor Green
      break
    } elseif ($status.status -eq 'error') {
      Write-Host "    ! Loop would EXIT here - error detected" -ForegroundColor Red
      break
    } elseif ($status.status -eq 'unknown') {
      Write-Host "    → Loop would CONTINUE (API error ignored)" -ForegroundColor Yellow
    }
  } catch {
    Write-Host "EXCEPTION" -ForegroundColor Red
    Write-Host "    Message: $($_.Exception.Message)"
    Write-Host "    Type: $($_.Exception.GetType().Name)"
    Write-Host "    → Loop would CONTINUE (exception caught)" -ForegroundColor Yellow
  }
  
  if ($i -lt 5) {
    Start-Sleep -Seconds 2
  }
}
Write-Host ""

# Test 6: Check Run Summary
Write-Host "TEST 6: Run Summary Analysis" -ForegroundColor Green
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
$summaryPath = Join-Path $runDir "run-summary.txt"
if (Test-Path $summaryPath) {
  Write-Host "  Extracting scene-002 log entries..."
  $lines = Get-Content $summaryPath
  $scene002Lines = $lines | Where-Object { $_ -like "*scene-002*" -or $_ -like "*Wan2 polling*" }
  
  if ($scene002Lines) {
    Write-Host ""
    foreach ($line in $scene002Lines) {
      if ($line -like "*polling started*") {
        Write-Host "    $line" -ForegroundColor Cyan
      } elseif ($line -like "*completed*") {
        Write-Host "    $line" -ForegroundColor Green
      } elseif ($line -like "*failed*" -or $line -like "*error*") {
        Write-Host "    $line" -ForegroundColor Red
      } else {
        Write-Host "    $line"
      }
    }
  }
  
  Write-Host ""
  Write-Host "  Last 5 lines of summary:"
  $lines | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
} else {
  Write-Host "  ✗ Run summary not found: $summaryPath" -ForegroundColor Red
}
Write-Host ""

# CONCLUSION
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC CONCLUSION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Based on the tests above, the polling loop should have:" -ForegroundColor Yellow
Write-Host "  1. Detected completion via Check-PromptStatus function"
Write-Host "  2. Broken out of the while loop"
Write-Host "  3. Copied the video file"
Write-Host ""
Write-Host "If Test 3 shows 'completed' but the run summary shows timeout," -ForegroundColor Yellow
Write-Host "then the issue is likely:" -ForegroundColor Yellow
Write-Host "  • Exception being thrown during status check (caught and ignored)"
Write-Host "  • PowerShell type conversion issue with API response"
Write-Host "  • Timing issue where status wasn't available during actual polling"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add verbose logging to Check-PromptStatus function"
Write-Host "  2. Log every status check result to file during polling"
Write-Host "  3. Add retry logic for transient API failures"
Write-Host "  4. Consider using WebSocket for real-time status updates"
Write-Host ""
