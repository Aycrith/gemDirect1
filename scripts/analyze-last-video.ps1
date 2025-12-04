<#
.SYNOPSIS
    Analyze the most recently generated video using vision-based coherence metrics.

.DESCRIPTION
    This script finds the most recently generated video from the ComfyUI output directory
    or a specified path, extracts frames using ffmpeg, and sends them to the VLM endpoint
    for coherence analysis. The result is compared against runtime coherence thresholds
    matching those used in Bookend QA Mode.

    This is useful for developers to quickly validate that a generated video meets
    quality standards without running the full regression suite.

.PARAMETER VideoPath
    Path to a specific video file to analyze. If omitted, finds the most recent video
    from the ComfyUI output directory.

.PARAMETER StartKeyframe
    Path to the start keyframe image for comparison. Optional.

.PARAMETER EndKeyframe  
    Path to the end keyframe image for comparison. Optional.

.PARAMETER VLMEndpoint
    LM Studio VLM endpoint URL. Default: http://192.168.50.192:1234/v1/chat/completions

.PARAMETER Model
    VLM model ID. Default: qwen/qwen3-vl-8b

.PARAMETER Verbose
    Show detailed output including VLM responses.

.EXAMPLE
    .\analyze-last-video.ps1
    Analyzes the most recently generated video

.EXAMPLE
    .\analyze-last-video.ps1 -VideoPath "C:\path\to\video.mp4" -StartKeyframe "C:\path\to\start.png"
    Analyzes a specific video with keyframe comparison

.OUTPUTS
    Coherence analysis results with PASS/WARN/FAIL verdict based on runtime thresholds.

.NOTES
    Runtime thresholds (aligned with Bookend QA Mode):
    - minOverall: 80
    - minFocusStability: 85
    - maxArtifactSeverity: 40
    - minObjectConsistency: 85
    - disallowBlackFrames: true
    - disallowHardFlicker: true
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$VideoPath,
    
    [Parameter(Mandatory=$false)]
    [string]$StartKeyframe,
    
    [Parameter(Mandatory=$false)]
    [string]$EndKeyframe,
    
    [Parameter(Mandatory=$false)]
    [string]$VLMEndpoint = "http://192.168.50.192:1234/v1/chat/completions",
    
    [Parameter(Mandatory=$false)]
    [string]$Model = "qwen/qwen3-vl-8b"
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$ComfyUIOutput = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video"
$TempDir = Join-Path $RepoRoot "temp_videos"

# Utility functions
function Write-Status { param([string]$Message) Write-Host "  $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "  ✓ $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "  ⚠ $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "  ✗ $Message" -ForegroundColor Red }

# Runtime coherence thresholds (aligned with visionThresholdConfig.ts)
$Thresholds = @{
    minOverall = 80
    minFocusStability = 85
    maxArtifactSeverity = 40
    minObjectConsistency = 85
    disallowBlackFrames = $true
    disallowHardFlicker = $true
}
$WarningMargin = 5

Write-Host "`n=== Last Video Coherence Analysis ===" -ForegroundColor White
Write-Host "Using runtime thresholds (Bookend QA Mode)" -ForegroundColor Gray

# 1. Check prerequisites
Write-Status "Checking prerequisites..."

# Check ffmpeg
$ffmpegPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegPath) {
    Write-Error "ffmpeg not found in PATH. Required for frame extraction."
    exit 1
}
Write-Success "ffmpeg found"

# Check VLM endpoint
Write-Status "Checking VLM endpoint: $VLMEndpoint"
try {
    $modelsUrl = $VLMEndpoint -replace "/chat/completions$", "/models"
    $response = Invoke-RestMethod -Uri $modelsUrl -Method Get -TimeoutSec 10
    Write-Success "VLM endpoint responsive"
} catch {
    Write-Error "VLM endpoint not responding: $($_.Exception.Message)"
    exit 1
}

# 2. Find the video to analyze
if (-not $VideoPath) {
    Write-Status "Finding most recent video..."
    
    # Check ComfyUI output directory
    if (Test-Path $ComfyUIOutput) {
        $videos = Get-ChildItem -Path $ComfyUIOutput -Filter "*.mp4" -Recurse -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending |
                  Select-Object -First 1
        
        if ($videos) {
            $VideoPath = $videos.FullName
            Write-Success "Found: $VideoPath"
        }
    }
    
    # Fallback to temp_videos
    if (-not $VideoPath -and (Test-Path $TempDir)) {
        $videos = Get-ChildItem -Path $TempDir -Filter "*.mp4" -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending |
                  Select-Object -First 1
        
        if ($videos) {
            $VideoPath = $videos.FullName
            Write-Success "Found in temp: $VideoPath"
        }
    }
    
    if (-not $VideoPath) {
        Write-Error "No video files found in ComfyUI output or temp directories"
        exit 1
    }
} else {
    if (-not (Test-Path $VideoPath)) {
        Write-Error "Video file not found: $VideoPath"
        exit 1
    }
    Write-Success "Using specified video: $VideoPath"
}

# 3. Extract frames using ffmpeg
Write-Status "Extracting frames..."
$FrameDir = Join-Path $TempDir "analysis_frames"
if (Test-Path $FrameDir) {
    Remove-Item $FrameDir -Recurse -Force
}
New-Item -ItemType Directory -Path $FrameDir -Force | Out-Null

# Extract first and last frames
$FirstFramePath = Join-Path $FrameDir "first.jpg"
$LastFramePath = Join-Path $FrameDir "last.jpg"

# First frame
$ffmpegArgs = @("-y", "-i", $VideoPath, "-vf", "select=eq(n\,0)", "-vframes", "1", $FirstFramePath)
& ffmpeg $ffmpegArgs 2>&1 | Out-Null
if (-not (Test-Path $FirstFramePath)) {
    Write-Error "Failed to extract first frame"
    exit 1
}

# Last frame (seek near end, get last frame)
$ffmpegArgs = @("-y", "-sseof", "-1", "-i", $VideoPath, "-update", "1", "-q:v", "2", $LastFramePath)
& ffmpeg $ffmpegArgs 2>&1 | Out-Null
if (-not (Test-Path $LastFramePath)) {
    Write-Error "Failed to extract last frame"
    exit 1
}
Write-Success "Frames extracted"

# 4. Convert frames to base64
function Get-ImageBase64 {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return [System.Convert]::ToBase64String($bytes)
}

$firstFrameB64 = Get-ImageBase64 $FirstFramePath
$lastFrameB64 = Get-ImageBase64 $LastFramePath
$startKeyframeB64 = if ($StartKeyframe -and (Test-Path $StartKeyframe)) { Get-ImageBase64 $StartKeyframe } else { $null }
$endKeyframeB64 = if ($EndKeyframe -and (Test-Path $EndKeyframe)) { Get-ImageBase64 $EndKeyframe } else { $null }

# 5. Call VLM for coherence analysis
Write-Status "Analyzing with VLM..."

# Build the prompt for coherence analysis
$analysisPrompt = @"
Analyze this video for quality and coherence. You are evaluating the first and last frames.

Evaluate and score these metrics from 0-100:

1. **overallQuality** (0-100): Overall visual quality, clarity, and professional appearance
2. **focusStability** (0-100): How stable and consistent the focus is (100 = perfectly sharp throughout)
3. **artifactSeverity** (0-100): Level of visual artifacts like compression, noise, banding (0 = no artifacts, 100 = severe)
4. **objectConsistency** (0-100): How well objects maintain their identity and appearance (100 = perfectly consistent)

Also check for:
5. **hasBlackFrames**: true if any completely black frames detected, false otherwise
6. **hasHardFlicker**: true if rapid brightness changes or strobing detected, false otherwise

Respond ONLY with valid JSON in this exact format:
{
    "overallQuality": <number>,
    "focusStability": <number>,
    "artifactSeverity": <number>,
    "objectConsistency": <number>,
    "hasBlackFrames": <boolean>,
    "hasHardFlicker": <boolean>,
    "notes": "<brief description of any issues>"
}
"@

# Build image content for VLM
$imageContent = @()
$imageContent += @{ type = "text"; text = "First frame of video:" }
$imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/jpeg;base64,$firstFrameB64" } }
$imageContent += @{ type = "text"; text = "Last frame of video:" }
$imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/jpeg;base64,$lastFrameB64" } }

if ($startKeyframeB64) {
    $imageContent += @{ type = "text"; text = "Original start keyframe for comparison:" }
    $imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/jpeg;base64,$startKeyframeB64" } }
}
if ($endKeyframeB64) {
    $imageContent += @{ type = "text"; text = "Original end keyframe for comparison:" }
    $imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/jpeg;base64,$endKeyframeB64" } }
}

$imageContent += @{ type = "text"; text = $analysisPrompt }

$requestBody = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = $imageContent
        }
    )
    temperature = 0.1
    max_tokens = 1000
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri $VLMEndpoint -Method Post -Body $requestBody -ContentType "application/json" -TimeoutSec 120
    $vlmResponse = $response.choices[0].message.content
    
    if ($VerbosePreference -eq 'Continue') {
        Write-Host "`nVLM Response:" -ForegroundColor Gray
        Write-Host $vlmResponse -ForegroundColor DarkGray
    }
} catch {
    Write-Error "VLM request failed: $($_.Exception.Message)"
    exit 1
}

# 6. Parse VLM response
Write-Status "Parsing results..."

# Try to extract JSON from response
$metrics = $null
try {
    # Try direct parse
    $metrics = $vlmResponse | ConvertFrom-Json -ErrorAction Stop
} catch {
    # Try to extract JSON from markdown code blocks
    if ($vlmResponse -match '```json\s*([\s\S]*?)\s*```') {
        try { $metrics = $Matches[1] | ConvertFrom-Json -ErrorAction Stop } catch { }
    }
    # Try to extract any JSON object
    if (-not $metrics -and $vlmResponse -match '\{[\s\S]*\}') {
        try { $metrics = $Matches[0] | ConvertFrom-Json -ErrorAction Stop } catch { }
    }
}

if (-not $metrics) {
    Write-Error "Failed to parse VLM response as JSON"
    Write-Host "Raw response: $vlmResponse" -ForegroundColor Gray
    exit 1
}

Write-Success "VLM analysis complete"

# 7. Apply thresholds and determine verdict
Write-Host "`n=== Coherence Analysis Results ===" -ForegroundColor White

$violations = @()

# Check overall quality
$overall = $metrics.overallQuality
Write-Host "  Overall Quality:     $overall / 100" -ForegroundColor $(if ($overall -ge $Thresholds.minOverall) { "Green" } elseif ($overall -ge $Thresholds.minOverall - $WarningMargin) { "Yellow" } else { "Red" })
if ($overall -lt $Thresholds.minOverall) {
    $severity = if ($overall -lt $Thresholds.minOverall - $WarningMargin) { "error" } else { "warning" }
    $violations += @{ metric = "overallQuality"; actual = $overall; threshold = $Thresholds.minOverall; severity = $severity }
}

# Check focus stability
$focus = $metrics.focusStability
Write-Host "  Focus Stability:     $focus / 100" -ForegroundColor $(if ($focus -ge $Thresholds.minFocusStability) { "Green" } elseif ($focus -ge $Thresholds.minFocusStability - $WarningMargin) { "Yellow" } else { "Red" })
if ($focus -lt $Thresholds.minFocusStability) {
    $severity = if ($focus -lt $Thresholds.minFocusStability - $WarningMargin) { "error" } else { "warning" }
    $violations += @{ metric = "focusStability"; actual = $focus; threshold = $Thresholds.minFocusStability; severity = $severity }
}

# Check artifact severity (lower is better)
$artifacts = $metrics.artifactSeverity
Write-Host "  Artifact Severity:   $artifacts / 100" -ForegroundColor $(if ($artifacts -le $Thresholds.maxArtifactSeverity) { "Green" } elseif ($artifacts -le $Thresholds.maxArtifactSeverity + $WarningMargin) { "Yellow" } else { "Red" })
if ($artifacts -gt $Thresholds.maxArtifactSeverity) {
    $severity = if ($artifacts -gt $Thresholds.maxArtifactSeverity + $WarningMargin) { "error" } else { "warning" }
    $violations += @{ metric = "artifactSeverity"; actual = $artifacts; threshold = $Thresholds.maxArtifactSeverity; severity = $severity }
}

# Check object consistency
$objConsist = $metrics.objectConsistency
Write-Host "  Object Consistency:  $objConsist / 100" -ForegroundColor $(if ($objConsist -ge $Thresholds.minObjectConsistency) { "Green" } elseif ($objConsist -ge $Thresholds.minObjectConsistency - $WarningMargin) { "Yellow" } else { "Red" })
if ($objConsist -lt $Thresholds.minObjectConsistency) {
    $severity = if ($objConsist -lt $Thresholds.minObjectConsistency - $WarningMargin) { "error" } else { "warning" }
    $violations += @{ metric = "objectConsistency"; actual = $objConsist; threshold = $Thresholds.minObjectConsistency; severity = $severity }
}

# Check black frames
$hasBlack = $metrics.hasBlackFrames
Write-Host "  Black Frames:        $(if ($hasBlack) { 'Yes' } else { 'No' })" -ForegroundColor $(if (-not $hasBlack) { "Green" } else { "Red" })
if ($Thresholds.disallowBlackFrames -and $hasBlack) {
    $violations += @{ metric = "blackFrames"; actual = $true; threshold = $false; severity = "error" }
}

# Check hard flicker
$hasFlicker = $metrics.hasHardFlicker
Write-Host "  Hard Flicker:        $(if ($hasFlicker) { 'Yes' } else { 'No' })" -ForegroundColor $(if (-not $hasFlicker) { "Green" } else { "Red" })
if ($Thresholds.disallowHardFlicker -and $hasFlicker) {
    $violations += @{ metric = "hardFlicker"; actual = $true; threshold = $false; severity = "error" }
}

# Notes from VLM
if ($metrics.notes) {
    Write-Host "`n  Notes: $($metrics.notes)" -ForegroundColor Gray
}

# 8. Determine overall verdict
$errors = $violations | Where-Object { $_.severity -eq "error" }
$warnings = $violations | Where-Object { $_.severity -eq "warning" }

Write-Host "`n=== Verdict ===" -ForegroundColor White

if ($errors.Count -gt 0) {
    Write-Host "  ❌ FAIL" -ForegroundColor Red
    Write-Host "  Errors:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "    - $($err.metric): $($err.actual) (threshold: $($err.threshold))" -ForegroundColor Red
    }
    $exitCode = 1
} elseif ($warnings.Count -gt 0) {
    Write-Host "  ⚠️ WARN" -ForegroundColor Yellow
    Write-Host "  Warnings:" -ForegroundColor Yellow
    foreach ($warn in $warnings) {
        Write-Host "    - $($warn.metric): $($warn.actual) (threshold: $($warn.threshold))" -ForegroundColor Yellow
    }
    $exitCode = 0
} else {
    Write-Host "  ✅ PASS" -ForegroundColor Green
    Write-Host "  All coherence thresholds met" -ForegroundColor Green
    $exitCode = 0
}

Write-Host "`n  Video analyzed: $VideoPath" -ForegroundColor Gray
Write-Host "  Thresholds: minOverall=$($Thresholds.minOverall), minFocus=$($Thresholds.minFocusStability), maxArtifact=$($Thresholds.maxArtifactSeverity), minObjConsist=$($Thresholds.minObjectConsistency)" -ForegroundColor Gray

# Cleanup
if (Test-Path $FrameDir) {
    Remove-Item $FrameDir -Recurse -Force -ErrorAction SilentlyContinue
}

exit $exitCode