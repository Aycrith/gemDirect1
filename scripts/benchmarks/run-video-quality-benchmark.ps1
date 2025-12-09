<#
.SYNOPSIS
    Wrapper script to run the Video Quality Benchmark harness.

.DESCRIPTION
    Runs the video quality benchmark on bookend regression videos,
    computing temporal coherence, motion consistency, and identity stability metrics.

.PARAMETER RunDir
    Specific regression run directory. Uses latest if not provided.

.PARAMETER Preset
    Filter to specific preset (production|cinematic|character|fast).

.PARAMETER Sample
    Filter to specific sample (e.g., sample-001-geometric).

.PARAMETER OutputDir
    Output directory for reports. Default: data/benchmarks

.PARAMETER Verbose
    Enable verbose logging.

.EXAMPLE
    .\run-video-quality-benchmark.ps1
    Runs benchmark on latest regression.

.EXAMPLE
    .\run-video-quality-benchmark.ps1 -RunDir "test-results/bookend-regression/run-20251204-163603" -Verbose
    Runs benchmark on specific run with verbose output.

.EXAMPLE
    .\run-video-quality-benchmark.ps1 -Sample sample-001-geometric
    Runs benchmark on single sample.
#>

param(
    [string]$RunDir,
    [ValidateSet('production', 'cinematic', 'character', 'fast')]
    [string]$Preset,
    [string]$Sample,
    [string]$OutputDir,
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
# Repo root is two levels up from scripts/benchmarks (C:\...\repo\scripts\benchmarks -> C:\...\repo)
$RepoRoot = (Resolve-Path (Join-Path $ScriptRoot ".." "..")).Path

Write-Host "`n=== Video Quality Benchmark ===" -ForegroundColor Cyan
Write-Host "Task A2: Workstream A - QA & Quality Signal Alignment" -ForegroundColor Gray
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Gray

$ffmpegPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegPath) {
    Write-Error "ffmpeg not found in PATH. Install: choco install ffmpeg"
    exit 1
}
Write-Host "  ✓ ffmpeg found" -ForegroundColor Green

$ffprobePath = Get-Command ffprobe -ErrorAction SilentlyContinue
if (-not $ffprobePath) {
    Write-Error "ffprobe not found in PATH. Install: choco install ffmpeg"
    exit 1
}
Write-Host "  ✓ ffprobe found" -ForegroundColor Green

# Build argument list
$args = @()

if ($RunDir) {
    $args += "--run-dir"
    $args += $RunDir
}

if ($Preset) {
    $args += "--preset"
    $args += $Preset
}

if ($Sample) {
    $args += "--sample"
    $args += $Sample
}

if ($OutputDir) {
    $args += "--output-dir"
    $args += $OutputDir
}

if ($Verbose) {
    $args += "--verbose"
}

# Run the benchmark
$benchmarkScript = Join-Path $RepoRoot "scripts" "benchmarks" "video-quality-benchmark.ts"

if (-not (Test-Path $benchmarkScript)) {
    Write-Error "Benchmark script not found: $benchmarkScript"
    exit 1
}

Write-Host ""
Write-Host "Running benchmark..." -ForegroundColor Cyan
Write-Host "  Script: $benchmarkScript" -ForegroundColor Gray
if ($args.Count -gt 0) {
    Write-Host "  Args: $($args -join ' ')" -ForegroundColor Gray
}
Write-Host ""

try {
    $argString = $args -join ' '
    $command = "npx tsx `"$benchmarkScript`" $argString"
    
    Push-Location $RepoRoot
    try {
        Invoke-Expression $command
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    
    if ($exitCode -ne 0) {
        Write-Error "Benchmark failed with exit code: $exitCode"
        exit $exitCode
    }
    
    Write-Host ""
    Write-Host "✓ Benchmark completed successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output locations:" -ForegroundColor Cyan
    Write-Host "  JSON/CSV: data/benchmarks/" -ForegroundColor Gray
    Write-Host "  Markdown: reports/" -ForegroundColor Gray
    
} catch {
    Write-Error "Benchmark failed: $_"
    exit 1
}
