<#
.SYNOPSIS
    Headless VLM video analysis script for bookend QA.

.DESCRIPTION
    Extracts frames from bookend regression videos using ffmpeg, then sends them
    to LM Studio VLM endpoint for analysis. Produces vision QA metrics including
    startFrameMatch, endFrameMatch, motionQuality, promptAdherence, and overall.
    
    Supports multi-run VLM evaluation to reduce variance. When Runs > 1, the VLM
    is called multiple times and results are aggregated (mean, median, min, max).

.PARAMETER Sample
    Specific sample to analyze (e.g., sample-001-geometric). Omit for all samples.

.PARAMETER RunTimestamp
    Specific regression run timestamp (e.g., 20251203-002457). Uses latest if omitted.

.PARAMETER VLMEndpoint
    LM Studio VLM endpoint URL. Default: http://192.168.50.192:1234/v1/chat/completions

.PARAMETER Model
    VLM model ID. Default: qwen/qwen3-vl-8b

.PARAMETER Runs
    Number of VLM runs to perform per sample for variance reduction. Default: 1.
    When > 1, aggregates results with mean/median/min/max.

.EXAMPLE
    .\analyze-bookend-vision.ps1
    Analyzes all samples from the latest regression run (single VLM call per sample)

.EXAMPLE
    .\analyze-bookend-vision.ps1 -Sample sample-001-geometric -Verbose
    Analyzes just sample-001-geometric with verbose output

.EXAMPLE
    .\analyze-bookend-vision.ps1 -Runs 3
    Analyzes all samples with 3 VLM runs each, aggregating results
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Sample,
    
    [Parameter(Mandatory=$false)]
    [string]$RunTimestamp,
    
    [Parameter(Mandatory=$false)]
    [string]$VLMEndpoint = "http://192.168.50.192:1234/v1/chat/completions",
    
    [Parameter(Mandatory=$false)]
    [string]$Model = "qwen/qwen3-vl-8b",
    
    [Parameter(Mandatory=$false)]
    [ValidateRange(1, 10)]
    [int]$Runs = 1,
    
    [switch]$SkipFrameExtraction
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$GoldenSamplesDir = Join-Path $RepoRoot "data" "bookend-golden-samples"
$RegressionDir = Join-Path $RepoRoot "test-results" "bookend-regression"
$ComfyUIOutput = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video"

# Utility functions
function Write-Status { param([string]$Message) Write-Host "  $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "  ✓ $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "  ⚠ $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "  ✗ $Message" -ForegroundColor Red }

# Helper function to safely parse VLM JSON response
function Parse-VLMResponse {
    param([string]$ResponseText, [string]$Context)
    
    try {
        # Try to parse directly
        $parsed = $ResponseText | ConvertFrom-Json -ErrorAction Stop
        return $parsed
    } catch {
        # Try to extract JSON from markdown code blocks
        if ($ResponseText -match '```json\s*([\s\S]*?)\s*```') {
            try {
                return $Matches[1] | ConvertFrom-Json -ErrorAction Stop
            } catch { }
        }
        # Try to extract any JSON object
        if ($ResponseText -match '\{[\s\S]*\}') {
            try {
                return $Matches[0] | ConvertFrom-Json -ErrorAction Stop
            } catch { }
        }
        Write-Warning "Failed to parse VLM response for $Context"
        return $null
    }
}

# Helper function to aggregate metrics from multiple VLM runs
function Get-AggregatedMetrics {
    param([array]$RunResults, [string]$MetricName)
    
    $values = $RunResults | ForEach-Object { 
        $val = $_.scores.$MetricName
        if ($null -ne $val) { [double]$val }
    } | Where-Object { $null -ne $_ }
    
    if ($values.Count -eq 0) {
        return @{
            mean = $null
            median = $null
            min = $null
            max = $null
            stdDev = $null
            count = 0
        }
    }
    
    $sorted = $values | Sort-Object
    $count = $sorted.Count
    $sum = ($sorted | Measure-Object -Sum).Sum
    $mean = $sum / $count
    
    # Calculate median
    if ($count % 2 -eq 0) {
        $median = ($sorted[$count/2 - 1] + $sorted[$count/2]) / 2
    } else {
        $median = $sorted[[math]::Floor($count/2)]
    }
    
    # Calculate standard deviation
    $variance = ($sorted | ForEach-Object { [math]::Pow($_ - $mean, 2) } | Measure-Object -Average).Average
    $stdDev = [math]::Sqrt($variance)
    
    return @{
        mean = [math]::Round($mean, 1)
        median = [math]::Round($median, 1)
        min = [math]::Round(($sorted | Measure-Object -Minimum).Minimum, 1)
        max = [math]::Round(($sorted | Measure-Object -Maximum).Maximum, 1)
        stdDev = [math]::Round($stdDev, 2)
        count = $count
    }
}

$runMode = if ($Runs -gt 1) { " (Multi-Run: $Runs)" } else { "" }
Write-Host "`n=== Bookend Vision QA Analysis (Extended)$runMode ===" -ForegroundColor White

# 1. Check prerequisites
Write-Status "Checking prerequisites..."

# Check ffmpeg
$ffmpegPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegPath) {
    Write-Error "ffmpeg not found in PATH. Required for frame extraction."
    exit 1
}
Write-Success "ffmpeg found: $($ffmpegPath.Source)"

# Check VLM endpoint
Write-Status "Checking VLM endpoint: $VLMEndpoint"
try {
    $modelsUrl = $VLMEndpoint -replace "/chat/completions$", "/models"
    $response = Invoke-RestMethod -Uri $modelsUrl -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Success "LM Studio connected, $(($response.data | Measure-Object).Count) model(s) available"
} catch {
    Write-Error "Cannot connect to VLM endpoint at $VLMEndpoint"
    Write-Warning "Make sure LM Studio is running with a VLM model loaded"
    exit 1
}

# 2. Find regression run
if ($RunTimestamp) {
    $runDir = Join-Path $RegressionDir "run-$RunTimestamp"
} else {
    $latestRun = Get-ChildItem -Path $RegressionDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latestRun) {
        Write-Error "No regression runs found in $RegressionDir"
        exit 1
    }
    $runDir = $latestRun.FullName
    $RunTimestamp = $latestRun.Name -replace "^run-", ""
}

$resultsPath = Join-Path $runDir "results.json"
if (-not (Test-Path $resultsPath)) {
    Write-Error "No results.json in $runDir - regression incomplete?"
    exit 1
}

Write-Success "Using regression run: $RunTimestamp"
$results = Get-Content $resultsPath | ConvertFrom-Json

# 3. Determine samples to analyze
$samplesToAnalyze = @()
if ($Sample) {
    if ($results.samples.PSObject.Properties.Name -contains $Sample) {
        $samplesToAnalyze += $Sample
    } else {
        Write-Error "Sample '$Sample' not found in regression results"
        exit 1
    }
} else {
    $samplesToAnalyze = $results.samples.PSObject.Properties.Name
}

Write-Status "Samples to analyze: $($samplesToAnalyze -join ', ')"

# 4. Create temp directory for frames
$tempDir = Join-Path $RepoRoot "temp" "vision-qa-$RunTimestamp"
if (-not (Test-Path $tempDir)) {
    New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
}

# 5. Process each sample
$visionResults = @{}

foreach ($sampleId in $samplesToAnalyze) {
    Write-Host "`nAnalyzing: $sampleId" -ForegroundColor White
    
    $sampleResult = $results.samples.$sampleId
    $videoPath = Join-Path $ComfyUIOutput ($sampleResult.videoPath -replace "^video/", "")
    
    if (-not (Test-Path $videoPath)) {
        Write-Error "Video not found: $videoPath"
        continue
    }
    
    $sampleTempDir = Join-Path $tempDir $sampleId
    if (-not (Test-Path $sampleTempDir)) {
        New-Item -Path $sampleTempDir -ItemType Directory -Force | Out-Null
    }
    
    # 5a. Extract frames
    $firstFrame = Join-Path $sampleTempDir "first_frame.jpg"
    $lastFrame = Join-Path $sampleTempDir "last_frame.jpg"
    $motionFrames = @()
    
    if (-not $SkipFrameExtraction) {
        Write-Status "Extracting frames..."
        
        # First frame
        & ffmpeg -y -i $videoPath -vf "select=eq(n\,0)" -vframes 1 -q:v 2 $firstFrame 2>$null
        
        # Last frame
        & ffmpeg -y -sseof -0.1 -i $videoPath -vframes 1 -q:v 2 $lastFrame 2>$null
        
        # Motion frames (5 evenly spaced)
        for ($i = 0; $i -lt 5; $i++) {
            $frameFile = Join-Path $sampleTempDir "motion_frame_$i.jpg"
            $timestamp = $i * 0.5  # Adjust based on video duration
            & ffmpeg -y -ss $timestamp -i $videoPath -vframes 1 -q:v 2 $frameFile 2>$null
            if (Test-Path $frameFile) {
                $motionFrames += $frameFile
            }
        }
        
        Write-Success "Extracted first/last frames + $($motionFrames.Count) motion frames"
    }
    
    # 5b. Frame-level artifact detection (model-free heuristics)
    Write-Status "Running frame-level artifact detection..."
    
    $hasBlackFrames = $false
    $hasHardFlicker = $false
    $frameArtifactScore = 0
    $brightnessValues = @()
    
    # Sample 10 frames evenly across the video using ffmpeg
    $frameAnalysisDir = Join-Path $sampleTempDir "frame_analysis"
    if (-not (Test-Path $frameAnalysisDir)) {
        New-Item -Path $frameAnalysisDir -ItemType Directory -Force | Out-Null
    }
    
    # Extract 10 frames at regular intervals
    $frameCount = 10
    $videoDuration = 2.0  # FLF2V typically produces ~2 second videos
    $frameInterval = $videoDuration / $frameCount
    
    for ($i = 0; $i -lt $frameCount; $i++) {
        $frameFile = Join-Path $frameAnalysisDir "frame_$i.jpg"
        $timestamp = $i * $frameInterval
        & ffmpeg -y -ss $timestamp -i $videoPath -vframes 1 -q:v 2 $frameFile 2>$null
        
        if (Test-Path $frameFile) {
            # Get mean brightness using ImageMagick (if available) or ffmpeg
            try {
                # Try ImageMagick first
                $magickPath = Get-Command magick -ErrorAction SilentlyContinue
                if ($magickPath) {
                    $brightness = & magick identify -format "%[mean]" $frameFile 2>$null
                    if ($brightness -match "^\d+\.?\d*$") {
                        # ImageMagick returns 0-65535 for 16-bit, normalize to 0-255
                        $normalizedBrightness = [math]::Round([double]$brightness / 257, 1)
                        $brightnessValues += $normalizedBrightness
                    }
                } else {
                    # Fallback: use ffprobe to get average frame stats
                    $ffprobeOutput = & ffprobe -v quiet -f image2 -i $frameFile -show_entries frame=pkt_pts_time -select_streams v -print_format json 2>$null
                    # Simple fallback: check file size as proxy for content (black frames are often smaller)
                    $fileInfo = Get-Item $frameFile
                    $sizeKB = $fileInfo.Length / 1024
                    # Typical frame is 20-100KB, black frame would be <5KB
                    if ($sizeKB -lt 5) {
                        $brightnessValues += 5  # Very dark
                    } elseif ($sizeKB -lt 10) {
                        $brightnessValues += 50  # Somewhat dark
                    } else {
                        $brightnessValues += 128  # Normal brightness estimate
                    }
                }
            } catch {
                # Fallback to file size heuristic
                $fileInfo = Get-Item $frameFile
                $sizeKB = $fileInfo.Length / 1024
                if ($sizeKB -lt 5) {
                    $brightnessValues += 5
                } else {
                    $brightnessValues += 128
                }
            }
        }
    }
    
    # Analyze brightness patterns
    if ($brightnessValues.Count -gt 0) {
        # Check for black frames (brightness < 15 on 0-255 scale)
        $blackFrameCount = ($brightnessValues | Where-Object { $_ -lt 15 }).Count
        if ($blackFrameCount -gt 0) {
            $hasBlackFrames = $true
            Write-Warning "Detected $blackFrameCount black frame(s) with brightness < 15"
        }
        
        # Check for hard flicker (large brightness jumps between consecutive frames)
        $flickerThreshold = 80  # Large jump threshold
        for ($i = 1; $i -lt $brightnessValues.Count; $i++) {
            $delta = [math]::Abs($brightnessValues[$i] - $brightnessValues[$i - 1])
            if ($delta -gt $flickerThreshold) {
                $hasHardFlicker = $true
                Write-Warning "Detected hard flicker: brightness jump of $delta between frames $($i-1) and $i"
                break
            }
        }
        
        # Calculate frame artifact score (0-100)
        # Black frames are severe (add 50), hard flicker adds 30
        if ($hasBlackFrames) {
            $frameArtifactScore += 50
        }
        if ($hasHardFlicker) {
            $frameArtifactScore += 30
        }
        
        # Also penalize for very high variance (indicates instability)
        $avgBrightness = ($brightnessValues | Measure-Object -Average).Average
        $variance = ($brightnessValues | ForEach-Object { [math]::Pow($_ - $avgBrightness, 2) } | Measure-Object -Average).Average
        $stdDev = [math]::Sqrt($variance)
        if ($stdDev -gt 50) {
            $frameArtifactScore = [math]::Min(100, $frameArtifactScore + 20)
            Write-Warning "High brightness variance detected (stdDev=$([math]::Round($stdDev, 1)))"
        }
        
        Write-Success "Frame analysis: hasBlackFrames=$hasBlackFrames, hasHardFlicker=$hasHardFlicker, frameArtifactScore=$frameArtifactScore"
    } else {
        Write-Warning "Could not analyze frame brightness (no frames extracted)"
    }
    
    # 5c. Load original keyframes and context
    $contextPath = Join-Path $GoldenSamplesDir $sampleId "context.json"
    $startKeyframePath = Join-Path $GoldenSamplesDir $sampleId "start.png"
    $endKeyframePath = Join-Path $GoldenSamplesDir $sampleId "end.png"
    
    if (-not (Test-Path $startKeyframePath) -or -not (Test-Path $endKeyframePath)) {
        Write-Error "Original keyframes not found for $sampleId"
        continue
    }
    
    # Load context for motion and prompt evaluation
    $context = Get-Content $contextPath | ConvertFrom-Json
    $sceneDescription = $context.sceneContext.summary
    $motionDescription = $context.videoContext.motionDescription
    $startPrompt = $context.startKeyframe.prompt
    $endPrompt = $context.endKeyframe.prompt
    $expectedBehavior = if ($context.expectedBehavior) { $context.expectedBehavior.primary } else { "Maintain visual consistency" }
    
    Write-Status "Calling VLM for comprehensive analysis..."
    
    # Convert images to base64
    $startKeyframeB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($startKeyframePath))
    $firstFrameB64 = if (Test-Path $firstFrame) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($firstFrame)) } else { $null }
    $endKeyframeB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($endKeyframePath))
    $lastFrameB64 = if (Test-Path $lastFrame) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($lastFrame)) } else { $null }
    
    # Convert motion frames to base64 (for motion quality analysis)
    $motionFramesB64 = @()
    foreach ($mf in $motionFrames) {
        if (Test-Path $mf) {
            $motionFramesB64 += [Convert]::ToBase64String([IO.File]::ReadAllBytes($mf))
        }
    }
    
    # Build comprehensive VLM prompt
    $comprehensivePrompt = @"
You are a professional VFX supervisor evaluating a generated video against its reference keyframes and intended motion.
You are EXTREMELY STRICT about quality. Your job is to catch every flaw so that only truly excellent videos pass.

=== SCENE CONTEXT ===
Scene: $sceneDescription
Start keyframe prompt: $startPrompt
End keyframe prompt: $endPrompt
Expected motion: $motionDescription
Primary expectation: $expectedBehavior

=== YOUR TASK ===
You will see 4 images in order:
1. ORIGINAL START KEYFRAME (reference)
2. VIDEO FIRST FRAME (to compare with #1)
3. ORIGINAL END KEYFRAME (reference)  
4. VIDEO LAST FRAME (to compare with #3)

Evaluate the video quality across these dimensions (score 0-100 for each):

1. **startFrameMatch**: How well does the video's first frame match the original start keyframe?
   - Consider: composition, objects/characters, colors, lighting, framing
   
2. **endFrameMatch**: How well does the video's last frame match the original end keyframe?
   - Consider: composition, objects/characters, colors, lighting, framing

3. **motionQuality**: Based on what motion should occur between start and end keyframes, how smooth and coherent would the interpolated motion be?
   - Consider: Would objects/characters move naturally? Any potential for flickering, morphing, or jumps?
   - High score = motion should be smooth and natural
   - Low score = likely jerky, unnatural, or containing artifacts

4. **promptAdherence**: How well does the video match the described scene, motion, and expected behavior?
   - Consider: Does the scene match the description? Is the expected motion achievable?
   - High score = video content matches the prompts and motion description
   - Low score = significant deviation from intended content

5. **focusStability**: Does the main subject/object remain the consistent focus throughout?
   - Consider: Is the primary subject (person, mug, object) clearly identifiable and consistently centered/focused?
   - Does the video clearly communicate what the subject is doing?
   - High score (90-100) = main subject is ALWAYS clear and maintains visual prominence
   - Medium score (60-80) = focus wanders occasionally but subject remains identifiable
   - Low score (below 60) = subject is unclear, attention is scattered, or focus lost for significant time

6. **artifactSeverity**: How severe are visual artifacts in the video? (0=no artifacts, 100=severe/unwatchable)

   CRITICAL ARTIFACT RULES (follow these strictly):
   - **Black Frames**: If you see ANY frame that is mostly black (>80% dark pixels), this is a SEVERE artifact.
     Set artifactSeverity to 80-100 immediately.
   - **Glitch Patterns**: Heavy noise, smeared faces, distorted bodies, "horror-style" visual disturbances,
     or "Ring-style" flashes are SEVERE artifacts. Set artifactSeverity to 70-100.
   - **Flickering**: If there is rapid brightness changes or strobing effects, set artifactSeverity to 60-80.
   - **Minor artifacts**: Brief blur, slight color banding, minor noise = 10-30.
   - **No artifacts**: Clean, smooth, no visual disturbances = 0-10.
   
   SEVERITY SCALE:
   - 0-10: Pristine, no visible artifacts
   - 10-30: Minor issues, tolerable for production
   - 30-50: Noticeable artifacts that distract from content
   - 50-70: Significant artifacts that harm quality
   - 70-100: Severe/unwatchable - black frames, major glitches, horror distortions

7. **objectConsistency**: Do key objects remain consistent in type, count, and appearance?

   CRITICAL CONSISTENCY RULES (follow these strictly):
   - **Object Type Changes**: If a metal pitcher becomes a ceramic coffee pot, or a mug changes material/color,
     this is a MAJOR inconsistency. Set objectConsistency to 40-60.
   - **Object Count Changes**: If one mug becomes two, or objects appear/disappear without explanation,
     this is a MAJOR inconsistency. Set objectConsistency to 30-50.
   - **Character Changes**: If a person's clothing, hair, or identity changes, set objectConsistency to 40-60.
   - **Minor variations**: Slight pose changes, small detail differences = 80-90.
   - **Perfect consistency**: All objects exactly as expected throughout = 95-100.
   
   CONSISTENCY SCALE:
   - 95-100: Perfect - all objects identical throughout
   - 80-95: Minor variations acceptable
   - 60-80: Some noticeable changes but objects identifiable
   - 40-60: Major object changes (type, count, or identity)
   - Below 40: Severe inconsistencies, objects unrecognizable

8. **overall**: Weighted overall quality score

   CRITICAL: The overall score MUST reflect artifacts and coherence issues. Do NOT give high overall scores
   if there are severe artifacts or object inconsistencies.
   
   Calculation guidance:
   - Start with base = (startFrameMatch + endFrameMatch + motionQuality + promptAdherence) / 4
   - If artifactSeverity > 50: reduce overall by 20-30 points
   - If artifactSeverity > 70: reduce overall to below 60 (severely flawed video)
   - If objectConsistency < 60: reduce overall by 15-25 points
   - If focusStability < 70: reduce overall by 10-15 points
   - Final overall should be 70+ ONLY if: artifacts < 30, objectConsistency > 80, focusStability > 80

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object (no markdown, no explanation):
{"startFrameMatch":X,"endFrameMatch":X,"motionQuality":X,"promptAdherence":X,"focusStability":X,"artifactSeverity":X,"objectConsistency":X,"overall":X,"summary":"1-2 sentence summary of video quality","coherenceNotes":"Brief notes on any focus/coherence/artifact issues observed"}
"@

    # Build request with all 4 images
    $imageContent = @(
        @{ type = "text"; text = $comprehensivePrompt }
        @{ type = "image_url"; image_url = @{ url = "data:image/png;base64,$startKeyframeB64" } }
    )
    
    if ($firstFrameB64) {
        $imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/jpeg;base64,$firstFrameB64" } }
    }
    
    $imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/png;base64,$endKeyframeB64" } }
    
    if ($lastFrameB64) {
        $imageContent += @{ type = "image_url"; image_url = @{ url = "data:image/jpeg;base64,$lastFrameB64" } }
    }
    
    $requestBody = @{
        model = $Model
        messages = @(
            @{
                role = "user"
                content = $imageContent
            }
        )
        temperature = 0.3
        max_tokens = 800
    } | ConvertTo-Json -Depth 10
    
    # Multi-run VLM evaluation for variance reduction
    $vlmRunResults = @()
    $rawAnalysisResults = @()
    
    for ($runNum = 1; $runNum -le $Runs; $runNum++) {
        if ($Runs -gt 1) {
            Write-Status "VLM run $runNum of $Runs..."
        }
        
        $analysisResult = $null
        try {
            $response = Invoke-RestMethod -Uri $VLMEndpoint -Method POST -Body $requestBody -ContentType "application/json" -TimeoutSec 180
            $rawAnalysis = $response.choices[0].message.content
            if ($Runs -eq 1) {
                Write-Status "Raw VLM response: $rawAnalysis"
            }
            $rawAnalysisResults += $rawAnalysis
            
            # Parse the response
            $analysisResult = Parse-VLMResponse -ResponseText $rawAnalysis -Context "$sampleId-run$runNum"
            
            if ($analysisResult -and $analysisResult.startFrameMatch) {
                $runScores = @{
                    scores = @{
                        startFrameMatch = [int]$analysisResult.startFrameMatch
                        endFrameMatch = [int]$analysisResult.endFrameMatch
                        motionQuality = [int]$analysisResult.motionQuality
                        promptAdherence = [int]$analysisResult.promptAdherence
                        focusStability = if ($null -ne $analysisResult.focusStability) { [int]$analysisResult.focusStability } else { $null }
                        artifactSeverity = if ($null -ne $analysisResult.artifactSeverity) { [int]$analysisResult.artifactSeverity } else { $null }
                        objectConsistency = if ($null -ne $analysisResult.objectConsistency) { [int]$analysisResult.objectConsistency } else { $null }
                        overall = [int]$analysisResult.overall
                    }
                    summary = if ($analysisResult.summary) { $analysisResult.summary } else { "" }
                    coherenceNotes = if ($analysisResult.coherenceNotes) { $analysisResult.coherenceNotes } else { "" }
                    status = "success"
                }
                $vlmRunResults += $runScores
                
                if ($Runs -gt 1) {
                    Write-Status "  Run $runNum scores: overall=$($runScores.scores.overall) focus=$($runScores.scores.focusStability) artifacts=$($runScores.scores.artifactSeverity) objConsist=$($runScores.scores.objectConsistency)"
                } else {
                    Write-Success "Parsed scores: start=$($analysisResult.startFrameMatch) end=$($analysisResult.endFrameMatch) motion=$($analysisResult.motionQuality) prompt=$($analysisResult.promptAdherence) overall=$($analysisResult.overall)"
                    Write-Success "Coherence metrics: focusStability=$($analysisResult.focusStability) artifactSeverity=$($analysisResult.artifactSeverity) objectConsistency=$($analysisResult.objectConsistency)"
                }
            } else {
                Write-Warning "Run ${runNum}: Could not extract structured scores from VLM response"
                $vlmRunResults += @{
                    scores = @{
                        startFrameMatch = 0
                        endFrameMatch = 0
                        motionQuality = 0
                        promptAdherence = 0
                        focusStability = $null
                        artifactSeverity = $null
                        objectConsistency = $null
                        overall = 0
                    }
                    summary = "VLM response parsing failed"
                    coherenceNotes = ""
                    status = "parse_error"
                }
            }
        } catch {
            Write-Warning "Run ${runNum}: VLM call failed: $_"
            $vlmRunResults += @{
                scores = @{
                    startFrameMatch = 0
                    endFrameMatch = 0
                    motionQuality = 0
                    promptAdherence = 0
                    focusStability = $null
                    artifactSeverity = $null
                    objectConsistency = $null
                    overall = 0
                }
                summary = "VLM call failed: $_"
                coherenceNotes = ""
                status = "error"
            }
            $rawAnalysisResults += "Error: $_"
        }
        
        # Small delay between runs to avoid rate limiting
        if ($runNum -lt $Runs) {
            Start-Sleep -Milliseconds 500
        }
    }
    
    # Compute aggregated metrics if multiple runs
    $aggregatedMetrics = $null
    if ($Runs -gt 1) {
        $successfulRuns = $vlmRunResults | Where-Object { $_.status -eq "success" }
        if ($successfulRuns.Count -gt 0) {
            $aggregatedMetrics = @{
                startFrameMatch = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "startFrameMatch"
                endFrameMatch = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "endFrameMatch"
                motionQuality = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "motionQuality"
                promptAdherence = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "promptAdherence"
                focusStability = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "focusStability"
                artifactSeverity = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "artifactSeverity"
                objectConsistency = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "objectConsistency"
                overall = Get-AggregatedMetrics -RunResults $successfulRuns -MetricName "overall"
                runsSuccessful = $successfulRuns.Count
                runsTotal = $Runs
            }
            
            Write-Success "Aggregated metrics (median): overall=$($aggregatedMetrics.overall.median) focus=$($aggregatedMetrics.focusStability.median) artifacts=$($aggregatedMetrics.artifactSeverity.median) objConsist=$($aggregatedMetrics.objectConsistency.median)"
            Write-Status "  Variance: overall stdDev=$($aggregatedMetrics.overall.stdDev) (range $($aggregatedMetrics.overall.min)-$($aggregatedMetrics.overall.max))"
        }
    }
    
    # Use first successful run for legacy fields, or fallback if all failed
    $primaryResult = $vlmRunResults | Where-Object { $_.status -eq "success" } | Select-Object -First 1
    if (-not $primaryResult) {
        $primaryResult = $vlmRunResults | Select-Object -First 1
    }
    
    # Store results in structured format
    $visionResults[$sampleId] = @{
        scores = $primaryResult.scores
        # Frame-level artifact detection (model-free)
        frameAnalysis = @{
            hasBlackFrames = $hasBlackFrames
            hasHardFlicker = $hasHardFlicker
            frameArtifactScore = $frameArtifactScore
            brightnessStats = @{
                values = $brightnessValues
                avg = if ($brightnessValues.Count -gt 0) { [math]::Round(($brightnessValues | Measure-Object -Average).Average, 1) } else { $null }
                min = if ($brightnessValues.Count -gt 0) { [math]::Round(($brightnessValues | Measure-Object -Minimum).Minimum, 1) } else { $null }
                max = if ($brightnessValues.Count -gt 0) { [math]::Round(($brightnessValues | Measure-Object -Maximum).Maximum, 1) } else { $null }
            }
        }
        summary = $primaryResult.summary
        coherenceNotes = $primaryResult.coherenceNotes
        pixelSimilarity = $sampleResult.similarity
        rawAnalysis = if ($rawAnalysisResults.Count -eq 1) { $rawAnalysisResults[0] } else { $null }
        context = @{
            sceneDescription = $sceneDescription
            motionDescription = $motionDescription
        }
        timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        status = if ($primaryResult.status -eq "success") { "success" } else { "error" }
        # Multi-run fields (only present when Runs > 1)
        runs = if ($Runs -gt 1) { $vlmRunResults } else { $null }
        aggregatedMetrics = $aggregatedMetrics
        rawAnalysisRuns = if ($Runs -gt 1) { $rawAnalysisResults } else { $null }
    }
    
    Write-Success "Analysis complete for $sampleId"
}

# 6. Output summary
$outputPath = Join-Path $tempDir "vision-qa-results.json"
$visionResults | ConvertTo-Json -Depth 5 | Set-Content -Path $outputPath

Write-Host "`n=== Vision QA Summary ===" -ForegroundColor White
Write-Status "Results saved to: $outputPath"
Write-Host "`nComprehensive Vision Metrics by Sample:" -ForegroundColor Cyan
Write-Host "  (Scores: 0-100, where 100 = perfect match)" -ForegroundColor DarkGray

foreach ($sampleId in $visionResults.Keys | Sort-Object) {
    $r = $visionResults[$sampleId]
    $s = $r.scores
    $statusColor = if ($r.status -eq "success") { "Green" } else { "Yellow" }
    
    Write-Host "`n  $sampleId" -ForegroundColor White -NoNewline
    Write-Host " [$($r.status)]" -ForegroundColor $statusColor
    
    # Pixel similarity (from regression run)
    if ($r.pixelSimilarity) {
        Write-Host "    Pixel:  start=$($r.pixelSimilarity.startSimilarity)% end=$($r.pixelSimilarity.endSimilarity)% avg=$($r.pixelSimilarity.avgSimilarity)%" -ForegroundColor DarkGray
    }
    
    # VLM scores (comprehensive)
    Write-Host "    VLM Scores:" -ForegroundColor Cyan
    Write-Host "      Start Frame Match:   $($s.startFrameMatch)%" -ForegroundColor $(if ($s.startFrameMatch -ge 70) { "Green" } elseif ($s.startFrameMatch -ge 50) { "Yellow" } else { "Red" })
    Write-Host "      End Frame Match:     $($s.endFrameMatch)%" -ForegroundColor $(if ($s.endFrameMatch -ge 70) { "Green" } elseif ($s.endFrameMatch -ge 50) { "Yellow" } else { "Red" })
    Write-Host "      Motion Quality:      $($s.motionQuality)%" -ForegroundColor $(if ($s.motionQuality -ge 60) { "Green" } elseif ($s.motionQuality -ge 40) { "Yellow" } else { "Red" })
    Write-Host "      Prompt Adherence:    $($s.promptAdherence)%" -ForegroundColor $(if ($s.promptAdherence -ge 60) { "Green" } elseif ($s.promptAdherence -ge 40) { "Yellow" } else { "Red" })
    Write-Host "      Overall:             $($s.overall)%" -ForegroundColor $(if ($s.overall -ge 70) { "Green" } elseif ($s.overall -ge 50) { "Yellow" } else { "Red" })
    
    # Coherence metrics (new)
    Write-Host "    Coherence Metrics:" -ForegroundColor Magenta
    if ($null -ne $s.focusStability) {
        Write-Host "      Focus Stability:     $($s.focusStability)%" -ForegroundColor $(if ($s.focusStability -ge 80) { "Green" } elseif ($s.focusStability -ge 60) { "Yellow" } else { "Red" })
    } else {
        Write-Host "      Focus Stability:     N/A" -ForegroundColor DarkGray
    }
    if ($null -ne $s.artifactSeverity) {
        Write-Host "      Artifact Severity:   $($s.artifactSeverity)%" -ForegroundColor $(if ($s.artifactSeverity -le 20) { "Green" } elseif ($s.artifactSeverity -le 50) { "Yellow" } else { "Red" })
    } else {
        Write-Host "      Artifact Severity:   N/A" -ForegroundColor DarkGray
    }
    if ($null -ne $s.objectConsistency) {
        Write-Host "      Object Consistency:  $($s.objectConsistency)%" -ForegroundColor $(if ($s.objectConsistency -ge 80) { "Green" } elseif ($s.objectConsistency -ge 60) { "Yellow" } else { "Red" })
    } else {
        Write-Host "      Object Consistency:  N/A" -ForegroundColor DarkGray
    }
    
    # Coherence notes
    if ($r.coherenceNotes -and $r.coherenceNotes.Length -gt 0) {
        $notesTrunc = if ($r.coherenceNotes.Length -gt 120) { $r.coherenceNotes.Substring(0, 120) + "..." } else { $r.coherenceNotes }
        Write-Host "    Coherence Notes: $notesTrunc" -ForegroundColor Magenta
    }
    
    # Frame-level artifact detection
    if ($r.frameAnalysis) {
        $fa = $r.frameAnalysis
        Write-Host "    Frame Analysis:" -ForegroundColor Yellow
        $blackColor = if ($fa.hasBlackFrames) { "Red" } else { "Green" }
        $flickerColor = if ($fa.hasHardFlicker) { "Red" } else { "Green" }
        Write-Host "      Black Frames:        $(if ($fa.hasBlackFrames) { 'YES' } else { 'No' })" -ForegroundColor $blackColor
        Write-Host "      Hard Flicker:        $(if ($fa.hasHardFlicker) { 'YES' } else { 'No' })" -ForegroundColor $flickerColor
        Write-Host "      Frame Artifact Score: $($fa.frameArtifactScore)" -ForegroundColor $(if ($fa.frameArtifactScore -eq 0) { "Green" } elseif ($fa.frameArtifactScore -lt 30) { "Yellow" } else { "Red" })
    }
    
    # Summary
    if ($r.summary -and $r.summary.Length -gt 0) {
        $summaryTrunc = if ($r.summary.Length -gt 100) { $r.summary.Substring(0, 100) + "..." } else { $r.summary }
        Write-Host "    Summary: $summaryTrunc" -ForegroundColor DarkGray
    }
}

# Aggregate statistics
Write-Host "`n=== Aggregate Statistics ===" -ForegroundColor White
$allScores = $visionResults.Values | Where-Object { $_.status -eq "success" } | ForEach-Object { $_.scores }
if ($allScores.Count -gt 0) {
    $avgStart = ($allScores | Measure-Object -Property startFrameMatch -Average).Average
    $avgEnd = ($allScores | Measure-Object -Property endFrameMatch -Average).Average
    $avgMotion = ($allScores | Measure-Object -Property motionQuality -Average).Average
    $avgPrompt = ($allScores | Measure-Object -Property promptAdherence -Average).Average
    $avgOverall = ($allScores | Measure-Object -Property overall -Average).Average
    
    # Coherence metrics (filter null values)
    $focusScores = $allScores | Where-Object { $null -ne $_.focusStability } | ForEach-Object { $_.focusStability }
    $artifactScores = $allScores | Where-Object { $null -ne $_.artifactSeverity } | ForEach-Object { $_.artifactSeverity }
    $consistencyScores = $allScores | Where-Object { $null -ne $_.objectConsistency } | ForEach-Object { $_.objectConsistency }
    
    $avgFocus = if ($focusScores.Count -gt 0) { ($focusScores | Measure-Object -Average).Average } else { $null }
    $avgArtifact = if ($artifactScores.Count -gt 0) { ($artifactScores | Measure-Object -Average).Average } else { $null }
    $avgConsistency = if ($consistencyScores.Count -gt 0) { ($consistencyScores | Measure-Object -Average).Average } else { $null }
    
    Write-Host "  Samples Analyzed: $($allScores.Count)" -ForegroundColor Cyan
    Write-Host "  Avg Start Frame Match:   $([math]::Round($avgStart, 1))%" -ForegroundColor Cyan
    Write-Host "  Avg End Frame Match:     $([math]::Round($avgEnd, 1))%" -ForegroundColor Cyan
    Write-Host "  Avg Motion Quality:      $([math]::Round($avgMotion, 1))%" -ForegroundColor Cyan
    Write-Host "  Avg Prompt Adherence:    $([math]::Round($avgPrompt, 1))%" -ForegroundColor Cyan
    Write-Host "  Avg Overall:             $([math]::Round($avgOverall, 1))%" -ForegroundColor Cyan
    
    Write-Host "  --- Coherence Metrics ---" -ForegroundColor Magenta
    if ($null -ne $avgFocus) {
        Write-Host "  Avg Focus Stability:     $([math]::Round($avgFocus, 1))%" -ForegroundColor Magenta
    }
    if ($null -ne $avgArtifact) {
        Write-Host "  Avg Artifact Severity:   $([math]::Round($avgArtifact, 1))%" -ForegroundColor Magenta
    }
    if ($null -ne $avgConsistency) {
        Write-Host "  Avg Object Consistency:  $([math]::Round($avgConsistency, 1))%" -ForegroundColor Magenta
    }
} else {
    Write-Warning "No successful analyses to aggregate"
}

Write-Host "`nDone!" -ForegroundColor Green
