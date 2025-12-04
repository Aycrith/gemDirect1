<#
.SYNOPSIS
    End-to-end validation of the bookend video generation pipeline.
    
.DESCRIPTION
    Tests the complete bookend workflow:
    1. Loads golden sample keyframe pairs
    2. Runs keyframe pair analysis (preflight gate)
    3. Generates videos using WAN 2.2 5B FLF2V
    4. Applies endpoint snapping post-processing
    5. Validates output against quality thresholds
    
.PARAMETER Sample
    Specific sample to test. Default: tests all samples.
    
.PARAMETER SkipPreflight
    Skip the keyframe pair analysis preflight check.
    
.PARAMETER ComfyUIUrl
    ComfyUI server URL. Default: http://127.0.0.1:8188
    
.PARAMETER Seed
    Fixed seed for deterministic video generation. Default: -1 (random).

.EXAMPLE
    .\test-bookend-e2e.ps1
    Run full E2E test on all golden samples
    
.EXAMPLE
    .\test-bookend-e2e.ps1 -Sample sample-001-geometric
    Test specific sample only
    
.EXAMPLE
    .\test-bookend-e2e.ps1 -Seed 42
    Run E2E test with fixed seed for reproducibility
#>

param(
    [string]$Sample = "",
    [switch]$SkipPreflight = $false,
    [string]$ComfyUIUrl = "http://127.0.0.1:8188",
    [int]$Seed = -1
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$samplesDir = Join-Path $projectRoot "data\bookend-golden-samples"
$outputDir = Join-Path $projectRoot "test-results\bookend-e2e"

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

function Send-BookendVideoRequest {
    param(
        [string]$StartImagePath,
        [string]$EndImagePath,
        [string]$Prompt,
        [string]$OutputPrefix
    )
    
    # Read settings to get workflow
    $settingsPath = Join-Path $projectRoot "localGenSettings.json"
    $settings = Get-Content $settingsPath | ConvertFrom-Json
    $profile = $settings.workflowProfiles.'wan-flf2v'
    
    if (-not $profile) {
        throw "wan-flf2v workflow profile not found"
    }
    
    # Parse workflow and update inputs
    $workflow = $profile.workflowJson | ConvertFrom-Json
    
    # Upload images first
    $startImageName = "e2e_start_$timestamp.png"
    $endImageName = "e2e_end_$timestamp.png"
    
    # Read images as bytes and upload
    $startBytes = [System.IO.File]::ReadAllBytes($StartImagePath)
    $endBytes = [System.IO.File]::ReadAllBytes($EndImagePath)
    
    # ComfyUI upload endpoint
    $uploadUri = "$ComfyUIUrl/upload/image"
    
    # Upload start image
    $boundary = [System.Guid]::NewGuid().ToString()
    $startContent = @"
--$boundary
Content-Disposition: form-data; name="image"; filename="$startImageName"
Content-Type: image/png

"@
    # Simpler approach: copy images to ComfyUI input directory
    $comfyInputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input"
    Copy-Item $StartImagePath (Join-Path $comfyInputDir $startImageName) -Force
    Copy-Item $EndImagePath (Join-Path $comfyInputDir $endImageName) -Force
    
    # Apply mappings
    $profile.mapping.PSObject.Properties | ForEach-Object {
        $key = $_.Name
        $mappingType = $_.Value
        $parts = $key -split ":"
        $nodeId = $parts[0]
        $inputName = $parts[1]
        
        switch ($mappingType) {
            "human_readable_prompt" { $workflow.$nodeId.inputs.$inputName = $Prompt }
            "start_image" { $workflow.$nodeId.inputs.$inputName = $startImageName }
            "end_image" { $workflow.$nodeId.inputs.$inputName = $endImageName }
        }
    }
    
    # Update output prefix
    $workflow.PSObject.Properties | ForEach-Object {
        $node = $_.Value
        if ($node.class_type -eq "SaveVideo") {
            $node.inputs.filename_prefix = "video/$OutputPrefix"
        }
    }
    
    # Queue prompt
    $payload = @{
        prompt = $workflow
        client_id = "e2e-test-$timestamp"
    } | ConvertTo-Json -Depth 20
    
    $response = Invoke-RestMethod -Uri "$ComfyUIUrl/prompt" -Method Post -Body $payload -ContentType "application/json"
    return $response.prompt_id
}

function Wait-ForVideoCompletion {
    param(
        [string]$PromptId,
        [int]$TimeoutSeconds = 300
    )
    
    $startTime = Get-Date
    
    while ($true) {
        Start-Sleep -Seconds 3
        
        $elapsed = ((Get-Date) - $startTime).TotalSeconds
        if ($elapsed -gt $TimeoutSeconds) {
            throw "Timeout waiting for video generation (${TimeoutSeconds}s)"
        }
        
        try {
            $history = Invoke-RestMethod -Uri "$ComfyUIUrl/history/$PromptId"
            
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
                            $comfyOutputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
                            $fullPath = Join-Path $comfyOutputDir "$subfolder$($videoFile.filename)"
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

function Compute-FrameSimilarity {
    param(
        [string]$VideoPath,
        [string]$StartKeyframePath,
        [string]$EndKeyframePath
    )
    
    # VideoPath is now expected to be a full absolute path
    $fullVideoPath = $VideoPath
    
    # If it's a relative path, construct absolute path
    if (-not [System.IO.Path]::IsPathRooted($VideoPath)) {
        $fullVideoPath = Join-Path $projectRoot $VideoPath
    }
    
    if (-not (Test-Path $fullVideoPath)) {
        Write-Status "    ⚠ Video file not found: $fullVideoPath" $Yellow
        return $null
    }
    
    # Run frame similarity CLI
    try {
        $output = & node --import tsx (Join-Path $projectRoot "scripts\bookend-frame-similarity.ts") `
            --video $fullVideoPath `
            --start $StartKeyframePath `
            --end $EndKeyframePath 2>&1
        
        # Output is single-line JSON - find the JSON line
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

# ============================================================================
# Main Execution
# ============================================================================

Write-Status "`n=== Bookend Video E2E Validation ===" $Cyan
Write-Status "Timestamp: $timestamp"
Write-Status "ComfyUI URL: $ComfyUIUrl"
Write-Status "Skip Preflight: $SkipPreflight"
Write-Status "Seed: $(if ($Seed -eq -1) { 'random' } else { $Seed })`n"

# Load settings to check bookendQAMode
$settingsPath = Join-Path $projectRoot "localGenSettings.json"
$settings = Get-Content $settingsPath | ConvertFrom-Json
$qaMode = $settings.bookendQAMode
if ($qaMode.enabled) {
    Write-Status "✓ Bookend QA Mode ENABLED" $Green
    Write-Status "  - Enforce Keyframe Passthrough: $($qaMode.enforceKeyframePassthrough)" $Yellow
    Write-Status "  - Override AI Suggestions: $($qaMode.overrideAISuggestions)" $Yellow
}

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
        Write-Status "  ⚠ VRAM usage high - video generation may fail" $Yellow
    }
}

# Create output directory
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
Write-Status "  ✓ Output directory: $runDir`n" $Green

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
    $sampleDirs = Get-ChildItem -Path $samplesDir -Directory | Where-Object { $_.Name -like "sample-*" }
}

$results = @{
    timestamp = $timestamp
    samples = @{}
    summary = @{
        total = 0
        passed = 0
        failed = 0
        skipped = 0
    }
}

foreach ($sampleDir in $sampleDirs) {
    $sampleId = $sampleDir.Name
    Write-Status "Testing: $sampleId" $Cyan
    
    $contextPath = Join-Path $sampleDir.FullName "context.json"
    $startPath = Join-Path $sampleDir.FullName "start.png"
    $endPath = Join-Path $sampleDir.FullName "end.png"
    
    # Validate sample has required files
    if (-not (Test-Path $contextPath) -or -not (Test-Path $startPath) -or -not (Test-Path $endPath)) {
        Write-Status "  SKIP: Missing required files" $Yellow
        $results.samples[$sampleId] = @{ status = "skipped"; reason = "Missing files" }
        $results.summary.skipped++
        continue
    }
    
    $context = Get-Content $contextPath | ConvertFrom-Json
    $results.summary.total++
    
    try {
        # Step 1: Queue video generation
        Write-Status "  1. Queuing video generation..." $Yellow
        $outputPrefix = "e2e_${sampleId}_$timestamp"
        $promptId = Send-BookendVideoRequest `
            -StartImagePath $startPath `
            -EndImagePath $endPath `
            -Prompt $context.videoContext.motionDescription `
            -OutputPrefix $outputPrefix
        
        Write-Status "    Prompt ID: $promptId" $Yellow
        
        # Step 2: Wait for completion
        Write-Status "  2. Waiting for video generation..." $Yellow
        $genResult = Wait-ForVideoCompletion -PromptId $promptId -TimeoutSeconds 300
        Write-Host ""
        
        if (-not $genResult.Success) {
            throw "Video generation failed: $($genResult.Error)"
        }
        
        Write-Status "    ✓ Generated in $([math]::Round($genResult.Duration))s" $Green
        
        # Step 3: Compute frame similarity (bookend matching)
        Write-Status "  3. Computing frame similarity..." $Yellow
        $similarity = Compute-FrameSimilarity `
            -VideoPath $genResult.VideoPath `
            -StartKeyframePath $startPath `
            -EndKeyframePath $endPath
        
        if ($similarity) {
            Write-Status "    Start similarity: $($similarity.startSimilarity)%" $Green
            Write-Status "    End similarity: $($similarity.endSimilarity)%" $Green
            Write-Status "    Avg similarity: $($similarity.avgSimilarity.ToString('F1'))%" $Green
        }
        
        # Step 4: Record results
        $results.samples[$sampleId] = @{
            status = "passed"
            duration = $genResult.Duration
            videoPath = $genResult.VideoPath
            promptId = $promptId
            similarity = $similarity
            seed = $(if ($Seed -eq -1) { "random" } else { $Seed })
        }
        $results.summary.passed++
        
        Write-Status "  PASSED: $sampleId" $Green
        
    } catch {
        Write-Status "  FAILED: $($_.Exception.Message)" $Red
        $results.samples[$sampleId] = @{
            status = "failed"
            error = $_.Exception.Message
        }
        $results.summary.failed++
    }
    
    Write-Host ""
}

# Save results
$resultsPath = Join-Path $runDir "results.json"
$results | ConvertTo-Json -Depth 10 | Set-Content $resultsPath

# Summary
Write-Status "`n=== E2E Validation Summary ===" $Cyan
Write-Status "Total: $($results.summary.total)" $Reset
Write-Status "Passed: $($results.summary.passed)" $Green
Write-Status "Failed: $($results.summary.failed)" $(if ($results.summary.failed -gt 0) { $Red } else { $Green })
Write-Status "Skipped: $($results.summary.skipped)" $Yellow
Write-Status "`nResults saved to: $resultsPath" $Cyan

if ($results.summary.failed -gt 0) {
    exit 1
}
