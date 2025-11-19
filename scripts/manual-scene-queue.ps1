#!/usr/bin/env pwsh
<#
.SYNOPSIS
Manually queue all 3 scenes from a completed story generation run directly to ComfyUI,
bypassing the complex E2E harness orchestration.

.DESCRIPTION
This script:
1. Extracts scene definitions from a previous E2E run's story generation
2. Loads the WAN2 SVD workflow
3. Injects keyframes for each scene  
4. Queues each scene to ComfyUI
5. Polls history to verify execution
6. Collects generated frames

.PARAMETER SourceRunDir
The run directory containing the story generation (e.g., 20251118-214937)

.PARAMETER ComfyUIUrl
ComfyUI API endpoint (default: http://127.0.0.1:8188)

.PARAMETER OutputDir
Directory to save results (default: C:\Dev\gemDirect1\logs\manual-scene-queue-$(date))
#>

param(
    [string]$SourceRunDir = "C:\Dev\gemDirect1\logs\20251118-214937",
    [string]$ComfyUIUrl = "http://127.0.0.1:8188",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

# ====== INITIALIZATION ======

if (-not $OutputDir) {
    $timestamp = (Get-Date -Format "yyyyMMdd-HHmmss")
    $OutputDir = "C:\Dev\gemDirect1\logs\manual-scene-queue-$timestamp"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$logFile = Join-Path $OutputDir "manual-queue.log"

function Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry
    Add-Content -Path $logFile -Value $logEntry
}

Log "========================================" "INFO"
Log "Manual Scene Queue Script" "INFO"
Log "========================================" "INFO"
Log "Source run directory: $SourceRunDir" "INFO"
Log "ComfyUI URL: $ComfyUIUrl" "INFO"
Log "Output directory: $OutputDir" "INFO"
Log "" "INFO"

# ====== VALIDATION ======

if (-not (Test-Path $SourceRunDir)) {
    Log "ERROR: Source run directory not found: $SourceRunDir" "ERROR"
    exit 1
}

$storyDir = Join-Path $SourceRunDir "story"
if (-not (Test-Path $storyDir)) {
    Log "ERROR: Story directory not found: $storyDir" "ERROR"
    exit 1
}

# ====== LOAD STORY DEFINITION ======

Log "Loading story definition from $storyDir..." "INFO"

$storyJsonPath = Join-Path $storyDir "story.json"
if (-not (Test-Path $storyJsonPath)) {
    Log "ERROR: story.json not found at $storyJsonPath" "ERROR"
    exit 1
}

try {
    $storyData = Get-Content $storyJsonPath -Raw | ConvertFrom-Json
    $scenes = $storyData.scenes
    Log "Loaded $($scenes.Count) scenes from story definition" "INFO"
    Log "Story ID: $($storyData.storyId)" "INFO"
    Log "Logline: $($storyData.logline)" "INFO"
} catch {
    Log "ERROR: Failed to parse story.json: $_" "ERROR"
    exit 1
}

# ====== LOAD WORKFLOW ======

Log "Loading WAN2 SVD workflow template..." "INFO"

$workflowPath = "C:\Dev\gemDirect1\assets\workflows\video_wan2_2_5B_ti2v.json"
if (-not (Test-Path $workflowPath)) {
    Log "ERROR: Workflow not found at $workflowPath" "ERROR"
    exit 1
}

try {
    $workflowTemplate = Get-Content $workflowPath -Raw | ConvertFrom-Json
    Log "Workflow loaded successfully" "INFO"
} catch {
    Log "ERROR: Failed to parse workflow: $_" "ERROR"
    exit 1
}

# ====== QUEUE SCENES ======

Log "Queuing scenes to ComfyUI..." "INFO"
Log "" "INFO"

$queuedScenes = @()
$startTime = Get-Date

for ($i = 0; $i -lt $scenes.Count; $i++) {
    $sceneNum = $i + 1
    $scene = $scenes[$i]
    $sceneKey = "Scene-$('{0:D3}' -f $sceneNum)"
    
    Log "[$sceneKey] Processing scene..." "INFO"
    
    # Load keyframe from source run
    $keyframeDir = Join-Path $SourceRunDir "story" "keyframes"
    $keyframePath = Join-Path $keyframeDir "scene-$('{0:D3}' -f $sceneNum).png"
    
    if (-not (Test-Path $keyframePath)) {
        Log "[$sceneKey] ERROR: Keyframe not found at $keyframePath" "ERROR"
        continue
    }
    
    # Copy keyframe to output
    $keyframeOutputPath = Join-Path $OutputDir "$sceneKey-keyframe.png"
    Copy-Item $keyframePath $keyframeOutputPath -Force
    Log "[$sceneKey] Keyframe copied to $keyframeOutputPath" "INFO"
    
    # Create workflow instance (deep copy)
    $workflow = $workflowTemplate | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    
    # Find and update nodes (assuming localGenSettings.json mapping)
    $localGenPath = "C:\Dev\gemDirect1\src\config\localGenSettings.json"
    if (Test-Path $localGenPath) {
        $localGenSettings = Get-Content $localGenPath -Raw | ConvertFrom-Json
        
        # Inject keyframe path into LoadImage node
        if ($localGenSettings.WAN2_keyframeInput -and $workflow.($localGenSettings.WAN2_keyframeInput)) {
            $keyframeNode = $workflow.($localGenSettings.WAN2_keyframeInput)
            if ($keyframeNode.inputs) {
                $keyframeNode.inputs.image = Split-Path -Leaf $keyframeOutputPath
                Log "[$sceneKey] Keyframe injected into node $($localGenSettings.WAN2_keyframeInput)" "INFO"
            }
        }
        
        # Inject scene description into CLIP node
        if ($localGenSettings.WAN2_clipInput -and $workflow.($localGenSettings.WAN2_clipInput)) {
            $clipNode = $workflow.($localGenSettings.WAN2_clipInput)
            if ($clipNode.inputs) {
                $clipNode.inputs.text = $scene.description
                Log "[$sceneKey] Scene description injected into CLIP node" "INFO"
            }
        }
    }
    
    # Queue to ComfyUI
    try {
        Log "[$sceneKey] Queuing to ComfyUI..." "INFO"
        
        $queueResponse = Invoke-RestMethod -Uri "$ComfyUIUrl/prompt" `
            -Method Post `
            -ContentType "application/json" `
            -Body ($workflow | ConvertTo-Json -Depth 100) `
            -TimeoutSec 5
        
        $promptId = $queueResponse.prompt_id
        $queuedScenes += @{
            sceneNum = $sceneNum
            sceneKey = $sceneKey
            promptId = $promptId
            queueTime = Get-Date
        }
        
        Log "[$sceneKey] Successfully queued (prompt_id: $promptId)" "INFO"
        Log "" "INFO"
    } catch {
        Log "[$sceneKey] ERROR: Failed to queue: $_" "ERROR"
        Log "" "INFO"
        continue
    }
}

if ($queuedScenes.Count -eq 0) {
    Log "ERROR: No scenes successfully queued" "ERROR"
    exit 1
}

Log "Queued $($queuedScenes.Count) scenes. Waiting for completion..." "INFO"
Log "" "INFO"

# ====== POLL FOR COMPLETION ======

$historyMaxWaitSeconds = 600
$historyPollIntervalSeconds = 2
$completedScenes = @()
$pollStartTime = Get-Date

while ((Get-Date) -lt $pollStartTime.AddSeconds($historyMaxWaitSeconds)) {
    try {
        $history = Invoke-RestMethod -Uri "$ComfyUIUrl/history" -TimeoutSec 5
    } catch {
        Log "WARNING: Failed to query history: $_" "WARN"
        Start-Sleep -Seconds $historyPollIntervalSeconds
        continue
    }
    
    # Check status of each queued scene
    foreach ($queuedScene in $queuedScenes) {
        if ($completedScenes.promptId -contains $queuedScene.promptId) {
            continue  # Already completed
        }
        
        $promptId = $queuedScene.promptId
        $historyEntry = $history.$promptId
        
        if ($historyEntry) {
            $status = if ($historyEntry.status.completed) { "completed" } else { "running" }
            $outputs = $historyEntry.outputs
            
            if ($outputs) {
                # Count frames from SaveImage node
                $frameCount = 0
                if ($outputs.'7'.images) {
                    $frameCount = $outputs.'7'.images.Count
                }
                
                Log "[$($queuedScene.sceneKey)] $status - $frameCount frames" "INFO"
                
                if ($status -eq "completed") {
                    $completedScenes += @{
                        sceneNum = $queuedScene.sceneNum
                        sceneKey = $queuedScene.sceneKey
                        promptId = $promptId
                        frameCount = $frameCount
                        completionTime = Get-Date
                    }
                }
            }
        }
    }
    
    if ($completedScenes.Count -eq $queuedScenes.Count) {
        Log "All $($queuedScenes.Count) scenes completed!" "INFO"
        break
    }
    
    Start-Sleep -Seconds $historyPollIntervalSeconds
}

Log "" "INFO"
Log "========================================" "INFO"
Log "EXECUTION SUMMARY" "INFO"
Log "========================================" "INFO"

if ($completedScenes.Count -eq 0) {
    Log "ERROR: No scenes completed after waiting $historyMaxWaitSeconds seconds" "ERROR"
    exit 1
}

$totalFrames = 0
foreach ($scene in $completedScenes) {
    Log "$($scene.sceneKey): $($scene.frameCount) frames" "INFO"
    $totalFrames += $scene.frameCount
}

Log "" "INFO"
Log "Total Scenes Completed: $($completedScenes.Count)/$($queuedScenes.Count)" "INFO"
Log "Total Frames Generated: $totalFrames (expected 75)" "INFO"
Log "Execution Time: $((Get-Date) - $startTime | Select-Object -ExpandProperty TotalSeconds) seconds" "INFO"
Log "" "INFO"

if ($completedScenes.Count -eq 3 -and $totalFrames -eq 75) {
    Log "[OK] SUCCESS: All 3 scenes executed with 75 frames total" "INFO"
    exit 0
} else {
    Log "[PARTIAL] Some scenes completed but not all (3/3 or 75/75)" "WARN"
    exit 1
}
