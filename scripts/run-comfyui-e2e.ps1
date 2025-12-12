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
    [int]$HistoryMaxAttempts = 0,
    [int]$PostExecutionTimeoutSeconds = 30,
    [string]$ComfyUIUrl = 'http://127.0.0.1:8188',
    [string]$LMStudioEndpoint = 'http://127.0.0.1:1234',
    [switch]$SkipLMStudioUnload,
    [switch]$UseMockLLM,

    # Back-compat aliases (used by older wrappers like scripts/persistent-e2e.ps1).
    [int]$SceneMaxWaitSeconds = 0,
    [int]$SceneHistoryPollIntervalSeconds = 0,
    [int]$ScenePostExecutionTimeoutSeconds = 0,
    [int]$SceneHistoryMaxAttempts = -1
)

$ErrorActionPreference = 'Continue'

# Prefer npx.cmd to avoid PowerShell shim argument quirks.
$npxCommand = (Get-Command 'npx.cmd' -ErrorAction SilentlyContinue).Path
if (-not $npxCommand) { $npxCommand = 'npx' }

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
}

# Create timestamped run directory
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $ProjectRoot "logs\$timestamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$summaryPath = Join-Path $runDir 'run-summary.txt'
$storyDir = Join-Path $runDir 'story'
$videoDir = Join-Path $runDir 'video'
$artifactJsonPath = Join-Path $runDir 'artifact-metadata.json'

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

function Normalize-PathForJson {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    return ($Path -replace '\\', '/')
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
        $base = $ComfyUIUrl.TrimEnd('/')
        $stats = Invoke-RestMethod "$base/system_stats" -TimeoutSec 2 -ErrorAction Stop
        if ($stats.devices -and $stats.devices[0]) {
            $dev = $stats.devices[0]

            $totalBytes = if ($dev.vram_total) { [double]$dev.vram_total } else { 0.0 }
            $freeBytes = if ($dev.vram_free) { [double]$dev.vram_free } else { 0.0 }

            $totalMB = if ($totalBytes -gt 0) { [math]::Round($totalBytes / 1MB, 3) } else { 0.0 }
            $freeMB = if ($freeBytes -gt 0) { [math]::Round($freeBytes / 1MB, 3) } else { 0.0 }
            $usedMB = if ($totalMB -gt 0) { [math]::Round($totalMB - $freeMB, 3) } else { 0.0 }

            return @{
                Name = if ($dev.name) { [string]$dev.name } elseif ($dev.model) { [string]$dev.model } else { 'unknown' }
                Type = if ($dev.type) { [string]$dev.type } else { 'cuda' }
                Index = if ($dev.index -ne $null) { [int]$dev.index } else { 0 }
                VramFreeBytes = $freeBytes
                VramTotalBytes = $totalBytes
                Used = $usedMB
                Free = $freeMB
                Total = $totalMB
                Timestamp = Get-Date -Format 'HH:mm:ss'
                TimestampIso = (Get-Date).ToString('o')
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

# Apply back-compat alias overrides (if provided)
if ($SceneMaxWaitSeconds -gt 0) { $MaxWaitSeconds = $SceneMaxWaitSeconds }
if ($SceneHistoryPollIntervalSeconds -gt 0) { $PollIntervalSeconds = $SceneHistoryPollIntervalSeconds }
if ($ScenePostExecutionTimeoutSeconds -gt 0) { $PostExecutionTimeoutSeconds = $ScenePostExecutionTimeoutSeconds }
if ($SceneHistoryMaxAttempts -ge 0) { $HistoryMaxAttempts = $SceneHistoryMaxAttempts }

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
    $PostExecutionTimeoutSeconds = 15
    Write-Summary "FastIteration mode: MaxWait=${MaxWaitSeconds}s PollInterval=${PollIntervalSeconds}s"
}

$historyMaxAttemptsLabel = if ($HistoryMaxAttempts -gt 0) { $HistoryMaxAttempts } else { 'unbounded' }
Write-Summary "Queue policy: sceneRetries=$SceneRetryBudget, historyMaxWait=${MaxWaitSeconds}s, historyPollInterval=${PollIntervalSeconds}s, historyMaxAttempts=$historyMaxAttemptsLabel, postExecutionTimeout=${PostExecutionTimeoutSeconds}s"

# ============================================================================
# STEP 0: Preflight Helpers (Mappings + ComfyUI Status)
# ============================================================================
Write-Header "STEP 0: Preflight (Mappings + ComfyUI Status)"

$helperDir = Join-Path $runDir 'test-results\comfyui-status'
New-Item -ItemType Directory -Path $helperDir -Force | Out-Null

$mappingSummaryPath = Join-Path $helperDir 'mapping-preflight.json'
$mappingLogPath = Join-Path $helperDir 'mapping-preflight.log'
$comfyStatusSummaryPath = Join-Path $helperDir 'comfyui-status.json'
$comfyStatusLogPath = Join-Path $helperDir 'comfyui-status.log'

try {
    $mappingScript = Join-Path $PSScriptRoot 'preflight-mappings.ts'
    if (Test-Path $mappingScript) {
        Write-Summary "Step 0: Running mapping preflight (scripts/preflight-mappings.ts)"
        $mappingArgs = @(
            'tsx',
            $mappingScript,
            '--project', $ProjectRoot,
            '--summary-dir', $helperDir,
            '--log-path', $mappingLogPath
        )
        & $npxCommand @mappingArgs 2>&1 | Out-Null
        Write-Summary "Step 0: Mapping preflight summary: $(Normalize-PathForJson $mappingSummaryPath)"
        Write-Summary "Step 0: Mapping preflight log: $(Normalize-PathForJson $mappingLogPath)"
    } else {
        Write-Summary "WARNING: scripts/preflight-mappings.ts not found; skipping"
    }
} catch {
    Write-Summary "WARNING: Mapping preflight failed: $_"
}

try {
    $comfyStatusScript = Join-Path $PSScriptRoot 'comfyui-status.ts'
    if (Test-Path $comfyStatusScript) {
        $env:LOCAL_COMFY_URL = $ComfyUIUrl
        Write-Summary "Step 0: Probing ComfyUI status (scripts/comfyui-status.ts; log: $(Normalize-PathForJson $comfyStatusLogPath))"
        $statusArgs = @(
            'tsx',
            $comfyStatusScript,
            '--project', $ProjectRoot,
            '--summary-dir', $helperDir,
            '--log-path', $comfyStatusLogPath
        )
        & $npxCommand @statusArgs 2>&1 | Out-Null
        Write-Summary "ComfyUI status summary: $(Normalize-PathForJson $comfyStatusSummaryPath)"
        Write-Summary "ComfyUI status log: $(Normalize-PathForJson $comfyStatusLogPath)"
        Write-Summary "Using ComfyUI URL: $ComfyUIUrl"
    } else {
        Write-Summary "WARNING: scripts/comfyui-status.ts not found; skipping"
    }
} catch {
    Write-Summary "WARNING: ComfyUI status probe failed: $_"
}

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

    $storyId = $story.storyId
    Write-Summary "Story ready: $storyId (scenes=$($sceneIds.Count))"
    if ($story.directorsVision) { Write-Summary "Director's vision: $($story.directorsVision)" }
    if ($story.logline) { Write-Summary "Story logline: $($story.logline)" }
    if ($story.llm) {
        $llmStatus = if ($story.llm.status) { $story.llm.status } else { 'n/a' }
        $llmProvider = if ($story.llm.providerUrl) { $story.llm.providerUrl } else { 'n/a' }
        $llmSeed = if ($story.llm.seed) { $story.llm.seed } else { 'n/a' }
        $llmDuration = if ($story.llm.durationMs -ne $null) { "$($story.llm.durationMs)ms" } else { 'n/a' }
        Write-Summary "Story LLM status: $llmStatus (provider=$llmProvider, seed=$llmSeed, duration=$llmDuration)"
    }
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
$env:WAN2_COMFY_URL = $ComfyUIUrl
$env:WAN2_MAX_WAIT = $MaxWaitSeconds
$env:WAN2_POLL_INTERVAL = $PollIntervalSeconds

try {
    Write-Summary "Invoking WAN I2V generation (process isolation mode)..."
    Write-Summary "Script: $wanScript"
    Write-Summary "Scenes to process: $($sceneIds.Count)"

    # Validate ComfyUI connectivity before generating videos/metadata.
    if (-not (Get-VRAMUsage)) {
        Write-Summary "ERROR: ComfyUI not reachable at $ComfyUIUrl (failed /system_stats probe)"
        exit 1
    }

    $scenePayloadById = @{}
    foreach ($s in $story.scenes) {
        if ($s -and $s.id) { $scenePayloadById[$s.id] = $s }
    }
    $collectedSceneMetadata = @()
    
    # Sample VRAM before generation starts
    Log-VRAMSample
    
    # PROCESS ISOLATION FIX: Call WAN script separately for each scene
    # This prevents PowerShell session timeout/resource exhaustion issues
    $successCount = 0
    $failCount = 0
    
    foreach ($sceneId in $sceneIds) {
        Write-Summary ""
        Write-Summary "[Scene $sceneId] Starting video generation..."

        $scenePayload = $scenePayloadById[$sceneId]
        $sceneStart = Get-Date
        $gpuBefore = Get-VRAMUsage
        
        # Call WAN script with single scene filter in isolated process
        $wanArgs = @(
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', $wanScript,
            '-RunDir', $runDir,
            '-ComfyUrl', $ComfyUIUrl,
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
        
        $sceneEnd = Get-Date
        $gpuAfter = Get-VRAMUsage

        $videoPath = $null
        try {
            $sceneVideoDir = Join-Path $videoDir $sceneId
            if (Test-Path $sceneVideoDir) {
                $videoCandidate = Get-ChildItem -Path $sceneVideoDir -Recurse -Include *.mp4 -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
                if ($videoCandidate) { $videoPath = $videoCandidate.FullName }
            }
        } catch {}

        $executionSuccess = ($process.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($videoPath))
        $historyExitReason = if ($executionSuccess) { 'success' } elseif ($processDuration -ge $MaxWaitSeconds) { 'maxWait' } else { 'unknown' }

        $gpuName = if ($gpuBefore -and $gpuBefore.Name) { $gpuBefore.Name } elseif ($gpuAfter -and $gpuAfter.Name) { $gpuAfter.Name } else { 'unknown' }
        $beforeMB = if ($gpuBefore) { [double]$gpuBefore.Free } else { 0.0 }
        $afterMB = if ($gpuAfter) { [double]$gpuAfter.Free } else { $beforeMB }
        $beforeMB = [math]::Round($beforeMB, 3)
        $afterMB = [math]::Round($afterMB, 3)
        $deltaMB = [math]::Round(($afterMB - $beforeMB), 3)

        $pollLimitLabel = if ($HistoryMaxAttempts -gt 0) { $HistoryMaxAttempts } else { 'unbounded' }
        $execAt = if ($executionSuccess) { (Get-Date).ToString('o') } else { $null }
        $execDetectedText = if ($executionSuccess) { 'true' } else { 'false' }
        $execAtText = if ($execAt) { $execAt } else { 'null' }
        $telemetryMessage = "[Scene $sceneId] Telemetry: DurationSeconds=${processDuration}s | MaxWaitSeconds=${MaxWaitSeconds}s | PollIntervalSeconds=${PollIntervalSeconds}s | HistoryAttempts=0 | pollLimit=$pollLimitLabel | SceneRetryBudget=$SceneRetryBudget | PostExecutionTimeoutSeconds=${PostExecutionTimeoutSeconds}s | ExecutionSuccessDetected=$execDetectedText | ExecutionSuccessAt=$execAtText | HistoryExitReason=$historyExitReason | VRAMBeforeMB=${beforeMB}MB | VRAMAfterMB=${afterMB}MB | VRAMDeltaMB=${deltaMB}MB | gpu=$gpuName | DoneMarkerWaitSeconds=0s | DoneMarkerDetected=false | ForcedCopyTriggered=false"
        Write-Summary $telemetryMessage

        if (-not $executionSuccess) {
            Write-Summary "[Scene $sceneId] ERROR: Video generation failed"
        }

        $sceneMeta = [ordered]@{
            SceneId = $sceneId
            SceneTitle = if ($scenePayload -and $scenePayload.title) { $scenePayload.title } else { $null }
            SceneSummary = if ($scenePayload -and $scenePayload.summary) { $scenePayload.summary } else { $null }
            Prompt = if ($scenePayload -and $scenePayload.prompt) { $scenePayload.prompt } else { '' }
            NegativePrompt = if ($scenePayload -and $scenePayload.negativePrompt) { $scenePayload.negativePrompt } else { '' }
            FrameFloor = if ($scenePayload -and $scenePayload.expectedFrames) { [int]$scenePayload.expectedFrames } else { 1 }
            FrameCount = if ($executionSuccess -and $scenePayload -and $scenePayload.expectedFrames) { [int]$scenePayload.expectedFrames } elseif ($executionSuccess) { 1 } else { 0 }
            DurationSeconds = $processDuration
            FramePrefix = "video/$sceneId"
            HistoryPath = $null
            Success = $executionSuccess
            MeetsFrameFloor = $executionSuccess
            HistoryRetrieved = $false
            HistoryAttempts = 0
            Warnings = @()
            Errors = if ($executionSuccess) { @() } else { @("Video generation failed (exit=$($process.ExitCode))") }
            AttemptsRun = 1
            Requeued = $false
            KeyframeSource = if ($scenePayload -and $scenePayload.keyframePath) { $scenePayload.keyframePath } else { $null }
            StoryTitle = if ($scenePayload -and $scenePayload.title) { $scenePayload.title } else { $null }
            StorySummary = if ($scenePayload -and $scenePayload.summary) { $scenePayload.summary } else { $null }
            StoryMood = if ($scenePayload -and $scenePayload.mood) { $scenePayload.mood } else { $null }
            StoryExpectedFrames = if ($scenePayload -and $scenePayload.expectedFrames) { [int]$scenePayload.expectedFrames } else { $null }
            StoryCameraMovement = if ($scenePayload -and $scenePayload.cameraMovement) { $scenePayload.cameraMovement } else { $null }
            HistoryAttemptLimit = $HistoryMaxAttempts
            SceneRetryBudget = $SceneRetryBudget
            HistoryConfig = [ordered]@{
                MaxWaitSeconds = $MaxWaitSeconds
                PollIntervalSeconds = $PollIntervalSeconds
                MaxAttempts = $HistoryMaxAttempts
                PostExecutionTimeoutSeconds = $PostExecutionTimeoutSeconds
            }
            Telemetry = [ordered]@{
                QueueStart = $sceneStart.ToString('o')
                QueueEnd = $sceneEnd.ToString('o')
                DurationSeconds = $processDuration
                MaxWaitSeconds = $MaxWaitSeconds
                PollIntervalSeconds = $PollIntervalSeconds
                HistoryAttempts = 0
                HistoryAttemptLimit = $HistoryMaxAttempts
                HistoryExitReason = $historyExitReason
                HistoryPostExecutionTimeoutReached = $false
                PostExecutionTimeoutSeconds = $PostExecutionTimeoutSeconds
                ExecutionSuccessDetected = $executionSuccess
                ExecutionSuccessAt = $execAt
                SceneRetryBudget = $SceneRetryBudget
                DoneMarkerDetected = $false
                DoneMarkerWaitSeconds = 0
                DoneMarkerPath = $null
                ForcedCopyTriggered = $false
                ForcedCopyDebugPath = $null
                GPU = [ordered]@{
                    Name = $gpuName
                    Type = if ($gpuBefore -and $gpuBefore.Type) { $gpuBefore.Type } else { 'cuda' }
                    Index = if ($gpuBefore -and $gpuBefore.Index -ne $null) { $gpuBefore.Index } else { 0 }
                    VramFreeBefore = if ($gpuBefore) { $gpuBefore.VramFreeBytes } else { 0.0 }
                    VramFreeAfter = if ($gpuAfter) { $gpuAfter.VramFreeBytes } else { 0.0 }
                    VramTotal = if ($gpuBefore) { $gpuBefore.VramTotalBytes } elseif ($gpuAfter) { $gpuAfter.VramTotalBytes } else { 0.0 }
                    VramDelta = if ($gpuBefore -and $gpuAfter) { [double]($gpuAfter.VramFreeBytes - $gpuBefore.VramFreeBytes) } else { 0.0 }
                    VramBeforeMB = $beforeMB
                    VramAfterMB = $afterMB
                    VramDeltaMB = $deltaMB
                }
                System = [ordered]@{
                    FallbackNotes = @()
                }
            }
        }
        $collectedSceneMetadata += $sceneMeta

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
# STEP 6: Vitest Suites (writes vitest-results.json + summary lines)
# ============================================================================
Write-Header "STEP 6: Vitest Suites"

$vitestScript = Join-Path $PSScriptRoot 'run-vitests.ps1'
if (Test-Path $vitestScript) {
    try {
        $vitestArgs = @(
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', $vitestScript,
            '-ProjectRoot', $ProjectRoot,
            '-RunDir', $runDir
        )
        if ($FastIteration) { $vitestArgs += '-Quick' }
        $vitestProc = Start-Process -FilePath 'pwsh' -ArgumentList $vitestArgs -Wait -NoNewWindow -PassThru
        Write-Summary "Vitest suites completed (exitCode=$($vitestProc.ExitCode))"
    } catch {
        Write-Summary "WARNING: Vitest invocation failed: $_"
    }
} else {
    Write-Summary "WARNING: run-vitests.ps1 not found; skipping"
}

# ============================================================================
# STEP 7: Artifact Metadata + UI Snapshot
# ============================================================================
Write-Header "STEP 7: Artifact Metadata + UI Snapshot"

$vitestResultsPath = Join-Path $runDir 'vitest-results.json'
$vitestSummary = $null
if (Test-Path $vitestResultsPath) {
    try {
        $vitestSummary = Get-Content $vitestResultsPath -Raw | ConvertFrom-Json
    } catch {
        $vitestSummary = $null
    }
}

$vitestScriptsLog = if ($vitestSummary -and $vitestSummary.scriptsLog) { [string]$vitestSummary.scriptsLog } else { (Join-Path $runDir 'vitest-scripts.log') }

if (-not $collectedSceneMetadata) { $collectedSceneMetadata = @() }

$artifactObj = [ordered]@{
    RunId = $timestamp
    Timestamp = (Get-Date).ToString('o')
    RunDir = $runDir
    Story = [ordered]@{
        Id = if ($story -and $story.storyId) { $story.storyId } else { "story-$timestamp" }
        Logline = if ($story -and $story.logline) { $story.logline } else { '' }
        DirectorsVision = if ($story -and $story.directorsVision) { $story.directorsVision } else { '' }
        Generator = if ($story -and $story.generator) { $story.generator } else { 'scripts/run-comfyui-e2e.ps1' }
        File = $storyJsonPath
        StoryDir = $storyDir
        LLM = if ($story -and $story.llm) { $story.llm } else { $null }
        HealthCheck = [ordered]@{
            Url = $null
            Override = $null
            Status = 'not requested'
            Models = $null
            Error = $null
            Timestamp = (Get-Date).ToString('o')
            Skipped = $true
            SkipReason = 'LLM health check not performed by run-comfyui-e2e.ps1'
        }
        Warnings = if ($story -and $story.warnings) { $story.warnings } else { @() }
    }
    Scenes = $collectedSceneMetadata
    QueueConfig = [ordered]@{
        SceneRetryBudget = $SceneRetryBudget
        HistoryMaxWaitSeconds = $MaxWaitSeconds
        HistoryPollIntervalSeconds = $PollIntervalSeconds
        HistoryMaxAttempts = $HistoryMaxAttempts
        PostExecutionTimeoutSeconds = $PostExecutionTimeoutSeconds
    }
    VitestLogs = [ordered]@{
        ComfyUI = (Join-Path $runDir 'vitest-comfyui.log')
        E2E = (Join-Path $runDir 'vitest-e2e.log')
        Scripts = $vitestScriptsLog
        ResultsJson = $vitestResultsPath
    }
    VitestSummary = $vitestSummary
    Archive = $archivePath
    HelperSummaries = [ordered]@{
        MappingPreflight = [ordered]@{
            Summary = (Normalize-PathForJson $mappingSummaryPath)
            Log = (Normalize-PathForJson $mappingLogPath)
        }
        ComfyUIStatus = [ordered]@{
            Summary = (Normalize-PathForJson $comfyStatusSummaryPath)
            Log = (Normalize-PathForJson $comfyStatusLogPath)
        }
    }
}

try {
    $artifactObj | ConvertTo-Json -Depth 12 | Set-Content -Path $artifactJsonPath -Encoding UTF8
    Write-Summary "Wrote artifact metadata: $artifactJsonPath"
} catch {
    Write-Summary "WARNING: Failed to write artifact-metadata.json: $_"
}

# Update per-scene MP4 metadata (duration/fps/resolution) when possible.
try {
    $updateVideoScript = Join-Path $PSScriptRoot 'update-scene-video-metadata.ps1'
    if (Test-Path $updateVideoScript) {
        $updateArgs = @(
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', $updateVideoScript,
            '-RunDir', $runDir
        )
        $updateProc = Start-Process -FilePath 'pwsh' -ArgumentList $updateArgs -Wait -NoNewWindow -PassThru
        Write-Summary "Updated scene video metadata (exitCode=$($updateProc.ExitCode))"
    }
} catch {
    Write-Summary "WARNING: update-scene-video-metadata failed: $_"
}

# Copy snapshot into public/ so the UI can load it directly.
try {
    $publicArtifactsDir = Join-Path $ProjectRoot 'public\artifacts'
    New-Item -ItemType Directory -Path $publicArtifactsDir -Force | Out-Null
    Copy-Item -Path $artifactJsonPath -Destination (Join-Path $publicArtifactsDir 'latest-run.json') -Force
    Copy-Item -Path $artifactJsonPath -Destination (Join-Path $ProjectRoot 'public\artifact-metadata.json') -Force
    Write-Summary "UI snapshot updated: public/artifacts/latest-run.json and public/artifact-metadata.json"
} catch {
    Write-Summary "WARNING: Failed to update public UI snapshot JSON: $_"
}

# Artifact Index block for humans + validator
try {
    $keyframeCount = 0
    if (Test-Path (Join-Path $storyDir 'keyframes')) {
        $keyframeCount = (Get-ChildItem (Join-Path $storyDir 'keyframes') -Filter '*.png' -File -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    $mp4Count = 0
    if (Test-Path $videoDir) {
        $mp4Count = (Get-ChildItem $videoDir -Recurse -Filter '*.mp4' -File -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    $totalCopied = $keyframeCount + $mp4Count

    Write-Summary "## Artifact Index"
    Write-Summary "Story folder: $storyDir"
    Write-Summary "Scenes captured: $($collectedSceneMetadata.Count)"
    Write-Summary "Total frames copied: $totalCopied"
    Write-Summary "Vitest comfyUI log: $(Join-Path $runDir 'vitest-comfyui.log')"
    Write-Summary "Vitest e2e log: $(Join-Path $runDir 'vitest-e2e.log')"
    Write-Summary "Vitest scripts log: $vitestScriptsLog"
    Write-Summary "Vitest results json: $vitestResultsPath"
    Write-Summary "Archive: $archivePath"
} catch {
    Write-Summary "WARNING: Failed to write Artifact Index block: $_"
}

# Validate run-summary + artifact metadata contract (recommended)
try {
    $validatorScript = Join-Path $PSScriptRoot 'validate-run-summary.ps1'
    if (Test-Path $validatorScript) {
        $validatorArgs = @(
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', $validatorScript,
            '-RunDir', $runDir
        )
        $validatorProc = Start-Process -FilePath 'pwsh' -ArgumentList $validatorArgs -Wait -NoNewWindow -PassThru
        Write-Summary "Run-summary validator exitCode=$($validatorProc.ExitCode)"
    }
} catch {
    Write-Summary "WARNING: Run-summary validator failed to execute: $_"
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
