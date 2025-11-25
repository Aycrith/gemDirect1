# Pipeline Quality Control Script
# Validates that the E2E pipeline uses dynamically generated content, not workflow defaults
# Run AFTER run-comfyui-e2e.ps1 completes

param(
    [Parameter(Mandatory=$true)]
    [string]$RunDir
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PIPELINE QUALITY CONTROL VALIDATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Run Directory: $RunDir`n" -ForegroundColor White

if (-not (Test-Path $RunDir)) {
    Write-Host "✗ Run directory not found: $RunDir" -ForegroundColor Red
    exit 1
}

$qcResults = @{
    Passed = 0
    Failed = 0
    Warnings = 0
    Tests = @()
}

function Add-QCTest {
    param($Name, $Status, $Message, $Details = "")
    $qcResults.Tests += [PSCustomObject]@{
        Name = $Name
        Status = $Status
        Message = $Message
        Details = $Details
    }
    if ($Status -eq "PASS") { $qcResults.Passed++ }
    elseif ($Status -eq "FAIL") { $qcResults.Failed++ }
    elseif ($Status -eq "WARN") { $qcResults.Warnings++ }
}

# QC Test 1: Verify story.json exists and contains content
Write-Host "[QC 1] Validating Story Generation..." -ForegroundColor Yellow
$storyPath = Join-Path $RunDir "story\story.json"
if (Test-Path $storyPath) {
    $story = Get-Content $storyPath -Raw | ConvertFrom-Json
    $storyText = $story | ConvertTo-Json -Depth 10
    
    # Check story has substantial content
    if ($story.storyBible.Length -gt 500) {
        Write-Host "  ✓ Story bible has substantial content ($($story.storyBible.Length) chars)" -ForegroundColor Green
        Add-QCTest "Story Bible Content" "PASS" "Story bible contains $($story.storyBible.Length) characters"
    } else {
        Write-Host "  ✗ Story bible too short ($($story.storyBible.Length) chars)" -ForegroundColor Red
        Add-QCTest "Story Bible Content" "FAIL" "Story bible only $($story.storyBible.Length) characters"
    }
    
    # Check scenes have unique prompts
    $scenePrompts = $story.scenes | ForEach-Object { $_.humanReadablePrompt }
    $uniquePrompts = $scenePrompts | Select-Object -Unique
    if ($uniquePrompts.Count -eq $scenePrompts.Count) {
        Write-Host "  ✓ All scene prompts are unique ($($scenePrompts.Count) scenes)" -ForegroundColor Green
        Add-QCTest "Unique Scene Prompts" "PASS" "All $($scenePrompts.Count) scene prompts are unique"
    } else {
        Write-Host "  ✗ Duplicate scene prompts detected" -ForegroundColor Red
        Add-QCTest "Unique Scene Prompts" "FAIL" "Found duplicate prompts"
    }
    
} else {
    Write-Host "  ✗ Story file not found" -ForegroundColor Red
    Add-QCTest "Story File Exists" "FAIL" "story.json not found at $storyPath"
}

# QC Test 2: Verify prompts are NOT workflow defaults
Write-Host "`n[QC 2] Checking for Workflow Default Prompts..." -ForegroundColor Yellow
$workflowDefaults = @(
    "Low contrast. In a retro 1970s-style subway station",
    "street musician plays in dim colors",
    "example.png",
    "You are an assistant designed to generate"
)

$foundDefaults = @()
foreach ($default in $workflowDefaults) {
    if ($storyText -match [regex]::Escape($default)) {
        $foundDefaults += $default
        Write-Host "  ✗ Found workflow default: '$($default.Substring(0, [Math]::Min(50, $default.Length)))...'" -ForegroundColor Red
    }
}

if ($foundDefaults.Count -eq 0) {
    Write-Host "  ✓ No workflow defaults found in story" -ForegroundColor Green
    Add-QCTest "No Workflow Defaults" "PASS" "Story content is dynamically generated"
} else {
    Write-Host "  ✗ CRITICAL: Story contains workflow defaults" -ForegroundColor Red
    Add-QCTest "No Workflow Defaults" "FAIL" "Found $($foundDefaults.Count) workflow default strings in story"
}

# QC Test 3: Verify keyframes exist and are unique
Write-Host "`n[QC 3] Validating Keyframe Generation..." -ForegroundColor Yellow
$keyframeDir = Join-Path $RunDir "story\keyframes"
if (Test-Path $keyframeDir) {
    $keyframes = Get-ChildItem "$keyframeDir\*.png" -ErrorAction SilentlyContinue
    
    if ($keyframes.Count -gt 0) {
        Write-Host "  ✓ Found $($keyframes.Count) keyframe(s)" -ForegroundColor Green
        Add-QCTest "Keyframes Generated" "PASS" "$($keyframes.Count) keyframes found"
        
        # Check uniqueness via file hash
        $hashes = @{}
        $duplicates = @()
        foreach ($kf in $keyframes) {
            $hash = (Get-FileHash $kf.FullName -Algorithm MD5).Hash
            if ($hashes.ContainsKey($hash)) {
                $duplicates += $kf.Name
            } else {
                $hashes[$hash] = $kf.Name
            }
        }
        
        if ($duplicates.Count -eq 0) {
            Write-Host "  ✓ All keyframes are unique" -ForegroundColor Green
            Add-QCTest "Keyframe Uniqueness" "PASS" "All keyframes have unique content"
        } else {
            Write-Host "  ✗ Duplicate keyframes detected: $($duplicates -join ', ')" -ForegroundColor Red
            Add-QCTest "Keyframe Uniqueness" "FAIL" "Found $($duplicates.Count) duplicate keyframes"
        }
        
        # Check file sizes are reasonable
        $avgSize = ($keyframes | Measure-Object -Property Length -Average).Average / 1KB
        if ($avgSize -gt 500) {
            Write-Host "  ✓ Average keyframe size: $([Math]::Round($avgSize, 2)) KB" -ForegroundColor Green
            Add-QCTest "Keyframe File Size" "PASS" "Average size $([Math]::Round($avgSize, 2)) KB (good quality)"
        } else {
            Write-Host "  ⚠ Average keyframe size unusually small: $([Math]::Round($avgSize, 2)) KB" -ForegroundColor Yellow
            Add-QCTest "Keyframe File Size" "WARN" "Average size $([Math]::Round($avgSize, 2)) KB (may be low quality)"
        }
        
    } else {
        Write-Host "  ✗ No keyframes found" -ForegroundColor Red
        Add-QCTest "Keyframes Generated" "FAIL" "No PNG files in keyframes directory"
    }
} else {
    Write-Host "  ✗ Keyframes directory not found" -ForegroundColor Red
    Add-QCTest "Keyframes Directory" "FAIL" "Directory not found: $keyframeDir"
}

# QC Test 4: Verify videos exist and have correct specifications
Write-Host "`n[QC 4] Validating Video Generation..." -ForegroundColor Yellow
$videoDir = Join-Path $RunDir "video"
if (Test-Path $videoDir) {
    $videos = Get-ChildItem "$videoDir\*\*.mp4" -Recurse -ErrorAction SilentlyContinue
    
    if ($videos.Count -gt 0) {
        Write-Host "  ✓ Found $($videos.Count) video(s)" -ForegroundColor Green
        Add-QCTest "Videos Generated" "PASS" "$($videos.Count) videos found"
        
        # Validate video specifications
        $specIssues = @()
        foreach ($video in $videos) {
            $sceneId = $video.Directory.Name
            
            # Use ffprobe to check specs
            $ffprobe = & ffprobe -v error -select_streams v:0 `
                -show_entries stream=width,height,r_frame_rate,duration `
                -of default=noprint_wrappers=1 $video.FullName 2>&1 | Out-String
            
            $fps = if ($ffprobe -match 'r_frame_rate=(\d+)/(\d+)') { 
                [int]$matches[1] / [int]$matches[2] 
            } else { 0 }
            
            $duration = if ($ffprobe -match 'duration=([\d.]+)') { 
                [decimal]$matches[1] 
            } else { 0 }
            
            $durationRounded = [Math]::Round($duration, 2)
            Write-Host "    ${sceneId}: $fps fps, ${durationRounded}s" -ForegroundColor Cyan
            
            # Check against expected specs (24 fps, ~2 seconds)
            if ($fps -ne 24) {
                $specIssues += "$sceneId has $fps fps (expected 24)"
            }
            if ($duration -lt 1.5 -or $duration -gt 3.0) {
                $durationRounded2 = [Math]::Round($duration, 2)
                $specIssues += "$sceneId has ${durationRounded2}s duration (expected 1.5-3.0s)"
            }
        }
        
        if ($specIssues.Count -eq 0) {
            Write-Host "  ✓ All videos match expected specifications" -ForegroundColor Green
            Add-QCTest "Video Specifications" "PASS" "All videos: 24 fps, 1.5-3.0s duration"
        } else {
            Write-Host "  ✗ Specification issues:" -ForegroundColor Red
            $specIssues | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
            Add-QCTest "Video Specifications" "FAIL" "$($specIssues.Count) spec issues found"
        }
        
    } else {
        Write-Host "  ✗ No videos found" -ForegroundColor Red
        Add-QCTest "Videos Generated" "FAIL" "No MP4 files in video directory"
    }
} else {
    Write-Host "  ✗ Video directory not found" -ForegroundColor Red
    Add-QCTest "Video Directory" "FAIL" "Directory not found: $videoDir"
}

# QC Test 5: Verify video-keyframe correlation (timing)
Write-Host "`n[QC 5] Validating Video-Keyframe Correlation..." -ForegroundColor Yellow
if ($keyframes.Count -gt 0 -and $videos.Count -gt 0) {
    $correlationIssues = @()
    
    foreach ($video in $videos) {
        $sceneId = $video.Directory.Name
        $keyframe = Get-Item "$keyframeDir\$sceneId.png" -ErrorAction SilentlyContinue
        
        if ($keyframe) {
            $timeDiff = ($video.CreationTime - $keyframe.CreationTime).TotalMinutes
            
            if ($timeDiff -lt 0) {
                $correlationIssues += "${sceneId}: Video created BEFORE keyframe"
            } elseif ($timeDiff -gt 15) {
                $timeDiffRounded = [Math]::Round($timeDiff, 1)
                $correlationIssues += "${sceneId}: Video created >15 min after keyframe ($timeDiffRounded min)"
            } else {
                $timeDiffRounded = [Math]::Round($timeDiff, 1)
                Write-Host "  ✓ ${sceneId}: Video created $timeDiffRounded min after keyframe" -ForegroundColor Green
            }
        } else {
            $correlationIssues += "${sceneId}: Keyframe not found"
        }
    }
    
    if ($correlationIssues.Count -eq 0) {
        Add-QCTest "Video-Keyframe Timing" "PASS" "All videos created after corresponding keyframes"
    } else {
        Write-Host "  ✗ Correlation issues:" -ForegroundColor Red
        $correlationIssues | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
        Add-QCTest "Video-Keyframe Timing" "FAIL" "$($correlationIssues.Count) timing issues"
    }
}

# QC Test 6: Verify prompts were actually used (not hardcoded workflow values)
Write-Host "`n[QC 6] Validating Dynamic Prompt Usage..." -ForegroundColor Yellow
if ($story) {
    $promptsUsed = $true
    
    # Check if story prompts contain the ComfyUI workflow default prompt
    $workflowDefault = "Low contrast. In a retro 1970s-style subway station"
    $hasWorkflowDefault = $story.scenes | Where-Object { 
        $_.humanReadablePrompt -like "*$workflowDefault*" 
    }
    
    if ($hasWorkflowDefault) {
        Write-Host "  ✗ CRITICAL: Story contains exact workflow default prompt" -ForegroundColor Red
        Write-Host "    This indicates the pipeline is NOT using dynamically generated prompts" -ForegroundColor Red
        Add-QCTest "Dynamic Prompt Usage" "FAIL" "Story contains workflow default prompts"
    } else {
        Write-Host "  ✓ Story prompts appear to be dynamically generated" -ForegroundColor Green
        Add-QCTest "Dynamic Prompt Usage" "PASS" "No workflow defaults detected in prompts"
    }
    
    # Sample a scene prompt to display
    if ($story.scenes.Count -gt 0) {
        $samplePrompt = $story.scenes[0].humanReadablePrompt
        Write-Host "`n  Sample Scene Prompt:" -ForegroundColor Cyan
        Write-Host "  $($samplePrompt.Substring(0, [Math]::Min(120, $samplePrompt.Length)))..." -ForegroundColor Gray
    }
}

# Final Report
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "QUALITY CONTROL SUMMARY" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$qcResults.Tests | ForEach-Object {
    $color = switch ($_.Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "WARN" { "Yellow" }
    }
    $icon = switch ($_.Status) {
        "PASS" { "✓" }
        "FAIL" { "✗" }
        "WARN" { "⚠" }
    }
    Write-Host "$icon [$($_.Status)] $($_.Name): $($_.Message)" -ForegroundColor $color
}

Write-Host "`n----------------------------------------" -ForegroundColor Cyan
Write-Host "Passed:   $($qcResults.Passed)" -ForegroundColor Green
Write-Host "Failed:   $($qcResults.Failed)" -ForegroundColor Red
Write-Host "Warnings: $($qcResults.Warnings)" -ForegroundColor Yellow
Write-Host "Total:    $($qcResults.Tests.Count)" -ForegroundColor White

$passRate = [Math]::Round(($qcResults.Passed / $qcResults.Tests.Count) * 100, 1)
Write-Host "`nPass Rate: $passRate%" -ForegroundColor $(if ($passRate -ge 90) { "Green" } elseif ($passRate -ge 70) { "Yellow" } else { "Red" })

# Conclusion
Write-Host "`n========================================" -ForegroundColor Cyan
if ($qcResults.Failed -eq 0 -and $passRate -ge 90) {
    Write-Host "✓ PIPELINE QUALITY VALIDATION PASSED" -ForegroundColor Green
    Write-Host "`nThe pipeline is correctly using:" -ForegroundColor White
    Write-Host "  • Dynamically generated story content" -ForegroundColor Green
    Write-Host "  • Unique keyframes from AI generation" -ForegroundColor Green
    Write-Host "  • Videos created from generated keyframes" -ForegroundColor Green
    Write-Host "  • Proper 24 fps / ~2 second specifications" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ PIPELINE QUALITY VALIDATION FAILED" -ForegroundColor Red
    Write-Host "`nIssues detected:" -ForegroundColor White
    if ($qcResults.Failed -gt 0) {
        Write-Host "  • $($qcResults.Failed) test(s) failed" -ForegroundColor Red
    }
    if ($passRate -lt 90) {
        Write-Host "  • Pass rate below 90% threshold" -ForegroundColor Red
    }
    Write-Host "`nReview the test details above for specific failures." -ForegroundColor Yellow
    exit 1
}
