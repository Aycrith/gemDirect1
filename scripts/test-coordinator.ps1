#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Smart Test Coordinator - Prevents repeated tool calls and manages test iterations efficiently
    
.DESCRIPTION
    Coordinates multiple test iterations without agent overhead:
    - Tracks test state in persistent JSON file
    - Implements circuit breaker to stop on repeated failures
    - Provides progress checkpoints to prevent redundant iterations
    - Summarizes results instead of raw tool call output
    
.PARAMETER Operation
    'init'      - Initialize new test run
    'checkpoint'- Save progress checkpoint
    'next'      - Get next test to run
    'status'    - Show current test status
    'report'    - Generate summary report
    
.EXAMPLE
    # Start coordinated test run
    .\test-coordinator.ps1 -Operation init -TestCount 3
    
    # Run a single test and checkpoint results
    .\test-coordinator.ps1 -Operation next
    # ... execute test ...
    .\test-coordinator.ps1 -Operation checkpoint -Result success
    
    # Get final report
    .\test-coordinator.ps1 -Operation report
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('init', 'checkpoint', 'next', 'status', 'report', 'reset')]
    [string] $Operation,
    
    [int] $TestCount = 1,
    [ValidateSet('success', 'failure', 'timeout')]
    [string] $Result,
    
    [string] $ErrorMessage
)

$ErrorActionPreference = 'Stop'
$StateFile = "C:\Dev\gemDirect1\.test-coordinator-state.json"
$FailureThreshold = 3  # Stop after 3 consecutive failures

function Initialize-TestRun {
    $state = @{
        initialized = Get-Date -Format 'o'
        totalTests = $TestCount
        completed = 0
        passed = 0
        failed = 0
        consecutiveFailures = 0
        currentIndex = 0
        tests = @()
        checkpoint = $null
        status = "active"
    }
    
    for ($i = 1; $i -le $TestCount; $i++) {
        $state.tests += @{
            index = $i
            status = "pending"
            result = $null
            error = $null
            timestamp = $null
        }
    }
    
    $state | ConvertTo-Json -Depth 10 | Set-Content -Path $StateFile -Force
    
    Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║   Test Coordinator Initialized               ║" -ForegroundColor Cyan
    Write-Host "║   Total Tests: $TestCount" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next: .\test-coordinator.ps1 -Operation next" -ForegroundColor Yellow
}

function Get-TestState {
    if (-not (Test-Path $StateFile)) {
        Write-Host "✗ No active test run. Initialize with: -Operation init" -ForegroundColor Red
        exit 1
    }
    
    return Get-Content -Path $StateFile | ConvertFrom-Json
}

function Save-TestState {
    param([psobject] $State)
    $State | ConvertTo-Json -Depth 10 | Set-Content -Path $StateFile -Force
}

function Get-NextTest {
    $state = Get-TestState
    
    # Check if we should stop due to too many failures
    if ($state.consecutiveFailures -ge $FailureThreshold) {
        Write-Host "✗ Stopping: $($state.consecutiveFailures) consecutive failures (threshold: $FailureThreshold)" -ForegroundColor Red
        $state.status = "stopped"
        Save-TestState -State $state
        exit 1
    }
    
    # Find next pending test
    $nextTest = $state.tests | Where-Object { $_.status -eq "pending" } | Select-Object -First 1
    
    if (-not $nextTest) {
        Write-Host "✓ All tests completed" -ForegroundColor Green
        $state.status = "completed"
        Save-TestState -State $state
        exit 0
    }
    
    $state.currentIndex = $nextTest.index
    Save-TestState -State $state
    
    Write-Host "Running Test $($nextTest.index)/$($state.totalTests)..." -ForegroundColor Cyan
}

function Save-Checkpoint {
    param(
        [ValidateSet('success', 'failure', 'timeout')]
        [string] $Status,
        [string] $Message
    )
    
    $state = Get-TestState
    $testIndex = $state.currentIndex - 1
    
    $state.tests[$testIndex].status = $Status
    $state.tests[$testIndex].timestamp = Get-Date -Format 'o'
    $state.tests[$testIndex].error = $Message
    $state.completed++
    
    if ($Status -eq "success") {
        $state.passed++
        $state.consecutiveFailures = 0
    } else {
        $state.failed++
        $state.consecutiveFailures++
    }
    
    Save-TestState -State $state
    
    $icon = switch ($Status) {
        'success' { "✓"; Write-Host "✓ Test $($state.currentIndex) PASSED" -ForegroundColor Green }
        'failure' { "✗"; Write-Host "✗ Test $($state.currentIndex) FAILED" -ForegroundColor Red }
        'timeout' { "⏱"; Write-Host "⏱ Test $($state.currentIndex) TIMEOUT" -ForegroundColor Yellow }
    }
    
    if ($Message) {
        Write-Host "  Error: $Message" -ForegroundColor Gray
    }
}

function Show-Status {
    $state = Get-TestState
    
    Write-Host "`n╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║   Test Coordinator Status                   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    Write-Host "Progress: $($state.completed)/$($state.totalTests) completed" -ForegroundColor Yellow
    Write-Host "  Passed: $($state.passed)" -ForegroundColor Green
    Write-Host "  Failed: $($state.failed)" -ForegroundColor Red
    Write-Host "  Consecutive Failures: $($state.consecutiveFailures)" -ForegroundColor $(if ($state.consecutiveFailures -eq 0) { 'Green' } else { 'Yellow' })
    Write-Host "Overall Status: $($state.status)" -ForegroundColor $(if ($state.status -eq 'active') { 'Green' } else { 'Yellow' })
    
    Write-Host "`nTest Results:" -ForegroundColor Cyan
    foreach ($test in $state.tests) {
        $icon = switch ($test.status) {
            'pending' { "⏳" }
            'success' { "✓" }
            'failure' { "✗" }
            'timeout' { "⏱" }
        }
        Write-Host "  [$icon] Test $($test.index): $($test.status)" -ForegroundColor $(if ($test.status -eq 'pending') { 'Gray' } else { if ($test.status -eq 'success') { 'Green' } else { 'Red' } })
    }
}

function New-Report {
    $state = Get-TestState
    $duration = (Get-Date) - [datetime]::Parse($state.initialized)
    
    Write-Host "`n╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║   TEST RUN SUMMARY REPORT                    ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    Write-Host "`nExecution Timeline:" -ForegroundColor Yellow
    Write-Host "  Started: $($state.initialized)" -ForegroundColor Gray
    Write-Host "  Duration: $([int]$duration.TotalSeconds)s" -ForegroundColor Gray
    
    Write-Host "`nResults Summary:" -ForegroundColor Yellow
    Write-Host "  Total Tests: $($state.totalTests)" -ForegroundColor Cyan
    Write-Host "  ✓ Passed: $($state.passed)" -ForegroundColor Green
    Write-Host "  ✗ Failed: $($state.failed)" -ForegroundColor Red
    Write-Host "  Success Rate: $([math]::Round(($state.passed / $state.totalTests) * 100, 1))%" -ForegroundColor $(if ($state.passed -eq $state.totalTests) { 'Green' } else { 'Yellow' })
    
    Write-Host "`nDetailed Results:" -ForegroundColor Yellow
    foreach ($test in $state.tests) {
        Write-Host "  Test $($test.index):" -ForegroundColor Cyan
        Write-Host "    Status: $($test.status)" -ForegroundColor $(if ($test.status -eq 'success') { 'Green' } else { 'Red' })
        if ($test.error) {
            Write-Host "    Error: $($test.error)" -ForegroundColor Gray
        }
        if ($test.timestamp) {
            Write-Host "    Completed: $($test.timestamp)" -ForegroundColor Gray
        }
    }
    
    Write-Host "`nRecommendation:" -ForegroundColor Yellow
    if ($state.passed -eq $state.totalTests) {
        Write-Host "  ✓ All tests passed. Ready for deployment." -ForegroundColor Green
    } else {
        Write-Host "  ✗ Some tests failed. Review errors above and retry." -ForegroundColor Red
    }
}

function Reset-Coordinator {
    if (Test-Path $StateFile) {
        Remove-Item $StateFile -Force
        Write-Host "✓ Test coordinator state reset" -ForegroundColor Green
    }
}

# Execute requested operation
switch ($Operation) {
    'init' {
        Initialize-TestRun
    }
    'checkpoint' {
        Save-Checkpoint -Status $Result -Message $ErrorMessage
    }
    'next' {
        Get-NextTest
    }
    'status' {
        Show-Status
    }
    'report' {
        New-Report
    }
    'reset' {
        Reset-Coordinator
    }
}
