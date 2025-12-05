<#
.SYNOPSIS
    One-command CI-friendly bookend vision QA pipeline.

.DESCRIPTION
    Runs the full bookend vision QA pipeline in a single command:
    1. Analyzes video samples using multi-run VLM evaluation for stable metrics
    2. Validates JSON schema (fail-fast if structure has drifted)
    3. Applies coherence thresholds from vision-thresholds.json
    4. Appends results to historical baseline tracking (optional)
    5. Outputs a compact, CI-readable summary
    
    CI vs Quick Mode:
    ┌──────────────────────────────────────────────────────────────────────┐
    │ npm run bookend:vision-qa          │ 3-run (stable, for CI gates)   │
    │ npm run bookend:vision-qa:quick    │ 1-run (fast, for dev feedback) │
    │ npm run bookend:ci:vision          │ 3-run + quiet (for CI systems) │
    └──────────────────────────────────────────────────────────────────────┘
    
    WARN vs FAIL semantics:
    - FAIL: At least one metric crosses threshold (e.g., overall < minOverall)
    - WARN: At least one metric is within warnMargin of threshold
    - PASS: All metrics comfortably above thresholds
    
    Exit codes:
    - 0: All PASS or WARN only (CI success - WARNs are advisory)
    - 1: At least one FAIL (CI failure - blocks merge/deploy)
    
    This script is designed for CI pipelines that need a single entry point
    for vision QA validation with deterministic, low-noise output.

.PARAMETER Runs
    Number of VLM runs per sample for variance reduction. Default: 3.
    Higher values increase stability but take longer.
    CI should always use 3+ runs for reliable gating.

.PARAMETER Sample
    Specific sample to analyze (e.g., sample-001-geometric). Omit for all samples.

.PARAMETER Quiet
    Suppress verbose output, show only summary. Useful for CI pipelines.

.PARAMETER ShowThresholds
    Display threshold configuration before running analysis.

.EXAMPLE
    .\run-bookend-vision-qa.ps1
    Run full vision QA with default 3 VLM runs per sample

.EXAMPLE
    .\run-bookend-vision-qa.ps1 -Runs 5 -Quiet
    Run with 5 VLM runs and minimal output (CI mode)

.EXAMPLE
    .\run-bookend-vision-qa.ps1 -Sample sample-001-geometric -ShowThresholds
    Run single sample with threshold display
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateRange(1, 10)]
    [int]$Runs = 3,
    
    [Parameter(Mandatory=$false)]
    [string]$Sample,
    
    [switch]$Quiet,
    
    [switch]$ShowThresholds
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$ThresholdsPath = Join-Path $RepoRoot "data\bookend-golden-samples\vision-thresholds.json"

# Helper functions for consistent output
function Write-Banner {
    param([string]$Message)
    if (-not $Quiet) {
        Write-Host ""
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host "  $Message" -ForegroundColor Cyan
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host ""
    }
}

function Write-Info {
    param([string]$Message)
    if (-not $Quiet) {
        Write-Host "  $Message" -ForegroundColor Gray
    }
}

function Write-Step {
    param([string]$Message)
    if (-not $Quiet) {
        Write-Host "► $Message" -ForegroundColor White
    }
}

# Display banner
Write-Banner "BOOKEND VISION QA ($Runs-run aggregation)"

# Validate prerequisites
Write-Step "Checking prerequisites..."

# Check for thresholds file
if (-not (Test-Path $ThresholdsPath)) {
    Write-Host "ERROR: Thresholds file not found: $ThresholdsPath" -ForegroundColor Red
    exit 1
}

$thresholds = Get-Content $ThresholdsPath -Raw | ConvertFrom-Json
Write-Info "Thresholds version: $($thresholds.version)"

if ($ShowThresholds) {
    Write-Host ""
    Write-Host "Threshold Configuration:" -ForegroundColor Yellow
    Write-Host "  Global Defaults:" -ForegroundColor Gray
    Write-Host "    minOverall:         $($thresholds.globalDefaults.minOverall)%" -ForegroundColor Gray
    Write-Host "    minFocusStability:  $($thresholds.globalDefaults.minFocusStability)%" -ForegroundColor Gray
    Write-Host "    maxArtifactSeverity: $($thresholds.globalDefaults.maxArtifactSeverity)%" -ForegroundColor Gray
    Write-Host "    minObjectConsistency: $($thresholds.globalDefaults.minObjectConsistency)%" -ForegroundColor Gray
    Write-Host ""
}

# Step 1: Run VLM analysis with multi-run aggregation
Write-Step "Running VLM analysis with $Runs-run aggregation..."

$analyzeArgs = @(
    "-File", (Join-Path $PSScriptRoot "analyze-bookend-vision.ps1"),
    "-Runs", $Runs
)

if ($Sample) {
    $analyzeArgs += @("-Sample", $Sample)
}

# We need to pass a way to write to specific output dir
# The analyze script writes to temp\vision-qa-<RunTimestamp>\vision-qa-results.json
# We'll capture the output path and use it

$analyzeProcess = Start-Process -FilePath "pwsh" -ArgumentList $analyzeArgs -NoNewWindow -Wait -PassThru

if ($analyzeProcess.ExitCode -ne 0) {
    Write-Host "ERROR: VLM analysis failed with exit code $($analyzeProcess.ExitCode)" -ForegroundColor Red
    exit 1
}

# Find the most recent results file
$latestResultsDir = Get-ChildItem -Path (Join-Path $RepoRoot "temp") -Directory -Filter "vision-qa-*" | 
    Sort-Object Name -Descending | 
    Select-Object -First 1

if (-not $latestResultsDir) {
    Write-Host "ERROR: No vision-qa results directory found" -ForegroundColor Red
    exit 1
}

$latestResultsFile = Join-Path $latestResultsDir.FullName "vision-qa-results.json"
if (-not (Test-Path $latestResultsFile)) {
    Write-Host "ERROR: Results file not found: $latestResultsFile" -ForegroundColor Red
    exit 1
}

Write-Info "Results: $latestResultsFile"

# Step 1.5: Validate schema (fail fast if structure has drifted)
Write-Step "Validating results schema..."

$schemaArgs = @(
    "-File", (Join-Path $PSScriptRoot "check-vision-qa-schema.ps1"),
    "-ResultsPath", $latestResultsFile
)

$schemaProcess = Start-Process -FilePath "pwsh" -ArgumentList $schemaArgs -NoNewWindow -Wait -PassThru

if ($schemaProcess.ExitCode -ne 0) {
    Write-Host "ERROR: Schema validation failed - results structure has drifted" -ForegroundColor Red
    Write-Host "Check the analyze script output format matches expected schema." -ForegroundColor Yellow
    exit 1
}

# Step 2: Apply thresholds and gate
Write-Step "Applying coherence thresholds..."

$gateArgs = @(
    "-File", (Join-Path $PSScriptRoot "test-bookend-vision-regression.ps1"),
    "-ResultsPath", $latestResultsFile,
    "-ThresholdsPath", $ThresholdsPath
)

# Run gating script and capture exit code
$gateProcess = Start-Process -FilePath "pwsh" -ArgumentList $gateArgs -NoNewWindow -Wait -PassThru

$exitCode = $gateProcess.ExitCode

# Step 3: Append to historical tracking (on success only)
# This helps detect gradual regression and track improvements over time
if ($exitCode -eq 0) {
    Write-Step "Appending to history..."
    
    $historyArgs = @(
        "-File", (Join-Path $PSScriptRoot "append-vision-qa-history.ps1"),
        "-ResultsPath", $latestResultsFile,
        "-ThresholdsPath", $ThresholdsPath
    )
    
    $historyProcess = Start-Process -FilePath "pwsh" -ArgumentList $historyArgs -NoNewWindow -Wait -PassThru
    
    if ($historyProcess.ExitCode -ne 0) {
        # Non-fatal - log warning but don't fail the overall run
        Write-Host "  ⚠ History append failed (non-fatal)" -ForegroundColor Yellow
    }
}

# Final summary for CI
Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  VISION QA: PASSED" -ForegroundColor Green
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
} else {
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host "  VISION QA: FAILED" -ForegroundColor Red
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Red
}

Write-Host ""
Write-Info "Full results: $latestResultsFile"

exit $exitCode
