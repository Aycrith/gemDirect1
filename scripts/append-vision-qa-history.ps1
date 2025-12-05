<#
.SYNOPSIS
    Appends vision QA results to historical baseline tracking.

.DESCRIPTION
    Records each successful vision QA run in a JSON history file for trend analysis.
    This helps detect gradual regression (creeping thresholds) and track improvements.
    
    History is stored in: data/bookend-golden-samples/vision-qa-history.json
    
    Each entry includes:
    - Timestamp and run ID
    - Per-sample scores (overall, focus, artifacts, objConsist)
    - Aggregated stats (mean, min, max)
    - Verdict summary (PASS/WARN/FAIL counts)
    - Threshold version used

.PARAMETER ResultsPath
    Path to the vision-qa-results.json from the current run.

.PARAMETER ThresholdsPath
    Path to vision-thresholds.json used for gating.

.PARAMETER RunId
    Optional run identifier. Defaults to timestamp-based ID.

.EXAMPLE
    .\append-vision-qa-history.ps1 -ResultsPath "temp\vision-qa-20251205-123456\vision-qa-results.json" -ThresholdsPath "data\bookend-golden-samples\vision-thresholds.json"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ResultsPath,
    
    [Parameter(Mandatory=$true)]
    [string]$ThresholdsPath,
    
    [Parameter(Mandatory=$false)]
    [string]$RunId
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$HistoryPath = Join-Path $RepoRoot "data\bookend-golden-samples\vision-qa-history.json"

# Generate run ID if not provided
if (-not $RunId) {
    $RunId = (Get-Date).ToString("yyyyMMdd-HHmmss")
}

# Load results
if (-not (Test-Path $ResultsPath)) {
    Write-Host "ERROR: Results file not found: $ResultsPath" -ForegroundColor Red
    exit 1
}
$results = Get-Content $ResultsPath -Raw | ConvertFrom-Json

# Load thresholds
if (-not (Test-Path $ThresholdsPath)) {
    Write-Host "ERROR: Thresholds file not found: $ThresholdsPath" -ForegroundColor Red
    exit 1
}
$thresholds = Get-Content $ThresholdsPath -Raw | ConvertFrom-Json
$thresholdVersion = $thresholds.version

# Configuration
$MAX_ENTRIES = 200  # Soft cap to prevent unbounded growth

# Initialize history file if it doesn't exist
if (-not (Test-Path $HistoryPath)) {
    $history = @{
        version = "1.0.0"
        description = "Historical tracking of vision QA runs for trend analysis"
        entries = @()
    }
} else {
    $history = Get-Content $HistoryPath -Raw | ConvertFrom-Json
    # Ensure entries is an array
    if (-not $history.entries) {
        $history | Add-Member -NotePropertyName "entries" -NotePropertyValue @() -Force
    }
}

# Enforce soft cap on history size (trim oldest entries if needed)
if ($history.entries.Count -ge $MAX_ENTRIES) {
    $trimCount = $history.entries.Count - $MAX_ENTRIES + 1  # +1 to make room for new entry
    Write-Host "  ⚠ History at cap ($($history.entries.Count) entries). Trimming $trimCount oldest." -ForegroundColor Yellow
    $history.entries = $history.entries | Select-Object -Last ($MAX_ENTRIES - 1)
}

# Extract sample data
$samples = @{}
$overallScores = @()
$focusScores = @()
$artifactScores = @()
$objConsistScores = @()
$verdicts = @{ PASS = 0; WARN = 0; FAIL = 0 }

# Get members that match sample-* pattern
$results.PSObject.Properties | Where-Object { $_.Name -like "sample-*" } | ForEach-Object {
    $sampleId = $_.Name
    $sample = $_.Value
    
    # Use aggregated median if available, otherwise raw scores
    $useAggregated = $sample.aggregatedMetrics -and $sample.aggregatedMetrics.overall
    
    $overall = if ($useAggregated) { $sample.aggregatedMetrics.overall.median } else { $sample.scores.overall }
    $focus = if ($useAggregated) { $sample.aggregatedMetrics.focusStability.median } else { $sample.scores.focusStability }
    $artifacts = if ($useAggregated) { $sample.aggregatedMetrics.artifactSeverity.median } else { $sample.scores.artifactSeverity }
    $objConsist = if ($useAggregated) { $sample.aggregatedMetrics.objectConsistency.median } else { $sample.scores.objectConsistency }
    
    $samples[$sampleId] = @{
        overall = $overall
        focusStability = $focus
        artifactSeverity = $artifacts
        objectConsistency = $objConsist
        isAggregated = $useAggregated
    }
    
    if ($overall -ne $null) { $overallScores += $overall }
    if ($focus -ne $null) { $focusScores += $focus }
    if ($artifacts -ne $null) { $artifactScores += $artifacts }
    if ($objConsist -ne $null) { $objConsistScores += $objConsist }
    
    # Determine verdict (simplified)
    $minOverall = $thresholds.globalDefaults.minOverall
    if ($thresholds.perSampleOverrides -and $thresholds.perSampleOverrides.$sampleId -and $thresholds.perSampleOverrides.$sampleId.minOverall) {
        $minOverall = $thresholds.perSampleOverrides.$sampleId.minOverall
    }
    
    if ($overall -lt $minOverall) {
        $verdicts.FAIL++
    } elseif ($overall -lt ($minOverall + 5)) {
        $verdicts.WARN++
    } else {
        $verdicts.PASS++
    }
}

# Calculate aggregates
function Get-Stats($arr) {
    if ($arr.Count -eq 0) { return @{ mean = 0; min = 0; max = 0 } }
    $sorted = $arr | Sort-Object
    return @{
        mean = [math]::Round(($arr | Measure-Object -Average).Average, 2)
        min = $sorted[0]
        max = $sorted[-1]
    }
}

$entry = @{
    runId = $RunId
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    thresholdVersion = $thresholdVersion
    sampleCount = $samples.Count
    samples = $samples
    aggregates = @{
        overall = Get-Stats $overallScores
        focusStability = Get-Stats $focusScores
        artifactSeverity = Get-Stats $artifactScores
        objectConsistency = Get-Stats $objConsistScores
    }
    verdicts = $verdicts
}

# Append entry
$history.entries += $entry

# Save history
$historyJson = $history | ConvertTo-Json -Depth 10
Set-Content -Path $HistoryPath -Value $historyJson -Encoding UTF8

Write-Host "  ✓ Appended to history: $HistoryPath" -ForegroundColor Green
Write-Host "    Run: $RunId | Samples: $($samples.Count) | PASS:$($verdicts.PASS) WARN:$($verdicts.WARN) FAIL:$($verdicts.FAIL)" -ForegroundColor Gray

exit 0
