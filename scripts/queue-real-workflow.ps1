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
    [int] $HistoryPollIntervalSeconds = 2,
    [int] $PostExecutionTimeoutSeconds = 30,
    [int] $SceneRetryBudget = 1
    ,[int] $AttemptNumber = 1
    ,[bool] $WaitForDoneMarker = $true
    ,[int] $DoneMarkerTimeoutSeconds = 60
    ,[int] $StabilitySeconds = 5
    ,[int] $StabilityRetries = 3
)

$ErrorActionPreference = 'Stop'

function Write-SceneLog {
    param(
        [string] $Message
    )
    Write-Host "[Real E2E][$SceneId] $Message"
}

function Normalize-VramValue {
    param([object] $Value)

    if ($null -eq $Value) { return 0 }
    if ($Value -is [long] -or $Value -is [int]) { return [double]$Value }
    if ($Value -is [string]) {
        if ([double]::TryParse($Value, [ref]$parsed)) { return $parsed }
        return 0
    }
    try {
        return [double]$Value
    } catch {
        return 0
    }
}

function Get-NvidiaSmiSystemStats {
    # Reference: NVIDIA nvidia-smi output documentation for --query-gpu
    $gpu = Get-GpuSnapshotFromNvidiaSmi
    if (-not $gpu) { return $null }
    return [pscustomobject]@{
        system = [ordered]@{
            source = 'nvidia-smi'
            note = 'Fallback when /system_stats is unavailable or incomplete'
        }
        devices = @(
            [ordered]@{
                name = $gpu.Name
                type = $gpu.Type
                index = $gpu.Index
                vram_total = $gpu.VramTotal
                vram_free = $gpu.VramFree
                fallback = $gpu.FallbackSource
            }
        )
    }
}

function Get-ComfySystemStats {
    param(
        [string] $BaseUrl
    )
    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            $stats = Invoke-RestMethod -Uri "$BaseUrl/system_stats" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            return $stats
        } catch {
            Write-SceneLog ("Debug: /system_stats attempt {0}/{1} failed: {2}" -f $attempt, $maxAttempts, $_.Exception.Message)
            if ($attempt -lt $maxAttempts) {
                Start-Sleep -Milliseconds 500
            }
        }
    }
    # Fall back to parsing nvidia-smi when /system_stats is unreachable (see https://developer.nvidia.com/nvidia-system-management-interface)
    $smiStats = Get-NvidiaSmiSystemStats
    if ($smiStats) {
        Write-SceneLog "Debug: /system_stats unavailable; using nvidia-smi fallback for GPU summary"
        return $smiStats
    }
    return $null
}

function Get-GpuSnapshotFromNvidiaSmi {
    <#
    Attempt to query GPU information using the nvidia-smi binary as a
    fallback when ComfyUI's /system_stats is unavailable or incomplete.
    Returns a hashtable with fields matching the /system_stats-derived
    snapshot (Name, Type, Index, VramTotal, VramFree) where sizes are
    expressed in bytes (to match system_stats semantics). Adds
    FallbackSource='nvidia-smi' when successful.
    #>
    try {
        $args = @('--query-gpu=name,index,memory.total,memory.free','--format=csv,noheader,nounits')
        $smiOut = & nvidia-smi $args 2>&1
        if (-not $smiOut) { return $null }

        # Take the first GPU line if multiple present
        $line = $smiOut | Select-Object -First 1
        if (-not $line) { return $null }

        $parts = $line -split ',' | ForEach-Object { $_.Trim() }
        if ($parts.Count -lt 4) { return $null }

        $name = $parts[0]
        $index = $null
        $memTotalMB = $null
        $memFreeMB = $null
        if ([int]::TryParse($parts[1], [ref]$tmp)) { $index = $tmp }
        if ([int]::TryParse($parts[2], [ref]$tmp)) { $memTotalMB = $tmp }
        if ([int]::TryParse($parts[3], [ref]$tmp)) { $memFreeMB = $tmp }

        $vramTotalBytes = if ($memTotalMB -ne $null) { [int64]$memTotalMB * 1048576 } else { 0 }
        $vramFreeBytes = if ($memFreeMB -ne $null) { [int64]$memFreeMB * 1048576 } else { 0 }

        return @{ Name = $name; Type = 'nvidia'; Index = $index; VramTotal = $vramTotalBytes; VramFree = $vramFreeBytes; FallbackSource = 'nvidia-smi' }
    } catch {
        return $null
    }
}

function Get-GpuSnapshot {
    param(
        [object] $Stats
    )

    # Prefer using /system_stats when it provides usable VRAM fields. Different
    # ComfyUI builds may expose slightly different property names, so attempt
    # to extract common variants before falling back.
    if ($Stats -and $Stats.devices) {
        $device = $Stats.devices | Select-Object -First 1
        if ($device) {
            # Attempt to discover VRAM properties under common names
            $vramTotal = $null
            $vramFree = $null
            if ($device.PSObject.Properties.Name -contains 'vram_total') { $vramTotal = $device.vram_total }
            elseif ($device.PSObject.Properties.Name -contains 'memory_total') { $vramTotal = $device.memory_total }
            elseif ($device.PSObject.Properties.Name -contains 'memory_total_bytes') { $vramTotal = $device.memory_total_bytes }
            elseif ($device.PSObject.Properties.Name -contains 'vram_total_bytes') { $vramTotal = $device.vram_total_bytes }

            if ($device.PSObject.Properties.Name -contains 'vram_free') { $vramFree = $device.vram_free }
            elseif ($device.PSObject.Properties.Name -contains 'memory_free') { $vramFree = $device.memory_free }
            elseif ($device.PSObject.Properties.Name -contains 'memory_free_bytes') { $vramFree = $device.memory_free_bytes }
            elseif ($device.PSObject.Properties.Name -contains 'vram_free_bytes') { $vramFree = $device.vram_free_bytes }

            # If we found either total or free memory values, return the system_stats-derived snapshot
            if ($vramTotal -ne $null -or $vramFree -ne $null) {
                return @{ Name = $device.name; Type = $device.type; Index = $device.index; VramTotal = Normalize-VramValue $vramTotal; VramFree = Normalize-VramValue $vramFree; FallbackSource = 'system_stats' }
            }
        }
    }

    # Fall back to nvidia-smi if available
    $fallback = Get-GpuSnapshotFromNvidiaSmi
    if ($fallback) { return $fallback }
    return @{ Name = 'Unknown'; Type = 'unknown'; Index = 0; VramTotal = 0; VramFree = 0; FallbackSource = 'missing' }
}

if (-not (Test-Path $SceneOutputDir)) {
    New-Item -ItemType Directory -Path $SceneOutputDir -Force | Out-Null
}

$generatedFramesDir = Join-Path $SceneOutputDir 'generated-frames'
# Support attempt-specific output directories to avoid overwriting previous
# attempt captures when the orchestrator requeues the same scene. The caller
# may pass -AttemptNumber so each invocation writes into a distinct folder
# (generated-frames-attempt-<n>). If not provided, fall back to the canonical
# generated-frames directory.
$attemptFramesDir = $null
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

# Reference: ComfyUI websocket_api_example.py (https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py)
# History detection relies on presence of history.$promptId in /history response, not .outputs
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

if ($workflow.PSObject.Properties.Name -contains '9') {
    if ($workflow.'9'.PSObject.Properties.Name -notcontains 'inputs') {
        $workflow.'9' | Add-Member -MemberType NoteProperty -Name inputs -Value @{} -Force
    }
    $workflow.'9'.inputs.scene_prefix = $scenePrefix
    $workflow.'9'.inputs.output_dir = 'C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\output'
    $workflow.'9'.widgets_values = @($scenePrefix)
} else {
    Write-SceneLog "Warning: workflow missing WriteDoneMarker node (id 9); done marker metadata will not be produced."
}

$clientId = "scene-$SceneId-$([guid]::NewGuid().ToString('N'))"
$payload = @{
    prompt    = $workflow
    client_id = $clientId
}
$payloadJson = $payload | ConvertTo-Json -Depth 10

Write-SceneLog "Queuing workflow (client_id: $clientId)"
try {
    $promptResponse = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method POST -ContentType 'application/json' -Body $payloadJson -TimeoutSec 15 -ErrorAction Stop
} catch {
    Write-SceneLog "ERROR: Failed to queue workflow: $($_.Exception.Message)"
    throw $_
}

if (-not $promptResponse.prompt_id) {
    throw "ComfyUI did not return a prompt_id for scene $SceneId"
}

$promptId = $promptResponse.prompt_id
Write-SceneLog "Queued prompt_id $promptId"


# Start main attempt timer and initialize history/polling state
$startTime = Get-Date

# Quick post-queue preflight: short probe to detect immediate failures (e.g. "image failed to load")
# This prevents long waits when ComfyUI cannot load the provided keyframe. We look for any
# output frames that appear immediately; if none are found within the timeout we inspect the
# ComfyUI log for explicit load errors and fail fast to conserve time during tests.
$preflightTimeout = 30
$preflightInterval = 2
$preflightStart = Get-Date
$preflightFramesFound = $false
while ((New-TimeSpan -Start $preflightStart).TotalSeconds -lt $preflightTimeout) {
    foreach ($outputDir in $possibleOutputDirs) {
        if (-not (Test-Path $outputDir)) { continue }
        $frames = @(Get-ChildItem -Path $outputDir -Filter "$scenePrefix*.png" -File -ErrorAction SilentlyContinue)
        if ($frames.Count -gt 0) {
            $preflightFramesFound = $true
            break
        }
    }
    if ($preflightFramesFound) { break }
    Start-Sleep -Seconds $preflightInterval
}

if (-not $preflightFramesFound) {
    $inputKeyframePath = Join-Path $comfyInputDir $keyframeName
    if (-not (Test-Path $inputKeyframePath)) {
        Write-SceneLog ("Preflight: keyframe not found in ComfyUI input dir: {0}" -f $inputKeyframePath)
    } else {
        try {
            $sz = (Get-Item $inputKeyframePath -ErrorAction Stop).Length
            if ($sz -eq 0) {
                Write-SceneLog ("Preflight: keyframe exists but is zero-length: {0}" -f $inputKeyframePath)
                throw "Keyframe zero-length"
            }
        } catch {
            # best-effort; continue to more detailed checks below
        }
    }

    $comfyLogPath = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\user\comfyui.log'
    if (Test-Path $comfyLogPath) {
        try {
            $logTail = Get-Content -Path $comfyLogPath -Tail 400 -ErrorAction Stop -Raw
            if ($logTail -match '(?i)failed to load|failed to read image|image failed|error.*load') {
                Write-SceneLog "Preflight: detected image load failure in ComfyUI log; aborting to avoid long wait."
                throw "ComfyUI reported image load error"
            }
        } catch {
            # ignore log-read failures and continue
        }
    }

    Write-SceneLog "Preflight: no immediate frames found and no explicit load error detected; proceeding with normal history polling (this may take longer)."
}
$historyData = $null
$historyErrorMessage = $null
$historyAttempts = 0
$historyErrors = @()
$historyPollLog = @()
$historyRetrievedAt = $null
$executionSuccessTime = $null
$postExecTimeoutReached = $false

# Defensive initialization: ensure these collections are always arrays so calling
# `.Count` does not throw when telemetry code reads frame counts. This follows
# the TELEMETRY contract which requires numeric counts and avoids null
# telemetry that can break the validator/UI. See TELEMETRY_CONTRACT.md for
# field expectations and traceability.
$sceneFrames = @()
$copiedFrom = @()

# Wrap the main workflow in a try/catch to ensure the script ALWAYS returns a
# structured result object (including a Telemetry block) even when unexpected
# errors occur. This prevents the caller (run-comfyui-e2e.ps1) from receiving a
# $null result which causes artifact metadata to miss required telemetry fields.
try {

while ((New-TimeSpan -Start $startTime).TotalSeconds -lt $MaxWaitSeconds -and (($MaxAttemptCount -le 0) -or ($historyAttempts -lt $MaxAttemptCount))) {
    $historyAttempts += 1
    $pollTimestamp = Get-Date
    try {
        $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5 -ErrorAction Stop
        # For SaveImage nodes, outputs may not populate. Just check if workflow was queued.
        if ($history -and $history.$promptId) {
            # History found! Record success time and continue polling for post-execution timeout.
            if (-not $historyData) {
                $historyData = $history
                $executionSuccessTime = Get-Date
                $historyRetrievedAt = $executionSuccessTime
            }
            $historyPollLog += [pscustomobject]@{
                    Attempt   = $historyAttempts
                    Timestamp = $pollTimestamp.ToString('o')
                    Status    = 'success'
                }
            # After finding history, poll through post-execution timeout window
            $postExecElapsedSeconds = (New-TimeSpan -Start $executionSuccessTime).TotalSeconds
            if ($postExecElapsedSeconds -ge $PostExecutionTimeoutSeconds) {
                # Post-execution timeout reached; exit gracefully
                $postExecTimeoutReached = $true
                Write-SceneLog ("Post-execution timeout reached after {0}s; exiting history loop" -f [Math]::Round($postExecElapsedSeconds, 1))
                break
            }
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

# After history timeout, continue waiting for frames to be written to disk
# ComfyUI may still be generating/saving frames even if history endpoint hasn't populated yet
$frameWaitStart = Get-Date
$frameWaitTimeout = 300  # Additional 300 seconds (5 minutes) to wait for frames after history timeout
$framesFound = $false
$noFrameCount = 0
$sceneFrames = @()
$copiedFrom = @()
# Collect any frame-stability warnings here so they can be merged into the
# canonical $warnings array (which is declared later after GPU snapshots).
$frameStabilityWarnings = @()
$doneMarkerDetected = $false
$doneMarkerPath = $null
$localMarkerCreated = $false
$forcedCopyDebugPath = $null
$forcedCopyTriggered = $false
$forcedCopyFallbackNote = $null
$doneMarkerWaitTimeSeconds = 0
$doneMarkerWarnings = @()

# If history data is present and ComfyUI reported explicit output filenames,
# prefer those filenames (deterministic) and wait up to the post-execution
# timeout for them to appear. This avoids brittle globbing and handles cases
# where history may list PNGs that are created slightly after history is
# published.
try {
    $expectedFilenames = @()
    if ($historyData -and $historyData.$promptId -and $historyData.$promptId.outputs) {
        foreach ($nodeKey in $historyData.$promptId.outputs.PSObject.Properties.Name) {
            $nodeOut = $historyData.$promptId.outputs.$nodeKey
            if ($nodeOut.images) {
                foreach ($img in $nodeOut.images) {
                    if ($img.filename) { $expectedFilenames += $img.filename }
                }
            }
        }
    }
} catch {
    $expectedFilenames = @()
}

if ($expectedFilenames.Count -gt 0) {
    Write-SceneLog ("Debug: history reported {0} expected filenames; waiting up to {1}s for them to appear" -f $expectedFilenames.Count, $PostExecutionTimeoutSeconds)
    $deadline = (Get-Date).AddSeconds($PostExecutionTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $foundFiles = @()
        foreach ($outputDir in $possibleOutputDirs) {
            if (-not (Test-Path $outputDir)) { continue }
            foreach ($fname in $expectedFilenames) {
                $candidate = Join-Path $outputDir $fname
                if (Test-Path $candidate) { $foundFiles += Get-Item -Path $candidate }
            }
        }
        if ($foundFiles.Count -gt 0) {
            # Use the deterministically-found files as the scene frames
            $sceneFrames = $foundFiles | Sort-Object LastWriteTime
            $best = [pscustomobject]@{ Dir = ($foundFiles | Select-Object -First 1).DirectoryName; Count = $sceneFrames.Count; Latest = ($sceneFrames | Select-Object -Last 1).LastWriteTime; Frames = $sceneFrames }
            # Copy into attempt-specific directory below (reuse existing copy logic)
            $framesFound = $true
            $copiedFrom = @($best.Dir)
            $copiedAttemptDir = if ($AttemptNumber -and ($AttemptNumber -gt 0)) { Join-Path $SceneOutputDir ("generated-frames-attempt-{0}" -f $AttemptNumber) } else { $generatedFramesDir }
            New-Item -ItemType Directory -Path $copiedAttemptDir -Force | Out-Null
            foreach ($frame in $sceneFrames) {
                Copy-Item -Path $frame.FullName -Destination (Join-Path $copiedAttemptDir $frame.Name) -Force
            }
            $sceneFrames = $sceneFrames
            Write-SceneLog ("Debug: copied {0} history-referenced frames into {1}" -f ($sceneFrames.Count), $copiedAttemptDir)
            break
        }
        Start-Sleep -Seconds 1
    }
    # If we already found and copied frames via history-referenced filenames,
    # the subsequent generic scanning loop is guarded by -not $framesFound and
    # will be skipped automatically. No explicit jump is required here.
}

while (-not $framesFound -and ((New-TimeSpan -Start $frameWaitStart).TotalSeconds -lt $frameWaitTimeout)) {
    $copiedFrom = @()
    $sceneFrames = @()
    $frameCheckCount = 0
    $candidates = @()

    foreach ($outputDir in $possibleOutputDirs) {
        if (-not (Test-Path $outputDir)) {
            continue
        }

        # Collect matching frames and sort by LastWriteTime so we can pick the most
        # recently-updated output directory as the canonical source of the sequence.
        $frames = @(Get-ChildItem -Path $outputDir -Filter "$scenePrefix*.png" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
        $count = $frames.Count
        $frameCheckCount += $count
        $latest = $null
        if ($count -gt 0) {
            # LastWriteTime of the most recently written file in this directory
            $latest = ($frames | Select-Object -Last 1).LastWriteTime
            $candidates += [pscustomobject]@{ Dir = $outputDir; Count = $count; Latest = $latest; Frames = $frames }
        }

        Write-SceneLog ("Debug: scanning outputDir={0} matched={1} latest={2}" -f $outputDir, $count, ($latest -as [string]))
    }

    if ($candidates.Count -gt 0) {
        # Prefer candidate directories that include an explicit ".done" marker
        # created by the producer (or sentinel). This is a deterministic
        # producer/consumer handshake that avoids brittle timing heuristics.
        $markerCandidates = @()
        if ($WaitForDoneMarker) {
            foreach ($cand in $candidates) {
                $markerPath = Join-Path $cand.Dir ("$scenePrefix.done")
                if (Test-Path $markerPath) { $markerCandidates += $cand }
            }
        }

        if ($markerCandidates.Count -gt 0) {
            $usable = $markerCandidates
            if (-not $doneMarkerDetected) {
                $doneMarkerDetected = $true
                $candidateMarker = Join-Path ($markerCandidates | Select-Object -First 1).Dir ("$scenePrefix.done")
                $doneMarkerPath = $candidateMarker
            }
        } else {
            $usable = $candidates
        }

        # Choose the candidate dir whose most-recent file write is newest. Tie-break on
        # larger frame count so tests that multiplex on disk pick the longest sequence.
        $best = $usable | Sort-Object -Property @{ Expression = { $_.Latest } ; Descending = $true }, @{ Expression = { $_.Count } ; Descending = $true } | Select-Object -First 1
        $framesToCopy = $best.Frames

        # If we did not find a marker candidate but the caller asked us to wait for
        # a producer-created marker, attempt to wait for it for a bounded timeout
        # before falling back to the stability-time heuristic.
        $skipStabilityCheck = $false
        $markerPath = Join-Path $best.Dir ("$scenePrefix.done")
        if ($WaitForDoneMarker -and ($markerCandidates.Count -eq 0)) {
            $doneWaitElapsed = 0
            $doneWaitInterval = 2
            while (-not (Test-Path $markerPath) -and $doneWaitElapsed -lt $DoneMarkerTimeoutSeconds) {
                Write-SceneLog ("Debug: waiting for done marker {0} (elapsed {1}/{2}s)" -f $markerPath, $doneWaitElapsed, $DoneMarkerTimeoutSeconds)
                Start-Sleep -Seconds $doneWaitInterval
                $doneWaitElapsed += $doneWaitInterval
            }
            $doneMarkerWaitTimeSeconds = $doneWaitElapsed
            if (Test-Path $markerPath) {
                Write-SceneLog ("Debug: done marker found: {0}" -f $markerPath)
                # Marker indicates producer finished writing sequence; skip stability checks
                $skipStabilityCheck = $true
                $doneMarkerDetected = $true
                $doneMarkerPath = $markerPath
                Write-SceneLog ("Debug: done marker wait time: {0}s" -f [Math]::Round($doneMarkerWaitTimeSeconds, 1))
            } else {
                Write-SceneLog ("Debug: done marker not found after {0}s; falling back to stability checks" -f $DoneMarkerTimeoutSeconds)
                $doneMarkerWarnings += "Done marker not found after $DoneMarkerTimeoutSeconds seconds (waited $doneMarkerWaitTimeSeconds seconds)"
            }
        }

        # Verify file stability before copying unless a done marker tells us the
        # producer finished (skipStabilityCheck == $true). This avoids copying
        # partially-written images produced by ComfyUI's SaveImage nodes.
        if (-not $skipStabilityCheck) {
            $stabilitySeconds = $StabilitySeconds
            $stabilityRetries = $StabilityRetries
            $stable = $false
            for ($attempt = 1; $attempt -le $stabilityRetries; $attempt++) {
                $latestFile = $framesToCopy | Select-Object -Last 1
                if ($latestFile -and $latestFile.LastWriteTime) {
                    $ageSec = (New-TimeSpan -Start $latestFile.LastWriteTime -End (Get-Date)).TotalSeconds
                } else {
                    $ageSec = [double]::PositiveInfinity
                }

                Write-SceneLog ("Debug: verifying file stability (attempt {0}/{1}) latestWriteAgeSeconds={2}" -f $attempt, $stabilityRetries, ([Math]::Round($ageSec, 2)))

                if ($ageSec -gt $stabilitySeconds) {
                    $stable = $true
                    break
                }
                Start-Sleep -Seconds 1
            }

            if (-not $stable) {
                Write-SceneLog ("Warning: frames appear to be recently written and may still be in-flight; proceeding with copy after {0} attempts" -f $stabilityRetries)
                $forcedCopyTriggered = $true
                $warningText = "Frames appeared freshly written; forced copy after $stabilityRetries stability checks"
                $frameStabilityWarnings += $warningText
            }
        }

            # If we reach here and either a done marker was found or files appear stable
            # (or we are forced to copy after stability retries), proactively create a
            # local done marker so other processes (or future attempts) can detect the
            # completed sequence deterministically. This helps when producer cannot
            # reliably create markers or when the sentinel is not available.
            try {
                $producerMarkerPath = Join-Path $best.Dir ("$scenePrefix.done")
                if (-not (Test-Path $producerMarkerPath)) {
                    $markerPayload = @{ Timestamp = (Get-Date).ToString('o'); FrameCount = $best.Count; Latest = $best.Latest.ToString('o') }
                    $markerPayload | ConvertTo-Json -Depth 3 | Set-Content -Path $producerMarkerPath -Encoding utf8 -Force
                    Write-SceneLog ("Debug: created local done marker: {0}" -f $producerMarkerPath)
                    $localMarkerCreated = $true
                    $doneMarkerDetected = $true
                    $doneMarkerPath = $producerMarkerPath
                } else {
                    Write-SceneLog ("Debug: producer marker already present: {0}" -f $producerMarkerPath)
                    $doneMarkerDetected = $true
                    $doneMarkerPath = $producerMarkerPath
                }
            } catch {
                Write-SceneLog ("Debug: failed to write local done marker: {0}" -f $_.Exception.Message)
            }

        # Create an attempt-specific output directory to preserve earlier attempts.
        if ($AttemptNumber -and ($AttemptNumber -gt 0)) {
            $attemptFramesDir = Join-Path $SceneOutputDir ("generated-frames-attempt-{0}" -f $AttemptNumber)
        } else {
            $attemptFramesDir = $generatedFramesDir
        }
        New-Item -ItemType Directory -Path $attemptFramesDir -Force | Out-Null

        foreach ($frame in $framesToCopy) {
            Copy-Item -Path $frame.FullName -Destination (Join-Path $attemptFramesDir $frame.Name) -Force
        }
        $sceneFrames = $framesToCopy
        $copiedFrom = @($best.Dir)
        # Record which directory (attempt-specific) holds the copied frames for this invocation
        $copiedAttemptDir = $attemptFramesDir
        $framesFound = $true
        Write-SceneLog ("Debug: chosen outputDir={0} count={1} latest={2}" -f $best.Dir, $best.Count, $best.Latest)

        if ($forcedCopyTriggered) {
            $timestampTag = (Get-Date).ToString('yyyyMMddHHmmss')
            $forcedCopyDebugPath = Join-Path $SceneOutputDir ("forced-copy-debug-$timestampTag.txt")
            $candidateDetails = $candidates | ForEach-Object { "Candidate: $($_.Dir) frames=$($_.Count) latest=$($_.Latest)" }
            $debugContent = @(
                "Timestamp: $timestampTag",
                "ScenePrefix: $scenePrefix",
                "Best output dir: $($best.Dir)",
                "Frame count: $($best.Count)",
                "Latest file: $($best.Latest)",
                "Stability retries: $stabilityRetries",
                "Stability window: $StabilitySeconds",
                "Marker path waited: $markerPath",
                "Candidates:",
                ($candidateDetails -join [Environment]::NewLine)
            )
            $debugContent | Set-Content -Path $forcedCopyDebugPath -Encoding UTF8 -Force
            Write-SceneLog ("Debug: wrote forced-copy debug dump: {0}" -f $forcedCopyDebugPath)
            $forcedCopyFallbackNote = "Forced copy after stability retries; see $forcedCopyDebugPath"
        }
        break
    }

    if (-not $framesFound) {
        # Only log every 10 checks (every 20 seconds) to reduce noise
        if (($noFrameCount++ % 10) -eq 0) {
            Write-SceneLog ("Still waiting for frames (elapsed: {0}s)..." -f [Math]::Round((New-TimeSpan -Start $frameWaitStart).TotalSeconds, 0))
        }
        Start-Sleep -Seconds 2
    }
}

if (@($sceneFrames).Count -eq 0) {
    # ensure arrays (defensive, though initialized above)
    $sceneFrames = @()
    $copiedFrom = @()
}

$frameCount = @($sceneFrames).Count
if ($frameCount -eq 0) {
    Write-SceneLog "No frames found for prefix $scenePrefix"
} else {
    $destDir = if ($copiedAttemptDir) { $copiedAttemptDir } else { $generatedFramesDir }
    Write-SceneLog ("Copied {0} frames into {1}" -f $frameCount, $destDir)
}

$sceneEndTime = Get-Date
$systemStatsAfter = Get-ComfySystemStats -BaseUrl $ComfyUrl
$gpuAfter = Get-GpuSnapshot -Stats $systemStatsAfter

$warnings = @()
$errors = @()
if ($frameStabilityWarnings -and $frameStabilityWarnings.Count -gt 0) {
    $warnings += $frameStabilityWarnings
}

if ($doneMarkerWarnings -and $doneMarkerWarnings.Count -gt 0) {
    $warnings += $doneMarkerWarnings
}

if (@($sceneFrames).Count -lt $FrameFloor) {
    $warnings += "Frame count below floor ($(@($sceneFrames).Count)/$FrameFloor)"
}
if (-not $historyData) {
    $warnings += "History missing: $historyErrorMessage"
}
if (@($sceneFrames).Count -eq 0) {
    $errors += 'No frames copied'
}

$telemetryDurationSeconds = if ($sceneEndTime) { [Math]::Round((New-TimeSpan -Start $startTime -End $sceneEndTime).TotalSeconds, 1) } else { [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1) }
$telemetryQueueEnd = if ($sceneEndTime) { $sceneEndTime } else { Get-Date }

# Determine exit reason following ComfyUI /history status flow (see websocket_api_example.py)
# Per telemetry contract: success | maxWait | attemptLimit | postExecution | unknown
$historyExitReason = 'unknown'
if ($postExecTimeoutReached) {
    $historyExitReason = 'postExecution'
} elseif ($historyData) {
    $historyExitReason = 'success'
} elseif ($historyAttempts -ge $MaxAttemptCount -and $MaxAttemptCount -gt 0) {
    $historyExitReason = 'attemptLimit'
} elseif ((New-TimeSpan -Start $startTime).TotalSeconds -ge $MaxWaitSeconds) {
    $historyExitReason = 'maxWait'
}

# Convert VRAM values from bytes to MB (divide by 1048576)
$vramBeforeMB = if ($gpuBefore -and $gpuBefore.VramFree -ne $null) { [Math]::Round($gpuBefore.VramFree / 1048576, 1) } else { $null }
$vramAfterMB = if ($gpuAfter -and $gpuAfter.VramFree -ne $null) { [Math]::Round($gpuAfter.VramFree / 1048576, 1) } else { $null }
$vramDeltaMB = if ($vramBeforeMB -ne $null -and $vramAfterMB -ne $null) { [Math]::Round($vramAfterMB - $vramBeforeMB, 1) } else { $null }

# Collect system/GPU fallback notes. We want to record whether /system_stats was
# unavailable or incomplete and whether we used the nvidia-smi fallback so that
# validators and the UI can surface what data source was used.
$fallbackNotes = @()
if (-not $systemStatsBefore) {
    if ($gpuBefore -and $gpuBefore.FallbackSource -eq 'nvidia-smi') {
        $fallbackNotes += "/system_stats unavailable before execution; used nvidia-smi fallback"
    } else {
        $fallbackNotes += "/system_stats unavailable before execution"
    }
} elseif ($gpuBefore -and $gpuBefore.FallbackSource -eq 'nvidia-smi') {
    $fallbackNotes += "/system_stats present but missing VRAM before execution; used nvidia-smi fallback"
}

if (-not $systemStatsAfter) {
    if ($gpuAfter -and $gpuAfter.FallbackSource -eq 'nvidia-smi') {
        $fallbackNotes += "/system_stats unavailable after execution; used nvidia-smi fallback"
    } else {
        $fallbackNotes += "/system_stats unavailable after execution"
    }
} elseif ($gpuAfter -and $gpuAfter.FallbackSource -eq 'nvidia-smi') {
    $fallbackNotes += "/system_stats present but missing VRAM after execution; used nvidia-smi fallback"
}

if ($frameStabilityWarnings.Count -gt 0) {
    $fallbackNotes += $frameStabilityWarnings
}
if ($forcedCopyFallbackNote) {
    $fallbackNotes += $forcedCopyFallbackNote
}
if ($doneMarkerWarnings.Count -gt 0) {
    $fallbackNotes += $doneMarkerWarnings
}

Write-SceneLog ("Debug: After frame copy: frameCount={0}, framesFound={1}, copiedFrom={2}" -f @($sceneFrames).Count, $framesFound, ($copiedFrom -join ','))
Write-SceneLog ("Debug: GPU before snapshot present: {0}" -f ([bool]$systemStatsBefore))
try {
    $gpubeforeJson = if ($gpuBefore) { $gpuBefore | ConvertTo-Json -Depth 5 -Compress } else { 'null' }
    Write-SceneLog ("Debug: GPU before: $gpubeforeJson")
} catch {
    Write-SceneLog "Debug: GPU before: (failed to convert to json)"
}

Write-SceneLog ("Debug: GPU after snapshot present: {0}" -f ([bool]$systemStatsAfter))
try {
    $gpuafterJson = if ($gpuAfter) { $gpuAfter | ConvertTo-Json -Depth 5 -Compress } else { 'null' }
    Write-SceneLog ("Debug: GPU after: $gpuafterJson")
} catch {
    Write-SceneLog "Debug: GPU after: (failed to convert to json)"
}

# Report which fallback sources (if any) were used to populate GPU info
$beforeFallback = if ($gpuBefore -and $gpuBefore.FallbackSource) { $gpuBefore.FallbackSource } else { 'none' }
$afterFallback = if ($gpuAfter -and $gpuAfter.FallbackSource) { $gpuAfter.FallbackSource } else { 'none' }
Write-SceneLog ("Debug: GPU fallback sources: before={0} after={1}" -f $beforeFallback, $afterFallback)

    $telemetry = [pscustomobject]@{
    QueueStart = $startTime.ToString('o')
    QueueEnd = $telemetryQueueEnd.ToString('o')
    DurationSeconds = $telemetryDurationSeconds
    MaxWaitSeconds = $MaxWaitSeconds
    PollIntervalSeconds = $HistoryPollIntervalSeconds
    HistoryAttempts = $historyAttempts
    HistoryAttemptLimit = $MaxAttemptCount
    HistoryExitReason = $historyExitReason
    HistoryPostExecutionTimeoutReached = $postExecTimeoutReached
    PostExecutionTimeoutSeconds = $PostExecutionTimeoutSeconds
    ExecutionSuccessDetected = $historyData -ne $null
    ExecutionSuccessAt = if ($historyRetrievedAt) { $historyRetrievedAt.ToString('o') } else { $null }
    SceneRetryBudget = $SceneRetryBudget
    DoneMarkerDetected = $doneMarkerDetected
    DoneMarkerWaitSeconds = [math]::Round($doneMarkerWaitTimeSeconds, 1)
    DoneMarkerPath = $doneMarkerPath
    ForcedCopyTriggered = $forcedCopyTriggered
    ForcedCopyDebugPath = $forcedCopyDebugPath
    # NOTE: The GPU block follows the telemetry contract. Keep naming in sync with
    # TELEMETRY_CONTRACT.md so validators and UI can reliably parse these fields.
    GPU = @{
        Name = if ($gpuAfter -and $gpuAfter.Name) { $gpuAfter.Name } elseif ($gpuBefore -and $gpuBefore.Name) { $gpuBefore.Name } else { "Unknown" }
        Type = if ($gpuAfter -and $gpuAfter.Type) { $gpuAfter.Type } elseif ($gpuBefore -and $gpuBefore.Type) { $gpuBefore.Type } else { $null }
        Index = if ($gpuAfter -and ($gpuAfter.Index -ne $null)) { $gpuAfter.Index } elseif ($gpuBefore -and ($gpuBefore.Index -ne $null)) { $gpuBefore.Index } else { $null }
        VramFreeBefore = if ($gpuBefore -and $gpuBefore.VramFree -ne $null) { $gpuBefore.VramFree } else { $null }
        VramFreeAfter = if ($gpuAfter -and $gpuAfter.VramFree -ne $null) { $gpuAfter.VramFree } else { $null }
        VramBeforeMB = $vramBeforeMB
        VramAfterMB = $vramAfterMB
        VramDeltaMB = $vramDeltaMB
        VramTotal = if ($gpuAfter -and $gpuAfter.VramTotal -ne $null) { $gpuAfter.VramTotal } elseif ($gpuBefore -and $gpuBefore.VramTotal -ne $null) { $gpuBefore.VramTotal } else { $null }
    }
    System = @{
        Before = if ($systemStatsBefore -and $systemStatsBefore.system) { $systemStatsBefore.system } else { $null }
        After = if ($systemStatsAfter -and $systemStatsAfter.system) { $systemStatsAfter.system } else { $null }
        FallbackNotes = (@($fallbackNotes) | Where-Object { $_ -and $_ -ne '' })
    }
}

    $result = [pscustomobject]@{
    SceneId             = $SceneId
    Prompt              = $Prompt
    NegativePrompt      = $NegativePrompt
    FrameFloor          = $FrameFloor
    KeyframeSource      = $KeyframePath
    KeyframeInputName   = $keyframeName
    FrameCount          = if ($sceneFrames) { @($sceneFrames).Count } else { 0 }
    FramePrefix         = $scenePrefix
    ClientId            = $clientId
    PromptId            = $promptId
    DurationSeconds     = [Math]::Round((New-TimeSpan -Start $startTime).TotalSeconds, 1)
    GeneratedFramesDir  = if ($copiedAttemptDir) { $copiedAttemptDir } else { $generatedFramesDir }
    HistoryPath         = $historyPath
    OutputDirsScanned   = $copiedFrom
    Success             = if ($sceneFrames) { @($sceneFrames).Count -gt 0 } else { $false }
    MeetsFrameFloor     = if ($sceneFrames) { @($sceneFrames).Count -ge $FrameFloor } else { $false }
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

} catch {
    # Capture the error details and return a best-effort result with a
    # telemetry stub so downstream validators/UI receive the required fields.
    $errMsg = $_.Exception.Message
    $errStack = $_.Exception.StackTrace
    $invocationInfo = $_.InvocationInfo
    $errScriptLine = if ($invocationInfo) { $invocationInfo.ScriptLineNumber } else { $null }
    $errScriptLineText = if ($invocationInfo) { $invocationInfo.Line } else { $null }
    Write-SceneLog ("Unhandled exception in queue-real-workflow.ps1: {0} (line {1})" -f $errMsg, $errScriptLine)

    $telemetryFallback = [pscustomobject]@{
        QueueStart = $startTime.ToString('o')
        QueueEnd = (Get-Date).ToString('o')
        DurationSeconds = 0
        MaxWaitSeconds = $MaxWaitSeconds
        PollIntervalSeconds = $HistoryPollIntervalSeconds
        HistoryAttempts = $historyAttempts
        HistoryAttemptLimit = $MaxAttemptCount
        HistoryExitReason = 'unknown'
        HistoryPostExecutionTimeoutReached = $postExecTimeoutReached
        PostExecutionTimeoutSeconds = $PostExecutionTimeoutSeconds
        ExecutionSuccessDetected = $false
        ExecutionSuccessAt = $null
        SceneRetryBudget = $SceneRetryBudget
        GPU = @{ Name = $gpuBefore?.Name; Type = $gpuBefore?.Type; Index = $gpuBefore?.Index; VramFreeBefore = $gpuBefore?.VramFree; VramFreeAfter = $gpuAfter?.VramFree; VramBeforeMB = $vramBeforeMB; VramAfterMB = $vramAfterMB; VramDeltaMB = $vramDeltaMB; VramTotal = $gpuBefore?.VramTotal }
        System = @{ Before = $systemStatsBefore?.system; After = $systemStatsAfter?.system; FallbackNotes = @("Queue script error: $errMsg") }
    }

    # Add stack trace and helpful debug dump to fallback notes
    $stackInfo = if ($errStack) { $errStack } else { 'no stack available' }
    # Append script location and stacktrace to fallback notes to aid debugging
    if ($errScriptLine) { $telemetryFallback.System.FallbackNotes += "ScriptLine: $errScriptLine" }
    if ($errScriptLineText) { $telemetryFallback.System.FallbackNotes += "ScriptLineText: $errScriptLineText" }
    $telemetryFallback.System.FallbackNotes += "StackTrace: $stackInfo"

    # Write a debug file into the scene output dir so failures are inspectable
    try {
        $debugPath = Join-Path $SceneOutputDir 'queue-error-debug.txt'
        $debugContent = @(
            "Timestamp: $(Get-Date -Format o)",
            "Error: $errMsg",
            "StackTrace:",
            $stackInfo,
            "ScriptLine:$errScriptLine",
            "ScriptLineText:$errScriptLineText",
            "--- Current quick state dump ---",
            "framesFound=$framesFound",
            "sceneFrames.Count=$(@($sceneFrames).Count)",
            "copiedFrom=$($copiedFrom -join ',')",
            "historyAttempts=$historyAttempts",
            "historyErrorMessage=$historyErrorMessage"
        )
        $debugContent | Set-Content -Path $debugPath -Encoding UTF8 -Force
    } catch {
        # ignore debug write failures
    }

    $resultOnErr = [pscustomobject]@{
        SceneId = $SceneId
        Prompt = $Prompt
        NegativePrompt = $NegativePrompt
        FrameFloor = $FrameFloor
        KeyframeSource = $KeyframePath
        KeyframeInputName = $keyframeName
        FrameCount = 0
        FramePrefix = $scenePrefix
        ClientId = $clientId
        PromptId = $promptId
        DurationSeconds = 0
        GeneratedFramesDir = $generatedFramesDir
        HistoryPath = $historyPath
        OutputDirsScanned = $copiedFrom
        Success = $false
        MeetsFrameFloor = $false
        HistoryRetrieved = ($historyData -ne $null)
        HistoryAttempts = $historyAttempts
        HistoryRetrievedAt = $historyRetrievedAt
        HistoryPollLog = $historyPollLog
        HistoryErrors = @($errMsg)
        HistoryError = $errMsg
        Warnings = $warnings
        Errors = @($errMsg)
        Telemetry = $telemetryFallback
    }

    return $resultOnErr

}
