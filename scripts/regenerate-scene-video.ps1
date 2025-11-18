param(
    [Parameter(Mandatory = $true)]
    [string] $RunDir,

    [Parameter(Mandatory = $true)]
    [string] $SceneId,

    [int] $SceneRetryBudget = 0,

    [int] $SceneMaxWaitSeconds = 600,

    [int] $SceneHistoryMaxAttempts = 0,

    [int] $SceneHistoryPollIntervalSeconds = 2,

    [int] $ScenePostExecutionTimeoutSeconds = 30,

    [int] $FrameWaitTimeoutSeconds = 300,

    [string] $Prompt,

    [string] $NegativePrompt,

    [switch] $Verbose
)

<#
.SYNOPSIS
Regenerates frames and video for a single scene within an existing run.

.DESCRIPTION
This script is designed to be used by operators or a local HTTP bridge to
regenerate a single scene's frames via queue-real-workflow.ps1 and then
rebuild the corresponding MP4 and metadata:

  1. Loads logs/<run>/artifact-metadata.json and locates the target scene.
  2. Calls queue-real-workflow.ps1 for that scene using the original Prompt
     and NegativePrompt, writing fresh frames into RunDir\<SceneId>\... .
  3. Invokes assemble-scene-videos.ps1 to rebuild per-scene MP4s.
  4. Invokes update-scene-video-metadata.ps1 so the React UI sees the new
     Video.Path/Status/DurationSeconds immediately.

This script is intentionally conservative: it does NOT rewrite the core
scene telemetry fields in artifact-metadata.json, only the Video block.
Future phases can extend this to track per-scene versioning.
#>

function Write-Log {
    param([string] $Message)
    if ($Verbose) {
        Write-Host "[regenerate-scene-video] $Message"
    }
}

if (-not (Test-Path $RunDir)) {
    throw "RunDir '$RunDir' does not exist."
}

$artifactPath = Join-Path $RunDir 'artifact-metadata.json'
if (-not (Test-Path $artifactPath)) {
    throw "artifact-metadata.json not found in RunDir '$RunDir'."
}

Write-Log "Loading artifact metadata from $artifactPath"
$artifact = Get-Content -Path $artifactPath -Raw | ConvertFrom-Json

if (-not $artifact.Scenes) {
    throw "No Scenes array found in artifact-metadata.json."
}

$scene = $artifact.Scenes | Where-Object { $_.SceneId -eq $SceneId } | Select-Object -First 1
if (-not $scene) {
    throw "Scene '$SceneId' not found in artifact-metadata.json."
}

$ProjectRoot = 'C:\Dev\gemDirect1'
$queueScript = Join-Path $ProjectRoot 'scripts\queue-real-workflow.ps1'
if (-not (Test-Path $queueScript)) {
    throw "queue-real-workflow.ps1 not found at '$queueScript'."
}

$sceneOutputDir = Join-Path $RunDir $SceneId
if (-not (Test-Path $sceneOutputDir)) {
    New-Item -ItemType Directory -Path $sceneOutputDir -Force | Out-Null
}

# Prefer the keyframe used in the original run when available.
$keyframePath = Join-Path $sceneOutputDir 'keyframe.png'
if (-not (Test-Path $keyframePath)) {
    if ($scene.StoryKeyframe) {
        $candidate = if ([System.IO.Path]::IsPathRooted([string]$scene.StoryKeyframe)) {
            [string]$scene.StoryKeyframe
        } else {
            Join-Path $RunDir ([string]$scene.StoryKeyframe)
        }
        if (Test-Path $candidate) {
            $keyframePath = $candidate
        } elseif ($scene.KeyframeSource) {
            $candidate2 = if ([System.IO.Path]::IsPathRooted([string]$scene.KeyframeSource)) {
                [string]$scene.KeyframeSource
            } else {
                Join-Path $RunDir ([string]$scene.KeyframeSource)
            }
            if (Test-Path $candidate2) {
                $keyframePath = $candidate2
            }
        }
    } elseif ($scene.KeyframeSource) {
        $candidate = if ([System.IO.Path]::IsPathRooted([string]$scene.KeyframeSource)) {
            [string]$scene.KeyframeSource
        } else {
            Join-Path $RunDir ([string]$scene.KeyframeSource)
        }
        if (Test-Path $candidate) {
            $keyframePath = $candidate
        }
    }
}

if (-not (Test-Path $keyframePath)) {
    throw "Keyframe image not found for scene '$SceneId'. Expected at '$keyframePath'."
}

$effectivePrompt = if (-not [string]::IsNullOrWhiteSpace($Prompt)) {
    $Prompt
} else {
    [string]$scene.Prompt
}

$negativePrompt = if (-not [string]::IsNullOrWhiteSpace($NegativePrompt)) {
    $NegativePrompt
} elseif ([string]::IsNullOrWhiteSpace([string]$scene.NegativePrompt)) {
    'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur'
} else {
    [string]$scene.NegativePrompt
}

$frameFloorValue = if ($scene.FrameFloor -and $scene.FrameFloor -gt 0) { [int]$scene.FrameFloor } else { 25 }

Write-Log "Requeuing scene '$SceneId' via $queueScript"

try {
    $result = & $queueScript `
        -SceneId $SceneId `
        -Prompt $effectivePrompt `
        -NegativePrompt $negativePrompt `
        -KeyframePath $keyframePath `
        -SceneOutputDir $sceneOutputDir `
        -FrameFloor $frameFloorValue `
        -MaxWaitSeconds $SceneMaxWaitSeconds `
        -MaxAttemptCount $SceneHistoryMaxAttempts `
        -HistoryPollIntervalSeconds $SceneHistoryPollIntervalSeconds `
        -PostExecutionTimeoutSeconds $ScenePostExecutionTimeoutSeconds `
        -SceneRetryBudget $SceneRetryBudget `
        -AttemptNumber 1 `
        -WaitForDoneMarker $true `
        -DoneMarkerTimeoutSeconds $ScenePostExecutionTimeoutSeconds `
        -StabilitySeconds 5 `
        -StabilityRetries 3 `
        -FrameWaitTimeoutSeconds $FrameWaitTimeoutSeconds
} catch {
    throw "queue-real-workflow.ps1 failed for scene '$SceneId': $($_.Exception.Message)"
}

if (-not $result) {
    throw "queue-real-workflow.ps1 returned null for scene '$SceneId'."
}

if (-not $result.Success) {
    $errSummary = if ($result.Errors) { ($result.Errors -join '; ') } else { 'Unknown error' }
    throw "Scene '$SceneId' regeneration failed: $errSummary"
}

Write-Log ("Scene '{0}' regenerated: FrameCount={1}, DurationSeconds={2}" -f $SceneId, $result.FrameCount, $result.DurationSeconds)

$wanScript = Join-Path $ProjectRoot 'scripts\generate-scene-videos-wan2.ps1'
$updateMetadataScript = Join-Path $ProjectRoot 'scripts\update-scene-video-metadata.ps1'

if (Test-Path $wanScript) {
    Write-Log "Generating Wan2 video for scene '$SceneId' via $wanScript"
    try {
        & pwsh -NoLogo -ExecutionPolicy Bypass -File $wanScript -RunDir $RunDir -SceneId $SceneId
    } catch {
        Write-Log ("Wan2 generation failed for scene '{0}': {1}" -f $SceneId, $_.Exception.Message)
    }
}

if (Test-Path $updateMetadataScript) {
    Write-Log "Updating scene Video metadata via $updateMetadataScript"
    & pwsh -NoLogo -ExecutionPolicy Bypass -File $updateMetadataScript -RunDir $RunDir -VideoSubDir 'video'
}

Write-Log "Scene '$SceneId' regeneration complete."
