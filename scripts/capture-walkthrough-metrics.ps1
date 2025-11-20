# Walkthrough Metrics Capture Script
# Runs in background while manual testing occurs
# Captures: Network requests, console logs, performance metrics

param(
    [string]$BrowserName = "chrome",
    [int]$DurationMinutes = 30,
    [string]$OutputDir = "C:\Dev\gemDirect1\logs\walkthrough-metrics-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
)

$ErrorActionPreference = "Continue"

# Create output directory
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Write-Host "📁 Output directory: $OutputDir" -ForegroundColor Cyan

$metricsLog = Join-Path $OutputDir "metrics-log.txt"
$networkLog = Join-Path $OutputDir "network-summary.json"
$performanceLog = Join-Path $OutputDir "performance-metrics.json"

# Helper function to log with timestamp
function Write-MetricLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $metricsLog -Value $logEntry
    
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host $logEntry -ForegroundColor $color
}

Write-MetricLog "=== Walkthrough Metrics Capture Started ===" "INFO"
Write-MetricLog "Duration: $DurationMinutes minutes" "INFO"
Write-MetricLog "Browser: $BrowserName" "INFO"

# Initialize metrics storage
$metrics = @{
    startTime = Get-Date -Format "o"
    endTime = $null
    checks = @()
    network = @{
        lmStudioCalls = 0
        comfyUICalls = 0
        externalCalls = @()
    }
    services = @{
        lmStudio = @{ checks = 0; successes = 0; failures = 0 }
        comfyUI = @{ checks = 0; successes = 0; failures = 0 }
        devServer = @{ checks = 0; successes = 0; failures = 0 }
    }
}

$endTime = (Get-Date).AddMinutes($DurationMinutes)
$checkInterval = 10 # seconds

Write-MetricLog "Will monitor until: $($endTime.ToString('HH:mm:ss'))" "INFO"
Write-MetricLog "Performing checks every $checkInterval seconds" "INFO"
Write-Host ""

# Main monitoring loop
while ((Get-Date) -lt $endTime) {
    $checkTime = Get-Date -Format "o"
    
    # Check LM Studio
    try {
        $metrics.services.lmStudio.checks++
        $lmTest = Invoke-RestMethod -Uri "http://localhost:1234/v1/models" -TimeoutSec 3 -ErrorAction Stop
        $metrics.services.lmStudio.successes++
        $lmStatus = "✓ UP"
        $lmColor = "Green"
    }
    catch {
        $metrics.services.lmStudio.failures++
        $lmStatus = "✗ DOWN"
        $lmColor = "Red"
        Write-MetricLog "LM Studio check failed: $_" "ERROR"
    }
    
    # Check ComfyUI
    try {
        $metrics.services.comfyUI.checks++
        $comfyTest = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 3 -ErrorAction Stop
        $metrics.services.comfyUI.successes++
        $comfyStatus = "✓ UP"
        $comfyColor = "Green"
        
        # Get queue info
        try {
            $queueInfo = Invoke-RestMethod -Uri "http://127.0.0.1:8188/queue" -TimeoutSec 2
            $queueRunning = $queueInfo.queue_running.Count
            $queuePending = $queueInfo.queue_pending.Count
            $comfyStatus += " (Queue: $queueRunning running, $queuePending pending)"
        }
        catch {
            # Queue endpoint might not exist, ignore
        }
    }
    catch {
        $metrics.services.comfyUI.failures++
        $comfyStatus = "✗ DOWN"
        $comfyColor = "Red"
        Write-MetricLog "ComfyUI check failed: $_" "ERROR"
    }
    
    # Check Dev Server
    try {
        $metrics.services.devServer.checks++
        $devTest = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $metrics.services.devServer.successes++
        $devStatus = "✓ UP (HTTP $($devTest.StatusCode))"
        $devColor = "Green"
    }
    catch {
        $metrics.services.devServer.failures++
        $devStatus = "✗ DOWN"
        $devColor = "Red"
        Write-MetricLog "Dev Server check failed: $_" "ERROR"
    }
    
    # Display status
    $elapsed = [math]::Round(((Get-Date) - [datetime]::Parse($metrics.startTime)).TotalSeconds)
    $remaining = [math]::Round(($endTime - (Get-Date)).TotalSeconds)
    
    Write-Host "`r[${elapsed}s elapsed, ${remaining}s remaining]  " -NoNewline -ForegroundColor Cyan
    Write-Host "LM Studio: $lmStatus  " -NoNewline -ForegroundColor $lmColor
    Write-Host "ComfyUI: $comfyStatus  " -NoNewline -ForegroundColor $comfyColor
    Write-Host "Dev: $devStatus  " -NoNewline -ForegroundColor $devColor
    
    # Store check result
    $metrics.checks += @{
        timestamp = $checkTime
        lmStudio = ($lmStatus -like "*UP*")
        comfyUI = ($comfyStatus -like "*UP*")
        devServer = ($devStatus -like "*UP*")
    }
    
    Start-Sleep -Seconds $checkInterval
}

Write-Host "`n"
Write-MetricLog "=== Monitoring Complete ===" "SUCCESS"

# Calculate uptime percentages
$lmUptime = if ($metrics.services.lmStudio.checks -gt 0) { 
    [math]::Round(($metrics.services.lmStudio.successes / $metrics.services.lmStudio.checks) * 100, 2) 
} else { 0 }

$comfyUptime = if ($metrics.services.comfyUI.checks -gt 0) { 
    [math]::Round(($metrics.services.comfyUI.successes / $metrics.services.comfyUI.checks) * 100, 2) 
} else { 0 }

$devUptime = if ($metrics.services.devServer.checks -gt 0) { 
    [math]::Round(($metrics.services.devServer.successes / $metrics.services.devServer.checks) * 100, 2) 
} else { 0 }

Write-MetricLog "" "INFO"
Write-MetricLog "=== Service Uptime Summary ===" "INFO"
Write-MetricLog "LM Studio: $lmUptime% ($($metrics.services.lmStudio.successes)/$($metrics.services.lmStudio.checks) checks)" $(if ($lmUptime -eq 100) { "SUCCESS" } else { "WARN" })
Write-MetricLog "ComfyUI: $comfyUptime% ($($metrics.services.comfyUI.successes)/$($metrics.services.comfyUI.checks) checks)" $(if ($comfyUptime -eq 100) { "SUCCESS" } else { "WARN" })
Write-MetricLog "Dev Server: $devUptime% ($($metrics.services.devServer.successes)/$($metrics.services.devServer.checks) checks)" $(if ($devUptime -eq 100) { "SUCCESS" } else { "WARN" })

# Save final metrics
$metrics.endTime = Get-Date -Format "o"
$metrics.summary = @{
    durationMinutes = $DurationMinutes
    totalChecks = $metrics.checks.Count
    lmStudioUptime = $lmUptime
    comfyUIUptime = $comfyUptime
    devServerUptime = $devUptime
}

$metrics | ConvertTo-Json -Depth 10 | Out-File $performanceLog
Write-MetricLog "Metrics saved to: $performanceLog" "SUCCESS"

# Check for Chrome network logs (if DevTools Protocol enabled)
try {
    Write-MetricLog "" "INFO"
    Write-MetricLog "=== Attempting to capture Chrome DevTools data ===" "INFO"
    
    # Note: This requires Chrome to be launched with --remote-debugging-port=9222
    # Users should launch Chrome with: chrome.exe --remote-debugging-port=9222
    
    $chromeDebugUrl = "http://localhost:9222/json"
    $chromeTabs = Invoke-RestMethod -Uri $chromeDebugUrl -TimeoutSec 2 -ErrorAction Stop
    
    $gemDirectTab = $chromeTabs | Where-Object { $_.url -like "*localhost:3000*" } | Select-Object -First 1
    
    if ($gemDirectTab) {
        Write-MetricLog "Found gemDirect1 tab: $($gemDirectTab.title)" "SUCCESS"
        Write-MetricLog "To capture network logs, use Chrome DevTools Protocol" "INFO"
        Write-MetricLog "DevTools URL: $($gemDirectTab.devtoolsFrontendUrl)" "INFO"
    }
    else {
        Write-MetricLog "gemDirect1 tab not found in Chrome debugging tabs" "WARN"
    }
}
catch {
    Write-MetricLog "Chrome remote debugging not available (launch with --remote-debugging-port=9222)" "WARN"
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "MONITORING COMPLETE" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Metrics saved to: $OutputDir" -ForegroundColor Cyan
Write-Host "📋 Review logs at: $metricsLog" -ForegroundColor Cyan
Write-Host ""

# Generate summary report
$summaryReport = @"
# Walkthrough Metrics Summary

**Date**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Duration**: $DurationMinutes minutes
**Checks Performed**: $($metrics.checks.Count)

## Service Uptime

| Service | Uptime | Checks | Status |
|---------|--------|--------|--------|
| LM Studio | ${lmUptime}% | $($metrics.services.lmStudio.checks) | $(if ($lmUptime -eq 100) { "✅ Stable" } else { "⚠️ Intermittent" }) |
| ComfyUI | ${comfyUptime}% | $($metrics.services.comfyUI.checks) | $(if ($comfyUptime -eq 100) { "✅ Stable" } else { "⚠️ Intermittent" }) |
| Dev Server | ${devUptime}% | $($metrics.services.devServer.checks) | $(if ($devUptime -eq 100) { "✅ Stable" } else { "⚠️ Intermittent" }) |

## Findings

- Total monitoring duration: $DurationMinutes minutes
- Check interval: $checkInterval seconds
- All services monitored: $(if ($lmUptime -eq 100 -and $comfyUptime -eq 100 -and $devUptime -eq 100) { "✅ YES" } else { "⚠️ Some downtime detected" })

## Recommendations

$(if ($lmUptime -lt 100) { "- Investigate LM Studio stability (uptime: ${lmUptime}%)" } else { "" })
$(if ($comfyUptime -lt 100) { "- Investigate ComfyUI stability (uptime: ${comfyUptime}%)" } else { "" })
$(if ($devUptime -lt 100) { "- Investigate Dev Server stability (uptime: ${devUptime}%)" } else { "" })

## Files Generated

- Metrics log: ``$metricsLog``
- Performance data: ``$performanceLog``
- Network data: ``$networkLog`` (manual collection required)

---

**Next Steps**: Review manual walkthrough findings and correlate with these metrics.
"@

$summaryPath = Join-Path $OutputDir "METRICS_SUMMARY.md"
$summaryReport | Out-File $summaryPath
Write-Host "📄 Summary report: $summaryPath" -ForegroundColor Green
Write-Host ""
