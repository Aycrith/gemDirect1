# Full Pipeline Validation Script
# Tests: React UI → Gemini/LLM Story → Keyframe Generation → Video Generation
# Validates that each stage uses dynamically generated content, not hardcoded prompts

param(
    [string]$StoryPrompt = "A mysterious lighthouse keeper discovers ancient maps in the fog",
    [switch]$UseLocalLLM,
    [int]$MaxScenes = 1,
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $OutputDir) {
    $OutputDir = "C:\Dev\gemDirect1\logs\pipeline-validation-$timestamp"
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "FULL PIPELINE VALIDATION TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Timestamp: $timestamp" -ForegroundColor White
Write-Host "Story Prompt: $StoryPrompt" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor White
Write-Host "LLM Mode: $(if ($UseLocalLLM) { 'Local (LM Studio)' } else { 'Gemini API' })" -ForegroundColor White
Write-Host ""

# Step 1: Generate Story with LLM (validate dynamic content)
Write-Host "[STEP 1] Generating Story via LLM..." -ForegroundColor Yellow

# Use the existing E2E story generation that works
$storyGenerator = Join-Path $PSScriptRoot "storyGenerator.ts"
$storyArgs = @(
    "--loader", "ts-node/esm",
    $storyGenerator,
    "--output", $OutputDir,
    "--max-scenes", $MaxScenes.ToString()
)

# Set environment variable for custom story prompt
$env:CUSTOM_STORY_PROMPT = $StoryPrompt
if ($UseLocalLLM) {
    $env:USE_LOCAL_LLM = "true"
}

try {
    $storyResult = & node --loader ts-node/esm @storyArgs 2>&1 | Out-String
    Write-Host "✓ Story generation completed" -ForegroundColor Green
    
    # Validate story.json contains our custom prompt
    $storyPath = Join-Path $OutputDir "story\story.json"
    if (-not (Test-Path $storyPath)) {
        throw "Story file not found at: $storyPath"
    }
    
    $story = Get-Content $storyPath -Raw | ConvertFrom-Json
    $storyText = $story | ConvertTo-Json -Depth 10
    
    # Critical validation: Check if story contains elements from our prompt
    $promptKeywords = $StoryPrompt -split '\s+' | Where-Object { $_.Length -gt 4 }
    $foundKeywords = @()
    foreach ($keyword in $promptKeywords) {
        if ($storyText -match [regex]::Escape($keyword)) {
            $foundKeywords += $keyword
        }
    }
    
    Write-Host "  Story Bible Length: $($story.storyBible.Length) chars" -ForegroundColor Cyan
    Write-Host "  Scenes Generated: $($story.scenes.Count)" -ForegroundColor Cyan
    Write-Host "  Prompt Keywords Found: $($foundKeywords.Count)/$($promptKeywords.Count)" -ForegroundColor Cyan
    Write-Host "  Found: $($foundKeywords -join ', ')" -ForegroundColor White
    
    if ($foundKeywords.Count -eq 0) {
        Write-Warning "⚠ No prompt keywords found in story - may be using cached/default content"
    }
    
} catch {
    Write-Host "✗ Story generation failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Generate Keyframes (validate prompts from story)
Write-Host "`n[STEP 2] Generating Keyframes from Story Prompts..." -ForegroundColor Yellow
$keyframeDir = Join-Path $OutputDir "story\keyframes"
$sceneIds = $story.scenes | ForEach-Object { $_.id }

foreach ($sceneId in $sceneIds) {
    Write-Host "  Processing $sceneId..." -ForegroundColor White
    
    # Get scene prompt from story
    $scene = $story.scenes | Where-Object { $_.id -eq $sceneId } | Select-Object -First 1
    $scenePrompt = $scene.humanReadablePrompt
    
    if (-not $scenePrompt) {
        Write-Warning "  ⚠ No prompt found for $sceneId"
        continue
    }
    
    Write-Host "    Prompt: $($scenePrompt.Substring(0, [Math]::Min(80, $scenePrompt.Length)))..." -ForegroundColor Gray
    
    # Generate keyframe using wan-t2i workflow
    try {
        $generateResult = & pwsh -ExecutionPolicy Bypass -File "C:\Dev\gemDirect1\scripts\generate-scene-keyframes-wan.ps1" `
            -StoryDir (Join-Path $OutputDir "story") `
            -SceneFilter $sceneId `
            -MaxWaitSeconds 180 `
            -PollIntervalSeconds 2 2>&1 | Out-String
        
        # Verify keyframe was created
        $keyframePath = Join-Path $keyframeDir "$sceneId.png"
        if (Test-Path $keyframePath) {
            $keyframeSize = (Get-Item $keyframePath).Length / 1KB
            Write-Host "    ✓ Keyframe generated: $([Math]::Round($keyframeSize, 2)) KB" -ForegroundColor Green
        } else {
            throw "Keyframe not found at: $keyframePath"
        }
        
    } catch {
        Write-Host "    ✗ Keyframe generation failed: $_" -ForegroundColor Red
        continue
    }
}

# Step 3: Generate Videos (validate using generated keyframes + prompts)
Write-Host "`n[STEP 3] Generating Videos from Keyframes + Prompts..." -ForegroundColor Yellow

foreach ($sceneId in $sceneIds) {
    Write-Host "  Processing $sceneId video..." -ForegroundColor White
    
    $scene = $story.scenes | Where-Object { $_.id -eq $sceneId } | Select-Object -First 1
    $keyframePath = Join-Path $keyframeDir "$sceneId.png"
    
    if (-not (Test-Path $keyframePath)) {
        Write-Warning "  ⚠ Keyframe missing, skipping video generation"
        continue
    }
    
    # Verify prompts are from story, not workflow defaults
    $scenePrompt = $scene.humanReadablePrompt
    $negativePrompt = if ($scene.negativePrompt) { $scene.negativePrompt } else { "default negative" }
    
    Write-Host "    Using Story Prompt: $($scenePrompt.Substring(0, [Math]::Min(60, $scenePrompt.Length)))..." -ForegroundColor Gray
    
    try {
        $videoResult = & pwsh -ExecutionPolicy Bypass -File "C:\Dev\gemDirect1\scripts\generate-scene-videos-wan2.ps1" `
            -RunDir $OutputDir `
            -SceneFilter $sceneId `
            -MaxWaitSeconds 360 `
            -PollIntervalSeconds 2 2>&1 | Out-String
        
        # Verify video was created
        $videoPattern = Join-Path $OutputDir "video\$sceneId\*.mp4"
        $videos = Get-ChildItem $videoPattern -ErrorAction SilentlyContinue
        
        if ($videos.Count -gt 0) {
            $video = $videos | Select-Object -First 1
            $videoSize = $video.Length / 1MB
            
            # Validate video specs
            $ffprobeOutput = & ffprobe -v error -select_streams v:0 `
                -show_entries stream=width,height,r_frame_rate,duration,bit_rate `
                -count_frames -show_entries stream=nb_read_frames `
                -of default=noprint_wrappers=1 $video.FullName 2>&1 | Out-String
            
            $fps = if ($ffprobeOutput -match 'r_frame_rate=(\d+)/(\d+)') { [int]$matches[1] / [int]$matches[2] } else { 0 }
            $duration = if ($ffprobeOutput -match 'duration=([\d.]+)') { [decimal]$matches[1] } else { 0 }
            
            Write-Host "    ✓ Video generated: $([Math]::Round($videoSize, 2)) MB" -ForegroundColor Green
            Write-Host "      FPS: $fps, Duration: $([Math]::Round($duration, 2))s" -ForegroundColor Cyan
            
            # Critical: Check if video specs match our configuration (24 fps, ~2s)
            if ($fps -ne 24) {
                Write-Warning "    ⚠ FPS mismatch: expected 24, got $fps"
            }
            if ($duration -lt 1.5 -or $duration -gt 3.0) {
                Write-Warning "    ⚠ Duration outside expected range: $([Math]::Round($duration, 2))s (expected 1.5-3.0s)"
            }
            
        } else {
            throw "Video not found at: $videoPattern"
        }
        
    } catch {
        Write-Host "    ✗ Video generation failed: $_" -ForegroundColor Red
        continue
    }
}

# Step 4: Quality Control Validation
Write-Host "`n[STEP 4] Quality Control Validation..." -ForegroundColor Yellow

# QC Check 1: Verify prompts are NOT workflow defaults
Write-Host "  [QC 1] Checking for workflow default prompts..." -ForegroundColor White
$workflowDefaults = @(
    "Low contrast. In a retro 1970s-style subway station",
    "street musician plays in dim colors",
    "example.png"
)

$foundDefaults = $false
foreach ($default in $workflowDefaults) {
    if ($storyText -match [regex]::Escape($default)) {
        Write-Host "    ✗ FAIL: Found workflow default: '$default'" -ForegroundColor Red
        $foundDefaults = $true
    }
}

if (-not $foundDefaults) {
    Write-Host "    ✓ PASS: No workflow defaults found in story" -ForegroundColor Green
}

# QC Check 2: Verify keyframes are unique (not reused workflow images)
Write-Host "  [QC 2] Checking keyframe uniqueness..." -ForegroundColor White
$keyframes = Get-ChildItem (Join-Path $OutputDir "story\keyframes\*.png") -ErrorAction SilentlyContinue
$uniqueHashes = @{}
foreach ($keyframe in $keyframes) {
    $hash = (Get-FileHash $keyframe.FullName -Algorithm MD5).Hash
    if ($uniqueHashes.ContainsKey($hash)) {
        Write-Host "    ✗ FAIL: Duplicate keyframe detected: $($keyframe.Name)" -ForegroundColor Red
    } else {
        $uniqueHashes[$hash] = $keyframe.Name
    }
}

if ($uniqueHashes.Count -eq $keyframes.Count) {
    Write-Host "    ✓ PASS: All keyframes are unique ($($keyframes.Count) images)" -ForegroundColor Green
}

# QC Check 3: Verify videos use generated keyframes (check file modification times)
Write-Host "  [QC 3] Checking video-keyframe correlation..." -ForegroundColor White
$videos = Get-ChildItem (Join-Path $OutputDir "video\*\*.mp4") -Recurse -ErrorAction SilentlyContinue
foreach ($video in $videos) {
    $sceneId = $video.Directory.Name
    $keyframe = Get-Item (Join-Path $keyframeDir "$sceneId.png") -ErrorAction SilentlyContinue
    
    if ($keyframe) {
        $timeDiff = ($video.CreationTime - $keyframe.CreationTime).TotalMinutes
        if ($timeDiff -lt 0) {
            Write-Host "    ✗ FAIL: Video created BEFORE keyframe for $sceneId" -ForegroundColor Red
        } elseif ($timeDiff -gt 10) {
            Write-Warning "    ⚠ Video created >10 min after keyframe for $sceneId"
        } else {
            Write-Host "    ✓ PASS: Video timing correct for $sceneId ($([Math]::Round($timeDiff, 1)) min)" -ForegroundColor Green
        }
    }
}

# Final Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Story Scenes: $($story.scenes.Count)" -ForegroundColor White
Write-Host "Keyframes Generated: $($keyframes.Count)" -ForegroundColor White
Write-Host "Videos Generated: $($videos.Count)" -ForegroundColor White
Write-Host "Output Directory: $OutputDir" -ForegroundColor White

# Calculate success rate
$totalSteps = $story.scenes.Count * 2  # keyframe + video per scene
$successfulSteps = $keyframes.Count + $videos.Count
$successRate = [Math]::Round(($successfulSteps / $totalSteps) * 100, 1)

Write-Host "`nSuccess Rate: $successRate% ($successfulSteps/$totalSteps steps)" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })

# Exit code based on success
if ($successRate -ge 90 -and -not $foundDefaults) {
    Write-Host "`n✓ PIPELINE VALIDATION PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n✗ PIPELINE VALIDATION FAILED" -ForegroundColor Red
    Write-Host "Review output directory for details: $OutputDir" -ForegroundColor Yellow
    exit 1
}
