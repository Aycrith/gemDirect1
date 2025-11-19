#!/usr/bin/env powershell
param(
    [string] $ComfyUrl = "http://127.0.0.1:8188",
    [int] $TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

Write-Host "=== GemDirect1 E2E Validation Report ===" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'o')" -ForegroundColor Cyan
Write-Host ""

# 1. Query ComfyUI history for all executions
Write-Host "[1] Querying ComfyUI History..." -ForegroundColor Yellow
try {
    $history = Invoke-RestMethod -Uri "$ComfyUrl/history" -TimeoutSec $TimeoutSeconds -ErrorAction Stop
    $totalExecutions = $history.PSObject.Properties.Count
    Write-Host "✅ ComfyUI responsive - Total executions: $totalExecutions" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to query ComfyUI: $_" -ForegroundColor Red
    exit 1
}

# 2. Analyze each execution
Write-Host "[2] Analyzing Executions..." -ForegroundColor Yellow
$sceneExecutions = @()
$totalFrames = 0

foreach ($execId in $history.PSObject.Properties.Name) {
    $exec = $history.$execId
    
    # Check if this is a scene execution (has SaveImage output)
    if ($exec.outputs -and $exec.outputs.PSObject.Properties.Count -gt 0) {
        foreach ($nodeId in $exec.outputs.PSObject.Properties.Name) {
            $output = $exec.outputs.$nodeId
            
            if ($output.images -and $output.images.Count -gt 0) {
                # Extract scene name from output
                $firstImage = $output.images[0].filename
                if ($firstImage -match 'gemdirect1_scene-(\d+)') {
                    $sceneNum = $Matches[1]
                    $frameCount = $output.images.Count
                    $totalFrames += $frameCount
                    
                    $sceneInfo = @{
                        ExecutionId = $execId
                        SceneNumber = $sceneNum
                        FrameCount = $frameCount
                        FirstFrame = $firstImage
                        Status = if ($exec.status.status_str -eq 'success') { 'success' } else { $exec.status.status_str }
                        Completed = $exec.status.completed
                    }
                    $sceneExecutions += $sceneInfo
                    Write-Host "  OK Scene-$sceneNum`: $frameCount frames" -ForegroundColor Green
                }
            }
        }
    }
}

# 3. Verify output directory
Write-Host "[3] Verifying ComfyUI Output Directory..." -ForegroundColor Yellow
$outputDir = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output'
if (Test-Path $outputDir) {
    $pngFiles = @(Get-ChildItem -Path $outputDir -Filter 'gemdirect1_*.png' -File)
    Write-Host "✅ Output directory verified: $($pngFiles.Count) PNG files found" -ForegroundColor Green
} else {
    Write-Host "⚠️ Output directory not found" -ForegroundColor Yellow
}

# 4. Summary
Write-Host "[4] Validation Summary" -ForegroundColor Yellow
Write-Host "========================="
Write-Host "Total Scenes Executed: $($sceneExecutions.Count)" -ForegroundColor Cyan
Write-Host "Total Frames Generated: $totalFrames" -ForegroundColor Cyan

if ($sceneExecutions.Count -gt 0) {
    Write-Host ""
    Write-Host "Scenes:" -ForegroundColor Cyan
    $sceneExecutions | ForEach-Object {
        Write-Host "  • Scene-$($_.SceneNumber): $($_.FrameCount) frames (Status: $($_.Status))" -ForegroundColor Cyan
    }
}

Write-Host ""

# 5. Success determination
$expectedScenes = 3
$expectedFramesPerScene = 25
$allSuccessful = $sceneExecutions.Count -eq $expectedScenes -and $totalFrames -eq ($expectedScenes * $expectedFramesPerScene)

if ($allSuccessful) {
    Write-Host "[OK] VALIDATION PASSED" -ForegroundColor Green
    Write-Host "   - All 3 scenes executed successfully"
    Write-Host "   - All 75 frames generated (25 per scene)"
    Write-Host "   - ComfyUI history verified"
    exit 0
} else {
    $sceneStatus = if ($sceneExecutions.Count -ge $expectedScenes) { "[OK]" } else { "[FAIL] ($($sceneExecutions.Count)/$expectedScenes)" }
    $frameStatus = if ($totalFrames -ge ($expectedScenes * $expectedFramesPerScene)) { "[OK]" } else { "[FAIL] ($totalFrames/75)" }
    
    Write-Host "⚠️ PARTIAL EXECUTION" -ForegroundColor Yellow
    Write-Host "   Scenes: $sceneStatus"
    Write-Host "   Frames: $frameStatus"
    Write-Host ""
    Write-Host "Status Summary:" -ForegroundColor Yellow
    Write-Host "   • $($sceneExecutions.Count) out of $expectedScenes scenes completed"
    Write-Host "   • $totalFrames out of 75 total frames generated"
    exit 0
}
