param(
    # Allows operators to tune the automatic requeue budget without editing the script.
    [int] $MaxSceneRetries = 1,
    [switch] $UseLocalLLM,
    [string] $LocalLLMProviderUrl,
    [string] $LocalLLMSeed,
    [int] $LocalLLMTimeoutMs = 8000
)

# CRITICAL FIX: Force UTF-8 encoding on Windows to prevent tqdm Unicode errors
# Windows defaults to cp1252 which cannot render Unicode progress bar characters.
# This must be set BEFORE ComfyUI starts to prevent KSampler execution failures.
if ([Environment]::OSVersion.Platform -eq 'Win32NT') {
    $env:PYTHONIOENCODING = 'utf-8'
    $env:PYTHONLEGACYWINDOWSSTDIO = '0'
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Windows detected: Applied UTF-8 encoding fix (PYTHONIOENCODING=utf-8, PYTHONLEGACYWINDOWSSTDIO=0)"
}

$MinimumNodeVersion = '22.19.0'

function Assert-NodeVersion {
    param(
        [string] $MinimumVersion = '22.19.0'
    )

    $nodeVersionOutput = & node -v 2>$null
    if ([string]::IsNullOrWhiteSpace($nodeVersionOutput)) {
        throw "Node.js not found in PATH. Minimum required version is v$MinimumVersion."
    }

    try {
        $parsedVersion = [version]($nodeVersionOutput.TrimStart('v'))
        $requiredVersion = [version]$MinimumVersion
    } catch {
        throw "Unable to parse Node.js version output '$nodeVersionOutput'."
    }

    if ($parsedVersion -lt $requiredVersion) {
        throw "Node.js v$MinimumVersion or newer is required. Current version: $nodeVersionOutput."
    }
}

Assert-NodeVersion -MinimumVersion $MinimumNodeVersion

$ProjectRoot = 'C:\Dev\gemDirect1'
$ResolvedLocalLLMProvider = if ($LocalLLMProviderUrl) { $LocalLLMProviderUrl } elseif ($env:LOCAL_STORY_PROVIDER_URL) { $env:LOCAL_STORY_PROVIDER_URL } else { $null }
if (-not $LocalLLMSeed -and $env:LOCAL_LLM_SEED) {
    $LocalLLMSeed = $env:LOCAL_LLM_SEED
}
if (-not $PSBoundParameters.ContainsKey('LocalLLMTimeoutMs') -and $env:LOCAL_LLM_TIMEOUT_MS) {
    [int]$LocalLLMTimeoutMs = [int]$env:LOCAL_LLM_TIMEOUT_MS
}
$ResolvedUseLocalLLM = $UseLocalLLM.IsPresent -or -not [string]::IsNullOrWhiteSpace($ResolvedLocalLLMProvider)

$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunDir = "$ProjectRoot\logs\$Timestamp"
mkdir -Path $RunDir -Force | Out-Null

$SummaryPath = "$RunDir\run-summary.txt"
Set-Content -Path $SummaryPath -Value "E2E Story-to-Video Run: $Timestamp"

function Add-RunSummary {
    param([string] $Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Add-Content -Path $SummaryPath -Value $line
}

function Get-SceneRetryReason {
    # Heuristic reason text explaining why another attempt is needed so run-summary/metadata stay auditable.
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject] $Result
    )

    if (-not $Result) {
        return 'unknown result'
    }
    if (-not $Result.Success) {
        return 'scene failed or returned no frames'
    }
    if (-not $Result.MeetsFrameFloor) {
        return ("frame count below floor ({0}/{1})" -f $Result.FrameCount, $Result.FrameFloor)
    }
    if (-not $Result.HistoryRetrieved) {
        return 'history missing'
    }
    return $null
}

Write-Host "Starting story-driven ComfyUI e2e run at $Timestamp"
Write-Host "Log directory: $RunDir"
Add-RunSummary "Log directory initialized: $RunDir"

# Step 1: Generate story + keyframes
Write-Host "Step 1: Generating story assets..."
$StoryDir = Join-Path $RunDir 'story'
$StoryScript = Join-Path $ProjectRoot 'scripts\generate-story-scenes.ts'
$SampleKeyframe = Join-Path $ProjectRoot 'sample_frame_start.png'
$SceneTargetCount = 3
if ($ResolvedUseLocalLLM) {
    $providerSummary = if ($ResolvedLocalLLMProvider) { $ResolvedLocalLLMProvider } else { 'custom provider' }
    Write-Host "  Using local LLM provider: $providerSummary (seed=${LocalLLMSeed ?? 'n/a'})"
}
$storyArgs = @('--loader', 'ts-node/esm', $StoryScript, '--output', $StoryDir, '--scenes', $SceneTargetCount.ToString(), '--sampleKeyframe', $SampleKeyframe)
if ($ResolvedUseLocalLLM) {
    $storyArgs += '--useLocalLLM'
}
if ($ResolvedLocalLLMProvider) {
    $storyArgs += @('--providerUrl', $ResolvedLocalLLMProvider)
}
if ($LocalLLMSeed) {
    $storyArgs += @('--localLLMSeed', $LocalLLMSeed)
}
if ($LocalLLMTimeoutMs -gt 0) {
    $storyArgs += @('--llmTimeoutMs', $LocalLLMTimeoutMs.ToString())
}
Push-Location $ProjectRoot
try {
    & node $storyArgs
    $storyExit = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($storyExit -ne 0) {
    throw "Story generator exited with $storyExit"
}
$StoryJsonPath = Join-Path $StoryDir 'story.json'
if (-not (Test-Path $StoryJsonPath)) {
    throw "Story JSON not found at $StoryJsonPath"
}
$StoryData = Get-Content -Path $StoryJsonPath -Raw | ConvertFrom-Json
$SceneDefinitions = @($StoryData.scenes)
$SceneDefinitionMap = @{}
foreach ($definition in $SceneDefinitions) {
    if ($definition.id) {
        $SceneDefinitionMap[$definition.id] = $definition
    }
}
Add-RunSummary ("Story ready: {0} (scenes={1})" -f $StoryData.storyId, $SceneDefinitions.Count)
Add-RunSummary ("Director's vision: {0}" -f $StoryData.directorsVision)
Add-RunSummary ("Story logline: {0}" -f $StoryData.logline)
if ($StoryData.llm) {
    $llmStatus = $StoryData.llm.status
    $llmProvider = if ($StoryData.llm.providerUrl) { $StoryData.llm.providerUrl } else { 'n/a' }
    $llmSeed = if ($StoryData.llm.seed) { $StoryData.llm.seed } else { 'n/a' }
    $llmDuration = if ($StoryData.llm.durationMs) { "$($StoryData.llm.durationMs)ms" } else { 'n/a' }
    Add-RunSummary ("Story LLM status: {0} (provider={1}, seed={2}, duration={3})" -f $llmStatus, $llmProvider, $llmSeed, $llmDuration)
    if ($StoryData.llm.error) {
        Add-RunSummary ("Story LLM error: {0}" -f $StoryData.llm.error)
    }
}
if ($StoryData.warnings) {
    foreach ($storyWarning in $StoryData.warnings) {
        Add-RunSummary ("[Story] WARNING: {0}" -f $storyWarning)
    }
}

# Step 2: Clean lingering processes
Write-Host "Step 2: Cleaning up lingering processes..."
Get-Process | Where-Object { $_.ProcessName -match 'node|npm|python' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Step 3: Start ComfyUI
Write-Host "Step 3: Starting ComfyUI..."
$ComfyPython = 'C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe'
$ComfyMain = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\main.py'
$ComfyProc = Start-Process -FilePath $ComfyPython `
    -ArgumentList @('-s', $ComfyMain, '--windows-standalone-build', '--listen', '0.0.0.0', '--port', '8188', '--enable-cors-header', '*') `
    -WorkingDirectory 'C:\ComfyUI\ComfyUI_windows_portable' `
    -NoNewWindow `
    -PassThru

Write-Host "  ComfyUI PID: $($ComfyProc.Id)"
Add-RunSummary "ComfyUI started with PID $($ComfyProc.Id)"

# Step 4: Wait for ComfyUI readiness
Write-Host "Step 4: Waiting for ComfyUI to be ready..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($ComfyProc.HasExited) {
        throw "ComfyUI process exited unexpectedly (code $($ComfyProc.ExitCode))"
    }
    try {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response) {
            $ready = $true
            $elapsed = $i * 2
            Write-Host "  ComfyUI is ready (after $elapsed seconds)"
            Add-RunSummary "ComfyUI ready after $elapsed seconds"
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) {
    throw "ComfyUI never became ready"
}

# Step 5: Queue each scene
Write-Host "Step 5: Generating scenes via REST pipeline..."
$RealWorkflowScript = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'queue-real-workflow.ps1'
$sceneResults = @()
$sceneAttemptMetadata = @{}
$sceneFailures = $false
$sceneWarnings = $false

foreach ($scene in $SceneDefinitions) {
    $sceneId = $scene.id
    $sceneLogDir = Join-Path $RunDir $sceneId
    New-Item -ItemType Directory -Path $sceneLogDir -Force | Out-Null

    $sceneJsonPath = Join-Path $sceneLogDir 'scene.json'
    ($scene | ConvertTo-Json -Depth 5) | Set-Content -Path $sceneJsonPath

    $sceneKeyframePath = $scene.keyframePath
    if (-not (Test-Path $sceneKeyframePath)) {
        $sceneKeyframePath = $SampleKeyframe
    }
    if (Test-Path $sceneKeyframePath) {
        Copy-Item -Path $sceneKeyframePath -Destination (Join-Path $sceneLogDir 'keyframe.png') -Force
    }

    $negativePrompt = if ([string]::IsNullOrWhiteSpace($scene.negativePrompt)) {
        'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur'
    } else {
        $scene.negativePrompt
    }
    $frameFloorValue = 25
    if ($scene.PSObject.Properties.Name -contains 'expectedFrames' -and $scene.expectedFrames -gt 0) {
        $frameFloorValue = [int][Math]::Round([double]$scene.expectedFrames)
    }

    $attemptResults = @()
    $attemptSummariesList = @()
    $maxAttempts = [Math]::Max(1, $MaxSceneRetries + 1)

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        $attemptTimestamp = (Get-Date).ToString('o')
        $result = $null
        try {
            $sceneMaxWait = 600
            $result = & $RealWorkflowScript `
                -SceneId $sceneId `
                -Prompt $scene.prompt `
                -NegativePrompt $negativePrompt `
                -KeyframePath $sceneKeyframePath `
                -SceneOutputDir $sceneLogDir `
                -FrameFloor $frameFloorValue `
                -MaxWaitSeconds $sceneMaxWait
        } catch {
            $err = $_.Exception.Message
            Write-Warning "[Scene $sceneId] Attempt $attempt failed: $err"
            Add-RunSummary "[Scene $sceneId] FAILED: $err"
            Add-RunSummary ("[Scene $sceneId] HISTORY ERROR: $err")
            $result = [pscustomobject]@{
                SceneId            = $sceneId
                Prompt             = $scene.prompt
                NegativePrompt     = $negativePrompt
                FrameFloor         = $frameFloorValue
                KeyframeSource     = $sceneKeyframePath
                KeyframeInputName  = ''
                FrameCount         = 0
                FramePrefix        = ''
                ClientId           = ''
                PromptId           = ''
                DurationSeconds    = 0
                GeneratedFramesDir = ''
                HistoryPath        = $null
                OutputDirsScanned  = @()
                Success            = $false
                MeetsFrameFloor    = $false
                HistoryRetrieved   = $false
                HistoryAttempts    = 0
                HistoryRetrievedAt = $null
                HistoryPollLog     = @()
                HistoryErrors      = @($err)
                HistoryError       = $err
                Warnings           = @()
                Errors             = @($err)
            }
        }

        if (-not ($result.PSObject.Properties.Name -contains 'Warnings')) {
            $result | Add-Member -NotePropertyName Warnings -Value @() -Force
        }
        if (-not ($result.PSObject.Properties.Name -contains 'Errors')) {
            $result | Add-Member -NotePropertyName Errors -Value @() -Force
        }

        $attemptSummariesList += [pscustomobject]@{
            Attempt          = $attempt
            Timestamp        = $attemptTimestamp
            FrameCount       = $result.FrameCount
            DurationSeconds  = $result.DurationSeconds
            Success          = $result.Success
            MeetsFrameFloor  = $result.MeetsFrameFloor
            HistoryRetrieved = $result.HistoryRetrieved
            Warnings         = $result.Warnings
            Errors           = $result.Errors
        }

        $attemptResults += $result

        $durationValue = if ($null -ne $result.DurationSeconds) { [Math]::Round([double]$result.DurationSeconds, 1) } else { 0 }
        $statusLine = "[Scene $sceneId][Attempt $attempt] Frames=$($result.FrameCount) Duration=${durationValue}s Prefix=$($result.FramePrefix)"
        Write-Host "  $statusLine"
        Add-RunSummary $statusLine

        if ($result.HistoryPath) {
            Add-RunSummary ("[Scene $sceneId] History saved: $($result.HistoryPath)")
        }

        $historyIssues = @()
        if (-not $result.HistoryRetrieved) {
            $historyIssues += (if ($result.HistoryError) { $result.HistoryError } else { 'Unknown history failure' })
        }
        if ($result.HistoryErrors -and $result.HistoryErrors.Count -gt 0) {
            $historyIssues += $result.HistoryErrors
        }
        if ($historyIssues.Count -gt 0) {
            $histMessage = [string]($historyIssues | Select-Object -Last 1)
            Add-RunSummary ("[Scene $sceneId] HISTORY WARNING: $histMessage (attempts=$($result.HistoryAttempts))")
        }

        foreach ($warning in $result.Warnings) {
            Add-RunSummary ("[Scene $sceneId] WARNING: {0}" -f $warning)
        }
        foreach ($errItem in $result.Errors) {
            Add-RunSummary ("[Scene $sceneId] ERROR: {0}" -f $errItem)
        }
        if ($result.Telemetry) {
            $telemetrySummaryParts = @()
            $telemetryDuration = if ($null -ne $result.Telemetry.DurationSeconds) { [Math]::Round([double]$result.Telemetry.DurationSeconds, 1) } else { $durationValue }
            $telemetrySummaryParts += "duration=${telemetryDuration}s"
            if ($result.Telemetry.MaxWaitSeconds) {
                $telemetrySummaryParts += "maxWait=$($result.Telemetry.MaxWaitSeconds)s"
            }
            if ($result.Telemetry.PollIntervalSeconds) {
                $telemetrySummaryParts += "pollInterval=$($result.Telemetry.PollIntervalSeconds)s"
            }
            if ($result.Telemetry.HistoryAttempts) {
                $telemetrySummaryParts += "historyAttempts=$($result.Telemetry.HistoryAttempts)"
            }
            if ($result.Telemetry.GPU) {
                $gpuName = if ($result.Telemetry.GPU.Name) { $result.Telemetry.GPU.Name } else { 'n/a' }
                $vramBefore = if ($result.Telemetry.GPU.VramFreeBefore) { $result.Telemetry.GPU.VramFreeBefore } else { 'n/a' }
                $vramAfter = if ($result.Telemetry.GPU.VramFreeAfter) { $result.Telemetry.GPU.VramFreeAfter } else { 'n/a' }
                $telemetrySummaryParts += "gpu=$gpuName vram=${vramBefore}/${vramAfter}"
            }
            Add-RunSummary ("[Scene $sceneId] Telemetry: {0}" -f ($telemetrySummaryParts -join ' | '))
        }

        $retryReason = Get-SceneRetryReason -Result $result
        if ($retryReason -and $attempt -lt $maxAttempts) {
            Add-RunSummary ("[Scene $sceneId] Requeue requested (next attempt {0}/{1}) reason: {2}" -f ($attempt + 1), $maxAttempts, $retryReason)
            Start-Sleep -Seconds 5
            continue
        }

        break
    }

    $finalResult = $attemptResults[-1]
    $sceneAttemptMetadata[$sceneId] = @{
        AttemptsRun = $attemptResults.Count
        Requeued = ($attemptResults.Count -gt 1)
        AttemptSummaries = $attemptSummariesList
    }
    $finalResult | Add-Member -NotePropertyName AttemptsRun -NotePropertyValue $sceneAttemptMetadata[$sceneId].AttemptsRun -Force
    $finalResult | Add-Member -NotePropertyName Requeued -NotePropertyValue $sceneAttemptMetadata[$sceneId].Requeued -Force
    $finalResult | Add-Member -NotePropertyName AttemptSummaries -NotePropertyValue $sceneAttemptMetadata[$sceneId].AttemptSummaries -Force
    if ($SceneDefinitionMap.ContainsKey($sceneId)) {
        $storyScene = $SceneDefinitionMap[$sceneId]
        $finalResult | Add-Member -NotePropertyName StoryTitle -NotePropertyValue $storyScene.title -Force
        $finalResult | Add-Member -NotePropertyName StorySummary -NotePropertyValue $storyScene.summary -Force
        $finalResult | Add-Member -NotePropertyName StoryMood -NotePropertyValue $storyScene.mood -Force
        $finalResult | Add-Member -NotePropertyName StoryExpectedFrames -NotePropertyValue $storyScene.expectedFrames -Force
        $finalResult | Add-Member -NotePropertyName StoryCameraMovement -NotePropertyValue $storyScene.cameraMovement -Force
    }

    $sceneResults += $finalResult

    if (-not $finalResult.Success) {
        $finalErrors = @()
        if ($finalResult.Errors) { $finalErrors = $finalResult.Errors }
        if ($finalErrors.Count -gt 0) {
            foreach ($err in $finalErrors) {
                Add-RunSummary ("[Scene $sceneId] ERROR: {0}" -f $err)
            }
        } else {
            Add-RunSummary ("[Scene $sceneId] ERROR: Scene still failed after {0} attempt(s)" -f $finalResult.AttemptsRun)
        }
    }

    if (-not $finalResult.Success) {
        $sceneFailures = $true
    }
    $finalWarnings = @()
    if ($finalResult.Warnings) { $finalWarnings = $finalResult.Warnings }
    if ($finalWarnings.Count -gt 0 -or -not $finalResult.MeetsFrameFloor -or -not $finalResult.HistoryRetrieved) {
        $sceneWarnings = $true
    }
}

$totalFrames = ($sceneResults | Measure-Object -Property FrameCount -Sum).Sum
$totalFramesDisplay = if ($null -eq $totalFrames) { 0 } else { $totalFrames }
$successfulScenes = ($sceneResults | Where-Object { $_.Success }).Count
$requeueCount = ($sceneAttemptMetadata.Values | Where-Object { $_.Requeued }).Count
Add-RunSummary ("Scene summary: {0}/{1} succeeded | total frames={2} | requeues={3}" -f $successfulScenes, $SceneDefinitions.Count, $totalFramesDisplay, $requeueCount)

## Step 6-8: Run Vitest suites via the unified helper
$RunVitestsScript = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'run-vitests.ps1'
Write-Host "Step 6-8: Running Vitest suites using $RunVitestsScript"

# Call helper and point it at the current run directory so logs and timings are colocated
& pwsh -NoLogo -ExecutionPolicy Bypass -File $RunVitestsScript -ProjectRoot $ProjectRoot -RunDir $RunDir
$vitestHelperExit = $LASTEXITCODE

# Prefer reading machine-readable vitest results produced by the helper
$ResultJsonPath = Join-Path $RunDir 'vitest-results.json'
$ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
$E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'
$ScriptsTestLog = Join-Path $RunDir 'vitest-scripts.log'
$comfyExit = 1
$e2eExit = 1
$scriptsExit = 1
if (Test-Path $ResultJsonPath) {
    try {
        $r = Get-Content -Path $ResultJsonPath -Raw | ConvertFrom-Json
        $comfyExit = [int]$r.comfyExit
        $e2eExit = [int]$r.e2eExit
        if ($null -ne $r.scriptsExit) { $scriptsExit = [int]$r.scriptsExit }
        if ($r.comfyLog) { $ComfyTestLog = $r.comfyLog }
        if ($r.e2eLog) { $E2eTestLog = $r.e2eLog }
        if ($r.scriptsLog) { $ScriptsTestLog = $r.scriptsLog }
        Add-RunSummary ("Vitest results read from JSON: {0}" -f $ResultJsonPath)
    } catch {
        Add-RunSummary ("Failed to read vitest results JSON: {0}" -f $_.Exception.Message)
    }
} else {
    # Fallback: parse the textual run-summary for compat
    if (Test-Path $SummaryPath) {
        $summaryLines = Get-Content -Path $SummaryPath -ErrorAction SilentlyContinue
        foreach ($ln in $summaryLines) {
            if ($ln -match 'Vitest comfyUI exitCode=(\d+)') { $comfyExit = [int]$Matches[1] }
            if ($ln -match 'Vitest e2e exitCode=(\d+)') { $e2eExit = [int]$Matches[1] }
        }
    }
}

$comfyTestsOk = ($comfyExit -eq 0)
$e2eTestsOk = ($e2eExit -eq 0)
$scriptsTestsOk = ($scriptsExit -eq 0)

Add-RunSummary ("Step 6: Vitest comfyUI suite completed (code {0})" -f $comfyExit)
Add-RunSummary ("Step 7: Vitest e2e suite completed (code {0})" -f $e2eExit)
Add-RunSummary ("Step 8: Vitest scripts suite completed (code {0})" -f $scriptsExit)

# Step 9: Stop ComfyUI
Write-Host "Step 9: Stopping ComfyUI..."
if ($ComfyProc -and -not $ComfyProc.HasExited) {
    Stop-Process -Id $ComfyProc.Id -Force
    Write-Host "  ComfyUI stopped"
    Add-RunSummary "ComfyUI stopped"
}

# Step 10: Archive logs
Write-Host "Step 10: Archiving logs..."
$ZipPath = "$ProjectRoot\artifacts\comfyui-e2e-$Timestamp.zip"
mkdir -Path (Split-Path $ZipPath) -Force | Out-Null
Compress-Archive -Path "$RunDir\*" -DestinationPath $ZipPath -Force
Write-Host "  Archived to: $ZipPath"
Add-RunSummary "Archived to: $ZipPath"

$ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
$E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'

$artifactIndex = @(
    "## Artifact Index",
    "Story folder: $StoryDir",
    "Scenes captured: $($SceneDefinitions.Count)",
    "Total frames copied: $totalFramesDisplay",
    "Vitest comfyUI log: $ComfyTestLog",
    "Vitest e2e log: $E2eTestLog",
    "Vitest scripts log: $ScriptsTestLog",
    "Vitest results json: $ResultJsonPath",
    "Archive: $ZipPath"
)
Add-Content -Path $SummaryPath -Value $artifactIndex

Write-Host "Step 11: Writing artifact metadata JSON"
$VitestResultsPath = if (Test-Path $ResultJsonPath) { $ResultJsonPath } else { $null }
$artifactMetadata = @{
    RunId = $Timestamp
    Timestamp = (Get-Date).ToString('o')
    RunDir = $RunDir
    Story = @{
        Id = $StoryData.storyId
        Logline = $StoryData.logline
        DirectorsVision = $StoryData.directorsVision
        Generator = $StoryData.generator
        File = $StoryJsonPath
        SceneCount = $SceneDefinitions.Count
        StoryDir = $StoryDir
        LLM = $StoryData.llm
        Warnings = $StoryData.warnings
    }
    Scenes = $sceneResults | ForEach-Object {
        $sceneInfo = if ($sceneAttemptMetadata.ContainsKey($_.SceneId)) { $sceneAttemptMetadata[$_.SceneId] } else { @{ AttemptsRun = $null; Requeued = $null; AttemptSummaries = $null } }
        $storyScene = if ($SceneDefinitionMap.ContainsKey($_.SceneId)) { $SceneDefinitionMap[$_.SceneId] } else { $null }
        @{
            SceneId = $_.SceneId
            Prompt = $_.Prompt
            NegativePrompt = $_.NegativePrompt
            FrameFloor = $_.FrameFloor
            FrameCount = $_.FrameCount
            DurationSeconds = $_.DurationSeconds
            FramePrefix = $_.FramePrefix
            HistoryPath = $_.HistoryPath
            HistoryRetrievedAt = $_.HistoryRetrievedAt
            HistoryPollLog = $_.HistoryPollLog
            HistoryErrors = $_.HistoryErrors
            Success = $_.Success
            MeetsFrameFloor = $_.MeetsFrameFloor
            HistoryRetrieved = $_.HistoryRetrieved
            HistoryAttempts = $_.HistoryAttempts
            HistoryError = $_.HistoryError
            Warnings = $_.Warnings
            Errors = $_.Errors
            AttemptsRun = $sceneInfo.AttemptsRun
            Requeued = $sceneInfo.Requeued
            AttemptSummaries = $sceneInfo.AttemptSummaries
            SceneOutputDir = (Join-Path $RunDir $_.SceneId)
            GeneratedFramesDir = $_.GeneratedFramesDir
            KeyframeSource = $_.KeyframeSource
            StoryTitle = $_.StoryTitle
            StorySummary = $_.StorySummary
            StoryMood = $_.StoryMood
            StoryExpectedFrames = $_.StoryExpectedFrames
            StoryCameraMovement = $_.StoryCameraMovement
            Telemetry = $_.Telemetry
            StoryKeyframe = if ($storyScene) { $storyScene.keyframePath } else { $null }
        }
    }
    VitestLogs = @{
        ComfyUI = $ComfyTestLog
        E2E = $E2eTestLog
        Scripts = $ScriptsTestLog
        ResultsJson = $VitestResultsPath
    }
    Archive = $ZipPath
}
$artifactMetadataJson = $artifactMetadata | ConvertTo-Json -Depth 6
$artifactMetaPath = Join-Path $RunDir 'artifact-metadata.json'
$artifactMetadataJson | Set-Content -Path $artifactMetaPath -Encoding utf8

$publicArtifactDir = Join-Path $ProjectRoot 'public\artifacts'
New-Item -ItemType Directory -Path $publicArtifactDir -Force | Out-Null
$publicArtifactFile = Join-Path $publicArtifactDir 'latest-run.json'
$artifactMetadataJson | Set-Content -Path $publicArtifactFile -Encoding utf8

# Step 12: Validate the generated run-summary for expected sections
$ValidateScript = Join-Path $ProjectRoot 'scripts\validate-run-summary.ps1'
if (Test-Path $ValidateScript) {
    Write-Host "Step 11: Validating run-summary with $ValidateScript"
    & pwsh -NoLogo -ExecutionPolicy Bypass -File $ValidateScript -RunDir $RunDir
    $validateExit = $LASTEXITCODE
    if ($validateExit -ne 0) {
        Add-RunSummary ("[Validation] run-summary validation failed (code {0})" -f $validateExit)
        Write-Warning "run-summary validation failed (code $validateExit)"
        # Preserve logs for inspection and fail the overall run
        exit 1
    }
    Add-RunSummary "[Validation] run-summary validation passed"
} else {
    Add-RunSummary "[Validation] validate-run-summary.ps1 not found; skipping validation"
}

Write-Host ""
Write-Host "=============================="
Write-Host "Story-to-video e2e complete!"
Write-Host "Logs: $RunDir"
Write-Host "Summary: $SummaryPath"
Write-Host "=============================="

$overallSuccess = (-not $sceneFailures) -and $comfyTestsOk -and $e2eTestsOk -and $scriptsTestsOk
if (-not $overallSuccess) {
    Write-Warning "One or more steps failed (scene failure: $sceneFailures, comfy tests ok: $comfyTestsOk, e2e tests ok: $e2eTestsOk, scripts tests ok: $scriptsTestsOk)"
    exit 1
}

if ($sceneWarnings) {
    Write-Warning "Scenes completed with warnings (frame count below floor)."
}

exit 0
