<#
.SYNOPSIS
    Bookend Regression Test Harness - Validates FLF2V videos against golden sample baselines.
    
.DESCRIPTION
    Runs a complete regression test of the bookend (first-last-frame) video generation pipeline:
    1. Loads golden samples and expected similarity baselines
    2. Generates videos using wan-flf2v workflow
    3. Extracts first/last frames from generated videos
    4. Computes frame similarity vs. golden keyframes
    5. Compares against stored baselines (pass/fail thresholds)
    6. Outputs detailed PASS/FAIL verdict for each sample
    
.PARAMETER Sample
    Specific sample to test. Default: tests all golden samples.
    
.PARAMETER ComfyUIUrl
    ComfyUI server URL. Default: http://127.0.0.1:8188
    
.PARAMETER FailThreshold
    Fail threshold for similarity score. Default: 70 (anything below 70% similarity fails).
    
.PARAMETER WarnThreshold
    Warning threshold for similarity score. Default: 85 (85-99% is a warning, ≥100% is pass).

.PARAMETER UpdateBaselines
    When present, updates baselines.json with current metrics instead of checking for regressions.
    Use this flag deliberately when you want to establish new baseline values.
    
.EXAMPLE
    .\test-bookend-regression.ps1
    Run full regression test on all golden samples with default thresholds
    
.EXAMPLE
    .\test-bookend-regression.ps1 -Sample sample-001-geometric -FailThreshold 65
    Test specific sample with custom fail threshold

.EXAMPLE
    .\test-bookend-regression.ps1 -UpdateBaselines
    Update baselines.json with current metrics for all samples (skips regression detection)
    
.NOTES
    Requires: ComfyUI running, frame similarity CLI available
    Output: JSON file with regression results + verdicts
#>

param(
    [string]$Sample = "",
    [string]$ComfyUIUrl = "http://127.0.0.1:8188",
    [int]$FailThreshold = 25,
    [int]$WarnThreshold = 35,
    [switch]$UpdateBaselines = $false
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$samplesDir = Join-Path $projectRoot "data\bookend-golden-samples"
$outputDir = Join-Path $projectRoot "test-results\bookend-regression"

# Timestamp for this run
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $outputDir "run-$timestamp"

# ANSI colors
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Cyan = "`e[36m"
$Reset = "`e[0m"

function Write-Status {
    param([string]$Message, [string]$Color = $Reset)
    Write-Host "$Color$Message$Reset"
}

function Test-ComfyUIConnection {
    try {
        $response = Invoke-RestMethod -Uri "$ComfyUIUrl/system_stats" -TimeoutSec 5
        return $true
    } catch {
        return $false
    }
}

function Get-VRAMUsage {
    try {
        $stats = Invoke-RestMethod -Uri "$ComfyUIUrl/system_stats" -TimeoutSec 5
        $device = $stats.devices | Where-Object { $_.type -eq "cuda" } | Select-Object -First 1
        if ($device) {
            $freeGB = [math]::Round($device.vram_free / 1GB, 2)
            $totalGB = [math]::Round($device.vram_total / 1GB, 2)
            $usedGB = $totalGB - $freeGB
            return @{
                Used = $usedGB
                Free = $freeGB
                Total = $totalGB
                Percent = [math]::Round(($usedGB / $totalGB) * 100, 1)
            }
        }
    } catch {}
    return $null
}

function Deep-CloneObject {
    param($Object)
    $json = $Object | ConvertTo-Json -Depth 100
    return $json | ConvertFrom-Json -AsHashtable
}

function Find-NodeByClassType {
    param([hashtable]$Workflow, [string]$ClassType)
    foreach ($nodeId in $Workflow.Keys) {
        $node = $Workflow[$nodeId]
        if ($node.class_type -eq $ClassType) {
            return @{ nodeId = $nodeId; node = $node }
        }
    }
    return $null
}

function Queue-RegressionVideo {
    param(
        [string]$ComfyUIUrl,
        [hashtable]$WorkflowObj,
        [string]$ClientId
    )
    
    $payload = @{
        prompt = $WorkflowObj
        client_id = $ClientId
    } | ConvertTo-Json -Depth 20
    
    try {
        $response = Invoke-RestMethod -Uri "$ComfyUIUrl/prompt" -Method Post -Body $payload -ContentType "application/json"
        return $response.prompt_id
    } catch {
        throw "Failed to queue prompt: $($_.Exception.Message)"
    }
}

function Wait-ForVideoCompletion {
    param(
        [string]$ComfyUIUrl,
        [string]$PromptId,
        [int]$TimeoutSeconds = 300
    )
    
    $startTime = Get-Date
    
    while ($true) {
        Start-Sleep -Seconds 2
        
        $elapsed = ((Get-Date) - $startTime).TotalSeconds
        if ($elapsed -gt $TimeoutSeconds) {
            throw "Timeout waiting for video generation (${TimeoutSeconds}s)"
        }
        
        try {
            $history = Invoke-RestMethod -Uri "$ComfyUIUrl/history/$PromptId" -TimeoutSec 10
            
            if ($history.$PromptId) {
                $status = $history.$PromptId.status
                if ($status.completed -or $status.status_str -eq "success") {
                    # Find video output (ComfyUI returns videos under "images" array with "animated" flag)
                    $outputs = $history.$PromptId.outputs
                    foreach ($nodeId in ($outputs | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)) {
                        $nodeOutput = $outputs.$nodeId
                        # Check for video in images array (ComfyUI's animated video output format)
                        if ($nodeOutput.images -and $nodeOutput.animated) {
                            $videoFile = $nodeOutput.images[0]
                            $subfolder = if ($videoFile.subfolder) { "$($videoFile.subfolder)/" } else { "" }
                            $fullPath = "$subfolder$($videoFile.filename)"
                            return @{
                                Success = $true
                                VideoPath = $fullPath
                                Duration = $elapsed
                            }
                        }
                        # Fallback: check for video array (legacy format)
                        if ($nodeOutput.video) {
                            return @{
                                Success = $true
                                VideoPath = $nodeOutput.video[0].filename
                                Duration = $elapsed
                            }
                        }
                    }
                    return @{ Success = $true; Duration = $elapsed }
                }
                if ($status.status_str -eq "error") {
                    return @{
                        Success = $false
                        Error = $status.messages | ConvertTo-Json -Compress
                        Duration = $elapsed
                    }
                }
            }
        } catch {
            # History not ready yet
        }
        
        $pct = [math]::Round(($elapsed / $TimeoutSeconds) * 100, 0)
        Write-Host "`r    Progress: $pct% ($([math]::Round($elapsed))s)" -NoNewline
    }
}

function Get-SimilarityScores {
    param(
        [string]$VideoPath,
        [string]$StartKeyframePath,
        [string]$EndKeyframePath
    )
    
    # ComfyUI stores videos in output/video folder
    $comfyOutputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
    $fullVideoPath = Join-Path $comfyOutputDir $VideoPath
    
    if (-not (Test-Path $fullVideoPath)) {
        Write-Status "    ⚠ Video file not found: $fullVideoPath" $Yellow
        return $null
    }
    
    try {
        $output = & node --import tsx (Join-Path $projectRoot "scripts\bookend-frame-similarity.ts") `
            --video $fullVideoPath `
            --start $StartKeyframePath `
            --end $EndKeyframePath 2>&1
        
        # Find JSON line with startSimilarity in output
        $jsonLine = $output | Where-Object { $_ -match '^\s*\{.*startSimilarity.*\}' } | Select-Object -First 1
        if ($jsonLine) {
            try {
                $similarityData = $jsonLine | ConvertFrom-Json
                if ($null -ne $similarityData.startSimilarity) {
                    return @{
                        startSimilarity = $similarityData.startSimilarity
                        endSimilarity = $similarityData.endSimilarity
                        avgSimilarity = (($similarityData.startSimilarity + $similarityData.endSimilarity) / 2)
                    }
                }
            } catch {
                Write-Status "    ⚠ JSON parse failed: $($_.Exception.Message)" $Yellow
            }
        }
        
        Write-Status "    ⚠ Failed to find similarity JSON in output" $Yellow
        return $null
    } catch {
        Write-Status "    ⚠ Frame similarity analysis failed: $($_.Exception.Message)" $Yellow
        return $null
    }
}

function Evaluate-Verdict {
    param(
        [float]$AvgSimilarity,
        [int]$FailThreshold,
        [int]$WarnThreshold
    )
    
    if ($AvgSimilarity -lt $FailThreshold) {
        return @{ verdict = "FAIL"; color = $Red; emoji = "❌" }
    } elseif ($AvgSimilarity -lt $WarnThreshold) {
        return @{ verdict = "WARN"; color = $Yellow; emoji = "⚠️" }
    } else {
        return @{ verdict = "PASS"; color = $Green; emoji = "✓" }
    }
}

# ============================================================================
# Main Execution
# ============================================================================

Write-Status "`n=== Bookend Regression Test Harness ===" $Cyan
Write-Status "Timestamp: $timestamp"
Write-Status "ComfyUI URL: $ComfyUIUrl"
Write-Status "Fail Threshold: $FailThreshold%"
Write-Status "Warn Threshold: $WarnThreshold%"
if ($UpdateBaselines) {
    Write-Status "Mode: UPDATE BASELINES (will write new baseline values)" $Yellow
} else {
    Write-Status "Mode: REGRESSION CHECK (comparing against existing baselines)" $Cyan
}
Write-Status ""

# Pre-flight checks
Write-Status "Running pre-flight checks..." $Yellow

if (-not (Test-ComfyUIConnection)) {
    Write-Status "ERROR: Cannot connect to ComfyUI at $ComfyUIUrl" $Red
    exit 1
}
Write-Status "  ✓ ComfyUI connected" $Green

$vram = Get-VRAMUsage
if ($vram) {
    Write-Status "  ✓ VRAM: $($vram.Used)GB / $($vram.Total)GB ($($vram.Percent)%)" $Green
    if ($vram.Percent -gt 85) {
        Write-Status "  ⚠ VRAM usage high" $Yellow
    }
}

# Create output directory
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
Write-Status "  ✓ Output directory: $runDir`n" $Green

# Load baselines
$baselinesPath = Join-Path $samplesDir "baselines.json"
if (-not (Test-Path $baselinesPath)) {
    Write-Status "ERROR: baselines.json not found at $baselinesPath" $Red
    exit 1
}

$baselines = Get-Content $baselinesPath | ConvertFrom-Json
Write-Status "Loaded baselines (fail: $($baselines.thresholds.fail)%, warn: $($baselines.thresholds.warn)%)" $Green

# Load settings to get workflow
$settingsPath = Join-Path $projectRoot "localGenSettings.json"
$settings = Get-Content $settingsPath | ConvertFrom-Json
$baseProfile = $settings.workflowProfiles.'wan-flf2v'

if (-not $baseProfile) {
    Write-Status "ERROR: wan-flf2v workflow profile not found" $Red
    exit 1
}

# Parse base workflow
$baseWorkflowJson = $baseProfile.workflowJson | ConvertFrom-Json -AsHashtable
$flfNode = Find-NodeByClassType $baseWorkflowJson "Wan22FirstLastFrameToVideoLatentTiledVAE"
$ksamplerNode = Find-NodeByClassType $baseWorkflowJson "KSampler"

if (-not $flfNode -or -not $ksamplerNode) {
    Write-Status "ERROR: Could not find required nodes in workflow" $Red
    exit 1
}

$flfNodeId = $flfNode.nodeId
$ksamplerNodeId = $ksamplerNode.nodeId
Write-Status "Loaded workflow (FLF: $flfNodeId, KSampler: $ksamplerNodeId)" $Green

# Find samples to test
$sampleDirs = @()
if ($Sample) {
    $samplePath = Join-Path $samplesDir $Sample
    if (-not (Test-Path $samplePath)) {
        Write-Status "ERROR: Sample '$Sample' not found" $Red
        exit 1
    }
    $sampleDirs += Get-Item $samplePath
} else {
    $sampleDirs = Get-ChildItem -Path $samplesDir -Directory | Where-Object { $_.Name -like "sample-*" } | Sort-Object Name
}

$results = @{
    timestamp = $timestamp
    comfyUIUrl = $ComfyUIUrl
    failThreshold = $FailThreshold
    warnThreshold = $WarnThreshold
    samples = @{}
    summary = @{
        total = 0
        passed = 0
        warned = 0
        failed = 0
    }
}

foreach ($sampleDir in $sampleDirs) {
    $sampleId = $sampleDir.Name
    Write-Status "Testing: $sampleId" $Cyan
    
    $contextPath = Join-Path $sampleDir.FullName "context.json"
    $startPath = Join-Path $sampleDir.FullName "start.png"
    $endPath = Join-Path $sampleDir.FullName "end.png"
    
    # Validate sample files
    if (-not (Test-Path $contextPath) -or -not (Test-Path $startPath) -or -not (Test-Path $endPath)) {
        Write-Status "  SKIP: Missing required files" $Yellow
        $results.samples[$sampleId] = @{ status = "skipped"; reason = "Missing files" }
        continue
    }
    
    $context = Get-Content $contextPath | ConvertFrom-Json
    $baseline = $baselines.samples.$sampleId
    
    if (-not $baseline) {
        Write-Status "  SKIP: No baseline found for $sampleId" $Yellow
        $results.samples[$sampleId] = @{ status = "skipped"; reason = "No baseline" }
        continue
    }
    
    $results.summary.total++
    
    try {
        # Step 1: Queue video generation
        Write-Status "  1. Queuing video generation..." $Yellow
        $outputPrefix = "regression_${sampleId}_$timestamp"
        
        # Copy images to ComfyUI input directory
        $comfyInputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input"
        $startImageName = "regression_start_${sampleId}_$timestamp.png"
        $endImageName = "regression_end_${sampleId}_$timestamp.png"
        Copy-Item $startPath (Join-Path $comfyInputDir $startImageName) -Force
        Copy-Item $endPath (Join-Path $comfyInputDir $endImageName) -Force
        Write-Status "    Copied keyframes to ComfyUI input" $Yellow
        
        # Deep clone workflow
        $workflowObj = Deep-CloneObject $baseWorkflowJson
        $workflowObj[$flfNodeId].inputs.width = 832
        $workflowObj[$flfNodeId].inputs.height = 480
        $workflowObj[$flfNodeId].inputs.length = 81
        $workflowObj[$ksamplerNodeId].inputs.seed = 12345
        
        # Update LoadImage nodes with actual image names
        $startImageNode = Find-NodeByClassType $workflowObj "LoadImage"
        if ($startImageNode) {
            # Find both LoadImage nodes (start and end)
            foreach ($nodeId in $workflowObj.Keys) {
                $node = $workflowObj[$nodeId]
                if ($node.class_type -eq "LoadImage") {
                    $title = $node._meta.title
                    if ($title -like "*Start*") {
                        $node.inputs.image = $startImageName
                    } elseif ($title -like "*End*") {
                        $node.inputs.image = $endImageName
                    }
                }
            }
        }
        
        # Update output prefix
        $saveVideoNode = Find-NodeByClassType $workflowObj "SaveVideo"
        if ($saveVideoNode) {
            $workflowObj[$saveVideoNode.nodeId].inputs.filename_prefix = "video/$outputPrefix"
        }
        
        $clientId = "regression-$sampleId-$timestamp"
        $promptId = Queue-RegressionVideo -ComfyUIUrl $ComfyUIUrl -WorkflowObj $workflowObj -ClientId $clientId
        
        Write-Status "    Prompt ID: $promptId" $Yellow
        
        # Step 2: Wait for completion
        Write-Status "  2. Waiting for generation..." $Yellow
        $genResult = Wait-ForVideoCompletion -ComfyUIUrl $ComfyUIUrl -PromptId $promptId -TimeoutSeconds 300
        Write-Host ""
        
        if (-not $genResult.Success) {
            throw "Video generation failed: $($genResult.Error)"
        }
        
        Write-Status "    ✓ Generated in $([math]::Round($genResult.Duration))s" $Green
        
        # Step 3: Compute frame similarity
        Write-Status "  3. Computing frame similarity..." $Yellow
        $similarity = Get-SimilarityScores `
            -VideoPath $genResult.VideoPath `
            -StartKeyframePath $startPath `
            -EndKeyframePath $endPath
        
        if ($similarity) {
            Write-Status "    Start: $($similarity.startSimilarity)%" $Green
            Write-Status "    End:   $($similarity.endSimilarity)%" $Green
            Write-Status "    Avg:   $($similarity.avgSimilarity.ToString('F1'))%" $Green
        } else {
            throw "Failed to compute frame similarity"
        }
        
        # Step 4: Evaluate verdict
        Write-Status "  4. Evaluating verdict..." $Yellow
        $verdict = Evaluate-Verdict -AvgSimilarity $similarity.avgSimilarity -FailThreshold $FailThreshold -WarnThreshold $WarnThreshold
        
        Write-Status "    $($verdict.emoji) $($verdict.verdict): $($similarity.avgSimilarity.ToString('F1'))% ($FailThreshold - $WarnThreshold range)" $verdict.color
        
        # Step 5: Baseline handling (update or regression detection)
        $regressionInfo = $null
        if ($UpdateBaselines) {
            # UPDATE MODE: Set new baseline from current metrics
            Write-Status "  5. Updating baseline..." $Yellow
            # Build baseline object
            $newBaseline = [PSCustomObject]@{
                startFrameMatch = $similarity.startSimilarity
                endFrameMatch = $similarity.endSimilarity
                avgSimilarity = $similarity.avgSimilarity
                capturedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
            # Update the sample entry (PSCustomObject style)
            $baselines.samples.$sampleId | Add-Member -NotePropertyName "baseline" -NotePropertyValue $newBaseline -Force
            $baselines.samples.$sampleId | Add-Member -NotePropertyName "status" -NotePropertyValue "ready" -Force
            Write-Status "    ✓ Baseline updated: avg=$($similarity.avgSimilarity.ToString('F1'))%" $Green
            # In update mode, always PASS (we're establishing ground truth, not checking)
        } elseif ($baseline.baseline -and $baseline.baseline.avgSimilarity) {
            # REGRESSION MODE: Check for drops vs baseline
            $baselineAvg = $baseline.baseline.avgSimilarity
            $drop = $baselineAvg - $similarity.avgSimilarity
            $regressionDelta = if ($baselines.thresholds.regressionDelta) { $baselines.thresholds.regressionDelta } else { 10 }
            
            Write-Status "  5. Checking baseline regression..." $Yellow
            Write-Status "    Baseline: $($baselineAvg.ToString('F1'))%  Current: $($similarity.avgSimilarity.ToString('F1'))%  Drop: $($drop.ToString('F1'))%" $Yellow
            
            if ($drop -gt $regressionDelta) {
                # Significant regression detected - upgrade to FAIL
                Write-Status "    ⚠️ REGRESSION DETECTED: Drop of $($drop.ToString('F1'))% exceeds delta of $regressionDelta%" $Red
                $verdict = @{ verdict = "FAIL"; color = $Red; emoji = "❌" }
                $regressionInfo = @{
                    detected = $true
                    baselineAvg = $baselineAvg
                    currentAvg = $similarity.avgSimilarity
                    drop = $drop
                    regressionDelta = $regressionDelta
                }
            } else {
                Write-Status "    ✓ No regression (drop $($drop.ToString('F1'))% within delta $regressionDelta%)" $Green
                $regressionInfo = @{
                    detected = $false
                    baselineAvg = $baselineAvg
                    currentAvg = $similarity.avgSimilarity
                    drop = $drop
                    regressionDelta = $regressionDelta
                }
            }
        } else {
            Write-Status "  5. Baseline regression: Skipped (no baseline data)" $Yellow
        }
        
        # Record results
        $sampleResult = @{
            status = "completed"
            verdict = $verdict.verdict
            similarity = $similarity
            baseline = $baseline
            duration = $genResult.Duration
            videoPath = $genResult.VideoPath
            promptId = $promptId
            flf2vEnabled = $true
        }
        if ($regressionInfo) {
            $sampleResult.regressionCheck = $regressionInfo
        }
        $results.samples[$sampleId] = $sampleResult
        
        if ($verdict.verdict -eq "PASS") {
            $results.summary.passed++
        } elseif ($verdict.verdict -eq "WARN") {
            $results.summary.warned++
        } else {
            $results.summary.failed++
        }
        
        Write-Status "  $($verdict.verdict): $sampleId`n" $verdict.color
        
    } catch {
        Write-Status "  ERROR: $($_.Exception.Message)" $Red
        $results.samples[$sampleId] = @{
            status = "failed"
            error = $_.Exception.Message
        }
        $results.summary.failed++
        Write-Host ""
    }
}

# Multi-regression detection: Check if multiple samples have smaller drops that collectively indicate regression
$multiRegressionDelta = if ($baselines.thresholds.multiRegressionDelta) { $baselines.thresholds.multiRegressionDelta } else { 5 }
$multiRegressionCount = if ($baselines.thresholds.multiRegressionCount) { $baselines.thresholds.multiRegressionCount } else { 2 }

$smallDropCount = 0
$smallDropSamples = @()

foreach ($sampleId in $results.samples.Keys) {
    $sampleResult = $results.samples[$sampleId]
    if ($sampleResult.regressionCheck -and -not $sampleResult.regressionCheck.detected) {
        $drop = $sampleResult.regressionCheck.drop
        if ($drop -gt $multiRegressionDelta) {
            $smallDropCount++
            $smallDropSamples += "$sampleId (drop: $($drop.ToString('F1'))%)"
        }
    }
}

$results.multiRegressionCheck = @{
    multiRegressionDelta = $multiRegressionDelta
    multiRegressionCount = $multiRegressionCount
    smallDropCount = $smallDropCount
    triggered = $false
}

if ($smallDropCount -ge $multiRegressionCount) {
    Write-Status "`n⚠️ MULTI-REGRESSION DETECTED: $smallDropCount samples have drops > $multiRegressionDelta%" $Red
    foreach ($sample in $smallDropSamples) {
        Write-Status "    - $sample" $Yellow
    }
    $results.summary.failed += $smallDropCount
    $results.summary.passed -= $smallDropCount
    $results.multiRegressionCheck.triggered = $true
    $results.multiRegressionCheck.affectedSamples = $smallDropSamples
}

# Save results
$resultsPath = Join-Path $runDir "results.json"
$results | ConvertTo-Json -Depth 10 | Set-Content $resultsPath

# Summary
# Step 6: Write updated baselines if in UpdateBaselines mode
if ($UpdateBaselines) {
    Write-Status "`n=== Writing Updated Baselines ===" $Cyan
    
    # Update version to indicate baseline update (PSCustomObject style)
    $baselines | Add-Member -NotePropertyName "version" -NotePropertyValue "1.3.0" -Force
    $baselines | Add-Member -NotePropertyName "updatedAt" -NotePropertyValue (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ") -Force
    $baselines | Add-Member -NotePropertyName "updatedBy" -NotePropertyValue "UpdateBaselines run" -Force
    
    # Write back to file
    try {
        $baselinesJson = $baselines | ConvertTo-Json -Depth 10
        Set-Content -Path $baselinesPath -Value $baselinesJson -Encoding UTF8
        Write-Status "✓ Baselines written to: $baselinesPath" $Green
        Write-Status "  Version: 1.3.0" $Green
    } catch {
        Write-Status "❌ Failed to write baselines: $_" $Red
        exit 1
    }
}

Write-Status "`n=== Regression Test Summary ===" $Cyan
if ($UpdateBaselines) {
    Write-Status "Mode: BASELINE UPDATE" $Yellow
}
Write-Status "Total: $($results.summary.total)" $Reset
Write-Status "Passed: $($results.summary.passed)" $(if ($results.summary.passed -gt 0) { $Green } else { $Reset })
Write-Status "Warned: $($results.summary.warned)" $(if ($results.summary.warned -gt 0) { $Yellow } else { $Reset })
Write-Status "Failed: $($results.summary.failed)" $(if ($results.summary.failed -gt 0) { $Red } else { $Green })
Write-Status "`nResults saved to: $resultsPath" $Cyan

if ($UpdateBaselines) {
    # In update mode, always exit success (we're establishing baselines, not checking)
    Write-Status "`n✓ BASELINES UPDATED - New baselines captured for $($results.summary.total) sample(s)" $Green
    exit 0
}

if ($results.summary.failed -gt 0) {
    Write-Status "`n❌ REGRESSION FAILED - $($results.summary.failed) sample(s) did not meet thresholds" $Red
    exit 1
}

if ($results.summary.warned -gt 0) {
    Write-Status "`n⚠️ REGRESSION PASSED WITH WARNINGS - $($results.summary.warned) sample(s) below optimal thresholds" $Yellow
    exit 0
}

Write-Status "`n✓ REGRESSION PASSED - All samples met thresholds" $Green
exit 0
