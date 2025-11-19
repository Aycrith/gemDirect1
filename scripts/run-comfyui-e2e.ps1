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

# Initialize summary
Write-Summary "E2E Story-to-Video Run: $timestamp"
Write-Summary "Run directory: $runDir"
Write-Summary ""

# FastIteration adjustments
if ($FastIteration) {
    $MaxWaitSeconds = 240
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
    Write-Summary "Invoking WAN I2V generation..."
    Write-Summary "Script: $wanScript"
    
    & $wanScript -RunDir $runDir -ComfyUrl 'http://127.0.0.1:8188' -MaxWaitSeconds $MaxWaitSeconds -PollIntervalSeconds $PollIntervalSeconds
    
    if ($LASTEXITCODE -ne 0) {
        Write-Summary "WARNING: WAN script exited with code $LASTEXITCODE"
    } else {
        Write-Summary "✓ WAN I2V generation completed"
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
