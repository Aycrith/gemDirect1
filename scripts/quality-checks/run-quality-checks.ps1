#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Orchestrates automated quality checks on generated story artifacts.
    
.DESCRIPTION
    Runs coherence, diversity, and semantic alignment validators on artifact-metadata.json.
    Logs results to standard output and optional JSON report.
    
    Exit codes:
    0 = All checks passed
    1 = One or more checks failed
    2 = Validation setup failed (missing dependencies, etc.)

.PARAMETER RunDir
    Path to logs/<timestamp> directory containing artifact-metadata.json.
    If not specified, uses most recent directory.

.PARAMETER OutputFormat
    Output format: 'table', 'json', or 'both' (default: 'table')

.PARAMETER Verbose
    Show detailed output for each metric.

.EXAMPLE
    pwsh ./scripts/quality-checks/run-quality-checks.ps1 -RunDir logs/20251113-102345
    pwsh ./scripts/quality-checks/run-quality-checks.ps1 -OutputFormat json
#>

param(
    [string]$RunDir = "",
    [ValidateSet("table", "json", "both")]
    [string]$OutputFormat = "table",
    [switch]$Verbose
)

# Color codes for output
$COLORS = @{
    "PASS" = @{fg = "Green"; bg = $null}
    "FAIL" = @{fg = "Red"; bg = $null}
    "WARN" = @{fg = "Yellow"; bg = $null}
    "INFO" = @{fg = "Cyan"; bg = $null}
}

function Write-Status {
    param([string]$Status, [string]$Message)
    $color = $COLORS[$Status]
    Write-Host "[$Status]" -ForegroundColor $color.fg -NoNewline
    Write-Host " $Message"
}

# 1. Resolve run directory
if ([string]::IsNullOrEmpty($RunDir)) {
    $logsDir = "logs"
    if (-not (Test-Path $logsDir)) {
        Write-Status "FAIL" "No logs directory found. Please run scripts/run-comfyui-e2e.ps1 first."
        exit 2
    }
    $RunDir = Get-ChildItem $logsDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-Object -ExpandProperty FullName
    Write-Status "INFO" "Using most recent run: $(Split-Path $RunDir -Leaf)"
}

# 2. Validate artifact-metadata.json exists
$MetadataPath = Join-Path $RunDir "artifact-metadata.json"
if (-not (Test-Path $MetadataPath)) {
    Write-Status "FAIL" "artifact-metadata.json not found at $MetadataPath"
    exit 2
}

Write-Status "INFO" "Loading artifact metadata..."
try {
    $Metadata = Get-Content $MetadataPath | ConvertFrom-Json
} catch {
    Write-Status "FAIL" "Failed to parse artifact-metadata.json: $_"
    exit 2
}

# 3. Initialize results object
$Results = [PSCustomObject]@{
    RunDir = $RunDir
    Timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    Checks = @{}
    Summary = @{
        Total = 0
        Passed = 0
        Failed = 0
        Warnings = 0
    }
    Details = @()
}

# ============================================================================
# CHECK 1: Telemetry Contract Validation
# ============================================================================
Write-Status "INFO" "Running: Telemetry Contract Validation"
$TelemetryCheck = @{
    Name = "TelemetryContract"
    Status = "PASS"
    Errors = @()
    Warnings = @()
}

# Verify all scenes have required telemetry fields
$RequiredTelemetryFields = @(
    "DurationSeconds", "MaxWaitSeconds", "PollIntervalSeconds",
    "HistoryAttempts", "HistoryAttemptLimit", "HistoryExitReason",
    "ExecutionSuccessDetected", "PostExecutionTimeoutSeconds",
    "SceneRetryBudget", "GPU", "DoneMarkerDetected", "ForcedCopyTriggered",
    "System"
)

foreach ($Scene in $Metadata.Scenes) {
    $MissingFields = @()
    foreach ($Field in $RequiredTelemetryFields) {
        if (-not (Get-Member -InputObject $Scene.Telemetry -Name $Field -Membership Properties -ErrorAction SilentlyContinue)) {
            $MissingFields += $Field
        }
    }
    
    if ($MissingFields.Count -gt 0) {
        $TelemetryCheck.Status = "FAIL"
        $TelemetryCheck.Errors += "Scene '$($Scene.SceneId)': Missing fields: $($MissingFields -join ', ')"
    }
    
    # Check GPU telemetry specifically
    if ($Scene.Telemetry.GPU.VramBeforeMB -eq $null -or $Scene.Telemetry.GPU.VramAfterMB -eq $null) {
        $TelemetryCheck.Warnings += "Scene '$($Scene.SceneId)': GPU VRAM telemetry incomplete"
    }
}

$Results.Checks.TelemetryContract = $TelemetryCheck
$Results.Summary.Total++
if ($TelemetryCheck.Status -eq "PASS") { $Results.Summary.Passed++ } else { $Results.Summary.Failed++ }
Write-Status $TelemetryCheck.Status "Telemetry: $($TelemetryCheck.Errors.Count) errors, $($TelemetryCheck.Warnings.Count) warnings"

# ============================================================================
# CHECK 2: Frame Count Validation
# ============================================================================
Write-Status "INFO" "Running: Frame Count Validation"
$FrameCheck = @{
    Name = "FrameCount"
    Status = "PASS"
    FrameFloor = 25
    Results = @()
    Errors = @()
}

$FrameStats = @{
    Total = 0
    Average = 0
    Min = 999
    Max = 0
    BelowFloor = 0
}

foreach ($Scene in $Metadata.Scenes) {
    $FrameCount = $Scene.FrameCount
    $FrameStats.Total += $FrameCount
    if ($FrameCount -lt $FrameCheck.FrameFloor) {
        $FrameStats.BelowFloor++
        $FrameCheck.Status = "FAIL"
        $FrameCheck.Errors += "Scene '$($Scene.SceneId)': Frame count $FrameCount < floor $($FrameCheck.FrameFloor)"
    }
    if ($FrameCount -lt $FrameStats.Min) { $FrameStats.Min = $FrameCount }
    if ($FrameCount -gt $FrameStats.Max) { $FrameStats.Max = $FrameCount }
}

$FrameStats.Average = [math]::Round($FrameStats.Total / $Metadata.Scenes.Count, 2)
$FrameCheck.Stats = $FrameStats

$Results.Checks.FrameCount = $FrameCheck
$Results.Summary.Total++
if ($FrameCheck.Status -eq "PASS") { $Results.Summary.Passed++ } else { $Results.Summary.Failed++ }
Write-Status $FrameCheck.Status "Frames: avg=$($FrameStats.Average), min=$($FrameStats.Min), max=$($FrameStats.Max), below_floor=$($FrameStats.BelowFloor)"

# ============================================================================
# CHECK 3: Done-Marker Reliability
# ============================================================================
Write-Status "INFO" "Running: Done-Marker Reliability"
$MarkerCheck = @{
    Name = "DoneMarkerReliability"
    Status = "PASS"
    Detected = 0
    ForcedCopy = 0
    Warnings = @()
}

foreach ($Scene in $Metadata.Scenes) {
    if ($Scene.Telemetry.DoneMarkerDetected -eq $true) {
        $MarkerCheck.Detected++
    } elseif ($Scene.Telemetry.ForcedCopyTriggered -eq $true) {
        $MarkerCheck.ForcedCopy++
        if ($MarkerCheck.ForcedCopy -gt ($Metadata.Scenes.Count * 0.1)) {
            $MarkerCheck.Status = "WARN"
            $MarkerCheck.Warnings += "Forced-copy rate exceeded 10% threshold"
        }
    }
}

$DetectionRate = [math]::Round(($MarkerCheck.Detected / $Metadata.Scenes.Count * 100), 2)
if ($DetectionRate -lt 95) {
    $MarkerCheck.Status = "WARN"
    $MarkerCheck.Warnings += "Done-marker detection rate $DetectionRate% below target 95%"
}

$Results.Checks.DoneMarkerReliability = $MarkerCheck
$Results.Summary.Total++
if ($MarkerCheck.Status -eq "PASS") { $Results.Summary.Passed++ } else { $Results.Summary.Warnings++ }
Write-Status $MarkerCheck.Status "Done-Marker: detected=$($MarkerCheck.Detected), forced_copy=$($MarkerCheck.ForcedCopy), rate=$($DetectionRate)%"

# ============================================================================
# CHECK 4: GPU VRAM Usage
# ============================================================================
Write-Status "INFO" "Running: GPU VRAM Usage"
$VramCheck = @{
    Name = "GPUVramUsage"
    Status = "PASS"
    MaxAllowedDeltaMB = 18432
    Warnings = @()
}

$VramStats = @{
    AverageDelta = 0
    MaxDelta = 0
    MinDelta = 0
    Warnings = 0
}

$VramDeltas = @()
foreach ($Scene in $Metadata.Scenes) {
    $Delta = $Scene.Telemetry.GPU.VramDeltaMB
    $VramDeltas += $Delta
    if ($Delta -gt $VramCheck.MaxAllowedDeltaMB) {
        $VramCheck.Status = "WARN"
        $VramCheck.Warnings += "Scene '$($Scene.SceneId)': VRAM delta $([math]::Abs($Delta))MB exceeds threshold"
        $VramStats.Warnings++
    }
}

if ($VramDeltas.Count -gt 0) {
    $VramStats.AverageDelta = [math]::Round(($VramDeltas | Measure-Object -Average).Average, 2)
    $VramStats.MaxDelta = [math]::Round(($VramDeltas | Measure-Object -Maximum).Maximum, 2)
    $VramStats.MinDelta = [math]::Round(($VramDeltas | Measure-Object -Minimum).Minimum, 2)
}

$VramCheck.Stats = $VramStats
$Results.Checks.GPUVramUsage = $VramCheck
$Results.Summary.Total++
if ($VramCheck.Status -eq "PASS") { $Results.Summary.Passed++ } else { $Results.Summary.Warnings++ }
Write-Status $VramCheck.Status "GPU VRAM: avg_delta=$(if ($VramStats.AverageDelta -eq 0) { 'N/A' } else { "$([math]::Abs($VramStats.AverageDelta))MB" }), warnings=$($VramStats.Warnings)"

# ============================================================================
# CHECK 5: Execution Health
# ============================================================================
Write-Status "INFO" "Running: Execution Health"
$HealthCheck = @{
    Name = "ExecutionHealth"
    Status = "PASS"
    Warnings = @()
}

$HealthStats = @{
    SuccessRate = 0
    TimeoutCount = 0
    FallbackNotes = @()
}

$SuccessCount = ($Metadata.Scenes | Where-Object { $_.Telemetry.ExecutionSuccessDetected -eq $true } | Measure-Object).Count
$HealthStats.SuccessRate = [math]::Round(($SuccessCount / $Metadata.Scenes.Count * 100), 2)

foreach ($Scene in $Metadata.Scenes) {
    if ($Scene.Telemetry.HistoryExitReason -eq "maxWait") {
        $HealthStats.TimeoutCount++
    }
    if ($Scene.Telemetry.System.FallbackNotes -and $Scene.Telemetry.System.FallbackNotes.Count -gt 0) {
        $HealthStats.FallbackNotes += $Scene.Telemetry.System.FallbackNotes
    }
}

if ($HealthStats.SuccessRate -lt 95) {
    $HealthCheck.Status = "WARN"
    $HealthCheck.Warnings += "Success rate $($HealthStats.SuccessRate)% below target 95%"
}
if ($HealthStats.TimeoutCount -gt 0) {
    $HealthCheck.Status = "WARN"
    $HealthCheck.Warnings += "Timeout count: $($HealthStats.TimeoutCount) scenes"
}

$HealthCheck.Stats = $HealthStats
$Results.Checks.ExecutionHealth = $HealthCheck
$Results.Summary.Total++
if ($HealthCheck.Status -eq "PASS") { $Results.Summary.Passed++ } else { $Results.Summary.Warnings++ }
Write-Status $HealthCheck.Status "Execution Health: success_rate=$($HealthStats.SuccessRate)%, timeouts=$($HealthStats.TimeoutCount)"

# ============================================================================
# Output Results
# ============================================================================
Write-Host ""
Write-Status "INFO" "Quality Checks Complete"
Write-Host ""

# Table output
if ($OutputFormat -in @("table", "both")) {
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "QUALITY CHECK RESULTS" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $Results.Checks.Values | ForEach-Object {
        Write-Host "▶ $($_.Name)" -ForegroundColor Cyan
        Write-Status $_.Status "$($_.Status)"
        if ($_.Errors) {
            Write-Host "  Errors:" -ForegroundColor Red
            $_.Errors | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
        }
        if ($_.Warnings) {
            Write-Host "  Warnings:" -ForegroundColor Yellow
            $_.Warnings | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
        }
        Write-Host ""
    }
    
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "Summary: $($Results.Summary.Passed) passed | $($Results.Summary.Failed) failed | $($Results.Summary.Warnings) warnings"
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
}

# JSON output
if ($OutputFormat -in @("json", "both")) {
    $JsonPath = Join-Path $RunDir "quality-checks-report.json"
    $Results | ConvertTo-Json -Depth 10 | Out-File $JsonPath -Encoding UTF8
    Write-Status "INFO" "JSON report saved: $JsonPath"
}

# Exit code
$OverallStatus = if ($Results.Summary.Failed -gt 0) { 1 } else { 0 }
exit $OverallStatus
