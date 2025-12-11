# run-comfyui-e2e.ps1
# End-to-end test: Story → WAN T2I Keyframes → WAN I2V Videos
# This script orchestrates the complete pipeline using ONLY WAN workflows (no SVD)
#
# FEATURES:
# - Playwright lock file prevents concurrent runs (multi-agent safety)
# - LM Studio auto-unload between LLM and ComfyUI phases (VRAM management)
# - Dynamic queue monitoring instead of static timeouts
# - Proper cleanup in finally block

param(
    [string]$ProjectRoot = $PSScriptRoot,
    [switch]$FastIteration,
    [int]$SceneRetryBudget = 1,
    [int]$MaxWaitSeconds = 600,
    [int]$PollIntervalSeconds = 2,
    [string]$LMStudioEndpoint = 'http://192.168.50.192:1234',
    [switch]$SkipLMStudioUnload,
    [switch]$UseMockLLM
)

$ErrorActionPreference = 'Continue'

# Resolve project root
if ($ProjectRoot -eq $PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

# ============================================================================
# PLAYWRIGHT LOCK FILE MECHANISM
# Prevents concurrent runs when multiple agents try to execute simultaneously
# ============================================================================

$lockFile = Join-Path $ProjectRoot '.playwright-lock'
$lockAcquired = $false

function Acquire-PlaywrightLock {
    param(
        [int]$MaxWaitSeconds = 60,
        [int]$PollIntervalSeconds = 2
    )
    
    $startTime = Get-Date
    $currentPID = $PID
    
    while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($MaxWaitSeconds)) {
        if (Test-Path $lockFile) {
            # Check if the process holding the lock is still running
            $lockContent = Get-Content $lockFile -Raw -ErrorAction SilentlyContinue
            if ($lockContent -match 'PID=(\d+)') {
                $lockerPID = [int]$Matches[1]
                $lockerProcess = Get-Process -Id $lockerPID -ErrorAction SilentlyContinue
                
                if (-not $lockerProcess) {
                    # Process that held the lock is dead, remove stale lock
                    Write-Host "[LOCK] Removing stale lock from dead process PID=$lockerPID" -ForegroundColor Yellow
                    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
                } else {
                    # Lock is held by running process, wait
                    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 0)
                    Write-Host "[LOCK] Waiting for lock (held by PID=$lockerPID, waited ${elapsed}s)..." -ForegroundColor Yellow
                    Start-Sleep -Seconds $PollIntervalSeconds
                    continue
                }
            }
        }
        
        # Try to acquire lock
        try {
            $lockContent = @"
PID=$currentPID
Acquired=$(Get-Date -Format 'o')
Script=run-comfyui-e2e.ps1
"@
            $lockContent | Set-Content $lockFile -Force -ErrorAction Stop
            
            # Verify we got the lock (race condition check)
            Start-Sleep -Milliseconds 100
            $verifyContent = Get-Content $lockFile -Raw -ErrorAction SilentlyContinue
            if ($verifyContent -match "PID=$currentPID") {
                Write-Host "[LOCK] Acquired Playwright lock (PID=$currentPID)" -ForegroundColor Green
                return $true
            }
        } catch {
            # Another process may have grabbed it
            Start-Sleep -Seconds $PollIntervalSeconds
        }
    }
    
    Write-Host "[LOCK] Failed to acquire lock after ${MaxWaitSeconds}s" -ForegroundColor Red
    return $false
}

function Release-PlaywrightLock {
    if (Test-Path $lockFile) {
        $lockContent = Get-Content $lockFile -Raw -ErrorAction SilentlyContinue
        if ($lockContent -match "PID=$PID") {
            Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
            Write-Host "[LOCK] Released Playwright lock (PID=$PID)" -ForegroundColor Green
        } else {
            Write-Host "[LOCK] Lock not owned by this process, not releasing" -ForegroundColor Yellow
        }
    }
}

# ============================================================================
# LM STUDIO MODEL MANAGEMENT
# Unloads models between LLM and ComfyUI phases to free VRAM
# Uses CLI (lms) with REST API fallback
# ============================================================================

function Get-LMStudioModelState {
    param([string]$Endpoint = $LMStudioEndpoint)
    
    try {
        # Try LM Studio REST API v0 first (more detailed)
        $response = Invoke-RestMethod -Uri "$Endpoint/api/v0/models" -TimeoutSec 5 -ErrorAction Stop
        $loadedModels = $response.data | Where-Object { $_.state -eq 'loaded' }
        return @{
            Available = $true
            LoadedModels = $loadedModels
            LoadedCount = ($loadedModels | Measure-Object).Count
            TotalModels = ($response.data | Measure-Object).Count
        }
    } catch {
        try {
            # Fallback to OpenAI-compatible endpoint
            $response = Invoke-RestMethod -Uri "$Endpoint/v1/models" -TimeoutSec 5 -ErrorAction Stop
            return @{
                Available = $true
                LoadedModels = $response.data
                LoadedCount = ($response.data | Measure-Object).Count
                TotalModels = ($response.data | Measure-Object).Count
            }
        } catch {
            return @{
                Available = $false
                LoadedModels = @()
                LoadedCount = 0
                TotalModels = 0
                Error = $_.Exception.Message
            }
        }
    }
}

function Unload-LMStudioModels {
    <#
    .SYNOPSIS
    Unloads all models from LM Studio to free VRAM for ComfyUI.
    
    .DESCRIPTION
    Uses LM Studio CLI (lms) if available, with REST API state verification.
    Falls back to documentation/manual guidance if CLI unavailable.
    
    .NOTES
    LM Studio CLI must be in PATH. Install via: https://lmstudio.ai/docs/cli
    CLI command: lms unload --all
    #>
    param(
        [string]$Endpoint = $LMStudioEndpoint,
        [int]$VerifyWaitSeconds = 30,
        [int]$PollIntervalSeconds = 2
    )
    
    Write-Host "[LM Studio] Checking model state before unload..." -ForegroundColor Cyan
    $stateBefore = Get-LMStudioModelState -Endpoint $Endpoint
    
    if (-not $stateBefore.Available) {
        Write-Host "[LM Studio] Server not available at $Endpoint - skipping unload" -ForegroundColor Yellow
        return @{ Success = $true; Skipped = $true; Reason = 'Server not available' }
    }
    
    if ($stateBefore.LoadedCount -eq 0) {
        Write-Host "[LM Studio] No models loaded - nothing to unload" -ForegroundColor Green
        return @{ Success = $true; Skipped = $true; Reason = 'No models loaded' }
    }
    
    Write-Host "[LM Studio] Found $($stateBefore.LoadedCount) loaded model(s)" -ForegroundColor Cyan
    
    # Method 1: Try LM Studio CLI (lms unload --all)
    $lmsPath = Get-Command 'lms' -ErrorAction SilentlyContinue
    if ($lmsPath) {
        Write-Host "[LM Studio] Using CLI: lms unload --all" -ForegroundColor Cyan
        try {
            $unloadResult = & lms unload --all 2>&1
            Write-Host "[LM Studio] CLI output: $unloadResult" -ForegroundColor Gray
        } catch {
            Write-Host "[LM Studio] CLI failed: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[LM Studio] CLI 'lms' not in PATH" -ForegroundColor Yellow
        Write-Host "[LM Studio] Install: https://lmstudio.ai/docs/cli" -ForegroundColor Yellow
        Write-Host "[LM Studio] Or add to PATH: C:\Users\<user>\.lmstudio\bin" -ForegroundColor Yellow
        
        # Provide manual instructions
        Write-Host "" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
        Write-Host "  MANUAL ACTION REQUIRED: Unload LM Studio Model" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
        Write-Host "  1. Open LM Studio application" -ForegroundColor Yellow
        Write-Host "  2. Click 'Eject' button next to loaded model" -ForegroundColor Yellow
        Write-Host "  3. Or: Settings → Server → Stop Server" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
    }
    
    # Wait and verify unload via REST API state polling
    Write-Host "[LM Studio] Waiting for model unload (polling state)..." -ForegroundColor Cyan
    $startTime = Get-Date
    $unloaded = $false
    
    while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($VerifyWaitSeconds)) {
        Start-Sleep -Seconds $PollIntervalSeconds
        $stateAfter = Get-LMStudioModelState -Endpoint $Endpoint
        
        if (-not $stateAfter.Available) {
            # Server stopped = models unloaded
            Write-Host "[LM Studio] Server stopped - models unloaded" -ForegroundColor Green
            $unloaded = $true
            break
        }
        
        if ($stateAfter.LoadedCount -eq 0) {
            Write-Host "[LM Studio] All models unloaded successfully" -ForegroundColor Green
            $unloaded = $true
            break
        }
        
        $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 0)
        Write-Host "[LM Studio] Still loaded: $($stateAfter.LoadedCount) model(s) (waited ${elapsed}s)" -ForegroundColor Yellow
    }
    
    if (-not $unloaded) {
        Write-Host "[LM Studio] WARNING: Models may still be loaded after ${VerifyWaitSeconds}s" -ForegroundColor Red
        Write-Host "[LM Studio] ComfyUI may have reduced VRAM available" -ForegroundColor Red
        return @{ Success = $false; Reason = 'Timeout waiting for unload' }
    }
    
    # Additional wait for VRAM to be fully released
    Write-Host "[LM Studio] Waiting 10s for VRAM release..." -ForegroundColor Cyan
    Start-Sleep -Seconds 10
    
    return @{ Success = $true; Skipped = $false }

# Create timestamped run directory
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $ProjectRoot "logs\$timestamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$summaryPath = Join-Path $runDir 'run-summary.txt'
$storyDir = Join-Path $runDir 'story'
$videoDir = Join-Path $runDir 'video'

# ============================================================================
# ACQUIRE PLAYWRIGHT LOCK (prevents concurrent runs)
# ============================================================================
$lockAcquired = Acquire-PlaywrightLock -MaxWaitSeconds 60 -PollIntervalSeconds 2
if (-not $lockAcquired) {
    Write-Host "ERROR: Could not acquire Playwright lock. Another E2E test may be running." -ForegroundColor Red
    Write-Host "If no other test is running, remove the stale lock file: $lockFile" -ForegroundColor Yellow
    exit 1
}

# Ensure cleanup on exit (release lock, stop jobs)
$cleanupBlock = {
    Release-PlaywrightLock
    if ($vramMonitorJob) {
        Stop-Job $vramMonitorJob -ErrorAction SilentlyContinue
        Remove-Job $vramMonitorJob -Force -ErrorAction SilentlyContinue
    }
}
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action $cleanupBlock | Out-Null

function Write-Summary {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -Path $summaryPath -Value $line -Encoding UTF8
}

function Write-Header {
    param([string]$Title)
    Write-Summary ""
    Write-Summary "=== $Title ==="
    Write-Summary ""
}

# VRAM Monitoring Setup
$vramLog = Join-Path $runDir 'vram-usage.log'
$vramStats = @{
    Peak = 0
    Minimum = 999999
    Samples = @()
}

function Get-VRAMUsage {
    try {
        $stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" -TimeoutSec 2 -ErrorAction Stop
        if ($stats.devices -and $stats.devices[0]) {
            $dev = $stats.devices[0]
            
            # Extract available values (API may not return all fields)
            $totalMB = if ($dev.vram_total) { [math]::Round($dev.vram_total / 1MB, 0) } else { 0 }
            $freeMB = if ($dev.vram_free) { [math]::Round($dev.vram_free / 1MB, 0) } else { 0 }
            
            # Calculate used based on whether Total is available
            $usedMB = if ($totalMB -gt 0) { $totalMB - $freeMB } else { 0 }
            
            return @{
                Used = $usedMB
                Free = $freeMB
                Total = $totalMB
                Timestamp = Get-Date -Format 'HH:mm:ss'
            }
        }
    } catch {
        # Silent fail if ComfyUI not responding
    }
    return $null
}

function Log-VRAMSample {
    $vram = Get-VRAMUsage
    if ($vram) {
        $vramStats.Samples += $vram
        if ($vram.Used -gt $vramStats.Peak) { $vramStats.Peak = $vram.Used }
        if ($vram.Used -lt $vramStats.Minimum) { $vramStats.Minimum = $vram.Used }
        
        $logLine = "$($vram.Timestamp),Used=$($vram.Used)MB,Free=$($vram.Free)MB,Total=$($vram.Total)MB"
        Add-Content -Path $vramLog -Value $logLine -Encoding UTF8
    }
}

# Initialize summary
Write-Summary "E2E Story-to-Video Run: $timestamp"
Write-Summary "Run directory: $runDir"
Write-Summary ""

# Capture initial VRAM state
Log-VRAMSample
$initialVRAM = Get-VRAMUsage
if ($initialVRAM) {
    Write-Summary "Initial VRAM: Used=$($initialVRAM.Used)MB Free=$($initialVRAM.Free)MB Total=$($initialVRAM.Total)MB"
}

# TEMPORARILY DISABLED: Background VRAM monitoring to debug E2E hang issue
# Start background VRAM monitoring job (samples every 5 seconds)
$vramMonitorJob = $null
<# COMMENTED OUT FOR DEBUGGING
$vramMonitorJob = Start-Job -ScriptBlock {
    param($vramLogPath)
    while ($true) {
        try {
            $stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" -TimeoutSec 2 -ErrorAction Stop
            if ($stats.devices -and $stats.devices[0]) {
                $dev = $stats.devices[0]
                $totalMB = if ($dev.vram_total) { [math]::Round($dev.vram_total / 1MB, 0) } else { 24576 }
                $freeMB = if ($dev.vram_free) { [math]::Round($dev.vram_free / 1MB, 0) } else { 0 }
                $usedMB = $totalMB - $freeMB
                $timestamp = Get-Date -Format 'HH:mm:ss'
                $logLine = "$timestamp,Used=${usedMB}MB,Free=${freeMB}MB"
                Add-Content -Path $vramLogPath -Value $logLine -Encoding UTF8
            }
        } catch {
            # Silent fail
        }
        Start-Sleep -Seconds 5
    }
} -ArgumentList $vramLog
#>

# FastIteration adjustments
if ($FastIteration) {
    $MaxWaitSeconds = 360  # 6 minutes for fresh generation (3.5 min/scene + buffer)
    $PollIntervalSeconds = 1
    Write-Summary "FastIteration mode: MaxWait=${MaxWaitSeconds}s PollInterval=${PollIntervalSeconds}s"
}

Write-Summary "Queue policy: retries=$SceneRetryBudget maxWait=${MaxWaitSeconds}s pollInterval=${PollIntervalSeconds}s"

# ============================================================================
# STEP 1: Generate Story (with keyframes)
# ============================================================================
Write-Header "STEP 1: Generate Story"

$storyScript = Join-Path $PSScriptRoot 'generate-story-scenes.ts'
if (-not (Test-Path $storyScript)) {
    Write-Summary "ERROR: generate-story-scenes.ts not found"
    exit 1
}

try {
    # Build story generation command with optional custom story idea
    $storyCmd = "npx tsx `"$storyScript`" --output `"$storyDir`" --scenes 3"
    if ($env:CUSTOM_STORY_IDEA) {
        $storyCmd += " --customStoryIdea `"$env:CUSTOM_STORY_IDEA`""
        Write-Summary "Using custom story idea: $env:CUSTOM_STORY_IDEA"
    }
    if ($UseMockLLM) {
        $storyCmd += " --useMockLLM"
        Write-Summary "Using Mock LLM for story generation"
    }
    
    Write-Summary "Executing: $storyCmd"
    $storyResult = Invoke-Expression $storyCmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Summary "ERROR: Story generation failed (exit code $LASTEXITCODE)"
        Write-Summary "Output: $storyResult"
        exit 1
    }
    
    Write-Summary "✓ Story generated: $storyDir"
    
    # Read story.json to get scene list
    $storyJsonPath = Join-Path $storyDir 'story.json'
    if (-not (Test-Path $storyJsonPath)) {
        Write-Summary "ERROR: story.json not found"
        exit 1
    }
    
    $story = Get-Content $storyJsonPath -Raw | ConvertFrom-Json
    $sceneIds = $story.scenes.id
    Write-Summary "Scenes to process: $($sceneIds -join ', ')"
    
} catch {
    Write-Summary "ERROR: Story generation exception: $_"
    Release-PlaywrightLock
    exit 1
}

# ============================================================================
# STEP 1.5: Unload LM Studio Model (Free VRAM for ComfyUI)
# ============================================================================
Write-Header "STEP 1.5: Unload LM Studio Model"

if ($SkipLMStudioUnload) {
    Write-Summary "Skipping LM Studio unload (--SkipLMStudioUnload flag)"
} else {
    Write-Summary "Unloading LM Studio model to free VRAM for ComfyUI..."
    $unloadResult = Unload-LMStudioModels -Endpoint $LMStudioEndpoint -VerifyWaitSeconds 30 -PollIntervalSeconds 2
    
    if ($unloadResult.Skipped) {
        Write-Summary "LM Studio unload skipped: $($unloadResult.Reason)"
    } elseif ($unloadResult.Success) {
        Write-Summary "✓ LM Studio model unloaded - VRAM available for ComfyUI"
        
        # Verify ComfyUI VRAM state after unload
        $postUnloadVRAM = Get-VRAMUsage
        if ($postUnloadVRAM) {
            Write-Summary "Post-unload VRAM: Free=$($postUnloadVRAM.Free)MB Total=$($postUnloadVRAM.Total)MB"
            if ($postUnloadVRAM.Free -lt 4096) {
                Write-Summary "⚠ WARNING: Free VRAM < 4GB - video generation may be slow"
            }
        }
    } else {
        Write-Summary "⚠ LM Studio unload failed: $($unloadResult.Reason)"
        Write-Summary "Continuing anyway - ComfyUI may have reduced VRAM"
    }
    
    Log-VRAMSample
}

# ============================================================================
# STEP 2: Generate Videos with WAN I2V
# ============================================================================
Write-Header "STEP 2: Generate Videos (WAN I2V)"

$wanScript = Join-Path $PSScriptRoot 'generate-scene-videos-wan2.ps1'
if (-not (Test-Path $wanScript)) {
    Write-Summary "ERROR: generate-scene-videos-wan2.ps1 not found"
    exit 1
}

# Set environment variables for WAN script
$env:WAN2_RUN_DIR = $runDir
$env:WAN2_COMFY_URL = 'http://127.0.0.1:8188'
$env:WAN2_MAX_WAIT = $MaxWaitSeconds
$env:WAN2_POLL_INTERVAL = $PollIntervalSeconds

try {
    Write-Summary "Invoking WAN I2V generation (process isolation mode)..."
    Write-Summary "Script: $wanScript"
    Write-Summary "Scenes to process: $($sceneIds.Count)"
    
    # Sample VRAM before generation starts
    Log-VRAMSample
    
    # PROCESS ISOLATION FIX: Call WAN script separately for each scene
    # This prevents PowerShell session timeout/resource exhaustion issues
    $successCount = 0
    $failCount = 0
    
    foreach ($sceneId in $sceneIds) {
        Write-Summary ""
        Write-Summary "[Scene $sceneId] Starting video generation..."
        
        # Call WAN script with single scene filter in isolated process
        $wanArgs = @(
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', $wanScript,
            '-RunDir', $runDir,
            '-ComfyUrl', 'http://127.0.0.1:8188',
            '-MaxWaitSeconds', $MaxWaitSeconds.ToString(),
            '-PollIntervalSeconds', $PollIntervalSeconds.ToString(),
            '-SceneFilter', $sceneId
        )
        
        $processStart = Get-Date
        $process = Start-Process -FilePath 'pwsh' -ArgumentList $wanArgs -Wait -NoNewWindow -PassThru
        $processDuration = [math]::Round(((Get-Date) - $processStart).TotalSeconds, 1)
        
        if ($process.ExitCode -eq 0) {
            Write-Summary "[Scene $sceneId] ✓ Video generation completed (${processDuration}s)"
            $successCount++
        } else {
            Write-Summary "[Scene $sceneId] ✗ Video generation failed with exit code $($process.ExitCode) (${processDuration}s)"
            $failCount++
        }
        
        # Force garbage collection and brief pause between scenes
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
        [GC]::Collect()
        Start-Sleep -Seconds 2
        
        # Sample VRAM after each scene
        Log-VRAMSample
    }
    
    Write-Summary ""
    Write-Summary "WAN I2V generation summary: $successCount succeeded, $failCount failed"
    
    if ($failCount -eq 0) {
        Write-Summary "✓ WAN I2V generation completed successfully"
    } elseif ($successCount -gt 0) {
        Write-Summary "⚠ WAN I2V generation partially completed"
    } else {
        Write-Summary "✗ WAN I2V generation failed completely"
    }
    
} catch {
    Write-Summary "ERROR: WAN generation exception: $_"
}

# ============================================================================
# STEP 3: Validate Results
# ============================================================================
Write-Header "STEP 3: Validate Results"

$videoCount = 0
if (Test-Path $videoDir) {
    $videos = Get-ChildItem $videoDir -Recurse -Filter "*.mp4"
    $videoCount = $videos.Count
    Write-Summary "Videos generated: $videoCount"
    
    foreach ($video in $videos) {
        $sizeMB = [math]::Round($video.Length / 1MB, 2)
        Write-Summary "  - $($video.Name) (${sizeMB} MB)"
    }
} else {
    Write-Summary "WARNING: Video directory not found"
}

$expectedScenes = $sceneIds.Count
Write-Summary ""
Write-Summary "Expected scenes: $expectedScenes"
Write-Summary "Videos generated: $videoCount"

if ($videoCount -eq $expectedScenes) {
    Write-Summary "✓ SUCCESS: All scenes produced videos"
} elseif ($videoCount -gt 0) {
    Write-Summary "⚠ PARTIAL: $videoCount/$expectedScenes videos generated"
} else {
    Write-Summary "✗ FAILURE: No videos generated"
}

# Stop background VRAM monitoring job
if ($vramMonitorJob) {
    Stop-Job $vramMonitorJob -ErrorAction SilentlyContinue
    Remove-Job $vramMonitorJob -Force -ErrorAction SilentlyContinue
}

# Capture final VRAM state and compute statistics from log
Log-VRAMSample
$finalVRAM = Get-VRAMUsage

# Parse VRAM log for statistics (includes background samples)
# Log format: "HH:mm:ss,Used=XXMb,Free=YYMb" or "HH:mm:ss,YYMb" (Free VRAM only)
if (Test-Path $vramLog) {
    $freeVRAMSamples = @()
    $usedVRAMSamples = @()
    $totalVRAM = 24576  # Default, will be updated if found in log
    
    Get-Content $vramLog | ForEach-Object {
        # Try to parse: "HH:mm:ss,Used=XXMb,Free=YYMb,Total=ZZMb"
        if ($_ -match 'Used=(\d+)MB,Free=(\d+)MB(?:,Total=(\d+)MB)?') {
            $usedVRAMSamples += [int]$Matches[1]
            $freeVRAMSamples += [int]$Matches[2]
            if ($Matches[3]) { $totalVRAM = [int]$Matches[3] }
        }
        # Alternative format: "HH:mm:ss,Free=YYMb"
        elseif ($_ -match 'Free=(\d+)MB') {
            $freeVRAMSamples += [int]$Matches[1]
        }
    }
    
    if ($freeVRAMSamples.Count -gt 0) {
        $minFreeVRAM = ($freeVRAMSamples | Measure-Object -Minimum).Minimum
        $avgFreeVRAM = [math]::Round(($freeVRAMSamples | Measure-Object -Average).Average, 0)
        $peakUsedVRAM = $totalVRAM - $minFreeVRAM
        
        Write-Summary ""
        Write-Summary "=== VRAM Usage Statistics ==="
        Write-Summary "Peak Used VRAM: $peakUsedVRAM MB (calculated from min free: $minFreeVRAM MB)"
        Write-Summary "Average Free VRAM: $avgFreeVRAM MB"
        Write-Summary "Total VRAM: $totalVRAM MB"
        Write-Summary "Samples collected: $($freeVRAMSamples.Count)"
        if ($finalVRAM) {
            Write-Summary "Final VRAM: Used=$($finalVRAM.Used)MB Free=$($finalVRAM.Free)MB"
        }
        Write-Summary "VRAM log: $vramLog"
    }
} elseif ($vramStats.Samples.Count -gt 0) {
    # Fallback to manual samples if log parsing fails
    $avgUsed = [math]::Round(($vramStats.Samples | Measure-Object -Property Used -Average).Average, 0)
    Write-Summary ""
    Write-Summary "=== VRAM Usage Statistics ==="
    Write-Summary "Peak VRAM: $($vramStats.Peak) MB"
    Write-Summary "Average VRAM: $avgUsed MB"
    Write-Summary "Minimum VRAM: $($vramStats.Minimum) MB"
    if ($finalVRAM) {
        Write-Summary "Final VRAM: Used=$($finalVRAM.Used)MB Free=$($finalVRAM.Free)MB"
    }
    Write-Summary "VRAM log: $vramLog"
}

# ============================================================================
# STEP 4: Run Validation Metrics
# ============================================================================
Write-Header "STEP 4: Validation Metrics"

$metricsScript = Join-Path $PSScriptRoot 'validation-metrics.ts'
if (Test-Path $metricsScript) {
    try {
        Write-Summary "Running validation metrics..."
        node --loader ts-node/esm $metricsScript --run-dir $runDir 2>&1 | Out-Null
        
        $metricsPath = Join-Path $runDir 'test-results\validation-metrics\latest.json'
        if (Test-Path $metricsPath) {
            $metrics = Get-Content $metricsPath -Raw | ConvertFrom-Json
            Write-Summary "Metrics: videosDetected=$($metrics.videosDetected) videosMissing=$($metrics.videosMissing)"
        }
    } catch {
        Write-Summary "WARNING: Validation metrics failed: $_"
    }
}

# ============================================================================
# STEP 4.5: Video Quality Validation (FFprobe-based)
# ============================================================================
Write-Header "STEP 4.5: Video Quality Validation"

$qualityScript = Join-Path $PSScriptRoot 'validate-video-quality.ts'
if (Test-Path $qualityScript) {
    try {
        Write-Summary "Running video quality validation (FFprobe)..."
        $qualityOutput = node --loader ts-node/esm $qualityScript --run-dir $runDir 2>&1
        
        # Extract summary line from output
        $summaryLine = $qualityOutput | Select-String -Pattern "^\s*\d+/\d+\s+videos\s+passed" | Select-Object -First 1
        if ($summaryLine) {
            Write-Summary "Quality: $($summaryLine.Line.Trim())"
        }
        
        $qualityPath = Join-Path $runDir 'test-results\video-validation\validation-results.json'
        if (Test-Path $qualityPath) {
            $qualityResults = Get-Content $qualityPath -Raw | ConvertFrom-Json
            $passed = ($qualityResults | Where-Object { $_.valid -eq $true }).Count
            $failed = ($qualityResults | Where-Object { $_.valid -eq $false }).Count
            Write-Summary "Quality Results: passed=$passed failed=$failed"
        }
    } catch {
        Write-Summary "WARNING: Video quality validation failed: $_"
    }
} else {
    Write-Summary "SKIP: validate-video-quality.ts not found"
}

# ============================================================================
# STEP 5: Create Archive
# ============================================================================
Write-Header "STEP 5: Create Archive"

$artifactsDir = Join-Path $ProjectRoot 'artifacts'
New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null

$archiveName = "comfyui-e2e-$timestamp.zip"
$archivePath = Join-Path $artifactsDir $archiveName

try {
    Compress-Archive -Path $runDir -DestinationPath $archivePath -Force
    Write-Summary "✓ Archive created: $archivePath"
} catch {
    Write-Summary "WARNING: Archive creation failed: $_"
}

# ============================================================================
# Summary
# ============================================================================
Write-Header "RUN COMPLETE"
Write-Summary "Run directory: $runDir"
Write-Summary "Archive: $archivePath"
Write-Summary "Videos: $videoCount/$expectedScenes"
Write-Summary ""

# Release the Playwright lock
Release-PlaywrightLock

# Exit with appropriate code
if ($videoCount -eq $expectedScenes) {
    exit 0
} else {
    exit 1
}
