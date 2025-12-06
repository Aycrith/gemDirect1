<#
.SYNOPSIS
    Runs the Video Quality Benchmark across all four presets and aggregates results.

.DESCRIPTION
    Multi-preset convenience wrapper for Task A2.1. Iterates over Production, Cinematic,
    Character, and Fast presets using the A1 baseline regression run, then produces an
    aggregate Markdown summary.

.PARAMETER BaselineRunDir
    Override the baseline regression run directory. If not provided, uses the A1 baseline
    run (run-20251204-163603) by default.

.PARAMETER OutputDir
    Output directory for individual preset reports. Default: data/benchmarks

.PARAMETER Verbose
    Enable verbose logging.

.EXAMPLE
    .\run-video-quality-all-presets.ps1
    Runs benchmark across all presets using A1 baseline runs.

.EXAMPLE
    .\run-video-quality-all-presets.ps1 -Verbose
    Runs with verbose output for debugging.

.EXAMPLE
    .\run-video-quality-all-presets.ps1 -BaselineRunDir "test-results/bookend-regression/run-20251205-120000"
    Uses a custom baseline run directory.

.NOTES
    Part of Task A2.1: Workstream A - QA & Quality Signal Alignment
    See: Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md
#>

param(
    [string]$BaselineRunDir,
    [string]$OutputDir,
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptRoot ".." "..")).Path
$Timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'

# === Configuration: Preset to RunDir Mapping ===
# These baseline runs were collected during Task A1 (Vision QA Baselines)
# As of 2025-12-05, all presets share the same regression run.
# Future baseline collections may use separate runs per preset.

$PresetConfig = @{
    'production' = @{
        RunDir = 'run-20251204-163603'
        WorkflowProfile = 'wan-fun-inpaint'
        Description = 'Standard production with Fun Inpaint'
    }
    'cinematic' = @{
        RunDir = 'run-20251204-163603'
        WorkflowProfile = 'wan-flf2v-feta'
        Description = 'FETA-enhanced FLF2V for temporal coherence'
    }
    'character' = @{
        RunDir = 'run-20251204-163603'
        WorkflowProfile = 'wan-ipadapter'
        Description = 'IP-Adapter for character consistency'
    }
    'fast' = @{
        RunDir = 'run-20251204-163603'
        WorkflowProfile = 'wan-flf2v'
        Description = 'Optimized FLF2V for faster iteration'
    }
}

Write-Host "`n=== Video Quality Benchmark - All Presets ===" -ForegroundColor Cyan
Write-Host "Task A2.1: Workstream A - QA & Quality Signal Alignment" -ForegroundColor Gray
Write-Host "Timestamp: $Timestamp" -ForegroundColor Gray
Write-Host ""

# Determine output directory
$benchmarkOutputDir = if ($OutputDir) { $OutputDir } else { Join-Path $RepoRoot "data" "benchmarks" }
$reportsDir = Join-Path $RepoRoot "reports"
$regressionBaseDir = Join-Path $RepoRoot "test-results" "bookend-regression"

# Ensure directories exist
New-Item -ItemType Directory -Path $benchmarkOutputDir -Force | Out-Null
New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null

# Track results per preset
$presetResults = @{}
$presetJsonPaths = @{}
$allSucceeded = $true

# === Run benchmark for each preset ===
$presets = @('production', 'cinematic', 'character', 'fast')

foreach ($preset in $presets) {
    $config = $PresetConfig[$preset]
    
    # Determine runDir (override or from config)
    $runDir = if ($BaselineRunDir) {
        $BaselineRunDir
    } else {
        Join-Path $regressionBaseDir $config.RunDir
    }
    
    Write-Host "`n--- Preset: $($preset.ToUpper()) ---" -ForegroundColor Yellow
    Write-Host "  Workflow: $($config.WorkflowProfile)" -ForegroundColor Gray
    Write-Host "  RunDir: $runDir" -ForegroundColor Gray
    
    if (-not (Test-Path $runDir)) {
        Write-Warning "RunDir not found: $runDir - Skipping preset"
        $presetResults[$preset] = @{ Status = 'SKIPPED'; Error = 'RunDir not found' }
        $allSucceeded = $false
        continue
    }
    
    # Build arguments for the benchmark script
    $benchmarkArgs = @(
        "--run-dir", $runDir,
        "--preset", $preset,
        "--output-dir", $benchmarkOutputDir
    )
    if ($Verbose) {
        $benchmarkArgs += "--verbose"
    }
    
    # Run the benchmark
    $benchmarkScript = Join-Path $RepoRoot "scripts" "benchmarks" "video-quality-benchmark.ts"
    $argString = $benchmarkArgs -join ' '
    $command = "npx tsx `"$benchmarkScript`" $argString"
    
    try {
        Push-Location $RepoRoot
        try {
            if ($Verbose) {
                Write-Host "  Command: $command" -ForegroundColor Gray
            }
            $output = Invoke-Expression $command 2>&1
            $exitCode = $LASTEXITCODE
            
            if ($exitCode -ne 0) {
                Write-Warning "Benchmark for $preset failed with exit code $exitCode"
                $presetResults[$preset] = @{ Status = 'FAILED'; Error = "Exit code $exitCode"; Output = $output }
                $allSucceeded = $false
                continue
            }
            
            # Find the JSON output file for this run
            # The benchmark creates files like: video-quality-YYYY-MM-DD_HH-mm-ss.json
            $latestJson = Get-ChildItem -Path $benchmarkOutputDir -Filter "video-quality-*.json" |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            
            if ($latestJson) {
                $jsonContent = Get-Content $latestJson.FullName | ConvertFrom-Json
                $presetResults[$preset] = @{
                    Status = 'SUCCESS'
                    JsonPath = $latestJson.FullName
                    Results = $jsonContent
                    OverallMean = $jsonContent.aggregates.overall.mean
                    OverallMedian = $jsonContent.aggregates.overall.median
                    OverallMin = $jsonContent.aggregates.overall.min
                    OverallMax = $jsonContent.aggregates.overall.max
                    SampleCount = $jsonContent.results.Count
                }
                $presetJsonPaths[$preset] = $latestJson.FullName
                Write-Host "  ✓ Overall Quality: $($jsonContent.aggregates.overall.mean)% (mean)" -ForegroundColor Green
            } else {
                Write-Warning "Could not find JSON output for $preset"
                $presetResults[$preset] = @{ Status = 'PARTIAL'; Error = 'JSON output not found' }
            }
        } finally {
            Pop-Location
        }
    } catch {
        Write-Warning "Exception running benchmark for $($preset): $_"
        $presetResults[$preset] = @{ Status = 'FAILED'; Error = $_.Exception.Message }
        $allSucceeded = $false
    }
}

# === Generate Aggregate Markdown Report ===
Write-Host "`n=== Generating Aggregate Report ===" -ForegroundColor Cyan

$aggregateReportPath = Join-Path $reportsDir "VIDEO_QUALITY_BENCHMARK_ALL_PRESETS_$Timestamp.md"

$mdContent = @"
# Video Quality Benchmark - All Presets

**Generated**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  
**Task ID**: A2.1  
**Baseline Source**: Task A1 Vision QA Baselines

## Executive Summary

| Preset | Status | Overall Mean | Samples | Workflow Profile |
|--------|--------|--------------|---------|------------------|
"@

foreach ($preset in $presets) {
    $result = $presetResults[$preset]
    $status = $result.Status
    $statusEmoji = switch ($status) {
        'SUCCESS' { '✅' }
        'PARTIAL' { '⚠️' }
        'SKIPPED' { '⏭️' }
        'FAILED'  { '❌' }
        default   { '❓' }
    }
    
    $overallMean = if ($result.OverallMean) { "$($result.OverallMean)%" } else { 'N/A' }
    $sampleCount = if ($result.SampleCount) { $result.SampleCount } else { 'N/A' }
    $workflow = $PresetConfig[$preset].WorkflowProfile
    
    $mdContent += "`n| **$($preset.Substring(0,1).ToUpper() + $preset.Substring(1))** | $statusEmoji $status | $overallMean | $sampleCount | ``$workflow`` |"
}

$mdContent += @"


## Detailed Per-Preset Results

"@

foreach ($preset in $presets) {
    $result = $presetResults[$preset]
    $config = $PresetConfig[$preset]
    
    $mdContent += @"

### $($preset.Substring(0,1).ToUpper() + $preset.Substring(1)) Preset

**Workflow**: ``$($config.WorkflowProfile)``  
**Description**: $($config.Description)  
**Baseline RunDir**: ``$($config.RunDir)``

"@
    
    if ($result.Status -eq 'SUCCESS') {
        $mdContent += @"
| Metric | Mean | Median | Min | Max |
|--------|------|--------|-----|-----|
| Overall Quality | $($result.OverallMean)% | $($result.OverallMedian)% | $($result.OverallMin)% | $($result.OverallMax)% |

**Samples Analyzed**: $($result.SampleCount)  
**JSON Report**: ``$($result.JsonPath | Split-Path -Leaf)``

"@
    } elseif ($result.Status -eq 'SKIPPED') {
        $mdContent += @"
> ⏭️ **Skipped**: $($result.Error)

"@
    } elseif ($result.Status -eq 'FAILED') {
        $mdContent += @"
> ❌ **Failed**: $($result.Error)

"@
    } else {
        $mdContent += @"
> ⚠️ **Partial**: $($result.Error)

"@
    }
}

$mdContent += @"

## Relationship to Vision QA Baselines (A1)

This report aggregates **technical quality metrics** (temporal coherence, motion consistency, identity stability) from the Video Quality Benchmark (A2).

For **semantic quality metrics** (prompt adherence, motion quality, coherence), see the Vision QA Baselines:
- ``reports/VISION_QA_BASELINES_20251205.md``
- ``data/vision-qa-baselines/baseline-all-presets-*.json``

### Cross-Reference Table

| Preset | A1 Overall (VLM) | A2 Overall (Signal) | Combined Assessment |
|--------|------------------|---------------------|---------------------|
"@

# Add A1/A2 cross-reference if we have A1 data
$a1BaselinesPath = Join-Path $RepoRoot "data" "vision-qa-baselines" "baseline-all-presets-20251205-005002.json"
$a1Data = $null
if (Test-Path $a1BaselinesPath) {
    try {
        $a1Data = Get-Content $a1BaselinesPath | ConvertFrom-Json
    } catch {
        # Ignore parse errors
    }
}

foreach ($preset in $presets) {
    $a2Result = $presetResults[$preset]
    $a2Score = if ($a2Result.OverallMean) { "$($a2Result.OverallMean)%" } else { 'N/A' }
    
    # Try to get A1 score
    $a1Score = 'N/A'
    if ($a1Data -and $a1Data.presets.$preset) {
        $a1Overall = $a1Data.presets.$preset.aggregates.overall.mean
        if ($a1Overall) { $a1Score = "$($a1Overall)%" }
    }
    
    # Combined assessment
    $combined = 'N/A'
    if ($a2Result.Status -eq 'SUCCESS') {
        if ($a2Result.OverallMean -ge 90) { $combined = '✅ Excellent' }
        elseif ($a2Result.OverallMean -ge 75) { $combined = '✅ Good' }
        elseif ($a2Result.OverallMean -ge 60) { $combined = '⚠️ Fair' }
        else { $combined = '❌ Poor' }
    }
    
    $mdContent += "`n| $($preset.Substring(0,1).ToUpper() + $preset.Substring(1)) | $a1Score | $a2Score | $combined |"
}

$mdContent += @"


## Output Files

| File | Description |
|------|-------------|
"@

foreach ($preset in $presets) {
    if ($presetJsonPaths[$preset]) {
        $filename = $presetJsonPaths[$preset] | Split-Path -Leaf
        $mdContent += "`n| ``$filename`` | $($preset.Substring(0,1).ToUpper() + $preset.Substring(1)) preset JSON report |"
    }
}

$mdContent += @"

| ``VIDEO_QUALITY_BENCHMARK_ALL_PRESETS_$Timestamp.md`` | This aggregate report |

## Reproduction Command

``````powershell
# Run all presets with default A1 baselines
.\scripts\benchmarks\run-video-quality-all-presets.ps1

# With verbose output
.\scripts\benchmarks\run-video-quality-all-presets.ps1 -Verbose

# Custom baseline run
.\scripts\benchmarks\run-video-quality-all-presets.ps1 -BaselineRunDir "test-results/bookend-regression/run-YYYYMMDD-HHMMSS"
``````

---

*Generated by Task A2.1: Multi-Preset Video Quality Benchmark*  
*Part of Workstream A: QA & Quality Signal Alignment*
"@

# Write the aggregate report
$mdContent | Out-File -FilePath $aggregateReportPath -Encoding utf8
Write-Host "  ✓ Aggregate report: $aggregateReportPath" -ForegroundColor Green

# === Final Summary ===
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Presets processed: $($presets.Count)" -ForegroundColor White

$successCount = ($presetResults.Values | Where-Object { $_.Status -eq 'SUCCESS' }).Count
$failedCount = ($presetResults.Values | Where-Object { $_.Status -eq 'FAILED' }).Count
$skippedCount = ($presetResults.Values | Where-Object { $_.Status -eq 'SKIPPED' }).Count

Write-Host "  ✅ Succeeded: $successCount" -ForegroundColor Green
if ($failedCount -gt 0) {
    Write-Host "  ❌ Failed: $failedCount" -ForegroundColor Red
}
if ($skippedCount -gt 0) {
    Write-Host "  ⏭️ Skipped: $skippedCount" -ForegroundColor Yellow
}

Write-Host "`nOutput:" -ForegroundColor Cyan
Write-Host "  Aggregate: $aggregateReportPath" -ForegroundColor Gray
Write-Host "  Data: $benchmarkOutputDir" -ForegroundColor Gray

if ($allSucceeded) {
    Write-Host "`n✓ All presets completed successfully" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠ Some presets did not complete successfully" -ForegroundColor Yellow
    exit 1
}
