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
    [int] $MaxWaitSeconds = 600,
    [int] $MaxAttemptCount = 0,
    [int] $HistoryPollIntervalSeconds = 2
)

function Write-SceneLog {
    param(
        [string] $Message
    )
    Write-Host "[Real E2E][$SceneId] $Message"
}

function Get-ComfySystemStats {
    param(
        [string] $BaseUrl
    )
    try {
        return Invoke-RestMethod -Uri "$BaseUrl/system_stats" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-GpuSnapshot {
    param(
        [object] $Stats
    )

    if (-not $Stats -or -not $Stats.devices) {
        return $null
    }
    $device = $Stats.devices | Select-Object -First 1
    if (-not $device) {
        return $null
    }
    return @{
        Name = $device.name
        Type = $device.type
        Index = $device.index
        VramTotal = $device.vram_total
        VramFree = $device.vram_free
    }
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

$systemStatsBefore = Get-ComfySystemStats -BaseUrl $ComfyUrl
$gpuBefore = Get-GpuSnapshot -Stats $systemStatsBefore

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
$historyData = $null
$historyErrorMessage = $null
$historyAttempts = 0
$historyErrors = @()
$historyPollLog = @()
$historyRetrievedAt = $null

while ((New-TimeSpan -Start $startTime).TotalSeconds -lt $MaxWaitSeconds -and (($MaxAttemptCount -le 0) -or ($historyAttempts -lt $MaxAttemptCount))) {
    $historyAttempts += 1
    $pollTimestamp = Get-Date
    try {
        $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5 -ErrorAction Stop
        if ($history -and $history.$promptId -and $history.$promptId.outputs) {
            $historyData = $history
            $historyRetrievedAt = Get-Date
            $historyPollLog += [pscustomobject]@{
                    Attempt   = $historyAttempts
                    Timestamp = $historyRetrievedAt.ToString('o')
                    Status    = 'success'
                }
            Write-SceneLog ("Workflow completed after {0}s" -f [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1))
            break
        } else {
            $historyPollLog += [pscustomobject]@{
                    Attempt   = $historyAttempts
                    Timestamp = $pollTimestamp.ToString('o')
                    Status    = 'pending'
                }
        }
    } catch {
        $historyErrorMessage = $_.Exception.Message
        $historyErrors += $historyErrorMessage
        $historyPollLog += [pscustomobject]@{
                Attempt   = $historyAttempts
                Timestamp = $pollTimestamp.ToString('o')
                Status    = 'error'
                Message   = $historyErrorMessage
            }
        Write-SceneLog ("History attempt {0}/{1} failed: {2}" -f $historyAttempts, $MaxAttemptCount, $historyErrorMessage)
    }
    Start-Sleep -Seconds $HistoryPollIntervalSeconds
}

if (-not $historyData) {
    if (-not $historyErrorMessage) {
        $historyErrorMessage = "No history found after $MaxWaitSeconds seconds"
    }
    Write-SceneLog "WARNING: $historyErrorMessage"
}

$historyPath = $null
if ($historyData) {
    $historyPath = Join-Path $SceneOutputDir 'history.json'
    $historyData | ConvertTo-Json -Depth 10 | Set-Content -Path $historyPath
}

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

$sceneEndTime = Get-Date
$systemStatsAfter = Get-ComfySystemStats -BaseUrl $ComfyUrl
$gpuAfter = Get-GpuSnapshot -Stats $systemStatsAfter

$warnings = @()
$errors = @()

if ($sceneFrames.Count -lt $FrameFloor) {
    $warnings += "Frame count below floor ($($sceneFrames.Count)/$FrameFloor)"
}
if (-not $historyData) {
    $warnings += "History missing: $historyErrorMessage"
}
if ($sceneFrames.Count -eq 0) {
    $errors += 'No frames copied'
}

$telemetryDurationSeconds = if ($sceneEndTime) { [Math]::Round((New-TimeSpan -Start $startTime -End $sceneEndTime).TotalSeconds, 1) } else { [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1) }
$telemetryQueueEnd = if ($sceneEndTime) { $sceneEndTime } else { Get-Date }
$telemetry = [pscustomobject]@{
    QueueStart = $startTime.ToString('o')
    QueueEnd = $telemetryQueueEnd.ToString('o')
    DurationSeconds = $telemetryDurationSeconds
    MaxWaitSeconds = $MaxWaitSeconds
    PollIntervalSeconds = $HistoryPollIntervalSeconds
    HistoryAttempts = $historyAttempts
    GPU = @{
        Name = if ($gpuAfter?.Name) { $gpuAfter.Name } elseif ($gpuBefore?.Name) { $gpuBefore.Name } else { $null }
        Type = if ($gpuAfter?.Type) { $gpuAfter.Type } elseif ($gpuBefore?.Type) { $gpuBefore.Type } else { $null }
        Index = if ($gpuAfter?.Index -ne $null) { $gpuAfter.Index } elseif ($gpuBefore?.Index -ne $null) { $gpuBefore.Index } else { $null }
        VramFreeBefore = $gpuBefore?.VramFree
        VramFreeAfter = $gpuAfter?.VramFree
        VramTotal = if ($gpuAfter?.VramTotal) { $gpuAfter.VramTotal } else { $gpuBefore?.VramTotal }
    }
    System = @{
        Before = $systemStatsBefore?.system
        After = $systemStatsAfter?.system
    }
}

$result = [pscustomobject]@{
    SceneId             = $SceneId
    Prompt              = $Prompt
    NegativePrompt      = $NegativePrompt
    FrameFloor          = $FrameFloor
    KeyframeSource      = $KeyframePath
    KeyframeInputName   = $keyframeName
    FrameCount          = $sceneFrames.Count
    FramePrefix         = $scenePrefix
    ClientId            = $clientId
    PromptId            = $promptId
    DurationSeconds     = [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1)
    GeneratedFramesDir  = $generatedFramesDir
    HistoryPath         = $historyPath
    OutputDirsScanned   = $copiedFrom
    Success             = ($sceneFrames.Count -gt 0)
    MeetsFrameFloor     = ($sceneFrames.Count -ge $FrameFloor)
    HistoryRetrieved    = ($historyData -ne $null)
    HistoryAttempts     = $historyAttempts
    HistoryRetrievedAt  = $historyRetrievedAt
    HistoryPollLog      = $historyPollLog
    HistoryErrors       = $historyErrors
    HistoryError        = $historyErrorMessage
    Warnings            = $warnings
    Errors              = $errors
    Telemetry           = $telemetry
}

return $result
