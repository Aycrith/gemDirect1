<#
.SYNOPSIS
    Agent-safe test runner for Playwright E2E tests.
    Enforces --reporter=list for clear output and completion verification.

.DESCRIPTION
    This script is the ONLY approved method for agents to run Playwright tests.
    It ensures tests:
    1. Produce list-format output for logging (not dots)
    2. Return proper exit codes for success/failure detection
    3. Never hang without output

.PARAMETER Filter
    Optional test file pattern to filter which tests run.

.PARAMETER Debug
    Run in debug mode with headed browser.

.PARAMETER UI
    Open Playwright UI for interactive test running.

.EXAMPLE
    pwsh -File scripts/run-playwright.ps1
    
.EXAMPLE
    pwsh -File scripts/run-playwright.ps1 -Filter "svd-basic"
    
.EXAMPLE
    pwsh -File scripts/run-playwright.ps1 -Debug
#>

param(
    [string]$Filter = "",
    [switch]$Debug,
    [switch]$UI
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AGENT-SAFE TEST RUNNER (Playwright)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Mode: List reporter with clear output" -ForegroundColor Green
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Check if dev server is running
$devServerRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        $devServerRunning = $true
        Write-Host "Dev Server: RUNNING (port 3000)" -ForegroundColor Green
    }
} catch {
    Write-Host "Dev Server: NOT RUNNING (Playwright will start it)" -ForegroundColor Yellow
}

# Build command string
$testArgs = "--reporter=list"

if ($UI) {
    $testArgs = "--ui"
    Write-Host "Mode: Interactive UI" -ForegroundColor Yellow
} elseif ($Debug) {
    $testArgs += " --debug"
    Write-Host "Mode: Debug (headed browser)" -ForegroundColor Yellow
}

if ($Filter -and -not $UI) {
    $testArgs += " $Filter"
    Write-Host "Filter: $Filter" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Running: npx playwright test $testArgs" -ForegroundColor Gray
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Run tests using Invoke-Expression to handle argument passing correctly
$startTime = Get-Date
$command = "npx playwright test $testArgs"
Invoke-Expression $command
$exitCode = $LASTEXITCODE
$duration = (Get-Date) - $startTime

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor Gray
Write-Host "Exit Code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Cyan

exit $exitCode
