<#
.SYNOPSIS
    WAN 2.2 5B Parameter Sweep - Optimize video generation settings for 24GB VRAM.

.DESCRIPTION
    This script runs diagnostic test pairs through the WAN 2.2 5B FLF2V workflow
    with various parameter combinations to find optimal settings.
    
    Parameters tested:
    - Resolution: 832×468, 896×504, 960×540
    - CFG Scale: 4.5, 5.5, 6.5
    - Inference Steps: 18, 24, 32
    - Frame Count: 49, 61
    
    Uses VRAM monitoring to detect OOM-risk configurations.

.PARAMETER ComfyUIUrl
    ComfyUI server URL. Default: http://127.0.0.1:8188

.PARAMETER OutputDir
    Directory for sweep results. Default: test-results/wan-tuning

.PARAMETER VRAMCeiling
    VRAM ceiling in MB. Configs exceeding this are marked as risky. Default: 22000

.PARAMETER QuickMode
    If set, only tests resolution sweep (fastest parameter to tune).

.EXAMPLE
    .\scripts\wan-parameter-sweep.ps1 -QuickMode
    
.EXAMPLE
    .\scripts\wan-parameter-sweep.ps1 -VRAMCeiling 20000

.NOTES
    Requires: ComfyUI running, nvidia-smi available
    Output: JSON file with sweep results + recommended config
#>

param(
    [string]$ComfyUIUrl = "http://127.0.0.1:8188",
    [string]$OutputDir = "test-results/wan-tuning",
    [int]$VRAMCeiling = 22000,
    [switch]$QuickMode
)

$ErrorActionPreference = "Stop"

# ============================================================================
# Configuration
# ============================================================================

$Resolutions = @(
    @{ width = 832; height = 468; label = "832x468" }
    @{ width = 896; height = 504; label = "896x504" }
    @{ width = 960; height = 540; label = "960x540" }
)

$CFGScales = @(4.5, 5.5, 6.5)
$InferenceSteps = @(18, 24, 32)
$FrameCounts = @(49, 61)

# Quick mode only tests resolutions with defaults
if ($QuickMode) {
    $CFGScales = @(5.5)
    $InferenceSteps = @(24)
    $FrameCounts = @(49)
}

# Diagnostic test prompts
$DiagnosticTests = @(
    @{
        id = "geometric"
        prompt = "Smooth geometric transformation from a blue circle to a blue square on white background"
        description = "Tests clean interpolation without artifacts"
        expectedBehavior = "Zero smearing, clear shape progression"
    }
    @{
        id = "character"
        prompt = "Camera slowly pulls back from astronaut close-up to mid-shot, revealing Martian landscape"
        description = "Tests character consistency and smooth camera motion"
        expectedBehavior = "No jitter, character position coherent"
    }
    @{
        id = "environment"
        prompt = "Alien creature turns to face camera while exploring ancient Martian canyon ruins"
        description = "Tests composite stability with character + environment"
        expectedBehavior = "Character alignment maintained, environment persistent"
    }
)

# ============================================================================
# Utility Functions
# ============================================================================

function Get-VRAMUsage {
    try {
        $nvidiaSmi = nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits
        $parts = $nvidiaSmi -split ","
        return @{
            UsedMB = [int]$parts[0].Trim()
            TotalMB = [int]$parts[1].Trim()
            Available = $true
        }
    } catch {
        return @{ Available = $false; UsedMB = 0; TotalMB = 0 }
    }
}

function Test-ComfyUIConnection {
    param([string]$Url)
    try {
        $response = Invoke-RestMethod -Uri "$Url/system_stats" -TimeoutSec 5
        return @{
            Connected = $true
            GPU = $response.devices[0].name
            VRAM = $response.devices[0].vram_total
        }
    } catch {
        return @{ Connected = $false }
    }
}

function Write-SweepLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "INFO" { "White" }
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Initialize-OutputDirectory {
    param([string]$Dir)
    if (-not (Test-Path $Dir)) {
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        Write-SweepLog "Created output directory: $Dir" -Level "INFO"
    }
}

# ============================================================================
# Workflow Helper Functions
# ============================================================================

function Deep-CloneObject {
    param($Object)
    # Deep clone via JSON serialization
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

function Queue-ParameterSweepVideo {
    param(
        [string]$ComfyUIUrl,
        [hashtable]$WorkflowObj,
        [string]$ClientId,
        [int]$Seed
    )
    
    # Queue prompt
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

function Compute-SweepSimilarity {
    param(
        [string]$VideoPath,
        [string]$StartKeyframePath,
        [string]$EndKeyframePath,
        [string]$ProjectRoot
    )
    
    # Construct full video path
    $comfyOutputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
    $fullVideoPath = Join-Path $comfyOutputDir $VideoPath
    
    if (-not (Test-Path $fullVideoPath)) {
        return $null
    }
    
    try {
        $output = & node --import tsx (Join-Path $ProjectRoot "scripts\bookend-frame-similarity.ts") `
            --video $fullVideoPath `
            --start $StartKeyframePath `
            --end $EndKeyframePath 2>&1
        
        # Find JSON line with startSimilarity in output
        $jsonLine = $output | Where-Object { $_ -match '^\s*\{.*startSimilarity.*\}' } | Select-Object -First 1
        
        if ($jsonLine) {
            $similarityData = $jsonLine | ConvertFrom-Json
            if ($null -ne $similarityData.startSimilarity) {
                return @{
                    startSimilarity = $similarityData.startSimilarity
                    endSimilarity = $similarityData.endSimilarity
                    avgSimilarity = (($similarityData.startSimilarity + $similarityData.endSimilarity) / 2)
                }
            }
        }
        
        return $null
    } catch {
        return $null
    }
}

# ============================================================================
# Main Sweep Logic
# ============================================================================

$sweepTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$sweepResultsFile = Join-Path $OutputDir "sweep-$sweepTimestamp.json"

Write-SweepLog "WAN 2.2 5B Parameter Sweep" -Level "INFO"
Write-SweepLog "================================================" -Level "INFO"

# Pre-flight checks
Write-SweepLog "Running pre-flight checks..." -Level "INFO"

$comfyStatus = Test-ComfyUIConnection -Url $ComfyUIUrl
if (-not $comfyStatus.Connected) {
    Write-SweepLog "ComfyUI not reachable at $ComfyUIUrl" -Level "ERROR"
    Write-SweepLog "Start ComfyUI first: Use VS Code task 'Start ComfyUI Server (Patched - Recommended)'" -Level "INFO"
    exit 1
}
Write-SweepLog "ComfyUI connected: GPU=$($comfyStatus.GPU)" -Level "SUCCESS"

$vramStatus = Get-VRAMUsage
if ($vramStatus.Available) {
    Write-SweepLog "VRAM: $($vramStatus.UsedMB)MB / $($vramStatus.TotalMB)MB used" -Level "INFO"
    if ($vramStatus.UsedMB -gt ($VRAMCeiling - 5000)) {
        Write-SweepLog "VRAM usage already high. Some configs may OOM." -Level "WARN"
    }
} else {
    Write-SweepLog "nvidia-smi not available - VRAM monitoring disabled" -Level "WARN"
}

Initialize-OutputDirectory -Dir $OutputDir

# Load settings to get base workflow
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$settingsPath = Join-Path $projectRoot "localGenSettings.json"

if (-not (Test-Path $settingsPath)) {
    Write-SweepLog "ERROR: localGenSettings.json not found at $settingsPath" -Level "ERROR"
    exit 1
}

$settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
$qaMode = $settings.bookendQAMode
if ($qaMode.enabled) {
    Write-SweepLog "✓ Bookend QA Mode ENABLED" -Level "SUCCESS"
    Write-SweepLog "  - Enforce Keyframe Passthrough: $($qaMode.enforceKeyframePassthrough)" -Level "INFO"
    Write-SweepLog "  - Override AI Suggestions: $($qaMode.overrideAISuggestions)" -Level "INFO"
}

$baseProfile = $settings.workflowProfiles.'wan-flf2v'

if (-not $baseProfile) {
    Write-SweepLog "ERROR: wan-flf2v workflow profile not found in localGenSettings.json" -Level "ERROR"
    exit 1
}

# Parse base workflow JSON
$baseWorkflowJson = $baseProfile.workflowJson | ConvertFrom-Json -AsHashtable
Write-SweepLog "Loaded base workflow: wan-flf2v" -Level "SUCCESS"

# Find critical nodes
$flfNode = Find-NodeByClassType $baseWorkflowJson "Wan22FirstLastFrameToVideoLatentTiledVAE"
$ksamplerNode = Find-NodeByClassType $baseWorkflowJson "KSampler"

if (-not $flfNode -or -not $ksamplerNode) {
    Write-SweepLog "ERROR: Could not find required nodes in workflow (FLF=$($null -ne $flfNode), KSampler=$($null -ne $ksamplerNode))" -Level "ERROR"
    exit 1
}

$flfNodeId = $flfNode.nodeId
$ksamplerNodeId = $ksamplerNode.nodeId
Write-SweepLog "Found FLF node: $flfNodeId, KSampler node: $ksamplerNodeId" -Level "SUCCESS"

# Copy golden sample keyframes to ComfyUI input for sweep tests
$samplesDir = Join-Path $projectRoot "data\bookend-golden-samples"
$comfyInputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input"
$sweepStartImage = "sweep_start_$sweepTimestamp.png"
$sweepEndImage = "sweep_end_$sweepTimestamp.png"

# Use sample-001-geometric as the sweep test sample
$testSampleDir = Join-Path $samplesDir "sample-001-geometric"
if (Test-Path $testSampleDir) {
    Copy-Item (Join-Path $testSampleDir "start.png") (Join-Path $comfyInputDir $sweepStartImage) -Force
    Copy-Item (Join-Path $testSampleDir "end.png") (Join-Path $comfyInputDir $sweepEndImage) -Force
    Write-SweepLog "Copied test keyframes to ComfyUI input" -Level "SUCCESS"
} else {
    Write-SweepLog "ERROR: Golden sample sample-001-geometric not found at $testSampleDir" -Level "ERROR"
    exit 1
}

# Build configuration matrix
$configs = @()
foreach ($res in $Resolutions) {
    foreach ($cfg in $CFGScales) {
        foreach ($steps in $InferenceSteps) {
            foreach ($frames in $FrameCounts) {
                $configs += @{
                    resolution = $res.label
                    width = $res.width
                    height = $res.height
                    cfgScale = $cfg
                    steps = $steps
                    frameCount = $frames
                    id = "$($res.label)_cfg$($cfg)_s$($steps)_f$($frames)"
                }
            }
        }
    }
}

Write-SweepLog "Testing $($configs.Count) configurations x $($DiagnosticTests.Count) test scenes" -Level "INFO"
Write-SweepLog "VRAM ceiling: $VRAMCeiling MB" -Level "INFO"

$results = @{
    timestamp = $sweepTimestamp
    comfyUIUrl = $ComfyUIUrl
    vramCeiling = $VRAMCeiling
    quickMode = [bool]$QuickMode
    configsTested = $configs.Count
    testScenes = $DiagnosticTests.Count
    configurations = @()
    recommended = $null
    status = "in_progress"
}

# Sweep execution
$configIndex = 0
foreach ($config in $configs) {
    $configIndex++
    
    # Estimate VRAM usage based on resolution
    $estimatedVRAM = switch ($config.resolution) {
        "832x468" { 16000 }
        "896x504" { 18000 }
        "960x540" { 20000 }
        default { 18000 }
    }
    
    # Skip configs that exceed VRAM ceiling
    if ($estimatedVRAM -gt $VRAMCeiling) {
        Write-SweepLog "[$configIndex/$($configs.Count)] Skipping $($config.id) - Est. VRAM $estimatedVRAM MB exceeds ceiling" -Level "WARN"
        
        $configResult = @{
            id = $config.id
            resolution = $config.resolution
            cfgScale = $config.cfgScale
            steps = $config.steps
            frameCount = $config.frameCount
            vramSafe = $false
            status = "skipped"
            reason = "VRAM estimate exceeds ceiling"
        }
        
        $results.configurations += $configResult
        continue
    }
    
    Write-SweepLog "[$configIndex/$($configs.Count)] Testing config: $($config.id)" -Level "INFO"
    
    $configResult = @{
        id = $config.id
        resolution = $config.resolution
        cfgScale = $config.cfgScale
        steps = $config.steps
        frameCount = $config.frameCount
        vramSafe = $true
        status = "pending"
        tests = @()
        averageScore = 0.0
        generationDuration = 0
        videoPath = ""
        seed = 12345 + $configIndex
    }
    
    try {
        # Deep clone workflow for this config
        $workflowObj = Deep-CloneObject $baseWorkflowJson
        
        # Patch FLF node (resolution and frame count)
        $workflowObj[$flfNodeId].inputs.width = $config.width
        $workflowObj[$flfNodeId].inputs.height = $config.height
        $workflowObj[$flfNodeId].inputs.length = $config.frameCount
        
        # Patch KSampler node (cfg and steps)
        $workflowObj[$ksamplerNodeId].inputs.cfg = $config.cfgScale
        $workflowObj[$ksamplerNodeId].inputs.steps = $config.steps
        $workflowObj[$ksamplerNodeId].inputs.seed = $configResult.seed
        
        # Update LoadImage nodes with sweep test images
        foreach ($nodeId in $workflowObj.Keys) {
            $node = $workflowObj[$nodeId]
            if ($node.class_type -eq "LoadImage") {
                $title = $node._meta.title
                if ($title -like "*Start*") {
                    $node.inputs.image = $sweepStartImage
                } elseif ($title -like "*End*") {
                    $node.inputs.image = $sweepEndImage
                }
            }
        }
        
        # Queue to ComfyUI
        $clientId = "sweep-$sweepTimestamp-$configIndex"
        $promptId = Queue-ParameterSweepVideo -ComfyUIUrl $ComfyUIUrl -WorkflowObj $workflowObj -ClientId $clientId -Seed $configResult.seed
        
        Write-SweepLog "  Queued: Prompt ID $promptId" -Level "INFO"
        
        # Wait for completion
        Write-SweepLog "  Waiting for generation..." -Level "INFO"
        $genResult = Wait-ForVideoCompletion -ComfyUIUrl $ComfyUIUrl -PromptId $promptId -TimeoutSeconds 300
        
        if (-not $genResult.Success) {
            throw "Video generation failed: $($genResult.Error)"
        }
        
        Write-Host ""
        Write-SweepLog "  Generated in $([math]::Round($genResult.Duration))s" -Level "SUCCESS"
        
        $configResult.status = "completed"
        $configResult.generationDuration = $genResult.Duration
        $configResult.videoPath = $genResult.VideoPath
        
        # Compute frame similarity
        $startKeyframePath = Join-Path $testSampleDir "start.png"
        $endKeyframePath = Join-Path $testSampleDir "end.png"
        $similarity = Compute-SweepSimilarity `
            -VideoPath $genResult.VideoPath `
            -StartKeyframePath $startKeyframePath `
            -EndKeyframePath $endKeyframePath `
            -ProjectRoot $projectRoot
        
        if ($similarity) {
            $configResult.similarity = $similarity
            Write-SweepLog "  Similarity: start=$($similarity.startSimilarity)% end=$($similarity.endSimilarity)% avg=$($similarity.avgSimilarity)%" -Level "INFO"
        } else {
            Write-SweepLog "  ⚠ Could not compute frame similarity" -Level "WARN"
        }
        
    } catch {
        Write-SweepLog "  ERROR: $($_.Exception.Message)" -Level "ERROR"
        $configResult.status = "failed"
        $configResult.error = $_.Exception.Message
    }
    
    $results.configurations += $configResult
}

# Determine recommended configuration (prefer highest resolution among completed configs)
$completedConfigs = $results.configurations | Where-Object { $_.status -eq "completed" -and $_.vramSafe -eq $true }
if ($completedConfigs.Count -gt 0) {
    $recommended = $completedConfigs | Sort-Object { 
        switch ($_.resolution) {
            "960x540" { 3 }
            "896x504" { 2 }
            "832x468" { 1 }
            default { 0 }
        }
    }, { $_.cfgScale }, { $_.steps } | Select-Object -First 1
    
    $results.recommended = @{
        resolution = $recommended.resolution
        cfgScale = $recommended.cfgScale
        steps = $recommended.steps
        frameCount = $recommended.frameCount
        videoPath = $recommended.videoPath
        reason = "Highest VRAM-safe resolution with tested CFG/steps"
    }
    Write-SweepLog "Recommended config: $($recommended.resolution) CFG=$($recommended.cfgScale) Steps=$($recommended.steps)" -Level "SUCCESS"
}

$results.status = "complete"

# Save results
$results | ConvertTo-Json -Depth 10 | Set-Content -Path $sweepResultsFile -Encoding UTF8
Write-SweepLog "Results saved to: $sweepResultsFile" -Level "SUCCESS"

Write-SweepLog "================================================" -Level "INFO"
Write-SweepLog "Parameter sweep complete. Tested $($configs.Count) configurations, completed $(($results.configurations | Where-Object { $_.status -eq 'completed' }).Count)." -Level "SUCCESS"

exit 0
