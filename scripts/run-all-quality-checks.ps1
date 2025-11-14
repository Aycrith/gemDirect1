#!/usr/bin/env pwsh
<#
.SYNOPSIS
Run all Phase 1 quality validators and generate aggregated report.

.DESCRIPTION
Orchestrates the full quality check suite for story generation runs:
- Telemetry Contract Validation (PowerShell)
- Coherence Check (Python/spaCy)
- Diversity Check (Python/entropy)
- Similarity Check (Python/BERT)

Generates aggregated quality-checks-full-report.json with all results.

.PARAMETER RunDir
Directory containing artifact-metadata.json and scene data (required)

.PARAMETER OutputFormat
Output format: 'json', 'text', or 'both' (default: 'both')

.PARAMETER StrictMode
If true, fail if ANY validator fails. If false, warn only (default: $true)

.EXAMPLE
pwsh scripts/run-all-quality-checks.ps1 -RunDir 'logs/2025-11-13-22-30-01'
# Run all validators on a specific run

.EXAMPLE
pwsh scripts/run-all-quality-checks.ps1 -RunDir 'logs/2025-11-13-22-30-01' -OutputFormat json
# Output JSON report only
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$RunDir,
    
    [ValidateSet('json', 'text', 'both')]
    [string]$OutputFormat = 'both',
    
    [bool]$StrictMode = $true
)

$ErrorActionPreference = 'Continue'
$startTime = Get-Date

# Validate RunDir exists
if (-not (Test-Path $RunDir)) {
    Write-Host "❌ ERROR: RunDir not found: $RunDir" -ForegroundColor Red
    exit 1
}

Write-Host "[Quality Check Suite] Starting at $startTime" -ForegroundColor Cyan
Write-Host "Run directory: $RunDir" -ForegroundColor Gray

# Initialize results object
$results = @{
    timestamp = Get-Date -Format 'o'
    run_dir = $RunDir
    validators = @{}
    summary = @{
        total_validators = 4
        passed = 0
        warned = 0
        failed = 0
    }
    overall_status = 'PENDING'
}

# ===== VALIDATOR 1: Telemetry Contract =====
Write-Host "`n[VALIDATOR 1/4] Telemetry Contract Validation..."
$powershellCheck = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'quality-checks\run-quality-checks.ps1'

if (Test-Path $powershellCheck) {
    try {
        & pwsh -NoLogo -ExecutionPolicy Bypass -File $powershellCheck -RunDir $RunDir
        $telemetryExitCode = $LASTEXITCODE
        
        $telemetryReport = Join-Path $RunDir 'quality-checks-report.json'
        $telemetryData = @{ status = 'UNKNOWN'; error = 'Report not found' }
        
        if (Test-Path $telemetryReport) {
            $telemetryData = Get-Content $telemetryReport | ConvertFrom-Json
        }
        
        $results.validators.telemetry = @{
            name = 'Telemetry Contract'
            exit_code = $telemetryExitCode
            status = if ($telemetryExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            report_file = $telemetryReport
            data = $telemetryData
        }
        
        Write-Host "  Status: $($results.validators.telemetry.status)" -ForegroundColor $(if ($telemetryExitCode -eq 0) { 'Green' } else { 'Red' })
    }
    catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $results.validators.telemetry = @{
            name = 'Telemetry Contract'
            status = 'ERROR'
            error = $_.Exception.Message
        }
    }
} else {
    Write-Host "  ⚠️  SKIPPED: Validator not found" -ForegroundColor Yellow
    $results.validators.telemetry = @{
        name = 'Telemetry Contract'
        status = 'SKIPPED'
        reason = 'Script not found'
    }
}

# ===== VALIDATOR 2: Coherence Check =====
Write-Host "`n[VALIDATOR 2/4] Coherence Check (spaCy)..."
$coherenceCheck = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'quality-checks\coherence-check.py'

if (Test-Path $coherenceCheck) {
    try {
        & python $coherenceCheck $RunDir 2>&1 | Tee-Object -Variable coherenceOutput | Out-Host
        $coherenceExitCode = $LASTEXITCODE
        
        $coherenceReport = Join-Path $RunDir 'coherence-check-report.json'
        $coherenceData = @{ status = 'UNKNOWN' }
        
        if (Test-Path $coherenceReport) {
            $coherenceData = Get-Content $coherenceReport | ConvertFrom-Json
        }
        
        $results.validators.coherence = @{
            name = 'Narrative Coherence'
            exit_code = $coherenceExitCode
            status = if ($coherenceExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            report_file = $coherenceReport
            data = $coherenceData
        }
        
        Write-Host "  Status: $($results.validators.coherence.status)" -ForegroundColor $(if ($coherenceExitCode -eq 0) { 'Green' } else { 'Red' })
    }
    catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $results.validators.coherence = @{
            name = 'Narrative Coherence'
            status = 'ERROR'
            error = $_.Exception.Message
        }
    }
} else {
    Write-Host "  ⚠️  SKIPPED: Validator not found" -ForegroundColor Yellow
    $results.validators.coherence = @{
        name = 'Narrative Coherence'
        status = 'SKIPPED'
        reason = 'Script not found'
    }
}

# ===== VALIDATOR 3: Diversity Check =====
Write-Host "`n[VALIDATOR 3/4] Diversity Check (entropy)..."
$diversityCheck = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'quality-checks\diversity-check.py'

if (Test-Path $diversityCheck) {
    try {
        & python $diversityCheck $RunDir 2>&1 | Tee-Object -Variable diversityOutput | Out-Host
        $diversityExitCode = $LASTEXITCODE
        
        $diversityReport = Join-Path $RunDir 'diversity-check-report.json'
        $diversityData = @{ status = 'UNKNOWN' }
        
        if (Test-Path $diversityReport) {
            $diversityData = Get-Content $diversityReport | ConvertFrom-Json
        }
        
        $results.validators.diversity = @{
            name = 'Thematic Diversity'
            exit_code = $diversityExitCode
            status = if ($diversityExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            report_file = $diversityReport
            data = $diversityData
        }
        
        Write-Host "  Status: $($results.validators.diversity.status)" -ForegroundColor $(if ($diversityExitCode -eq 0) { 'Green' } else { 'Red' })
    }
    catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $results.validators.diversity = @{
            name = 'Thematic Diversity'
            status = 'ERROR'
            error = $_.Exception.Message
        }
    }
} else {
    Write-Host "  ⚠️  SKIPPED: Validator not found" -ForegroundColor Yellow
    $results.validators.diversity = @{
        name = 'Thematic Diversity'
        status = 'SKIPPED'
        reason = 'Script not found'
    }
}

# ===== VALIDATOR 4: Similarity Check =====
Write-Host "`n[VALIDATOR 4/4] Similarity Check (BERT)..."
$similarityCheck = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'quality-checks\similarity-check.py'

if (Test-Path $similarityCheck) {
    try {
        & python $similarityCheck $RunDir 2>&1 | Tee-Object -Variable similarityOutput | Out-Host
        $similarityExitCode = $LASTEXITCODE
        
        $similarityReport = Join-Path $RunDir 'similarity-check-report.json'
        $similarityData = @{ status = 'UNKNOWN' }
        
        if (Test-Path $similarityReport) {
            $similarityData = Get-Content $similarityReport | ConvertFrom-Json
        }
        
        $results.validators.similarity = @{
            name = 'Semantic Alignment'
            exit_code = $similarityExitCode
            status = if ($similarityExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            report_file = $similarityReport
            data = $similarityData
        }
        
        Write-Host "  Status: $($results.validators.similarity.status)" -ForegroundColor $(if ($similarityExitCode -eq 0) { 'Green' } else { 'Red' })
    }
    catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $results.validators.similarity = @{
            name = 'Semantic Alignment'
            status = 'ERROR'
            error = $_.Exception.Message
        }
    }
} else {
    Write-Host "  ⚠️  SKIPPED: Validator not found" -ForegroundColor Yellow
    $results.validators.similarity = @{
        name = 'Semantic Alignment'
        status = 'SKIPPED'
        reason = 'Script not found'
    }
}

# ===== AGGREGATE RESULTS =====
Write-Host "`n[RESULTS]" -ForegroundColor Cyan

foreach ($validatorKey in $results.validators.Keys) {
    $validator = $results.validators[$validatorKey]
    if ($validator.status -eq 'PASS') { $results.summary.passed++ }
    elseif ($validator.status -eq 'FAIL') { $results.summary.failed++ }
    else { $results.summary.warned++ }
}

$results.overall_status = if ($results.summary.failed -eq 0) { 'PASS' } else { 'FAIL' }

# Summary table
Write-Host ""
Write-Host "Validator Results:" -ForegroundColor Gray
foreach ($validatorKey in $results.validators.Keys) {
    $validator = $results.validators[$validatorKey]
    $statusColor = switch ($validator.status) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        'WARN' { 'Yellow' }
        default { 'Gray' }
    }
    Write-Host "  $($validator.name): $($validator.status)" -ForegroundColor $statusColor
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Gray
Write-Host "  Passed: $($results.summary.passed)" -ForegroundColor Green
Write-Host "  Failed: $($results.summary.failed)" -ForegroundColor $(if ($results.summary.failed -gt 0) { 'Red' } else { 'Green' })
Write-Host "  Warned: $($results.summary.warned)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Overall: $($results.overall_status)" -ForegroundColor $(if ($results.overall_status -eq 'PASS') { 'Green' } else { 'Red' })

# ===== SAVE AGGREGATED REPORT =====
if ($OutputFormat -in 'json', 'both') {
    try {
        $reportPath = Join-Path $RunDir 'quality-checks-full-report.json'
        $results | ConvertTo-Json -Depth 10 | Set-Content -Path $reportPath -Encoding UTF8
        Write-Host "`n[OUTPUT] Full report saved: $reportPath" -ForegroundColor Cyan
    }
    catch {
        Write-Host "`n⚠️  Failed to save report: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Exit code
$exitCode = if ($StrictMode) {
    if ($results.summary.failed -eq 0) { 0 } else { 1 }
} else {
    0
}

Write-Host "`n[EXIT] Quality checks complete (code $exitCode)" -ForegroundColor $(if ($exitCode -eq 0) { 'Green' } else { 'Red' })
exit $exitCode
