<#
.SYNOPSIS
    Generates a trend/drift report from Vision QA history.

.DESCRIPTION
    Analyzes vision-qa-history.json to show quality trends across runs.
    For each sample, reports the last N runs and a status indicator:
    
    Status:
    - OK:         last score >= max(last N) - 3
    - WATCH:      last score between median(last N) - 5 and max - 3
    - REGRESSING: last score < median(last N) - 5
    
    This is a diagnostic tool - always exits 0.

.PARAMETER N
    Number of recent runs to analyze. Default: 5.

.PARAMETER ShowAll
    Show all runs, not just the last N.

.EXAMPLE
    .\vision-qa-trend-report.ps1
    Show trend report for last 5 runs

.EXAMPLE
    .\vision-qa-trend-report.ps1 -N 10
    Show trend report for last 10 runs
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateRange(2, 50)]
    [int]$N = 5,
    
    [switch]$ShowAll
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$HistoryPath = Join-Path $RepoRoot "data\bookend-golden-samples\vision-qa-history.json"

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VISION QA TREND REPORT" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if history file exists
if (-not (Test-Path $HistoryPath)) {
    Write-Host "No history file found: $HistoryPath" -ForegroundColor Yellow
    Write-Host "Run 'npm run bookend:vision-qa' to generate history entries." -ForegroundColor Gray
    exit 0
}

# Load history
$history = Get-Content $HistoryPath -Raw | ConvertFrom-Json

if (-not $history.entries -or $history.entries.Count -eq 0) {
    Write-Host "No history entries found." -ForegroundColor Yellow
    Write-Host "Run 'npm run bookend:vision-qa' to generate history entries." -ForegroundColor Gray
    exit 0
}

$entries = $history.entries
$totalRuns = $entries.Count
$runsToAnalyze = if ($ShowAll) { $totalRuns } else { [Math]::Min($N, $totalRuns) }

Write-Host "History version: $($history.version)" -ForegroundColor Gray
Write-Host "Total runs: $totalRuns | Analyzing last: $runsToAnalyze" -ForegroundColor Gray
Write-Host ""

# Get the last entry info
$lastEntry = $entries[-1]
$lastTimestamp = $lastEntry.timestamp
$lastThresholdVersion = $lastEntry.thresholdVersion
$lastRunId = $lastEntry.runId

Write-Host "Last run: $lastRunId" -ForegroundColor Gray
Write-Host "Timestamp: $lastTimestamp" -ForegroundColor Gray
Write-Host "Threshold version: $lastThresholdVersion" -ForegroundColor Gray
Write-Host ""

# Build sample time series from last N entries
$recentEntries = $entries | Select-Object -Last $runsToAnalyze
$sampleData = @{}

foreach ($entry in $recentEntries) {
    if (-not $entry.samples) { continue }
    
    $entry.samples.PSObject.Properties | Where-Object { $_.Name -like "sample-*" } | ForEach-Object {
        $sampleId = $_.Name
        $sample = $_.Value
        
        if (-not $sampleData.ContainsKey($sampleId)) {
            $sampleData[$sampleId] = @()
        }
        
        $overall = $sample.overall
        if ($overall -ne $null) {
            $sampleData[$sampleId] += $overall
        }
    }
}

if ($sampleData.Count -eq 0) {
    Write-Host "No sample data found in history entries." -ForegroundColor Yellow
    exit 0
}

# Helper function to calculate median
function Get-Median($arr) {
    if ($arr.Count -eq 0) { return 0 }
    $sorted = $arr | Sort-Object
    $mid = [Math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2 -eq 0) {
        return ($sorted[$mid - 1] + $sorted[$mid]) / 2
    } else {
        return $sorted[$mid]
    }
}

# Calculate status for each sample
$results = @()

foreach ($sampleId in ($sampleData.Keys | Sort-Object)) {
    $scores = $sampleData[$sampleId]
    if ($scores.Count -eq 0) { continue }
    
    $lastScore = $scores[-1]
    $median = Get-Median $scores
    $max = ($scores | Measure-Object -Maximum).Maximum
    $min = ($scores | Measure-Object -Minimum).Minimum
    
    # Status calculation
    # OK: last >= max - 3
    # WATCH: last between (median - 5) and (max - 3)
    # REGRESSING: last < median - 5
    
    $status = "OK"
    $statusColor = "Green"
    
    if ($lastScore -ge ($max - 3)) {
        $status = "OK"
        $statusColor = "Green"
    } elseif ($lastScore -ge ($median - 5)) {
        $status = "WATCH"
        $statusColor = "Yellow"
    } else {
        $status = "REGRESSING"
        $statusColor = "Red"
    }
    
    $results += [PSCustomObject]@{
        Sample = $sampleId.Replace("sample-", "")
        Last = $lastScore
        Median = [Math]::Round($median, 1)
        Max = $max
        Min = $min
        Runs = $scores.Count
        Status = $status
        StatusColor = $statusColor
    }
}

# Print header
$headerFormat = "{0,-18} {1,6} {2,8} {3,6} {4,6} {5,5} {6,-12}"
Write-Host ($headerFormat -f "Sample", "Last", "Median", "Max", "Min", "Runs", "Status") -ForegroundColor White
Write-Host ("-" * 70) -ForegroundColor Gray

# Print rows
foreach ($r in $results) {
    $line = $headerFormat -f $r.Sample, "$($r.Last)%", "$($r.Median)%", "$($r.Max)%", "$($r.Min)%", $r.Runs, $r.Status
    Write-Host $line -ForegroundColor $r.StatusColor
}

Write-Host ""

# Summary
$okCount = ($results | Where-Object { $_.Status -eq "OK" }).Count
$watchCount = ($results | Where-Object { $_.Status -eq "WATCH" }).Count
$regressCount = ($results | Where-Object { $_.Status -eq "REGRESSING" }).Count

Write-Host "Summary: $okCount OK / $watchCount WATCH / $regressCount REGRESSING" -ForegroundColor $(if ($regressCount -gt 0) { "Red" } elseif ($watchCount -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

# Always exit 0 - this is a diagnostic tool
exit 0
