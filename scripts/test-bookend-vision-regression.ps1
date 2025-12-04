<#
.SYNOPSIS
    Vision regression gating script - applies coherence thresholds to vision QA results.

.DESCRIPTION
    Reads vision QA results JSON and applies thresholds from vision-thresholds.json.
    Fails (exit code 1) if any sample violates thresholds.
    Warns if samples are within narrow margin of thresholds.
    
    Supports multi-run aggregated metrics: if aggregatedMetrics.*.median exists, uses
    that instead of single-run scores for more stable gating.

.PARAMETER ResultsPath
    Path to vision-qa-results.json. If not provided, finds latest in temp\vision-qa-*.

.PARAMETER ThresholdsPath
    Path to thresholds config. Defaults to data\bookend-golden-samples\vision-thresholds.json.

.EXAMPLE
    pwsh -File scripts/test-bookend-vision-regression.ps1
    pwsh -File scripts/test-bookend-vision-regression.ps1 -ResultsPath temp\vision-qa-20251204\vision-qa-results.json
#>

param(
    [string]$ResultsPath,
    [string]$ThresholdsPath = "data\bookend-golden-samples\vision-thresholds.json"
)

$ErrorActionPreference = 'Stop'

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VISION REGRESSION GATING" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Find latest results if not provided
if (-not $ResultsPath) {
    $visionDirs = Get-ChildItem -Path "temp" -Directory -Filter "vision-qa-*" | Sort-Object Name -Descending
    if ($visionDirs.Count -eq 0) {
        Write-Host "ERROR: No vision-qa-* directories found in temp/" -ForegroundColor Red
        Write-Host "Run 'npm run bookend:vision' first." -ForegroundColor Yellow
        exit 1
    }
    $latestDir = $visionDirs[0].FullName
    $ResultsPath = Join-Path $latestDir "vision-qa-results.json"
}

if (-not (Test-Path $ResultsPath)) {
    Write-Host "ERROR: Results file not found: $ResultsPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ThresholdsPath)) {
    Write-Host "ERROR: Thresholds file not found: $ThresholdsPath" -ForegroundColor Red
    exit 1
}

Write-Host "Results: $ResultsPath" -ForegroundColor Gray
Write-Host "Thresholds: $ThresholdsPath" -ForegroundColor Gray
Write-Host ""

# Load files
$results = Get-Content $ResultsPath -Raw | ConvertFrom-Json
$thresholds = Get-Content $ThresholdsPath -Raw | ConvertFrom-Json

$globalDefaults = $thresholds.globalDefaults
$overrides = $thresholds.perSampleOverrides

# Track verdicts
$verdicts = @()
$failCount = 0
$warnCount = 0
$passCount = 0
$warnMargin = 5  # Points within threshold to trigger WARN

Write-Host "Sample                 Overall  Focus  Artifacts  ObjConsist  Black  Flicker  Verdict" -ForegroundColor White
Write-Host "(* = aggregated median from multi-run VLM analysis)" -ForegroundColor DarkGray
Write-Host "---------------------------------------------------------------------------------------" -ForegroundColor Gray

# Results are at root level, not in a "samples" wrapper
foreach ($sample in $results.PSObject.Properties) {
    $sampleId = $sample.Name
    $sampleData = $sample.Value
    
    # Skip non-sample properties if any exist
    if (-not $sampleId.StartsWith("sample-")) {
        continue
    }
    
    # Get metrics from scores object
    $metrics = $sampleData.scores
    if (-not $metrics) {
        Write-Host "  SKIP: $sampleId - no scores object" -ForegroundColor Yellow
        continue
    }
    
    # Check for aggregated metrics (from multi-run VLM analysis)
    # Prefer aggregatedMetrics.*.median for stable gating
    $aggregated = $sampleData.aggregatedMetrics
    $useAggregated = $false
    if ($aggregated -and $aggregated.overall -and $null -ne $aggregated.overall.median) {
        $useAggregated = $true
    }
    
    # Get frame analysis (if present)
    $frameAnalysis = $sampleData.frameAnalysis
    $hasBlackFrames = if ($frameAnalysis) { $frameAnalysis.hasBlackFrames } else { $false }
    $hasHardFlicker = if ($frameAnalysis) { $frameAnalysis.hasHardFlicker } else { $false }
    
    # Get effective thresholds (global + overrides)
    $minOverall = $globalDefaults.minOverall
    $minFocusStability = $globalDefaults.minFocusStability
    $maxArtifactSeverity = $globalDefaults.maxArtifactSeverity
    $minObjectConsistency = $globalDefaults.minObjectConsistency
    $disallowBlackFrames = if ($null -ne $globalDefaults.disallowBlackFrames) { $globalDefaults.disallowBlackFrames } else { $true }
    $disallowHardFlicker = if ($null -ne $globalDefaults.disallowHardFlicker) { $globalDefaults.disallowHardFlicker } else { $true }
    
    if ($overrides.$sampleId) {
        $override = $overrides.$sampleId
        if ($null -ne $override.minOverall) { $minOverall = $override.minOverall }
        if ($null -ne $override.minFocusStability) { $minFocusStability = $override.minFocusStability }
        if ($null -ne $override.maxArtifactSeverity) { $maxArtifactSeverity = $override.maxArtifactSeverity }
        if ($null -ne $override.minObjectConsistency) { $minObjectConsistency = $override.minObjectConsistency }
        if ($null -ne $override.disallowBlackFrames) { $disallowBlackFrames = $override.disallowBlackFrames }
        if ($null -ne $override.disallowHardFlicker) { $disallowHardFlicker = $override.disallowHardFlicker }
    }
    
    # Extract metrics - prefer aggregated median if available, fall back to single-run scores
    if ($useAggregated) {
        $overall = if ($null -ne $aggregated.overall.median) { $aggregated.overall.median } else { 0 }
        $focusStability = if ($null -ne $aggregated.focusStability.median) { $aggregated.focusStability.median } else { 0 }
        $artifactSeverity = if ($null -ne $aggregated.artifactSeverity.median) { $aggregated.artifactSeverity.median } else { 100 }
        $objectConsistency = if ($null -ne $aggregated.objectConsistency.median) { $aggregated.objectConsistency.median } else { 0 }
        $metricsSource = "(aggregated median)"
    } else {
        $overall = if ($null -ne $metrics.overall) { $metrics.overall } else { 0 }
        $focusStability = if ($null -ne $metrics.focusStability) { $metrics.focusStability } else { 0 }
        $artifactSeverity = if ($null -ne $metrics.artifactSeverity) { $metrics.artifactSeverity } else { 100 }
        $objectConsistency = if ($null -ne $metrics.objectConsistency) { $metrics.objectConsistency } else { 0 }
        $metricsSource = ""
    }
    
    # Check for failures
    $failures = @()
    $warnings = @()
    
    if ($overall -lt $minOverall) {
        $failures += "overall<$minOverall"
    } elseif ($overall -lt ($minOverall + $warnMargin)) {
        $warnings += "overall~$minOverall"
    }
    
    if ($focusStability -lt $minFocusStability) {
        $failures += "focus<$minFocusStability"
    } elseif ($focusStability -lt ($minFocusStability + $warnMargin)) {
        $warnings += "focus~$minFocusStability"
    }
    
    if ($artifactSeverity -gt $maxArtifactSeverity) {
        $failures += "artifacts>$maxArtifactSeverity"
    } elseif ($artifactSeverity -gt ($maxArtifactSeverity - $warnMargin)) {
        $warnings += "artifacts~$maxArtifactSeverity"
    }
    
    if ($objectConsistency -lt $minObjectConsistency) {
        $failures += "objConsist<$minObjectConsistency"
    } elseif ($objectConsistency -lt ($minObjectConsistency + $warnMargin)) {
        $warnings += "objConsist~$minObjectConsistency"
    }
    
    # Hard artifact checks (black frames, flicker)
    if ($disallowBlackFrames -and $hasBlackFrames) {
        $failures += "hasBlackFrames"
    }
    if ($disallowHardFlicker -and $hasHardFlicker) {
        $failures += "hasHardFlicker"
    }
    
    # Determine verdict
    $verdict = "PASS"
    $verdictColor = "Green"
    $humanNote = ""
    
    # Check for human review metadata
    if ($overrides.$sampleId -and $overrides.$sampleId.humanReview) {
        $humanNote = " (human: $($overrides.$sampleId.humanReview.issueLevel))"
    }
    
    if ($failures.Count -gt 0) {
        $verdict = "FAIL"
        $verdictColor = "Red"
        $failCount++
    } elseif ($warnings.Count -gt 0) {
        $verdict = "WARN"
        $verdictColor = "Yellow"
        $warnCount++
    } else {
        $passCount++
    }
    
    # Format output row
    $shortId = $sampleId -replace "sample-", ""
    $blackFrameStr = if ($hasBlackFrames) { "YES" } else { "No" }
    $flickerStr = if ($hasHardFlicker) { "YES" } else { "No" }
    $aggIndicator = if ($useAggregated) { "*" } else { "" }
    $row = "{0,-22} {1,5}%{2} {3,4}  {4,9}  {5,10}  {6,5}  {7,7}  {8}{9}" -f $shortId, $overall, $aggIndicator, $focusStability, $artifactSeverity, $objectConsistency, $blackFrameStr, $flickerStr, $verdict, $humanNote
    Write-Host $row -ForegroundColor $verdictColor
    
    if ($failures.Count -gt 0) {
        Write-Host "  -> Failures: $($failures -join ', ')" -ForegroundColor Red
    }
    if ($warnings.Count -gt 0) {
        Write-Host "  -> Warnings: $($warnings -join ', ')" -ForegroundColor Yellow
    }
    
    $verdicts += @{
        sample = $sampleId
        verdict = $verdict
        failures = $failures
        warnings = $warnings
        aggregated = $useAggregated
    }
}

Write-Host ""
Write-Host "---------------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "SUMMARY: $passCount PASS / $warnCount WARN / $failCount FAIL" -ForegroundColor $(if ($failCount -gt 0) { "Red" } elseif ($warnCount -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($failCount -gt 0) {
    Write-Host "RESULT: FAILED - $failCount sample(s) below thresholds" -ForegroundColor Red
    exit 1
} elseif ($warnCount -gt 0) {
    Write-Host "RESULT: PASSED with WARNINGS - $warnCount sample(s) near thresholds" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "RESULT: PASSED - all samples within thresholds" -ForegroundColor Green
    exit 0
}
