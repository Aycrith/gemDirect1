<#
.SYNOPSIS
    Generate golden sample keyframe pairs for bookend regression testing.
    
.DESCRIPTION
    This script generates start and end keyframe images for each golden sample
    by queuing prompts to ComfyUI using the configured text-to-image workflow.
    
.PARAMETER Sample
    Specific sample to generate (e.g., "sample-001-geometric"). If not specified,
    generates all samples that don't have keyframes yet.
    
.PARAMETER Force
    Force regeneration even if keyframes already exist.
    
.PARAMETER ComfyUIUrl
    ComfyUI server URL. Default: http://127.0.0.1:8188
    
.PARAMETER WorkflowProfile
    Workflow profile to use. Default: flux-t2i
    
.EXAMPLE
    .\generate-golden-samples.ps1
    Generate missing keyframes for all samples
    
.EXAMPLE
    .\generate-golden-samples.ps1 -Sample sample-001-geometric -Force
    Regenerate keyframes for specific sample
#>

param(
    [string]$Sample = "",
    [switch]$Force = $false,
    [string]$ComfyUIUrl = "http://127.0.0.1:8188",
    [string]$WorkflowProfile = "flux-t2i"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$samplesDir = Join-Path $projectRoot "data\bookend-golden-samples"

# ANSI color codes
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

function Get-WorkflowTemplate {
    param([string]$ProfileId)
    
    $settingsPath = Join-Path $projectRoot "localGenSettings.json"
    if (-not (Test-Path $settingsPath)) {
        throw "localGenSettings.json not found"
    }
    
    $settings = Get-Content $settingsPath | ConvertFrom-Json
    $profile = $settings.workflowProfiles.$ProfileId
    
    if (-not $profile) {
        throw "Workflow profile '$ProfileId' not found"
    }
    
    return @{
        WorkflowJson = $profile.workflowJson
        Mapping = $profile.mapping
    }
}

function Send-ComfyUIPrompt {
    param(
        [string]$WorkflowJson,
        [PSObject]$Mapping,
        [string]$PositivePrompt,
        [string]$NegativePrompt,
        [string]$OutputPrefix
    )
    
    # Parse workflow
    $workflow = $WorkflowJson | ConvertFrom-Json
    
    # Apply prompt mappings - iterate over PSObject properties
    $Mapping.PSObject.Properties | ForEach-Object {
        $key = $_.Name
        $mappingType = $_.Value
        $parts = $key -split ":"
        $nodeId = $parts[0]
        $inputName = $parts[1]
        
        if ($mappingType -eq "human_readable_prompt") {
            $workflow.$nodeId.inputs.$inputName = $PositivePrompt
        } elseif ($mappingType -eq "negative_prompt") {
            $workflow.$nodeId.inputs.$inputName = $NegativePrompt
        }
    }
    
    # Find SaveImage node and set prefix
    foreach ($nodeId in ($workflow | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)) {
        $node = $workflow.$nodeId
        if ($node.class_type -eq "SaveImage") {
            $node.inputs.filename_prefix = $OutputPrefix
        }
    }
    
    # Create prompt payload
    $payload = @{
        prompt = $workflow
        client_id = "golden-sample-generator"
    } | ConvertTo-Json -Depth 20
    
    # Queue prompt
    $response = Invoke-RestMethod -Uri "$ComfyUIUrl/prompt" -Method Post -Body $payload -ContentType "application/json"
    return $response.prompt_id
}

function Wait-ForCompletion {
    param(
        [string]$PromptId,
        [int]$TimeoutSeconds = 120
    )
    
    $startTime = Get-Date
    
    while ($true) {
        Start-Sleep -Seconds 2
        
        $elapsed = ((Get-Date) - $startTime).TotalSeconds
        if ($elapsed -gt $TimeoutSeconds) {
            throw "Timeout waiting for prompt $PromptId"
        }
        
        try {
            $history = Invoke-RestMethod -Uri "$ComfyUIUrl/history/$PromptId"
            
            if ($history.$PromptId) {
                $status = $history.$PromptId.status
                if ($status.completed -or $status.status_str -eq "success") {
                    return $history.$PromptId.outputs
                }
                if ($status.status_str -eq "error") {
                    throw "Prompt failed: $($status.messages | ConvertTo-Json)"
                }
            }
        } catch {
            # History not ready yet
        }
        
        Write-Host "." -NoNewline
    }
}

function Get-LatestImage {
    param([string]$Prefix)
    
    $outputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
    
    # Wait a moment for file to be written
    Start-Sleep -Seconds 1
    
    $images = Get-ChildItem -Path $outputDir -Filter "$Prefix*.png" | Sort-Object LastWriteTime -Descending
    
    if ($images.Count -eq 0) {
        throw "No images found with prefix $Prefix"
    }
    
    return $images[0].FullName
}

function Copy-KeyframeToSample {
    param(
        [string]$SourcePath,
        [string]$DestPath
    )
    
    Copy-Item -Path $SourcePath -Destination $DestPath -Force
    Write-Status "  Saved: $DestPath" $Green
}

# Main execution
Write-Status "`n=== Golden Sample Keyframe Generator ===" $Cyan
Write-Status "ComfyUI URL: $ComfyUIUrl"
Write-Status "Workflow Profile: $WorkflowProfile"
Write-Status "Samples Directory: $samplesDir`n"

# Check ComfyUI connection
Write-Status "Checking ComfyUI connection..." $Yellow
if (-not (Test-ComfyUIConnection)) {
    Write-Status "ERROR: Cannot connect to ComfyUI at $ComfyUIUrl" $Red
    Write-Status "Please start ComfyUI server first." $Red
    exit 1
}
Write-Status "ComfyUI connected!`n" $Green

# Get workflow template
Write-Status "Loading workflow template..." $Yellow
try {
    $template = Get-WorkflowTemplate -ProfileId $WorkflowProfile
    Write-Status "Workflow loaded: $WorkflowProfile`n" $Green
} catch {
    Write-Status "ERROR: $($_.Exception.Message)" $Red
    exit 1
}

# Find samples to process
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

$generated = 0
$skipped = 0
$failed = 0

foreach ($sampleDir in $sampleDirs) {
    $contextPath = Join-Path $sampleDir.FullName "context.json"
    
    if (-not (Test-Path $contextPath)) {
        Write-Status "SKIP: $($sampleDir.Name) - no context.json" $Yellow
        $skipped++
        continue
    }
    
    $startPath = Join-Path $sampleDir.FullName "start.png"
    $endPath = Join-Path $sampleDir.FullName "end.png"
    
    if ((Test-Path $startPath) -and (Test-Path $endPath) -and -not $Force) {
        Write-Status "SKIP: $($sampleDir.Name) - keyframes exist (use -Force to regenerate)" $Yellow
        $skipped++
        continue
    }
    
    Write-Status "`nProcessing: $($sampleDir.Name)" $Cyan
    
    try {
        $context = Get-Content $contextPath | ConvertFrom-Json
        
        # Generate start keyframe
        Write-Status "  Generating start keyframe..." $Yellow
        $startPrefix = "golden_$($sampleDir.Name)_start"
        $promptId = Send-ComfyUIPrompt `
            -WorkflowJson $template.WorkflowJson `
            -Mapping $template.Mapping `
            -PositivePrompt $context.startKeyframe.prompt `
            -NegativePrompt $context.startKeyframe.negativePrompt `
            -OutputPrefix $startPrefix
        
        Write-Status "  Queued prompt: $promptId" $Yellow
        $null = Wait-ForCompletion -PromptId $promptId
        Write-Host ""
        
        $startImage = Get-LatestImage -Prefix $startPrefix
        Copy-KeyframeToSample -SourcePath $startImage -DestPath $startPath
        
        # Generate end keyframe
        Write-Status "  Generating end keyframe..." $Yellow
        $endPrefix = "golden_$($sampleDir.Name)_end"
        $promptId = Send-ComfyUIPrompt `
            -WorkflowJson $template.WorkflowJson `
            -Mapping $template.Mapping `
            -PositivePrompt $context.endKeyframe.prompt `
            -NegativePrompt $context.endKeyframe.negativePrompt `
            -OutputPrefix $endPrefix
        
        Write-Status "  Queued prompt: $promptId" $Yellow
        $null = Wait-ForCompletion -PromptId $promptId
        Write-Host ""
        
        $endImage = Get-LatestImage -Prefix $endPrefix
        Copy-KeyframeToSample -SourcePath $endImage -DestPath $endPath
        
        Write-Status "  COMPLETE: $($sampleDir.Name)" $Green
        $generated++
        
    } catch {
        Write-Status "  FAILED: $($_.Exception.Message)" $Red
        $failed++
    }
}

# Summary
Write-Status "`n=== Generation Summary ===" $Cyan
Write-Status "Generated: $generated" $Green
Write-Status "Skipped: $skipped" $Yellow
Write-Status "Failed: $failed" $(if ($failed -gt 0) { $Red } else { $Green })

if ($failed -gt 0) {
    exit 1
}
