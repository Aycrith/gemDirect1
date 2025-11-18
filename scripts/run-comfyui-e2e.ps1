param(
    # Allows operators to tune the automatic requeue budget without editing the script.
    [Alias('MaxSceneRetries')]
    [int] $SceneRetryBudget = 1,
    [switch] $UseLocalLLM,
    [string] $LocalLLMProviderUrl,
    [string] $LocalLLMSeed,
    [int] $LocalLLMTimeoutMs = 8000,
    [string] $LocalLLMModel,
    [Nullable[Double]] $LocalLLMTemperature,
    [string] $LocalLLMRequestFormat,
    [string] $LocalLLMHealthcheckUrl,
    [int] $SceneMaxWaitSeconds = 600,
    [int] $SceneHistoryMaxAttempts = 0,
    [int] $SceneHistoryPollIntervalSeconds = 2,
    [int] $ScenePostExecutionTimeoutSeconds = 30,
    [switch] $FastIteration,
    [switch] $SkipLLMHealthCheck
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

function Resolve-LlmHealthUrl {
    param(
        [string] $ProviderUrl,
        [string] $Override
    )

    # Follow the LM Studio health-check URL pattern documented at https://lmstudio.ai/docs/api#health-checks
    if (-not [string]::IsNullOrWhiteSpace($Override)) {
        return $Override
    }
    if ([string]::IsNullOrWhiteSpace($ProviderUrl)) {
        return $null
    }
    try {
        $uri = [Uri]$ProviderUrl
        $builder = [System.UriBuilder]::new($uri)
        $path = $builder.Path.TrimEnd('/')
        if ($path -match '/v1/chat/completions$') {
            $builder.Path = $path -replace '/chat/completions$', '/models'
        } elseif ($path -match '/v1$') {
            $builder.Path = "$path/models"
        } else {
            $builder.Path = '/v1/models'
        }
        $builder.Query = ''
        return $builder.Uri.AbsoluteUri
    } catch {
        throw "Unable to derive LLM health check URL from $ProviderUrl ($($_.Exception.Message))"
    }
}

function Invoke-LlmHealthCheck {
    param(
        [string] $HealthUrl,
        [int] $TimeoutSeconds = 5
    )

    if ([string]::IsNullOrWhiteSpace($HealthUrl)) {
        return [ordered]@{ Status = 'skipped'; Message = 'No health-check URL resolved' }
    }

    Write-Host "Step 2a: Probing local LLM health at $HealthUrl ..."
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -UseBasicParsing -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        $modelCount = if ($response.data) { $response.data.Count } elseif ($response.models) { $response.models.Count } else { $null }
        return [ordered]@{ Status = 'success'; Models = $modelCount }
    } catch {
        $errorMessage = $_.Exception.Message
        return [ordered]@{ Status = 'failed'; Error = $errorMessage }
    }
}

$ProjectRoot = 'C:\Dev\gemDirect1'
$ResolvedLocalLLMProvider = if ($LocalLLMProviderUrl) { $LocalLLMProviderUrl } elseif ($env:LOCAL_STORY_PROVIDER_URL) { $env:LOCAL_STORY_PROVIDER_URL } else { $null }
if (-not $LocalLLMSeed -and $env:LOCAL_LLM_SEED) {
    $LocalLLMSeed = $env:LOCAL_LLM_SEED
}
if (-not $PSBoundParameters.ContainsKey('LocalLLMTimeoutMs') -and $env:LOCAL_LLM_TIMEOUT_MS) {
    [int]$LocalLLMTimeoutMs = [int]$env:LOCAL_LLM_TIMEOUT_MS
}
if (-not $LocalLLMModel -and $env:LOCAL_LLM_MODEL) {
    $LocalLLMModel = $env:LOCAL_LLM_MODEL
}
if (-not $PSBoundParameters.ContainsKey('LocalLLMTemperature') -and $env:LOCAL_LLM_TEMPERATURE) {
    [Nullable[Double]]$LocalLLMTemperature = [double]$env:LOCAL_LLM_TEMPERATURE
}
if (-not $LocalLLMRequestFormat -and $env:LOCAL_LLM_REQUEST_FORMAT) {
    $LocalLLMRequestFormat = $env:LOCAL_LLM_REQUEST_FORMAT
}
$healthOverride = if ($LocalLLMHealthcheckUrl) { $LocalLLMHealthcheckUrl } elseif ($env:LOCAL_LLM_HEALTHCHECK_URL) { $env:LOCAL_LLM_HEALTHCHECK_URL } else { $null }
if (-not $PSBoundParameters.ContainsKey('SceneMaxWaitSeconds') -and $env:SCENE_MAX_WAIT_SECONDS) {
    [int]$SceneMaxWaitSeconds = [int]$env:SCENE_MAX_WAIT_SECONDS
}
if (-not $PSBoundParameters.ContainsKey('SceneHistoryMaxAttempts') -and $env:SCENE_HISTORY_MAX_ATTEMPTS) {
    [int]$SceneHistoryMaxAttempts = [int]$env:SCENE_HISTORY_MAX_ATTEMPTS
}
if (-not $PSBoundParameters.ContainsKey('SceneHistoryPollIntervalSeconds') -and $env:SCENE_HISTORY_POLL_INTERVAL_SECONDS) {
    [int]$SceneHistoryPollIntervalSeconds = [int]$env:SCENE_HISTORY_POLL_INTERVAL_SECONDS
}
if (-not $PSBoundParameters.ContainsKey('ScenePostExecutionTimeoutSeconds') -and $env:SCENE_POST_EXECUTION_TIMEOUT_SECONDS) {
    [int]$ScenePostExecutionTimeoutSeconds = [int]$env:SCENE_POST_EXECUTION_TIMEOUT_SECONDS
}
if (-not $PSBoundParameters.ContainsKey('SceneRetryBudget') -and $env:SCENE_RETRY_BUDGET) {
    [int]$SceneRetryBudget = [int]$env:SCENE_RETRY_BUDGET
}
if ($SceneMaxWaitSeconds -le 0) {
    throw "SceneMaxWaitSeconds must be greater than zero."
}
if ($SceneHistoryPollIntervalSeconds -lt 1) {
    throw "SceneHistoryPollIntervalSeconds must be at least 1."
}
if ($SceneHistoryMaxAttempts -lt 0) {
    throw "SceneHistoryMaxAttempts cannot be negative."
}
if ($SceneRetryBudget -lt 0) {
    throw "SceneRetryBudget cannot be negative."
}
$ResolvedUseLocalLLM = $UseLocalLLM.IsPresent -or -not [string]::IsNullOrWhiteSpace($ResolvedLocalLLMProvider)
$ResolvedSkipHealthCheck = $SkipLLMHealthCheck.IsPresent -or ($env:LOCAL_LLM_SKIP_HEALTHCHECK -eq '1')

$LLMHealthInfo = [ordered]@{
    Url = $null
    Override = $healthOverride
    Status = 'not requested'
    Models = $null
    Error = $null
    Timestamp = (Get-Date).ToString('o')
    Skipped = $ResolvedSkipHealthCheck
    SkipReason = $null
}

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

    # If we have sufficient frames for the scene (MeetsFrameFloor == true),
    # prefer the locally-copied frames even if ComfyUI's history endpoint has
    # not yet populated. Requeueing solely because history is missing produced
    # repeated attempts that subsequently found zero frames (race between
    # execution and history population). Therefore do NOT request a requeue for
    # "history missing" when the frame floor has been met; instead let the
    # caller surface a warning.
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
    $modelSummary = if ($LocalLLMModel) { "model=$LocalLLMModel" } else { 'model=default' }
    $formatSummary = if ($LocalLLMRequestFormat) { "format=$LocalLLMRequestFormat" } else { 'format=auto' }
    Write-Host "  Using local LLM provider: $providerSummary ($modelSummary | seed=${LocalLLMSeed ?? 'n/a'} | $formatSummary)"
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
if ($LocalLLMModel) {
    $storyArgs += @('--localLLMModel', $LocalLLMModel)
}
if ($null -ne $LocalLLMTemperature) {
    $storyArgs += @('--localLLMTemperature', $LocalLLMTemperature.ToString())
}
if ($LocalLLMRequestFormat) {
    $storyArgs += @('--llmRequestFormat', $LocalLLMRequestFormat)
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
$historyAttemptDisplay = if ($SceneHistoryMaxAttempts -gt 0) { $SceneHistoryMaxAttempts } else { 'unbounded' }

# Fast iteration mode: reduce timeouts and poll intervals to speed up dev cycles.
if ($FastIteration.IsPresent) {
    Write-Host "FastIteration enabled: reducing poll intervals and timeouts for quicker feedback"
    # Reduce history wait timeout for quick feedback (30s instead of 600s)
    $SceneMaxWaitSeconds = [int]30
    # Keep HistoryPollInterval at minimum allowed (1s)
    $SceneHistoryPollIntervalSeconds = 1
    # Reduce post-execution timeout for quick experiments
    $ScenePostExecutionTimeoutSeconds = [int]15
    # Reduce frame wait timeout in fast iteration mode (60s instead of 300s)
    $FrameWaitTimeoutSeconds = 60
    $SentinelScanIntervalSeconds = 0.5
    $SentinelStableSeconds = 1
    $QueueStabilitySeconds = 1
    $QueueStabilityRetries = 2
    Add-RunSummary ("FastIteration mode enabled: historyMaxWait={0}s historyPollInterval={1}s postExecTimeout={2}s frameWaitTimeout={3}s sentinelScan={4}s sentinelStable={5}s queueStability={6}s stabilityRetries={7}" -f $SceneMaxWaitSeconds, $SceneHistoryPollIntervalSeconds, $ScenePostExecutionTimeoutSeconds, $FrameWaitTimeoutSeconds, $SentinelScanIntervalSeconds, $SentinelStableSeconds, $QueueStabilitySeconds, $QueueStabilityRetries)
} else {
    $FrameWaitTimeoutSeconds = 300
    $SentinelScanIntervalSeconds = 2
    $SentinelStableSeconds = 3
    $QueueStabilitySeconds = 5
    $QueueStabilityRetries = 3
}

Add-RunSummary ("Queue policy: sceneRetries={0}, historyMaxWait={1}s, historyPollInterval={2}s, historyMaxAttempts={3}, postExecutionTimeout={4}s" -f $SceneRetryBudget, $SceneMaxWaitSeconds, $SceneHistoryPollIntervalSeconds, $historyAttemptDisplay, $ScenePostExecutionTimeoutSeconds)

if ($ResolvedUseLocalLLM -and $ResolvedLocalLLMProvider -and -not $ResolvedSkipHealthCheck) {
    $llmHealthUrl = Resolve-LlmHealthUrl -ProviderUrl $ResolvedLocalLLMProvider -Override $healthOverride
    $LLMHealthInfo.Url = $llmHealthUrl
    $healthResult = Invoke-LlmHealthCheck -HealthUrl $llmHealthUrl
    $LLMHealthInfo.Status = $healthResult.Status
    if ($healthResult.Models) {
        $LLMHealthInfo.Models = $healthResult.Models
    }
    if ($healthResult.Error) {
        $LLMHealthInfo.Error = $healthResult.Error
    }
    $modelDisplay = if ($healthResult.Models) { $healthResult.Models } else { 'n/a' }
    $overrideDisplay = if ($healthOverride) { $healthOverride } else { 'default' }
    if ($healthResult.Status -eq 'success') {
        Add-RunSummary ("[LLM] Health check: success (url={0}, models={1}, override={2})" -f $llmHealthUrl, $modelDisplay, $overrideDisplay)
    } else {
        Add-RunSummary ("[LLM] Health check failed: {0} (url={1}, override={2})" -f $LLMHealthInfo.Error, $llmHealthUrl, $overrideDisplay)
        throw "Local LLM health check failed: $($LLMHealthInfo.Error)"
    }
} elseif ($ResolvedSkipHealthCheck) {
    $LLMHealthInfo.Status = 'skipped'
    $LLMHealthInfo.SkipReason = 'operator requested skip'
    Add-RunSummary "[LLM] Health check skipped by operator request"
} elseif (-not $ResolvedUseLocalLLM -or -not $ResolvedLocalLLMProvider) {
    $LLMHealthInfo.Status = 'not requested'
    $LLMHealthInfo.SkipReason = 'no local provider configured'
    Add-RunSummary "[LLM] Health check skipped (no local provider configured)"
}

# Step 2: Clean lingering processes
Write-Host "Step 2: Cleaning up lingering processes..."
# If ComfyUI is already running and responsive, prefer to reuse it rather than
# killing processes and starting a new instance. This avoids race conditions and
# accidental termination of an in-use ComfyUI server which can make runs appear
# hung. Probe the /system_stats endpoint to determine reachability.
$comfyAlreadyRunning = $false
try {
    $probe = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($probe) { $comfyAlreadyRunning = $true }
} catch {
    $comfyAlreadyRunning = $false
}

if (-not $comfyAlreadyRunning) {
    Get-Process | Where-Object { $_.ProcessName -match 'node|npm|python' } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    Add-RunSummary "ComfyUI already running and reachable; skipping process cleanup/start to avoid interruptions"
}

# Step 3: Start ComfyUI (only if not already running)
if (-not $comfyAlreadyRunning) {
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
} else {
    Write-Host "Step 3: ComfyUI already running; skipping start"
    Add-RunSummary "Step 3: ComfyUI already running; skipping start"
    $ComfyProc = $null
}

# Step 4: Wait for ComfyUI readiness
Write-Host "Step 4: Waiting for ComfyUI to be ready..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($ComfyProc -and $ComfyProc.HasExited) {
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

# Start optional done-marker sentinel to produce producer-side .done markers
# that consumer scripts can wait on. We prefer to reuse an existing job if one
# is already running, otherwise start a short-lived background job that runs
# the sentinel script. We will stop it later if we started it here.
$StartedDoneSentinel = $false
$SentinelJobName = 'comfyui-done-sentinel'
try {
    $existingJob = Get-Job -Name $SentinelJobName -State Running -ErrorAction SilentlyContinue
} catch {
    $existingJob = $null
}
if (-not $existingJob) {
    Write-Host "Starting done-marker sentinel job ($SentinelJobName)"
    Start-Job -Name $SentinelJobName -ScriptBlock {
        param($scan, $stable, $url)
        & 'C:\Dev\gemDirect1\scripts\generate-done-markers.ps1' -ScanIntervalSeconds $scan -StableSeconds $stable -ComfyUrl $url
    } -ArgumentList $SentinelScanIntervalSeconds, $SentinelStableSeconds, 'http://127.0.0.1:8188' | Out-Null
    $StartedDoneSentinel = $true
    Add-RunSummary "Started done-marker sentinel job ($SentinelJobName)"
} else {
    Add-RunSummary "Done-marker sentinel job already running; reusing existing job"
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
    $maxAttempts = [Math]::Max(1, $SceneRetryBudget + 1)

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        $attemptTimestamp = (Get-Date).ToString('o')
        $result = $null
        try {
            $result = & $RealWorkflowScript `
                -SceneId $sceneId `
                -Prompt $scene.prompt `
                -NegativePrompt $negativePrompt `
                -KeyframePath $sceneKeyframePath `
                -SceneOutputDir $sceneLogDir `
                -FrameFloor $frameFloorValue `
                -MaxWaitSeconds $SceneMaxWaitSeconds `
                -MaxAttemptCount $SceneHistoryMaxAttempts `
                -HistoryPollIntervalSeconds $SceneHistoryPollIntervalSeconds `
                -PostExecutionTimeoutSeconds $ScenePostExecutionTimeoutSeconds `
                    -SceneRetryBudget $SceneRetryBudget `
                    -AttemptNumber $attempt `
                    -WaitForDoneMarker $true `
                    -DoneMarkerTimeoutSeconds $ScenePostExecutionTimeoutSeconds `
                    -StabilitySeconds $QueueStabilitySeconds `
                    -StabilityRetries $QueueStabilityRetries `
                    -FrameWaitTimeoutSeconds $FrameWaitTimeoutSeconds
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

        # Guard against null result from queue script IMMEDIATELY after invocation
        if (-not $result) {
            Write-Host "ERROR: queue-real-workflow.ps1 returned null for scene $sceneId" -ForegroundColor Red
            Add-RunSummary ("[Scene $sceneId] ERROR: Queue script returned null")
            $result = [pscustomobject]@{
                SceneId = $sceneId
                FrameCount = 0
                DurationSeconds = 0
                FramePrefix = ""
                HistoryRetrieved = $false
                HistoryError = "Queue script returned null"
                HistoryErrors = @("Queue script returned null")
                HistoryAttempts = 0
                HistoryPollLog = @()
                HistoryRetrievedAt = $null
                Warnings = @()
                Errors = @("Queue script returned null")
                Telemetry = $null
                HistoryPath = $null
                Success = $false
                MeetsFrameFloor = $false
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
            # Fixed: Replace inline if with explicit conditional to avoid PowerShell parser issues
            if ($result.HistoryError) {
                $historyIssues += $result.HistoryError
            } else {
                $historyIssues += 'Unknown history failure'
            }
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
            $telemetrySummaryParts += "DurationSeconds=${telemetryDuration}s"
            if ($null -ne $result.Telemetry.MaxWaitSeconds) {
                $telemetrySummaryParts += "MaxWaitSeconds=${($result.Telemetry.MaxWaitSeconds)}s"
            }
            if ($null -ne $result.Telemetry.PollIntervalSeconds) {
                $telemetrySummaryParts += "PollIntervalSeconds=${($result.Telemetry.PollIntervalSeconds)}s"
            }
            if ($null -ne $result.Telemetry.HistoryAttempts) {
                $telemetrySummaryParts += "HistoryAttempts=$($result.Telemetry.HistoryAttempts)"
            }
            $pollLimitValue = if ($result.Telemetry.HistoryAttemptLimit -gt 0) { $result.Telemetry.HistoryAttemptLimit } else { 'unbounded' }
            $telemetrySummaryParts += "pollLimit=$pollLimitValue"
            $retryBudgetValue = if ($null -ne $result.Telemetry.SceneRetryBudget -and $result.Telemetry.SceneRetryBudget -gt 0) { $result.Telemetry.SceneRetryBudget } else { 'unbounded' }
            $telemetrySummaryParts += "SceneRetryBudget=$retryBudgetValue"
            if ($null -ne $result.Telemetry.PostExecutionTimeoutSeconds) {
                $telemetrySummaryParts += "PostExecutionTimeoutSeconds=${($result.Telemetry.PostExecutionTimeoutSeconds)}s"
            }
            if ($result.Telemetry.ExecutionSuccessDetected) {
                $telemetrySummaryParts += 'ExecutionSuccessDetected=true'
            }
            if ($result.Telemetry.ExecutionSuccessAt) {
                try {
                    $successAt = [DateTimeOffset]::Parse($result.Telemetry.ExecutionSuccessAt).ToLocalTime().ToString('HH:mm:ss')
                    $telemetrySummaryParts += "ExecutionSuccessAt=$successAt"
                } catch {
                    $telemetrySummaryParts += ("ExecutionSuccessAt={0}" -f $result.Telemetry.ExecutionSuccessAt)
                }
            }
            if ($result.Telemetry.HistoryExitReason) {
                $telemetrySummaryParts += "HistoryExitReason=$($result.Telemetry.HistoryExitReason)"
            }
            if ($result.Telemetry.HistoryPostExecutionTimeoutReached) {
                $telemetrySummaryParts += 'HistoryPostExecutionTimeoutReached=true'
            }
            if ($result.Telemetry.GPU) {
                $gpuName = if ($result.Telemetry.GPU.Name) { $result.Telemetry.GPU.Name } else { 'n/a' }
                $telemetrySummaryParts += "GPU={$gpuName}"
                if ($result.Telemetry.GPU.VramBeforeMB -ne $null) {
                    $telemetrySummaryParts += ("VRAMBeforeMB={0}MB" -f $result.Telemetry.GPU.VramBeforeMB)
                }
                if ($result.Telemetry.GPU.VramAfterMB -ne $null) {
                    $telemetrySummaryParts += ("VRAMAfterMB={0}MB" -f $result.Telemetry.GPU.VramAfterMB)
                }
                if ($result.Telemetry.GPU.VramDeltaMB -ne $null) {
                    $telemetrySummaryParts += ("VRAMDeltaMB={0}MB" -f $result.Telemetry.GPU.VramDeltaMB)
                }
            }

            if ($result.Telemetry.DoneMarkerWaitSeconds -ne $null) {
                $telemetrySummaryParts += ("DoneMarkerWaitSeconds={0}s" -f $result.Telemetry.DoneMarkerWaitSeconds)
            }
            $telemetrySummaryParts += ("DoneMarkerDetected={0}" -f ($result.Telemetry.DoneMarkerDetected ? 'true' : 'false'))
            if ($result.Telemetry.DoneMarkerPath) {
                $telemetrySummaryParts += ("DoneMarkerPath={0}" -f $result.Telemetry.DoneMarkerPath)
            }
            $telemetrySummaryParts += ("ForcedCopyTriggered={0}" -f ($result.Telemetry.ForcedCopyTriggered ? 'true' : 'false'))
            if ($result.Telemetry.ForcedCopyTriggered -and $result.Telemetry.ForcedCopyDebugPath) {
                $telemetrySummaryParts += ("ForcedCopyDebugPath={0}" -f $result.Telemetry.ForcedCopyDebugPath)
            }
            if ($result.Telemetry.System -and $result.Telemetry.System.FallbackNotes) {
                $fallbackNotes = $result.Telemetry.System.FallbackNotes | Where-Object { $_ } | ForEach-Object { $_.ToString() }
                if ($fallbackNotes.Count -gt 0) {
                    $telemetrySummaryParts += ("fallback={0}" -f ($fallbackNotes -join '; '))
                }
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

    # Choose final result object. By default take the last attempt, but preserve the
    # best observed frame count across attempts so the artifact metadata reflects
    # the successful work even if a subsequent requeue returned no frames.
    $finalResult = $attemptResults[-1]
    try {
        $bestAttempt = $attemptResults | Sort-Object -Property @{Expression = { if ($null -ne $_.FrameCount) { [int]$_.FrameCount } else { 0 } } } -Descending | Select-Object -First 1
        if ($bestAttempt -and ($bestAttempt.FrameCount -gt 0)) {
            # Update finalResult to reflect the best observed frame-count and success status
            $finalResult.FrameCount = $bestAttempt.FrameCount
            $finalResult.Success = if ($bestAttempt.FrameCount -gt 0) { $true } else { $false }
            $finalResult.MeetsFrameFloor = if ($bestAttempt.MeetsFrameFloor) { $true } else { $false }
            if ($bestAttempt.GeneratedFramesDir) { $finalResult.GeneratedFramesDir = $bestAttempt.GeneratedFramesDir }
            # Align top-level warnings/errors/history/telemetry with the best attempt so
            # the artifact metadata and validators see a consistent snapshot of the
            # chosen (best) output rather than mixing fields from a later empty attempt.
            try {
                if ($bestAttempt.PSObject.Properties.Name -contains 'Warnings') { $finalResult.Warnings = $bestAttempt.Warnings }
                if ($bestAttempt.PSObject.Properties.Name -contains 'Errors') { $finalResult.Errors = $bestAttempt.Errors }
                if ($bestAttempt.PSObject.Properties.Name -contains 'HistoryRetrieved') { $finalResult.HistoryRetrieved = $bestAttempt.HistoryRetrieved }
                if ($bestAttempt.PSObject.Properties.Name -contains 'HistoryRetrievedAt') { $finalResult.HistoryRetrievedAt = $bestAttempt.HistoryRetrievedAt }
                if ($bestAttempt.PSObject.Properties.Name -contains 'HistoryPath') { $finalResult.HistoryPath = $bestAttempt.HistoryPath }
                if ($bestAttempt.PSObject.Properties.Name -contains 'Telemetry') { $finalResult.Telemetry = $bestAttempt.Telemetry }
            } catch {
                # best-effort alignment; if any of these properties are missing or
                # assignment fails, continue using the partially-updated finalResult
            }
            # Preserve attempt-level telemetry in AttemptSummaries; the top-level fields now
            # reflect the most useful result (highest frame count) for validators and UI.
        }
    } catch {
        # Best-effort; if this fails, continue using the last attempt as-is
    }
    $sceneAttemptMetadata[$sceneId] = @{
        AttemptsRun = $attemptResults.Count
        Requeued = ($attemptResults.Count -gt 1)
        AttemptSummaries = $attemptSummariesList
        HistoryConfig = @{
            MaxWaitSeconds = $SceneMaxWaitSeconds
            MaxAttempts = $SceneHistoryMaxAttempts
            PollIntervalSeconds = $SceneHistoryPollIntervalSeconds
            PostExecutionTimeoutSeconds = $ScenePostExecutionTimeoutSeconds
        }
        SceneRetryBudget = $SceneRetryBudget
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
if ($FastIteration.IsPresent) {
    & pwsh -NoLogo -ExecutionPolicy Bypass -File $RunVitestsScript -ProjectRoot $ProjectRoot -RunDir $RunDir -Quick
} else {
    & pwsh -NoLogo -ExecutionPolicy Bypass -File $RunVitestsScript -ProjectRoot $ProjectRoot -RunDir $RunDir
}
$vitestHelperExit = $LASTEXITCODE

# Prefer reading machine-readable vitest results produced by the helper
$ResultJsonPath = Join-Path $RunDir 'vitest-results.json'
$ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
$E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'
$ScriptsTestLog = Join-Path $RunDir 'vitest-scripts.log'
$comfyExit = 1
$e2eExit = 1
$scriptsExit = 1
$VitestResultPayload = $null
if (Test-Path $ResultJsonPath) {
    try {
        $r = Get-Content -Path $ResultJsonPath -Raw | ConvertFrom-Json
        $comfyExit = [int]$r.comfyExit
        $e2eExit = [int]$r.e2eExit
        if ($null -ne $r.scriptsExit) { $scriptsExit = [int]$r.scriptsExit }
        if ($r.comfyLog) { $ComfyTestLog = $r.comfyLog }
        if ($r.e2eLog) { $E2eTestLog = $r.e2eLog }
        if ($r.scriptsLog) { $ScriptsTestLog = $r.scriptsLog }
        $VitestResultPayload = $r
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
    # Safety guard: verify the process path matches the expected ComfyUI embedded
    # python executable before calling Stop-Process. This prevents accidentally
    # killing unrelated processes if PIDs have been recycled or something else
    # has taken the same PID. If we cannot determine the path, skip stopping
    # for safety.
    $expectedComfyPython = 'C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe'
    try {
        $proc = Get-Process -Id $ComfyProc.Id -ErrorAction Stop
        $procPath = $null
        try { $procPath = $proc.Path } catch { $procPath = $null }
        if ($procPath) {
            if ($procPath -ieq $expectedComfyPython) {
                Stop-Process -Id $ComfyProc.Id -Force
                Write-Host "  ComfyUI stopped"
                Add-RunSummary "ComfyUI stopped"
            } else {
                Write-Warning "ComfyUI stop skipped: PID $($ComfyProc.Id) path mismatch ($procPath != $expectedComfyPython)"
                Add-RunSummary ("ComfyUI stop skipped for PID {0} due to path mismatch: {1}" -f $ComfyProc.Id, $procPath)
            }
        } else {
            Write-Warning "ComfyUI stop skipped: unable to determine process path for PID $($ComfyProc.Id)"
            Add-RunSummary ("ComfyUI stop skipped: unable to determine process path for PID {0}" -f $ComfyProc.Id)
        }
    } catch {
        Write-Host "ComfyUI process $($ComfyProc.Id) not found or already exited."
    }
}

# Step 10: Archive logs
Write-Host "Step 10: Archiving logs..."
$ZipPath = "$ProjectRoot\artifacts\comfyui-e2e-$Timestamp.zip"
mkdir -Path (Split-Path $ZipPath) -Force | Out-Null
Compress-Archive -Path "$RunDir\*" -DestinationPath $ZipPath -Force
Write-Host "  Archived to: $ZipPath"
Add-RunSummary "Archived to: $ZipPath"
# Stop the sentinel job if we started it
if ($StartedDoneSentinel) {
    try {
        Stop-Job -Name $SentinelJobName -Force -ErrorAction SilentlyContinue
        Remove-Job -Name $SentinelJobName -Force -ErrorAction SilentlyContinue
        Add-RunSummary "Stopped done-marker sentinel job ($SentinelJobName)"
    } catch {
        Add-RunSummary ("Failed to stop sentinel job: {0}" -f $_.Exception.Message)
    }
}

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
        HealthCheck = $LLMHealthInfo
        Warnings = $StoryData.warnings
    }
    Scenes = $sceneResults | ForEach-Object {
        $sceneInfo = if ($sceneAttemptMetadata.ContainsKey($_.SceneId)) { $sceneAttemptMetadata[$_.SceneId] } else { @{ AttemptsRun = $null; Requeued = $null; AttemptSummaries = $null; HistoryConfig = $null; SceneRetryBudget = $null } }
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
            HistoryAttemptLimit = $_.HistoryAttemptLimit
            SceneRetryBudget = $sceneInfo.SceneRetryBudget
            HistoryConfig = $sceneInfo.HistoryConfig
        }
    }
    VitestLogs = @{
        ComfyUI = $ComfyTestLog
        E2E = $E2eTestLog
        Scripts = $ScriptsTestLog
        ResultsJson = $VitestResultsPath
    }
    VitestSummary = $VitestResultPayload
    Archive = $ZipPath
    QueueConfig = @{
        SceneRetryBudget = $SceneRetryBudget
        HistoryMaxWaitSeconds = $SceneMaxWaitSeconds
        HistoryPollIntervalSeconds = $SceneHistoryPollIntervalSeconds
        HistoryMaxAttempts = $SceneHistoryMaxAttempts
        PostExecutionTimeoutSeconds = $ScenePostExecutionTimeoutSeconds
    }
}
$artifactMetadataJson = $artifactMetadata | ConvertTo-Json -Depth 6
$artifactMetaPath = Join-Path $RunDir 'artifact-metadata.json'
$artifactMetadataJson | Set-Content -Path $artifactMetaPath -Encoding utf8

# Step 11b: Generate Wan2-based per-scene videos and wire scene-level video metadata
$wanScript = Join-Path $ProjectRoot 'scripts\generate-scene-videos-wan2.ps1'
$updateVideoMetadataScript = Join-Path $ProjectRoot 'scripts\update-scene-video-metadata.ps1'
if ((Test-Path $wanScript) -and (Test-Path $updateVideoMetadataScript)) {
    Write-Host "Step 11b: Generating Wan2 per-scene videos with $wanScript"
    try {
        & pwsh -NoLogo -ExecutionPolicy Bypass -File $wanScript -RunDir $RunDir
        $wanExit = $LASTEXITCODE
        if ($wanExit -ne 0) {
            Add-RunSummary ("[Video] Wan2 scene video generation script exited with code {0}" -f $wanExit)
            Write-Warning "Wan2 scene video generation script exited with code $wanExit"
        } else {
            Add-RunSummary "[Video] Wan2 scene video generation completed"
        }
    } catch {
        Add-RunSummary ("[Video] Wan2 scene video generation failed: {0}" -f $_.Exception.Message)
        Write-Warning ("Wan2 scene video generation failed: {0}" -f $_.Exception.Message)
    }

    Write-Host "Step 11c: Updating scene video metadata with $updateVideoMetadataScript"
    try {
        & pwsh -NoLogo -ExecutionPolicy Bypass -File $updateVideoMetadataScript -RunDir $RunDir -VideoSubDir 'video'
        $updateExit = $LASTEXITCODE
        if ($updateExit -ne 0) {
            Add-RunSummary ("[Video] Scene video metadata update script exited with code {0}" -f $updateExit)
            Write-Warning "Scene video metadata update script exited with code $updateExit"
        } else {
            Add-RunSummary "[Video] Scene video metadata updated"
        }
    } catch {
        Add-RunSummary ("[Video] Scene video metadata update failed: {0}" -f $_.Exception.Message)
        Write-Warning ("Scene video metadata update failed: {0}" -f $_.Exception.Message)
    }
} else {
    Add-RunSummary "[Video] Wan2 scene video tooling not found; skipping per-scene video generation"
}

# Reload the artifact metadata JSON so that any Video blocks added by
# update-scene-video-metadata.ps1 are reflected in the public artifact.
$artifactMetadataJson = Get-Content -Path $artifactMetaPath -Raw

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
