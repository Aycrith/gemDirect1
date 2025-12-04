<#
.SYNOPSIS
    Agent-safe test runner for vitest unit tests.
    Enforces --run flag to prevent infinite watch mode.
    Enforces --reporter=verbose for clear output and completion verification.

.DESCRIPTION
    This script is the ONLY approved method for agents to run unit tests.
    It ensures tests:
    1. Run once and terminate (not watch mode)
    2. Produce verbose output for logging
    3. Return proper exit codes for success/failure detection

.PARAMETER Filter
    Optional test file pattern to filter which tests run.

.PARAMETER Coverage
    Include coverage report in output.

.EXAMPLE
    pwsh -File scripts/run-tests.ps1
    
.EXAMPLE
    pwsh -File scripts/run-tests.ps1 -Filter "comfyUIService"
    
.EXAMPLE
    pwsh -File scripts/run-tests.ps1 -Coverage
#>

param(
    [string]$Filter = "",
    [switch]$Coverage
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AGENT-SAFE TEST RUNNER (vitest)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Mode: Single-run with verbose output" -ForegroundColor Green
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Build command string
# Note: package.json "test" script already includes --run --reporter=verbose
$testArgs = ""

if ($Coverage) {
    $testArgs += "--coverage"
    Write-Host "Coverage: ENABLED" -ForegroundColor Yellow
}

if ($Filter) {
    if ($testArgs) { $testArgs += " " }
    $testArgs += $Filter
    Write-Host "Filter: $Filter" -ForegroundColor Yellow
}

Write-Host ""
if ($testArgs) {
    Write-Host "Running: npm test -- $testArgs" -ForegroundColor Gray
} else {
    Write-Host "Running: npm test" -ForegroundColor Gray
}
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Run tests
$startTime = Get-Date
if ($testArgs) {
    $command = "npm test -- $testArgs"
} else {
    $command = "npm test"
}
Invoke-Expression $command
$exitCode = $LASTEXITCODE
$duration = (Get-Date) - $startTime

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor Gray
Write-Host "Exit Code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Cyan

exit $exitCode
