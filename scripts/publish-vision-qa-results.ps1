<#
.SYNOPSIS
    Publishes the latest vision QA results to the public folder for UI access.

.DESCRIPTION
    Copies the most recent vision-qa-results.json from temp/vision-qa-* to
    public/vision-qa-latest.json so the BookendVisionQAPanel can display it.
    
    This is a helper for development/QA workflows. In production, the panel
    will gracefully show "No results found".

.EXAMPLE
    .\publish-vision-qa-results.ps1
    Copies the latest results to public/vision-qa-latest.json
#>

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$TempDir = Join-Path $RepoRoot "temp"
$PublicDir = Join-Path $RepoRoot "public"
$ThresholdsSource = Join-Path $RepoRoot "data\bookend-golden-samples\vision-thresholds.json"

# Find latest vision QA results
$latestDir = Get-ChildItem -Path $TempDir -Directory -Filter "vision-qa-*" | 
    Sort-Object Name -Descending | 
    Select-Object -First 1

if (-not $latestDir) {
    Write-Host "ERROR: No vision-qa-* directories found in temp/" -ForegroundColor Red
    Write-Host "Run 'npm run bookend:vision-qa' first." -ForegroundColor Yellow
    exit 1
}

$sourcePath = Join-Path $latestDir.FullName "vision-qa-results.json"
if (-not (Test-Path $sourcePath)) {
    Write-Host "ERROR: Results file not found: $sourcePath" -ForegroundColor Red
    exit 1
}

$destPath = Join-Path $PublicDir "vision-qa-latest.json"

# Copy the file
Copy-Item -Path $sourcePath -Destination $destPath -Force

Write-Host "✓ Published vision QA results" -ForegroundColor Green
Write-Host "  Source: $sourcePath" -ForegroundColor Gray
Write-Host "  Dest:   $destPath" -ForegroundColor Gray

# Also publish the current thresholds so the UI can use the exact same config
if (Test-Path $ThresholdsSource) {
    $thresholdsDest = Join-Path $PublicDir "vision-thresholds.json"
    Copy-Item -Path $ThresholdsSource -Destination $thresholdsDest -Force
    Write-Host "û Published vision QA thresholds" -ForegroundColor Green
    Write-Host "  Threshold Source: $ThresholdsSource" -ForegroundColor Gray
    Write-Host "  Threshold Dest:   $thresholdsDest" -ForegroundColor Gray
}

# Also publish history file for UI baseline display
$HistorySource = Join-Path $RepoRoot "data\bookend-golden-samples\vision-qa-history.json"
if (Test-Path $HistorySource) {
    $historyDest = Join-Path $PublicDir "vision-qa-history.json"
    Copy-Item -Path $HistorySource -Destination $historyDest -Force
    Write-Host "✓ Published vision QA history" -ForegroundColor Green
    Write-Host "  History Source: $HistorySource" -ForegroundColor Gray
    Write-Host "  History Dest:   $historyDest" -ForegroundColor Gray
}

# Show summary
$results = Get-Content $destPath -Raw | ConvertFrom-Json
$sampleCount = ($results.PSObject.Properties | Where-Object { $_.Name -like "sample-*" }).Count
Write-Host "  Samples: $sampleCount" -ForegroundColor Gray
