#!/usr/bin/env pwsh
# Comprehensive Telemetry Contract Verification
# Checks artifact-metadata.json against TELEMETRY_CONTRACT.md requirements

param(
    [string]$MetadataPath = $(Get-ChildItem -Path 'c:\Dev\gemDirect1\logs\20251113-212831' -Filter 'artifact-metadata.json' -Recurse | Select-Object -First 1 -ExpandProperty FullName)
)

if (-not (Test-Path $MetadataPath)) {
    Write-Host "ERROR: Metadata file not found at $MetadataPath" -ForegroundColor Red
    exit 1
}

$metadata = Get-Content $MetadataPath | ConvertFrom-Json

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Telemetry Contract Verification - Artifact Metadata     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Define required telemetry fields per TELEMETRY_CONTRACT.md
$requiredFields = @(
    # Core Execution Metrics
    "DurationSeconds",
    "QueueStart",
    "QueueEnd",
    
    # History Polling Metrics
    "HistoryAttempts",
    "HistoryAttemptLimit",
    "MaxWaitSeconds",
    "PollIntervalSeconds",
    "HistoryExitReason",
    
    # Execution Success Indicators
    "ExecutionSuccessDetected",
    "ExecutionSuccessAt",
    
    # Post-Execution Monitoring
    "PostExecutionTimeoutSeconds",
    "HistoryPostExecutionTimeoutReached",
    
    # Scene Retry Control
    "SceneRetryBudget",
    
    # Sentinel & Forced-Copy Telemetry
    "DoneMarkerDetected",
    "DoneMarkerWaitSeconds",
    "DoneMarkerPath",
    "ForcedCopyTriggered",
    "ForcedCopyDebugPath"
)

$requiredGPUFields = @(
    "Name",
    "Type",
    "Index",
    "VramTotal",
    "VramFreeBefore",
    "VramFreeAfter",
    "VramBeforeMB",
    "VramAfterMB",
    "VramDeltaMB"
)

$requiredSystemFields = @(
    "Before",
    "After",
    "FallbackNotes"
)

$allPassed = $true
$passCount = 0
$failCount = 0

Write-Host "Checking $($metadata.scenes.Count) scenes..." -ForegroundColor Cyan
Write-Host ""

foreach ($sceneIdx in 0..($metadata.scenes.Count - 1)) {
    $scene = $metadata.scenes[$sceneIdx]
    $sceneId = $scene.SceneId
    Write-Host "Scene: $sceneId" -ForegroundColor Yellow
    Write-Host "────────────────────────────────────"
    
    $telemetry = $scene.Telemetry
    
    # Check core fields
    foreach ($field in $requiredFields) {
        $value = $telemetry.$field
        if ($null -eq $value -and $field -ne "ExecutionSuccessAt" -and $field -ne "ForcedCopyDebugPath" -and $field -ne "DoneMarkerPath") {
            Write-Host "  ✗ Missing required field: $field" -ForegroundColor Red
            $failCount++
            $allPassed = $false
        } else {
            Write-Host "  ✓ $field" -ForegroundColor Green
            $passCount++
        }
    }
    
    # Check GPU fields
    Write-Host ""
    Write-Host "  GPU Fields:" -ForegroundColor Cyan
    $gpu = $telemetry.GPU
    foreach ($field in $requiredGPUFields) {
        $value = $gpu.$field
        if ($null -eq $value) {
            Write-Host "    ✗ Missing GPU.$field" -ForegroundColor Red
            $failCount++
            $allPassed = $false
        } else {
            Write-Host "    ✓ GPU.$field = $value" -ForegroundColor Green
            $passCount++
        }
    }
    
    # Check System fields
    Write-Host ""
    Write-Host "  System Fields:" -ForegroundColor Cyan
    $system = $telemetry.System
    foreach ($field in $requiredSystemFields) {
        $value = $system.$field
        if ($null -eq $value) {
            Write-Host "    ✗ Missing System.$field" -ForegroundColor Red
            $failCount++
            $allPassed = $false
        } else {
            $valueStr = if ($value -is [array]) { "[$($value.Count) items]" } else { $value }
            Write-Host "    ✓ System.$field = $valueStr" -ForegroundColor Green
            $passCount++
        }
    }
    
    # Validate VRAM delta math
    $vramDelta = $gpu.VramAfterMB - $gpu.VramBeforeMB
    $reportedDelta = $gpu.VramDeltaMB
    if ([Math]::Abs($vramDelta - $reportedDelta) -gt 0.1) {
        Write-Host "  ✗ VRAM delta math error: $reportedDelta != ($($gpu.VramAfterMB) - $($gpu.VramBeforeMB))" -ForegroundColor Red
        $failCount++
        $allPassed = $false
    } else {
        Write-Host "  ✓ VRAM delta math validated" -ForegroundColor Green
        $passCount++
    }
    
    # Validate HistoryExitReason enum
    $validReasons = @("success", "maxWait", "attemptLimit", "postExecution", "unknown")
    if ($telemetry.HistoryExitReason -notin $validReasons) {
        Write-Host "  ✗ Invalid HistoryExitReason: $($telemetry.HistoryExitReason)" -ForegroundColor Red
        $failCount++
        $allPassed = $false
    } else {
        Write-Host "  ✓ HistoryExitReason valid: $($telemetry.HistoryExitReason)" -ForegroundColor Green
        $passCount++
    }
    
    # Conditional check: ExecutionSuccessAt required when ExecutionSuccessDetected
    if ($telemetry.ExecutionSuccessDetected -and $null -eq $telemetry.ExecutionSuccessAt) {
        Write-Host "  ✗ ExecutionSuccessAt required when ExecutionSuccessDetected=true" -ForegroundColor Red
        $failCount++
        $allPassed = $false
    }
    
    Write-Host ""
}

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Verification Summary                                    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Passed: $passCount checks" -ForegroundColor Green
Write-Host "Failed: $failCount checks" -ForegroundColor $(if ($failCount -gt 0) { 'Red' } else { 'Green' })
Write-Host ""

if ($allPassed) {
    Write-Host "✓ ALL TELEMETRY CONTRACT REQUIREMENTS MET" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ TELEMETRY CONTRACT VERIFICATION FAILED" -ForegroundColor Red
    exit 1
}
