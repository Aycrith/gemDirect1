# run-comfyui-e2e.ps1
# End-to-end test: Story → WAN T2I Keyframes → WAN I2V Videos
# This script orchestrates the complete pipeline using ONLY WAN workflows (no SVD)

param(
    [string]$ProjectRoot = $PSScriptRoot,
    [switch]$FastIteration,
    [int]$SceneRetryBudget = 1,
    [int]$MaxWaitSeconds = 600,
    [int]$PollIntervalSeconds = 2
)

$ErrorActionPreference = 'Continue'

# Resolve project root
if ($ProjectRoot -eq $PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

# Create timestamped run directory
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $ProjectRoot "logs\$timestamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$summaryPath = Join-Path $runDir 'run-summary.txt'
$storyDir = Join-Path $runDir 'story'
$videoDir = Join-Path $runDir 'video'

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
    $storyResult = node --loader ts-node/esm $storyScript --output $storyDir --scenes 3 2>&1
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
    exit 1
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

# Exit with appropriate code
if ($videoCount -eq $expectedScenes) {
    exit 0
} else {
    exit 1
}
