# test-svd-seed-fix.ps1
# Quick test to validate SVD seed fix produces consistent 25 frames
# This script uses queue-real-workflow.ps1 with a test keyframe

param(
    [string]$ProjectRoot = 'C:\Dev\gemDirect1',
    [string]$ComfyUrl = 'http://127.0.0.1:8188',
    [int]$MaxWaitSeconds = 300,
    [int]$TestRuns = 3
)

$ErrorActionPreference = 'Stop'

function Write-TestLog {
    param([string]$Message)
    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] [SVD-TEST] $Message"
}

Write-TestLog "Starting SVD seed fix validation"
Write-TestLog "Test runs: $TestRuns"
Write-TestLog ""

# Create test output directory
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$testDir = Join-Path $ProjectRoot "logs\svd-seed-test-$timestamp"
New-Item -ItemType Directory -Path $testDir -Force | Out-Null
Write-TestLog "Test directory: $testDir"

# Locate a test keyframe from recent runs
$logsDir = Join-Path $ProjectRoot 'logs'
$recentKeyframes = Get-ChildItem -Path $logsDir -Recurse -Filter 'keyframe.png' -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $recentKeyframes) {
    Write-TestLog "ERROR: No test keyframes found in logs directory"
    Write-TestLog "Searching in: $logsDir"
    Write-TestLog "Expected pattern: */keyframe.png"
    exit 1
}

$testKeyframe = $recentKeyframes.FullName
Write-TestLog "Using test keyframe: $($recentKeyframes.Name)"
Write-TestLog ""

# Run multiple test iterations
$results = @()

for ($run = 1; $run -le $TestRuns; $run++) {
    Write-TestLog "=== Run $run/$TestRuns ==="
    
    $sceneId = "svd-test-run-$run"
    $sceneOutputDir = Join-Path $testDir "run-$run"
    New-Item -ItemType Directory -Path $sceneOutputDir -Force | Out-Null
    
    $queueScript = Join-Path $ProjectRoot 'scripts\queue-real-workflow.ps1'
    
    try {
        $startTime = Get-Date
        
        # Queue workflow with fixed seed
        & $queueScript `
            -SceneId $sceneId `
            -Prompt "A cinematic test scene with dramatic lighting" `
            -NegativePrompt "blurry, low-resolution, distorted" `
            -KeyframePath $testKeyframe `
            -SceneOutputDir $sceneOutputDir `
            -ProjectRoot $ProjectRoot `
            -ComfyUrl $ComfyUrl `
            -MaxWaitSeconds $MaxWaitSeconds `
            -WaitForDoneMarker $true `
            -DoneMarkerTimeoutSeconds 60
        
        $exitCode = $LASTEXITCODE
        $duration = (Get-Date) - $startTime
        
        if ($exitCode -eq 0) {
            Write-TestLog "✓ Run $run completed successfully (${duration}s elapsed)"
            
            # Check frame count from done marker
            $doneMarkerPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\gemdirect1_$sceneId.done"
            if (Test-Path $doneMarkerPath) {
                $doneMarker = Get-Content $doneMarkerPath -Raw | ConvertFrom-Json
                $frameCount = $doneMarker.FrameCount
                Write-TestLog "  Frame count: $frameCount"
                
                $results += [PSCustomObject]@{
                    Run = $run
                    Success = $true
                    FrameCount = $frameCount
                    DurationSeconds = [int]$duration.TotalSeconds
                }
            } else {
                Write-TestLog "  WARNING: Done marker not found"
                $results += [PSCustomObject]@{
                    Run = $run
                    Success = $true
                    FrameCount = 0
                    DurationSeconds = [int]$duration.TotalSeconds
                }
            }
        } else {
            Write-TestLog "✗ Run $run failed (exit code $exitCode)"
            $results += [PSCustomObject]@{
                Run = $run
                Success = $false
                FrameCount = 0
                DurationSeconds = [int]$duration.TotalSeconds
            }
        }
        
    } catch {
        Write-TestLog "ERROR in run ${run}: $($_.Exception.Message)"
        $results += [PSCustomObject]@{
            Run = $run
            Success = $false
            FrameCount = 0
            DurationSeconds = 0
        }
    }
    
    Write-TestLog ""
}

# Summary
Write-TestLog "=== TEST RESULTS SUMMARY ==="
Write-TestLog ""

$successCount = ($results | Where-Object { $_.Success }).Count
$frameCounts = $results | Where-Object { $_.Success -and $_.FrameCount -gt 0 } | Select-Object -ExpandProperty FrameCount

Write-TestLog "Successful runs: $successCount/$TestRuns"

if ($frameCounts.Count -gt 0) {
    $minFrames = ($frameCounts | Measure-Object -Minimum).Minimum
    $maxFrames = ($frameCounts | Measure-Object -Maximum).Maximum
    $avgFrames = ($frameCounts | Measure-Object -Average).Average
    
    Write-TestLog "Frame counts:"
    Write-TestLog "  Min: $minFrames"
    Write-TestLog "  Max: $maxFrames"
    Write-TestLog "  Avg: $([math]::Round($avgFrames, 1))"
    Write-TestLog "  Values: $($frameCounts -join ', ')"
    Write-TestLog ""
    
    # Check if all frame counts are 25 (target)
    if ($minFrames -eq 25 -and $maxFrames -eq 25) {
        Write-TestLog "✓ SUCCESS: All runs produced exactly 25 frames (seed fix validated)"
        exit 0
    } elseif ($minFrames -eq $maxFrames) {
        Write-TestLog "⚠ PARTIAL: Frame count consistent ($minFrames) but not target (25)"
        Write-TestLog "  Seed fix working (consistent output) but may need workflow tuning"
        exit 0
    } else {
        Write-TestLog "✗ FAILURE: Frame count variability detected (min=$minFrames, max=$maxFrames)"
        Write-TestLog "  Seed fix may not be applied correctly"
        exit 1
    }
} else {
    Write-TestLog "✗ FAILURE: No frame counts available"
    exit 1
}
