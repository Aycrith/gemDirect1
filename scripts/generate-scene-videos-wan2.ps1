param(
    [Parameter(Mandatory = $true)]
    [string] $RunDir,

    # Default to the canonical Wan2 5B ti2v workflow saved in the ComfyUI workspace.
    # This must be exported in API format (Save (API Format)) so it can be sent
    # directly to /prompt as the "prompt" payload.
    [string] $WorkflowFile = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\video_wan2_2_5B_ti2v.json',

    [string] $ComfyUrl = 'http://127.0.0.1:8188'
)

<#
.SYNOPSIS
Generates per-scene MP4 videos using the Wan2.2 5B text+image-to-video workflow.

.DESCRIPTION
For each scene in artifact-metadata.json:
  - Copies the scene keyframe into ComfyUI's input directory with a scene-specific name.
  - Loads the Wan2 5B ti2v workflow JSON (API format, video_wan2_2_5B_ti2v.json) from the ComfyUI workspace.
  - Replaces placeholders (__KEYFRAME_IMAGE__, __SCENE_PREFIX__, __SCENE_PROMPT__, __NEGATIVE_PROMPT__).
  - Submits the workflow to ComfyUI /prompt.
  - Polls the ComfyUI output directory for resulting MP4s.
  - Copies each MP4 into RunDir\video\scene-XXX.mp4.

This script does not modify artifact-metadata.json directly; run
update-scene-video-metadata.ps1 afterwards to wire Video metadata.
#>

function Write-WanLog {
    param([string] $Message)
    Write-Host "[wan2-scene-video] $Message"
}

if (-not (Test-Path $RunDir)) {
    throw "RunDir '$RunDir' does not exist."
}

$artifactPath = Join-Path $RunDir 'artifact-metadata.json'
if (-not (Test-Path $artifactPath)) {
    throw "artifact-metadata.json not found in RunDir '$RunDir'."
}

if (-not (Test-Path $WorkflowFile)) {
    throw "Wan2 workflow file not found at '$WorkflowFile'."
}

Write-WanLog "Loading artifact metadata from $artifactPath"
$artifact = Get-Content -Path $artifactPath -Raw | ConvertFrom-Json

if (-not $artifact.Scenes) {
    Write-WanLog "No Scenes array found in artifact-metadata.json; nothing to generate."
    return
}

$comfyRoot = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI'
$comfyInputDir = Join-Path $comfyRoot 'input'
$comfyOutputDir = Join-Path $comfyRoot 'output'

if (-not (Test-Path $comfyInputDir)) {
    New-Item -ItemType Directory -Path $comfyInputDir -Force | Out-Null
}
if (-not (Test-Path $comfyOutputDir)) {
    New-Item -ItemType Directory -Path $comfyOutputDir -Force | Out-Null
}

$videoDir = Join-Path $RunDir 'video'
if (-not (Test-Path $videoDir)) {
    New-Item -ItemType Directory -Path $videoDir -Force | Out-Null
}

# Load the Wan2 API-format workflow template once; we will patch it per scene.
$workflowTemplateJson = Get-Content -Path $WorkflowFile -Raw

function Invoke-WanWorkflowForScene {
    param(
        [string] $SceneId,
        [string] $Prompt,
        [string] $NegativePrompt,
        [string] $KeyframePath
    )

    $sceneKeyframeName = "$SceneId`_keyframe.png"
    $sceneKeyframeDest = Join-Path $comfyInputDir $sceneKeyframeName
    Copy-Item -Path $KeyframePath -Destination $sceneKeyframeDest -Force
    Write-WanLog "Copied keyframe for '$SceneId' to $sceneKeyframeDest"

    # Patch placeholders in the API-format workflow JSON.
    # We keep this as a string replacement to avoid accidentally restructuring the prompt.
    $scenePrefix = "gemdirect1_$SceneId"
    $escapedPrompt = $Prompt -replace '"','\"'
    $escapedNegative = $NegativePrompt -replace '"','\"'
    $patchedJson = $workflowTemplateJson.
        Replace('__KEYFRAME_IMAGE__', $sceneKeyframeName).
        Replace('__SCENE_PREFIX__', $scenePrefix).
        Replace('__SCENE_PROMPT__', $escapedPrompt).
        Replace('__NEGATIVE_PROMPT__', $escapedNegative)

    # Parse back into an object to send as the "prompt" payload.
    $workflowPrompt = $patchedJson | ConvertFrom-Json

    $clientId = "wan2-$SceneId-$([guid]::NewGuid().ToString('N'))"
    $payload = @{
        prompt    = $workflowPrompt
        client_id = $clientId
    }
    $payloadJson = $payload | ConvertTo-Json -Depth 10

    Write-WanLog "Submitting Wan2 workflow for scene '$SceneId' (client_id=$clientId)"
    try {
        $response = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method POST -ContentType 'application/json' -Body $payloadJson -TimeoutSec 30 -ErrorAction Stop
    } catch {
        throw "Failed to submit Wan2 workflow for scene '$SceneId': $($_.Exception.Message)"
    }

    if (-not $response.prompt_id) {
        throw "ComfyUI did not return a prompt_id for Wan2 scene '$SceneId'."
    }

    $promptId = $response.prompt_id
    Write-WanLog "Queued Wan2 prompt_id $promptId for scene '$SceneId'"

    # Wait for MP4 output with a filename containing the sceneId
    $maxWaitSeconds = 600
    $pollInterval = 5
    $start = Get-Date
    $targetPattern = "gemdirect1_${SceneId}*.mp4"
    $videoFile = $null

    while ((New-TimeSpan -Start $start).TotalSeconds -lt $maxWaitSeconds) {
        $candidates = Get-ChildItem -Path $comfyOutputDir -Recurse -Filter $targetPattern -ErrorAction SilentlyContinue
        if ($candidates -and $candidates.Count -gt 0) {
            $videoFile = $candidates | Sort-Object LastWriteTime | Select-Object -Last 1
            break
        }
        Start-Sleep -Seconds $pollInterval
    }

    # Fallback: if no gemdirect1_* match is found, pick the most recent MP4
    # in the output tree. This keeps older WAN workflows that use the default
    # ComfyUI_0000X_ prefixes working without forcing a SaveVideo rename.
    if (-not $videoFile) {
        Write-WanLog "Wan2 video with pattern '$targetPattern' not found; falling back to latest *.mp4 in output."
        $fallback = Get-ChildItem -Path $comfyOutputDir -Recurse -Include *.mp4 -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime | Select-Object -Last 1
        if ($fallback) {
            $videoFile = $fallback
        }
    }

    if (-not $videoFile) {
        throw "Wan2 video output not found for scene '$SceneId' after $maxWaitSeconds seconds (pattern: $targetPattern, and no fallback *.mp4 found)."
    }

    $destPath = Join-Path $videoDir ("$SceneId.mp4")
    Copy-Item -Path $videoFile.FullName -Destination $destPath -Force
    Write-WanLog "Copied Wan2 video for '$SceneId' to $destPath"
}

foreach ($scene in $artifact.Scenes) {
    if (-not $scene.SceneId) {
        continue
    }
    $sceneId = [string]$scene.SceneId
    $sceneOutputDir = if ($scene.SceneOutputDir) { [string]$scene.SceneOutputDir } else { Join-Path $RunDir $sceneId }
    $keyframePath = Join-Path $sceneOutputDir 'keyframe.png'

    if (-not (Test-Path $keyframePath)) {
        Write-WanLog "Scene '$sceneId' has no keyframe at '$keyframePath'; skipping Wan2 video."
        continue
    }

    $promptText = if ($scene.Prompt) { [string]$scene.Prompt } else { "Cinematic shot of scene $sceneId" }
    $negativePromptText = if ($scene.NegativePrompt) {
        [string]$scene.NegativePrompt
    } else {
        'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur'
    }

    try {
        Invoke-WanWorkflowForScene -SceneId $sceneId -Prompt $promptText -NegativePrompt $negativePromptText -KeyframePath $keyframePath
    } catch {
        Write-WanLog "ERROR: Failed to generate Wan2 video for scene '$sceneId': $($_.Exception.Message)"
    }
}

Write-WanLog "Wan2 scene video generation completed for RunDir '$RunDir'."
