param()

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$LogsRoot = Join-Path $ProjectRoot 'logs'
$ArtifactsRoot = Join-Path $ProjectRoot 'artifacts'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunDir = Join-Path $LogsRoot $Timestamp
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
New-Item -ItemType Directory -Path $ArtifactsRoot -Force | Out-Null

$SummaryPath = Join-Path $RunDir 'run-summary.txt'

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
    $entry
}

function Start-ProcessAndLog {
    param($Name, $File, $Args, $OutputLog)
    $proc = Start-Process -FilePath $File -ArgumentList $Args -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $OutputLog -RedirectStandardError $OutputLog -NoNewWindow -PassThru
    $proc.WaitForExit()
    Log-Result $Name $proc.ExitCode
    return $proc
}

$ComfyScript = 'C:\ComfyUI\start-comfyui.bat'
if (-not (Test-Path $ComfyScript)) {
    throw "ComfyUI startup script not found at $ComfyScript"
}

$ComfyStdOut = Join-Path $RunDir 'comfyui.out.log'
$ComfyStdErr = Join-Path $RunDir 'comfyui.err.log'
$ComfyProc = Start-Process -FilePath $ComfyScript -WorkingDirectory (Split-Path $ComfyScript -Parent) `
    -RedirectStandardOutput $ComfyStdOut -RedirectStandardError $ComfyStdErr -PassThru -NoNewWindow
Add-Content -Path $SummaryPath -Value "ComfyUI process started (PID $($ComfyProc.Id))"

$SystemStatsPath = Join-Path $RunDir 'system_stats.json'
$Attempt = 0
$Ready = $false
while (-not $Ready -and $Attempt -lt 60) {
    try {
        $Stats = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 5
        $Stats | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $SystemStatsPath
        $Ready = $true
    } catch {
        Start-Sleep -Seconds 2
        $Attempt++
    }
}

if (-not $Ready) {
    Add-Content -Path $SummaryPath -Value 'Warning: ComfyUI system stats unreachable after timeout.'
}

$AppOut = Join-Path $RunDir 'app.out.log'
$AppErr = Join-Path $RunDir 'app.err.log'
$NpmProc = Start-Process -FilePath 'npm' -ArgumentList 'run','dev' -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $AppOut -RedirectStandardError $AppErr -PassThru -NoNewWindow
Add-Content -Path $SummaryPath -Value "npm dev process started (PID $($NpmProc.Id))"

# Run targeted test suites
$ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
Start-ProcessAndLog 'Vitest-ComfyUI' 'node' @('./node_modules/vitest/vitest.mjs','run','--pool=vmThreads','services/comfyUIService.test.ts') $ComfyTestLog

$E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'
Start-ProcessAndLog 'Vitest-E2E' 'node' @('./node_modules/vitest/vitest.mjs','run','--pool=vmThreads','services/e2e.test.ts') $E2eTestLog

# Diagnostics captured after tests
$QueueInfoPath = Join-Path $RunDir 'queue_info.json'
try {
    $QueueInfo = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/queue_info' -UseBasicParsing -TimeoutSec 5
    $QueueInfo | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $QueueInfoPath
} catch {
    Add-Content -Path $SummaryPath -Value 'Warning: Failed to fetch queue_info.'
}

$OutputsDir = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs'
$OutputsJson = Join-Path $RunDir 'comfyui-outputs.json'
$FrameValidation = Join-Path $RunDir 'frame-validation.json'
$Frames = @()
if (Test-Path $OutputsDir) {
    $Frames = Get-ChildItem -Path $OutputsDir -Filter '*.png' -Recurse -File -ErrorAction SilentlyContinue
    $Frames | Select-Object FullName,Length,CreationTime,LastWriteTime | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 $OutputsJson
    $FrameSummary = [ordered]@{
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
} else {
    Add-Content -Path $SummaryPath -Value "Warning: Outputs directory $OutputsDir not found."
}

$FinalOutputPath = Join-Path $RunDir 'final_output.json'
$FinalPayload = [ordered]@{
    type = 'image'
    filename = 'comfyui-sequence'
    metadata = @{
        generatedAt = (Get-Date).ToString('o')
        frameCount = $Frames.Count
        frameSample = if ($Frames.Count -gt 0) {
            ($Frames | Select-Object -First 5 | Select-Object -ExpandProperty Name)
        } else {
            @()
        }
    }
    frames = if ($Frames.Count -gt 0) {
        $Frames | Select-Object -First 8 | ForEach-Object { $_.FullName }
    } else {
        @()
    }
    data = 'mock://final-output'
}
$FinalPayload | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $FinalOutputPath

# Summaries and cleanup
Start-Sleep -Seconds 2
if ($NpmProc -and -not $NpmProc.HasExited) {
    Stop-Process -Id $NpmProc.Id -Force -ErrorAction SilentlyContinue
    Add-Content -Path $SummaryPath -Value "Stopped npm dev (PID $($NpmProc.Id))."
}
if ($ComfyProc -and -not $ComfyProc.HasExited) {
    Stop-Process -Id $ComfyProc.Id -Force -ErrorAction SilentlyContinue
    Add-Content -Path $SummaryPath -Value "Stopped ComfyUI (PID $($ComfyProc.Id))."
}

# Capture git status
$GitStatusPath = Join-Path $RunDir 'git-status.txt'
git status -sb | Out-File -Encoding utf8 $GitStatusPath

# Compress logs and copy artifact
$ZipName = "comfyui-e2e-$Timestamp.zip"
$ArtifactZipPath = Join-Path $ArtifactsRoot $ZipName
Compress-Archive -Path (Join-Path $RunDir '*') -DestinationPath $ArtifactZipPath -Force
$LogZipPath = Join-Path $RunDir $ZipName
Copy-Item -Path $ArtifactZipPath -Destination $LogZipPath -Force
Add-Content -Path $SummaryPath -Value "Logs archived to $ArtifactZipPath and mirrored to $LogZipPath"
