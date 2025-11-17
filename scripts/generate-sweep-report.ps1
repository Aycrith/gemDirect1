<#
.SYNOPSIS
    Generate an aggregate stability sweep report from multiple E2E run logs.

.DESCRIPTION
    Scans the repository's `logs/` folder for run directories (e.g. 20251112-235813),
    reads `artifact-metadata.json` and `run-summary.txt` when available, and
    produces a consolidated JSON report at `logs/stability-sweep-<timestamp>/report.json`.

.EXAMPLE
    & .\scripts\generate-sweep-report.ps1
#>

param(
    [string] $LogsRoot = (Join-Path (Get-Location) 'logs')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $LogsRoot)) {
    Write-Error "Logs root not found: $LogsRoot"
    exit 2
}

function Safe-ReadJson {
    param([string] $Path)
    try {
        if (Test-Path $Path) {
            return Get-Content -Path $Path -Raw | ConvertFrom-Json -ErrorAction Stop
        }
    } catch {
        Write-Warning "Failed to parse JSON at ${Path}: $($_.Exception.Message)"
    }
    return $null
}

$runDirs = Get-ChildItem -Path $LogsRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}$' } | Sort-Object Name
if ($runDirs.Count -eq 0) {
    Write-Host "No run directories found under $LogsRoot"
    exit 0
}

$reportTimestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$outDir = Join-Path $LogsRoot "stability-sweep-$reportTimestamp"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$runs = @()
$sceneAggregate = @{}
$totalFramesOverall = 0
$totalScenes = 0
$runsWithFallback = 0
$runsWithWarnings = 0

foreach ($dir in $runDirs) {
    $metaPath = Join-Path $dir.FullName 'artifact-metadata.json'
    $runObj = Safe-ReadJson -Path $metaPath
    if (-not $runObj) {
        # Try to recover minimal info from run-summary.txt
        $summaryPath = Join-Path $dir.FullName 'run-summary.txt'
        $runObj = [ordered]@{
            RunId = $dir.Name
            Timestamp = (Get-Date -Format o)
            RunDir = $dir.FullName
            Scenes = @()
            QueueConfig = @{}
        }
        if (Test-Path $summaryPath) {
            $runSummaryText = Get-Content -Path $summaryPath -Raw -ErrorAction SilentlyContinue
            $runObj.RunSummaryText = $runSummaryText
        }
    }

    $runReport = [ordered]@{
        RunId = $runObj.RunId
        Timestamp = $runObj.Timestamp
        RunDir = $runObj.RunDir
        SceneCount = 0
        TotalFrames = 0
        Scenes = @()
        HasFallbackNotes = $false
        HasWarnings = $false
    }

    if ($runObj.Scenes) {
        foreach ($s in $runObj.Scenes) {
            $frameCount = 0
            $success = $false
            $meetsFloor = $false
            $historyRetrieved = $false
            $historyAttempts = 0
            $warnings = @()
            $errors = @()
            $telemetry = $null

            if ($s.FrameCount -ne $null) { $frameCount = [int]$s.FrameCount }
            if ($s.Success -ne $null) { $success = [bool]$s.Success }
            if ($s.MeetsFrameFloor -ne $null) { $meetsFloor = [bool]$s.MeetsFrameFloor }
            if ($s.HistoryRetrieved -ne $null) { $historyRetrieved = [bool]$s.HistoryRetrieved }
            if ($s.HistoryAttempts -ne $null) { $historyAttempts = [int]$s.HistoryAttempts }
            if ($s.Warnings) { $warnings = $s.Warnings }
            if ($s.Errors) { $errors = $s.Errors }
            if ($s -and $s.PSObject -and $s.PSObject.Properties.Name -contains 'Telemetry') {
                $telemetry = $s.Telemetry
            }

            $sceneRec = [ordered]@{
                SceneId = $s.SceneId
                FrameCount = $frameCount
                Success = $success
                MeetsFrameFloor = $meetsFloor
                HistoryRetrieved = $historyRetrieved
                HistoryAttempts = $historyAttempts
                WarningCount = if ($warnings) { $warnings.Count } else { 0 }
                ErrorCount = if ($errors) { $errors.Count } else { 0 }
                Telemetry = $null
            }

            if ($telemetry) {
                $sceneRec.Telemetry = [ordered]@{}
                if ($telemetry.GPU) {
                    $gpu = [ordered]@{}
                    if ($telemetry.GPU.PSObject -and $telemetry.GPU.PSObject.Properties.Name -contains 'Name') { $gpu.Name = $telemetry.GPU.Name }
                    if ($telemetry.GPU.PSObject -and $telemetry.GPU.PSObject.Properties.Name -contains 'VramBeforeMB') { $gpu.VramBeforeMB = $telemetry.GPU.VramBeforeMB } else { $gpu.VramBeforeMB = $null }
                    if ($telemetry.GPU.PSObject -and $telemetry.GPU.PSObject.Properties.Name -contains 'VramAfterMB') { $gpu.VramAfterMB = $telemetry.GPU.VramAfterMB } else { $gpu.VramAfterMB = $null }
                    if ($telemetry.GPU.PSObject -and $telemetry.GPU.PSObject.Properties.Name -contains 'VramDeltaMB') { $gpu.VramDeltaMB = $telemetry.GPU.VramDeltaMB } else { $gpu.VramDeltaMB = $null }
                    $sceneRec.Telemetry.GPU = $gpu
                }
                if ($telemetry.System -and $telemetry.System.PSObject -and $telemetry.System.PSObject.Properties.Name -contains 'FallbackNotes') {
                    $sceneRec.Telemetry.SystemFallbackNotes = $telemetry.System.FallbackNotes
                    $fallbackArray = @($telemetry.System.FallbackNotes)
                    if ($fallbackArray -and $fallbackArray.Count -gt 0) { $runReport.HasFallbackNotes = $true }
                }
            }

            $runReport.Scenes += $sceneRec
            $runReport.TotalFrames += $frameCount
            $runReport.SceneCount += 1

            # Aggregate-level counters
            $totalFramesOverall += $frameCount
            $totalScenes += 1
            if (-not $runReport.HasWarnings -and ($sceneRec.WarningCount -gt 0 -or -not $meetsFloor -or -not $historyRetrieved)) { $runReport.HasWarnings = $true }
        }
    }

    if ($runReport.HasFallbackNotes) { $runsWithFallback += 1 }
    if ($runReport.HasWarnings) { $runsWithWarnings += 1 }

    $runs += $runReport
}

$avgFramesPerScene = if ($totalScenes -gt 0) { [math]::Round($totalFramesOverall / $totalScenes, 2) } else { 0 }

$summary = [ordered]@{
    RunsProcessed = $runs.Count
    TotalScenes = $totalScenes
    TotalFrames = $totalFramesOverall
    AverageFramesPerScene = $avgFramesPerScene
    RunsWithFallbackNotes = $runsWithFallback
    RunsWithWarnings = $runsWithWarnings
}

$outPayload = [ordered]@{
    ReportGeneratedAt = (Get-Date).ToString('o')
    LogsRoot = $LogsRoot
    Summary = $summary
    Runs = $runs
}

$outJson = $outPayload | ConvertTo-Json -Depth 8
$outPath = Join-Path $outDir 'report.json'
$outJson | Set-Content -Path $outPath -Encoding UTF8

Write-Host "Stability sweep report written to: $outPath"
Write-Host "Summary: Runs=$($summary.RunsProcessed) Scenes=$($summary.TotalScenes) TotalFrames=$($summary.TotalFrames) AvgFrames/Scene=$($summary.AverageFramesPerScene) RunsWithFallback=$($summary.RunsWithFallbackNotes) RunsWithWarnings=$($summary.RunsWithWarnings)"

exit 0
