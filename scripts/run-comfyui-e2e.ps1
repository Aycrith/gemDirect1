param()

$ProjectRoot = 'C:\Dev\gemDirect1'
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

Write-Host "Starting story-driven ComfyUI e2e run at $Timestamp"
Write-Host "Log directory: $RunDir"
Add-RunSummary "Log directory initialized: $RunDir"

# Step 1: Generate story + keyframes
Write-Host "Step 1: Generating story assets..."
$StoryDir = Join-Path $RunDir 'story'
$StoryScript = Join-Path $ProjectRoot 'scripts\generate-story-scenes.ts'
$SampleKeyframe = Join-Path $ProjectRoot 'sample_frame_start.png'
$SceneTargetCount = 3
$storyArgs = @('--loader', 'ts-node/esm', $StoryScript, '--output', $StoryDir, '--scenes', $SceneTargetCount.ToString(), '--sampleKeyframe', $SampleKeyframe)
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
Add-RunSummary ("Story ready: {0} (scenes={1})" -f $StoryData.storyId, $SceneDefinitions.Count)
Add-RunSummary ("Director's vision: {0}" -f $StoryData.directorsVision)
Add-Content -Path $SummaryPath -Value "Story logline: $($StoryData.logline)"

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

    try {
        # Allow a longer wait for SVD generations (in seconds)
        $sceneMaxWait = 600
        $result = & $RealWorkflowScript `
            -SceneId $sceneId `
            -Prompt $scene.prompt `
            -NegativePrompt $negativePrompt `
            -KeyframePath $sceneKeyframePath `
            -SceneOutputDir $sceneLogDir `
            -FrameFloor $frameFloorValue `
            -MaxWaitSeconds $sceneMaxWait

        $sceneResults += $result
        $statusLine = "[Scene $sceneId] Frames=$($result.FrameCount) Duration=${($result.DurationSeconds)}s Prefix=$($result.FramePrefix)"
        Write-Host "  $statusLine"
        Add-RunSummary $statusLine

        if (-not $result.Success) {
            $sceneFailures = $true
            Add-RunSummary "[Scene $sceneId] ERROR: No frames copied"
        } elseif (-not $result.MeetsFrameFloor) {
            $sceneWarnings = $true
            Add-RunSummary "[Scene $sceneId] WARNING: Frame count below floor ($($result.FrameCount)/$frameFloorValue)"
        }
    } catch {
        $sceneFailures = $true
        $err = $_.Exception.Message
        Write-Warning "[Scene $sceneId] Failed: $err"
        Add-RunSummary "[Scene $sceneId] FAILED: $err"
    }
}

$totalFrames = ($sceneResults | Measure-Object -Property FrameCount -Sum).Sum
$totalFramesDisplay = if ($null -eq $totalFrames) { 0 } else { $totalFrames }
$successfulScenes = ($sceneResults | Where-Object { $_.Success }).Count
Add-RunSummary ("Scene summary: {0}/{1} succeeded | total frames={2}" -f $successfulScenes, $SceneDefinitions.Count, $totalFramesDisplay)

## Step 6/7: Run Vitest suites via the unified helper
$RunVitestsScript = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'run-vitests.ps1'
Write-Host "Step 6/7: Running Vitest suites using $RunVitestsScript"

# Call helper and point it at the current run directory so logs and timings are colocated
& powershell -NoLogo -ExecutionPolicy Bypass -File $RunVitestsScript -ProjectRoot $ProjectRoot -RunDir $RunDir
$vitestHelperExit = $LASTEXITCODE

# Prefer reading machine-readable vitest results produced by the helper
$ResultJsonPath = Join-Path $RunDir 'vitest-results.json'
$ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
$E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'
$comfyExit = 1
$e2eExit = 1
if (Test-Path $ResultJsonPath) {
    try {
        $r = Get-Content -Path $ResultJsonPath -Raw | ConvertFrom-Json
        $comfyExit = [int]$r.comfyExit
        $e2eExit = [int]$r.e2eExit
        if ($r.comfyLog) { $ComfyTestLog = $r.comfyLog }
        if ($r.e2eLog) { $E2eTestLog = $r.e2eLog }
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

Add-RunSummary ("Step 6: Vitest comfyUI suite completed (code {0})" -f $comfyExit)
Add-RunSummary ("Step 7: Vitest e2e suite completed (code {0})" -f $e2eExit)

# Step 8: Stop ComfyUI
Write-Host "Step 8: Stopping ComfyUI..."
if ($ComfyProc -and -not $ComfyProc.HasExited) {
    Stop-Process -Id $ComfyProc.Id -Force
    Write-Host "  ComfyUI stopped"
    Add-RunSummary "ComfyUI stopped"
}

# Step 9: Archive logs
Write-Host "Step 9: Archiving logs..."
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
    "Archive: $ZipPath"
)
Add-Content -Path $SummaryPath -Value $artifactIndex

# Step 10: Validate the generated run-summary for expected sections
$ValidateScript = Join-Path $ProjectRoot 'scripts\validate-run-summary.ps1'
if (Test-Path $ValidateScript) {
    Write-Host "Step 10: Validating run-summary with $ValidateScript"
    & powershell -NoLogo -ExecutionPolicy Bypass -File $ValidateScript -RunDir $RunDir
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

$overallSuccess = (-not $sceneFailures) -and $comfyTestsOk -and $e2eTestsOk
if (-not $overallSuccess) {
    Write-Warning "One or more steps failed (scene failure: $sceneFailures, comfy tests ok: $comfyTestsOk, e2e tests ok: $e2eTestsOk)"
    exit 1
}

if ($sceneWarnings) {
    Write-Warning "Scenes completed with warnings (frame count below floor)."
}

exit 0
