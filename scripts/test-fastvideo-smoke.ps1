<#
.SYNOPSIS
    FastVideo smoke test - validates adapter with minimal 8-frame generation

.DESCRIPTION
    Tests the FastVideo adapter end-to-end:
    1. Checks server health
    2. Sends a minimal generation request (8 frames, low resolution)
    3. Validates MP4 output exists
    4. Reports telemetry

.PARAMETER ServerUrl
    FastVideo adapter endpoint (default: http://127.0.0.1:8055)

.PARAMETER OutputDir
    Output directory for test artifacts (default: test-results/fastvideo-smoke)

.EXAMPLE
    .\test-fastvideo-smoke.ps1
    Run smoke test with defaults

.EXAMPLE
    .\test-fastvideo-smoke.ps1 -ServerUrl http://127.0.0.1:8056
    Test against custom server port
#>

param(
    [string]$ServerUrl = "http://127.0.0.1:8055",
    [string]$OutputDir = "test-results/fastvideo-smoke"
)

$ErrorActionPreference = "Stop"

# --- Helper Functions ---
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Test-FastVideoHealth {
    param([string]$Url)
    
    try {
        $response = Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 5
        return $response
    } catch {
        throw "Health check failed: $($_.Exception.Message)"
    }
}

function Send-FastVideoRequest {
    param(
        [string]$Url,
        [hashtable]$Payload
    )
    
    try {
        $json = $Payload | ConvertTo-Json -Depth 10
        $response = Invoke-RestMethod `
            -Uri "$Url/generate" `
            -Method Post `
            -ContentType "application/json" `
            -Body $json `
            -TimeoutSec 300
        
        return $response
    } catch {
        throw "Generation request failed: $($_.Exception.Message)"
    }
}

# --- Main Script ---
Write-Header "FastVideo Smoke Test"

$testId = "smoke-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$testOutputDir = Join-Path $OutputDir $testId
New-Item -ItemType Directory -Path $testOutputDir -Force | Out-Null

Write-Host "Test ID: $testId" -ForegroundColor Gray
Write-Host "Server: $ServerUrl" -ForegroundColor Gray
Write-Host "Output: $testOutputDir" -ForegroundColor Gray
Write-Host ""

# Step 1: Health Check
Write-Host "Step 1: Health Check..." -ForegroundColor Cyan
try {
    $health = Test-FastVideoHealth -Url $ServerUrl
    Write-Host "✓ Server Status: $($health.status)" -ForegroundColor Green
    Write-Host "  Model: $($health.modelId)" -ForegroundColor Gray
    Write-Host "  Model Loaded: $($health.modelLoaded)" -ForegroundColor Gray
    Write-Host "  Attention Backend: $($health.attentionBackend)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Health check failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure FastVideo server is running:" -ForegroundColor Yellow
    Write-Host "  pwsh scripts\run-fastvideo-server.ps1" -ForegroundColor Gray
    exit 1
}

# Step 2: Generate Test Video
Write-Host ""
Write-Host "Step 2: Generate Test Video (8 frames, 720x480)..." -ForegroundColor Cyan

$payload = @{
    prompt = "Test smoke: A simple red sphere rotating slowly on a white background."
    negativePrompt = "complex, detailed, low quality"
    fps = 8
    numFrames = 8
    width = 720
    height = 480
    outputDir = $testOutputDir
}

Write-Host "  Prompt: $($payload.prompt)" -ForegroundColor Gray
Write-Host "  Config: $($payload.numFrames) frames @ $($payload.fps) FPS, $($payload.width)x$($payload.height)" -ForegroundColor Gray

$startTime = Get-Date
try {
    $result = Send-FastVideoRequest -Url $ServerUrl -Payload $payload
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    
    Write-Host "✓ Generation complete ($([math]::Round($elapsed, 1))s)" -ForegroundColor Green
    Write-Host "  Status: $($result.status)" -ForegroundColor Gray
    Write-Host "  Output: $($result.outputVideoPath)" -ForegroundColor Gray
    Write-Host "  Frames: $($result.frames)" -ForegroundColor Gray
    Write-Host "  Duration: $($result.durationMs)ms" -ForegroundColor Gray
    Write-Host "  Seed: $($result.seed)" -ForegroundColor Gray
    
    if ($result.warnings -and $result.warnings.Count -gt 0) {
        Write-Host "  Warnings:" -ForegroundColor Yellow
        $result.warnings | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
    }
} catch {
    Write-Host "✗ Generation failed: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Validate Output
Write-Host ""
Write-Host "Step 3: Validate Output..." -ForegroundColor Cyan

if (-not $result.outputVideoPath) {
    Write-Host "✗ No output path returned" -ForegroundColor Red
    exit 1
}

# Handle both absolute and relative paths
$outputPath = $result.outputVideoPath
if (-not [System.IO.Path]::IsPathRooted($outputPath)) {
    $outputPath = Join-Path $PWD $outputPath
}

if (Test-Path $outputPath) {
    $fileInfo = Get-Item $outputPath
    $sizeKB = [math]::Round($fileInfo.Length / 1KB, 2)
    
    Write-Host "✓ Output file exists: $outputPath" -ForegroundColor Green
    Write-Host "  Size: $sizeKB KB" -ForegroundColor Gray
    Write-Host "  Created: $($fileInfo.CreationTime)" -ForegroundColor Gray
    
    # Basic validation: file should be at least 10KB for 8 frames
    if ($fileInfo.Length -lt 10KB) {
        Write-Host "⚠ Warning: File size suspiciously small (< 10KB)" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ Output file not found: $outputPath" -ForegroundColor Red
    Write-Host "  Server returned path, but file doesn't exist" -ForegroundColor Gray
    exit 1
}

# Step 4: Summary
Write-Header "Smoke Test Complete"

$summary = @{
    testId = $testId
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    serverUrl = $ServerUrl
    result = "PASS"
    generationTime = $elapsed
    outputFile = $result.outputVideoPath
    fileSize = $fileInfo.Length
    config = $payload
    serverHealth = $health
}

$summaryPath = Join-Path $testOutputDir "smoke-test-summary.json"
$summary | ConvertTo-Json -Depth 10 | Set-Content $summaryPath

Write-Host "✓ All checks passed" -ForegroundColor Green
Write-Host "  Summary: $summaryPath" -ForegroundColor Gray
Write-Host "  Video: $outputPath" -ForegroundColor Gray
Write-Host ""
Write-Host "FastVideo adapter is functional and ready for integration!" -ForegroundColor Green
