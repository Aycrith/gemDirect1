param(
    [Parameter(Mandatory = $true)]
    [string] $SceneId,

    [Parameter(Mandatory = $true)]
    [string] $Prompt,

    [string] $NegativePrompt = 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur',

    [Parameter(Mandatory = $true)]
    [string] $KeyframePath,

    [Parameter(Mandatory = $true)]
    [string] $SceneOutputDir,

    [string] $ProjectRoot = 'C:\Dev\gemDirect1',
    [string] $ComfyUrl = 'http://127.0.0.1:8188',
    [int] $FrameFloor = 25,
    [int] $MaxWaitSeconds = 600
)

function Write-SceneLog {
    param(
        [string] $Message
    )
    Write-Host "[Real E2E][$SceneId] $Message"
}

if (-not (Test-Path $SceneOutputDir)) {
    New-Item -ItemType Directory -Path $SceneOutputDir -Force | Out-Null
}

$generatedFramesDir = Join-Path $SceneOutputDir 'generated-frames'
New-Item -ItemType Directory -Path $generatedFramesDir -Force | Out-Null

$WorkflowPath = Join-Path $ProjectRoot 'workflows\text-to-video.json'
if (-not (Test-Path $WorkflowPath)) {
    throw "Workflow not found at $WorkflowPath"
}

if (-not (Test-Path $KeyframePath)) {
    throw "Keyframe path not found: $KeyframePath"
}

$scenePrefix = "gemdirect1_$SceneId"
$comfyInputDir = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input'
if (-not (Test-Path $comfyInputDir)) {
    New-Item -ItemType Directory -Path $comfyInputDir -Force | Out-Null
}

$keyframeName = "{0}_keyframe{1}" -f $SceneId, [IO.Path]::GetExtension($KeyframePath)
$keyframeTarget = Join-Path $comfyInputDir $keyframeName

Write-SceneLog "Preparing keyframe $keyframeName"
Copy-Item -Path $KeyframePath -Destination $keyframeTarget -Force

# Remove stale frames matching this prefix
$possibleOutputDirs = @(
    'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs',
    'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output',
    'C:\ComfyUI\ComfyUI_windows_portable\outputs',
    'C:\ComfyUI\outputs'
)
foreach ($dir in $possibleOutputDirs) {
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Filter "$scenePrefix*.png" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

$workflow = Get-Content $WorkflowPath -Raw | ConvertFrom-Json
$workflow.'2'.inputs.image = $keyframeName
$workflow.'2'.widgets_values[0] = $keyframeName
$workflow.'7'.inputs.filename_prefix = $scenePrefix
if ($workflow.'7'.PSObject.Properties.Name -notcontains '_meta') {
    $workflow.'7' | Add-Member -MemberType NoteProperty -Name _meta -Value @{ }
}
$workflow.'7'._meta.scene_prompt = $Prompt
$workflow.'7'._meta.negative_prompt = $NegativePrompt

$clientId = "scene-$SceneId-$([guid]::NewGuid().ToString('N'))"
$payload = @{
    prompt    = $workflow
    client_id = $clientId
}
$payloadJson = $payload | ConvertTo-Json -Depth 10

Write-SceneLog "Queuing workflow (client_id: $clientId)"
$promptResponse = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method POST -ContentType 'application/json' -Body $payloadJson -TimeoutSec 15 -ErrorAction Stop

if (-not $promptResponse.prompt_id) {
    throw "ComfyUI did not return a prompt_id for scene $SceneId"
}

$promptId = $promptResponse.prompt_id
Write-SceneLog "Queued prompt_id $promptId"

$startTime = Get-Date
$maxWaitSeconds = $MaxWaitSeconds
$historyData = $null

while ((New-TimeSpan -Start $startTime).TotalSeconds -lt $maxWaitSeconds) {
    try {
        $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($history -and $history.$promptId -and $history.$promptId.outputs) {
            $historyData = $history
            Write-SceneLog ("Workflow completed after {0}s" -f [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1))
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
    Start-Sleep -Seconds 2
}

if (-not $historyData) {
    throw "Scene $SceneId did not finish within $maxWaitSeconds seconds"
}

$historyPath = Join-Path $SceneOutputDir 'history.json'
$historyData | ConvertTo-Json -Depth 10 | Set-Content -Path $historyPath

$copiedFrom = @()
$sceneFrames = @()
foreach ($outputDir in $possibleOutputDirs) {
    if (-not (Test-Path $outputDir)) {
        continue
    }

    $frames = @(Get-ChildItem -Path $outputDir -Filter "$scenePrefix*.png" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
    if ($frames.Count -gt 0) {
        foreach ($frame in $frames) {
            Copy-Item -Path $frame.FullName -Destination (Join-Path $generatedFramesDir $frame.Name) -Force
        }
        $sceneFrames += $frames
        $copiedFrom += $outputDir
    }
}

if ($sceneFrames.Count -eq 0) {
    Write-SceneLog "No frames found for prefix $scenePrefix"
} else {
    Write-SceneLog ("Copied {0} frames into {1}" -f $sceneFrames.Count, $generatedFramesDir)
}

$result = [pscustomobject]@{
    SceneId            = $SceneId
    Prompt             = $Prompt
    NegativePrompt     = $NegativePrompt
    KeyframeSource     = $KeyframePath
    KeyframeInputName  = $keyframeName
    FrameCount         = $sceneFrames.Count
    FramePrefix        = $scenePrefix
    ClientId           = $clientId
    PromptId           = $promptId
    DurationSeconds    = [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1)
    GeneratedFramesDir = $generatedFramesDir
    HistoryPath        = $historyPath
    OutputDirsScanned  = $copiedFrom
    Success            = ($sceneFrames.Count -gt 0)
    MeetsFrameFloor    = ($sceneFrames.Count -ge $FrameFloor)
}

return $result
