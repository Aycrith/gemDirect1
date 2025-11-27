<#
.SYNOPSIS
    Runs the baseline metrics capture notebook and validates output artifacts.

.DESCRIPTION
    This script executes baseline_metrics_capture.ipynb to generate:
    - baseline_metrics.json: Pre-optimization prompt metrics
    - documentation_drift_report.json: Plan-to-repo discrepancies
    
    These are OUTPUT ARTIFACTS, not source files. They must be regenerated
    before each optimization phase to capture current state.

.EXAMPLE
    ./scripts/run-baseline-capture.ps1
    
.EXAMPLE
    npm run capture:baseline  # via package.json script
#>

param(
    [switch]$SkipValidation,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "`n[Baseline Capture] Starting baseline metrics capture..." -ForegroundColor Cyan

# Check for Jupyter/nbconvert
$nbconvert = Get-Command nbconvert -ErrorAction SilentlyContinue
if (-not $nbconvert) {
    Write-Host "[!] nbconvert not found. Install with: pip install nbconvert" -ForegroundColor Yellow
    Write-Host "[!] Alternatively, run the notebook manually in VS Code." -ForegroundColor Yellow
    exit 1
}

# Run the notebook
$NotebookPath = Join-Path $ScriptDir "baseline_metrics_capture.ipynb"
if (-not (Test-Path $NotebookPath)) {
    Write-Host "[X] Notebook not found: $NotebookPath" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Executing notebook: $NotebookPath" -ForegroundColor White
try {
    $output = jupyter nbconvert --to notebook --execute --inplace $NotebookPath 2>&1
    if ($Verbose) {
        Write-Host $output
    }
    Write-Host "[OK] Notebook executed successfully" -ForegroundColor Green
} catch {
    Write-Host "[X] Notebook execution failed: $_" -ForegroundColor Red
    exit 1
}

# Validate output artifacts
if (-not $SkipValidation) {
    $artifacts = @(
        @{ Name = "baseline_metrics.json"; Required = $true },
        @{ Name = "documentation_drift_report.json"; Required = $true }
    )
    
    $allPresent = $true
    foreach ($artifact in $artifacts) {
        $path = Join-Path $ScriptDir $artifact.Name
        if (Test-Path $path) {
            $size = (Get-Item $path).Length
            Write-Host "[OK] $($artifact.Name) ($size bytes)" -ForegroundColor Green
        } else {
            if ($artifact.Required) {
                Write-Host "[X] Missing required artifact: $($artifact.Name)" -ForegroundColor Red
                $allPresent = $false
            } else {
                Write-Host "[?] Optional artifact not generated: $($artifact.Name)" -ForegroundColor Yellow
            }
        }
    }
    
    if (-not $allPresent) {
        Write-Host "`n[X] Baseline capture incomplete - some artifacts missing" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n[OK] Baseline capture complete!" -ForegroundColor Green
Write-Host "    Review artifacts in: $ScriptDir" -ForegroundColor White
