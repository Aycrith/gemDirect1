param()

# Resolve repository root (script is located in scripts/)
$ScriptPath = $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptPath)
$LogsRoot = Join-Path $ProjectRoot 'logs'
$ArtifactsRoot = Join-Path $ProjectRoot 'artifacts'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunDir = Join-Path $LogsRoot $Timestamp
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
New-Item -ItemType Directory -Path $ArtifactsRoot -Force | Out-Null

$SummaryPath = Join-Path $RunDir 'run-summary.txt'

# Prepend Node to PATH
$NodeDir = 'C:\Tools\node-v22.19.0-win-x64'
if (Test-Path $NodeDir) {
    $env:Path = "$NodeDir;$env:Path"
} else {
    Write-Warning "Node directory $NodeDir not found. Make sure Node 22.19.0 is installed."
}

function Log-Result {
    param($Name, $ExitCode)
    $entry = "{0} exit {1}" -f $Name, $ExitCode
    Add-Content -Path $SummaryPath -Value $entry
    Write-Host $entry
}

function Start-BackgroundProcess {
    param($Name, $File, $Arguments, $OutputLog, $WorkingDirectory)
    
    $params = @{
        FilePath = $File
        WorkingDirectory = $WorkingDirectory
        NoNewWindow = $true
        PassThru = $true
    }
    
    if ($Arguments -and @($Arguments).Count -gt 0) {
        $params['ArgumentList'] = $Arguments
    }
    
    $proc = Start-Process @params
    
    Add-Content -Path $SummaryPath -Value "$Name started (PID $($proc.Id))"
    Write-Host "$Name started (PID $($proc.Id))"
    return $proc
}

function Wait-ForService {
    param($Url, $MaxAttempts = 60, $IntervalSec = 2)
    
    $attempt = 0
    while ($attempt -lt $MaxAttempts) {
        try {
            $response = Invoke-RestMethod -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            return $response
        } catch {
            $attempt++
            Start-Sleep -Seconds $IntervalSec
        }
    }
    return $null
}

# ===== START COMFYUI =====
$ComfyScript = 'C:\ComfyUI\start-comfyui.bat'
if (-not (Test-Path $ComfyScript)) {
    Add-Content -Path $SummaryPath -Value "ERROR: ComfyUI startup script not found at $ComfyScript"
    exit 1
}

$ComfyOut = Join-Path $RunDir 'comfyui.out.log'
$ComfyProc = Start-BackgroundProcess -Name 'ComfyUI' -File $ComfyScript -Arguments @() `
    -OutputLog $ComfyOut -WorkingDirectory (Split-Path $ComfyScript -Parent)

# Wait for ComfyUI to be ready
Add-Content -Path $SummaryPath -Value "Waiting for ComfyUI to be ready..."
$stats = Wait-ForService -Url 'http://127.0.0.1:8188/system_stats' -MaxAttempts 60 -IntervalSec 2
if ($stats) {
    $SystemStatsPath = Join-Path $RunDir 'system_stats.json'
    $stats | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $SystemStatsPath
    Add-Content -Path $SummaryPath -Value "ComfyUI ready"
} else {
    Add-Content -Path $SummaryPath -Value "Warning: ComfyUI system stats unreachable after timeout."
}

# ===== START NPM DEV =====
$AppOut = Join-Path $RunDir 'app.out.log'
$NpmExecutable = if (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }
$NpmProc = Start-BackgroundProcess -Name 'npm dev' -File $NpmExecutable -Arguments @('run', 'dev') `
    -OutputLog $AppOut -WorkingDirectory $ProjectRoot

# Give npm a moment to start
Start-Sleep -Seconds 5

# ===== QUEUE REAL SHOT =====
$RealShotLog = Join-Path $RunDir 'queue-real-shot.log'
Write-Host "Queueing a real shot against ComfyUI..."
$RealShotProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "node --loader ts-node/esm scripts\queue-real-shot.ts > `"$RealShotLog`" 2>&1") `
    -WorkingDirectory $ProjectRoot `
    -NoNewWindow `
    -PassThru

if ($RealShotProc) {
    $RealShotProc.WaitForExit()
    Log-Result "Queue-Real-Shot" $RealShotProc.ExitCode
    Add-Content -Path $SummaryPath -Value "Queue-Real-Shot log: $RealShotLog"
} else {
    Add-Content -Path $SummaryPath -Value "Queue-Real-Shot failed to start"
}

# ===== RUN TESTS (BACKGROUND) =====
$ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
$E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'

Write-Host "Starting vitest suites..."

$ComfyTestProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "node .\node_modules\vitest\vitest.mjs run --pool=vmThreads services\comfyUIService.test.ts > `"$ComfyTestLog`" 2>&1") `
    -WorkingDirectory $ProjectRoot `
    -NoNewWindow `
    -PassThru

Add-Content -Path $SummaryPath -Value "Vitest-ComfyUI started (PID $($ComfyTestProc.Id))"

$E2eTestProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "node .\node_modules\vitest\vitest.mjs run --pool=vmThreads services\e2e.test.ts > `"$E2eTestLog`" 2>&1") `
    -WorkingDirectory $ProjectRoot `
    -NoNewWindow `
    -PassThru

Add-Content -Path $SummaryPath -Value "Vitest-E2E started (PID $($E2eTestProc.Id))"

# Wait for tests to complete
Write-Host "Waiting for vitest suites to complete..."
if ($ComfyTestProc) { 
    $ComfyTestProc.WaitForExit()
    Log-Result "Vitest-ComfyUI" $ComfyTestProc.ExitCode
} else {
    Add-Content -Path $SummaryPath -Value "Vitest-ComfyUI failed to start"
}

if ($E2eTestProc) { 
    $E2eTestProc.WaitForExit()
    Log-Result "Vitest-E2E" $E2eTestProc.ExitCode
} else {
    Add-Content -Path $SummaryPath -Value "Vitest-E2E failed to start"
}

# ===== GATHER DIAGNOSTICS =====
Write-Host "Gathering diagnostics..."

$QueueInfoPath = Join-Path $RunDir 'queue_info.json'
try {
    $queueInfo = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/queue_info' -UseBasicParsing -TimeoutSec 5
    $queueInfo | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $QueueInfoPath
} catch {
    Add-Content -Path $SummaryPath -Value "Warning: Failed to fetch queue_info."
}

$OutputsDir = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs'
$OutputsJson = Join-Path $RunDir 'comfyui-outputs.json'
$FrameValidation = Join-Path $RunDir 'frame-validation.json'
$Frames = @()
if (Test-Path $OutputsDir) {
    $Frames = @(Get-ChildItem -Path $OutputsDir -Filter '*.png' -Recurse -File -ErrorAction SilentlyContinue)
    $Frames | Select-Object FullName,Length,CreationTime,LastWriteTime | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 $OutputsJson
    $FrameSummary = @{
        totalFrames = $Frames.Count
        newest = if ($Frames.Count -gt 0) {
            ($Frames | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-Object -ExpandProperty FullName)
        } else {
            $null
        }
        oldest = if ($Frames.Count -gt 0) {
            ($Frames | Sort-Object LastWriteTime | Select-Object -First 1 | Select-Object -ExpandProperty FullName)
        } else {
            $null
        }
    }
    $FrameSummary | ConvertTo-Json | Out-File -Encoding utf8 $FrameValidation
    $OutputsArchive = Join-Path $RunDir 'generated-frames'
    New-Item -ItemType Directory -Path $OutputsArchive -Force | Out-Null
    Try {
        Copy-Item -Path (Join-Path $OutputsDir 'gemdirect1_shot*.png') -Destination $OutputsArchive -Force -ErrorAction SilentlyContinue
        Add-Content -Path $SummaryPath -Value "Copied frames to $OutputsArchive"
    } Catch {
        Add-Content -Path $SummaryPath -Value "Warning: Failed to copy generated frames - $($_.Exception.Message)"
    }
} else {
    Add-Content -Path $SummaryPath -Value "Warning: Outputs directory $OutputsDir not found."
}

$FinalOutputPath = Join-Path $RunDir 'final_output.json'
$FinalPayload = @{
    type = 'image'
    filename = 'comfyui-sequence'
    metadata = @{
        generatedAt = (Get-Date).ToString('o')
        frameCount = $Frames.Count
        frameSample = if ($Frames.Count -gt 0) {
            @($Frames | Select-Object -First 5 | Select-Object -ExpandProperty Name)
        } else {
            @()
        }
    }
    frames = if ($Frames.Count -gt 0) {
        @($Frames | Select-Object -First 8 | ForEach-Object { $_.FullName })
    } else {
        @()
    }
    data = 'mock://final-output'
}
$FinalPayload | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $FinalOutputPath

# ===== STOP SERVICES =====
Write-Host "Stopping services..."

if ($NpmProc -and -not $NpmProc.HasExited) {
    Stop-Process -Id $NpmProc.Id -Force -ErrorAction SilentlyContinue
    Add-Content -Path $SummaryPath -Value "Stopped npm dev (PID $($NpmProc.Id))"
}

if ($ComfyProc -and -not $ComfyProc.HasExited) {
    Stop-Process -Id $ComfyProc.Id -Force -ErrorAction SilentlyContinue
    Add-Content -Path $SummaryPath -Value "Stopped ComfyUI (PID $($ComfyProc.Id))"
}

# Wait a bit for process cleanup
Start-Sleep -Seconds 3

# ===== CAPTURE GIT STATUS =====
$GitStatusPath = Join-Path $RunDir 'git-status.txt'
git status -sb | Out-File -Encoding utf8 $GitStatusPath

# ===== COMPRESS LOGS =====
Write-Host "Compressing logs..."
$ZipName = "comfyui-e2e-$Timestamp.zip"
$ArtifactZipPath = Join-Path $ArtifactsRoot $ZipName

# Force GC to release file handles
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
Start-Sleep -Seconds 1

$compressed = $false
$maxAttempts = 5
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
        Compress-Archive -Path (Join-Path $RunDir '*') -DestinationPath $ArtifactZipPath -Force -ErrorAction Stop
        $compressed = $true
        break
    } catch {
        Add-Content -Path $SummaryPath -Value "Compress attempt $attempt failed: $($_.Exception.Message)"
        if ($attempt -lt $maxAttempts) {
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}

if ($compressed) {
    $LogZipPath = Join-Path $RunDir $ZipName
    Copy-Item -Path $ArtifactZipPath -Destination $LogZipPath -Force -ErrorAction SilentlyContinue
    Add-Content -Path $SummaryPath -Value "Logs archived to $ArtifactZipPath and mirrored to $LogZipPath"
    Write-Host "SUCCESS: Logs archived to $ArtifactZipPath"
} else {
    Add-Content -Path $SummaryPath -Value "ERROR: Compression failed after $maxAttempts attempts."
    Write-Host "ERROR: Compression failed after $maxAttempts attempts."
}

Write-Host "Script completed. Summary: $SummaryPath"
