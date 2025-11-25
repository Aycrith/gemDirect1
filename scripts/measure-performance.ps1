<#
.SYNOPSIS
    Measure React app performance metrics using browser APIs

.DESCRIPTION
    Opens the app in a browser, captures performance metrics, and generates a report.
    Metrics captured:
    - DOM load time
    - First paint / First contentful paint
    - React mount time (from console logs)
    - Memory usage
    - Resource count and sizes

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File scripts\measure-performance.ps1
#>

param(
    [string]$AppUrl = "http://localhost:3000",
    [int]$SampleCount = 3,
    [string]$OutputPath = "logs\performance-metrics.json"
)

Write-Host "🔍 Performance Measurement Tool" -ForegroundColor Cyan
Write-Host "Target: $AppUrl" -ForegroundColor Gray
Write-Host "Samples: $SampleCount" -ForegroundColor Gray
Write-Host ""

# Check if dev server is running
try {
    $response = Invoke-WebRequest $AppUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Host "✓ Dev server is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Dev server not running at $AppUrl" -ForegroundColor Red
    Write-Host "  Run: npm run dev" -ForegroundColor Yellow
    exit 1
}

# Create output directory
$outputDir = Split-Path $OutputPath -Parent
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host ""
Write-Host "📊 Collecting $SampleCount samples..." -ForegroundColor Cyan

$samples = @()

for ($i = 1; $i -le $SampleCount; $i++) {
    Write-Host "  Sample $i/$SampleCount..." -ForegroundColor Gray
    
    # Use Playwright to collect metrics
    $metricsScript = @"
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate and wait for load
    await page.goto('$AppUrl');
    await page.waitForLoadState('networkidle');
    
    // Capture performance metrics
    const metrics = await page.evaluate(() => {
        const perfData = window.performance.getEntriesByType('navigation')[0];
        const paintEntries = window.performance.getEntriesByType('paint');
        const firstPaint = paintEntries.find(e => e.name === 'first-paint');
        const firstContentfulPaint = paintEntries.find(e => e.name === 'first-contentful-paint');
        
        return {
            domContentLoaded: Math.round(perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart),
            pageLoad: Math.round(perfData.loadEventEnd - perfData.loadEventStart),
            domInteractive: Math.round(perfData.domInteractive - perfData.fetchStart),
            totalLoadTime: Math.round(perfData.loadEventEnd - perfData.fetchStart),
            firstPaint: firstPaint ? Math.round(firstPaint.startTime) : null,
            firstContentfulPaint: firstContentfulPaint ? Math.round(firstContentfulPaint.startTime) : null
        };
    });
    
    console.log(JSON.stringify(metrics));
    
    await browser.close();
})();
"@

    # Write temp script
    $tempScript = "$env:TEMP\measure-perf-$i.js"
    $metricsScript | Out-File -FilePath $tempScript -Encoding UTF8
    
    # Run with Node.js
    try {
        $output = node $tempScript 2>&1 | Out-String
        $json = $output -replace '(?s).*(\{.*\}).*','$1'
        $sample = $json | ConvertFrom-Json
        $samples += $sample
        
        Write-Host "    ✓ DOM: $($sample.domInteractive)ms, FCP: $($sample.firstContentfulPaint)ms" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ Failed to collect metrics: $_" -ForegroundColor Red
    }
    
    # Cleanup
    Remove-Item $tempScript -ErrorAction SilentlyContinue
    
    # Brief pause between samples
    if ($i -lt $SampleCount) {
        Start-Sleep -Seconds 1
    }
}

Write-Host ""
Write-Host "📈 Performance Summary" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

# Calculate averages
$avgDomInteractive = ($samples | Measure-Object -Property domInteractive -Average).Average
$avgFirstPaint = ($samples | Measure-Object -Property firstPaint -Average).Average
$avgFirstContentfulPaint = ($samples | Measure-Object -Property firstContentfulPaint -Average).Average
$avgTotalLoad = ($samples | Measure-Object -Property totalLoadTime -Average).Average

$summary = @{
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    url = $AppUrl
    sampleCount = $SampleCount
    averages = @{
        domInteractive = [math]::Round($avgDomInteractive, 0)
        firstPaint = [math]::Round($avgFirstPaint, 0)
        firstContentfulPaint = [math]::Round($avgFirstContentfulPaint, 0)
        totalLoadTime = [math]::Round($avgTotalLoad, 0)
    }
    samples = $samples
    targets = @{
        domInteractive = 1000
        firstContentfulPaint = 1500
    }
    status = @{
        domInteractive = if ($avgDomInteractive -lt 1000) { "PASS" } else { "WARN" }
        firstContentfulPaint = if ($avgFirstContentfulPaint -lt 1500) { "PASS" } else { "WARN" }
    }
}

# Display results
Write-Host "Metric                          Average      Target      Status" -ForegroundColor White
Write-Host "-" * 60 -ForegroundColor Gray
Write-Host ("DOM Interactive                 {0,6} ms   {1,6} ms   {2}" -f $summary.averages.domInteractive, $summary.targets.domInteractive, $summary.status.domInteractive) -ForegroundColor $(if ($summary.status.domInteractive -eq "PASS") { "Green" } else { "Yellow" })
Write-Host ("First Contentful Paint          {0,6} ms   {1,6} ms   {2}" -f $summary.averages.firstContentfulPaint, $summary.targets.firstContentfulPaint, $summary.status.firstContentfulPaint) -ForegroundColor $(if ($summary.status.firstContentfulPaint -eq "PASS") { "Green" } else { "Yellow" })
Write-Host ("Total Load Time                 {0,6} ms" -f $summary.averages.totalLoadTime) -ForegroundColor Gray

# Save to file
$summary | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
Write-Host ""
Write-Host "✓ Metrics saved to: $OutputPath" -ForegroundColor Green

# Exit with status code
$exitCode = if ($summary.status.domInteractive -eq "PASS" -and $summary.status.firstContentfulPaint -eq "PASS") { 0 } else { 1 }
exit $exitCode
