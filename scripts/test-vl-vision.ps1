#!/usr/bin/env pwsh
# Test Qwen3-VL vision capability with proper multimodal format

$ErrorActionPreference = "Stop"
$ServerUrl = "http://192.168.50.192:1234/v1/chat/completions"
$Model = "huihui-qwen3-vl-32b-instruct-abliterated"

Write-Host "Testing Qwen3-VL vision capability..." -ForegroundColor Cyan

# Create a simple 64x64 red test image as valid PNG
# This is a minimal valid PNG that should work
$testImagePath = Join-Path $PSScriptRoot "..\logs\test-image.png"

# Create test image using .NET
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(64, 64)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::Red)
$graphics.FillRectangle([System.Drawing.Brushes]::Blue, 16, 16, 32, 32)
$graphics.Dispose()
$bitmap.Save($testImagePath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host "Created test image: $testImagePath" -ForegroundColor Gray

# Read as base64
$imageBytes = [System.IO.File]::ReadAllBytes($testImagePath)
$imageBase64 = [Convert]::ToBase64String($imageBytes)
Write-Host "Image size: $($imageBytes.Length) bytes, base64 length: $($imageBase64.Length)" -ForegroundColor Gray

# Try different message formats that VL models might accept

# Format 1: OpenAI-style with content array
Write-Host "`n[Format 1] OpenAI-style content array..." -ForegroundColor Yellow
$body1 = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = @(
                @{ type = "text"; text = "Describe this image briefly. What colors do you see?" }
                @{ type = "image_url"; image_url = @{ url = "data:image/png;base64,$imageBase64" } }
            )
        }
    )
    max_tokens = 100
    temperature = 0.3
    stream = $false
}

try {
    $json1 = $body1 | ConvertTo-Json -Depth 10 -Compress
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response1 = Invoke-RestMethod -Uri $ServerUrl -Method POST -ContentType "application/json" -Body $json1 -TimeoutSec 180
    $stopwatch.Stop()
    Write-Host "SUCCESS in $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor Green
    Write-Host "Response: $($response1.choices[0].message.content)" -ForegroundColor White
    exit 0
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errorDetails.error) {
            Write-Host "Error: $($errorDetails.error)" -ForegroundColor Red
        } else {
            Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
}

# Format 2: Try with base64 directly (no data URL prefix)
Write-Host "`n[Format 2] base64 without data URL prefix..." -ForegroundColor Yellow
$body2 = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = @(
                @{ type = "text"; text = "Describe this image briefly." }
                @{ type = "image_url"; image_url = @{ url = $imageBase64 } }
            )
        }
    )
    max_tokens = 100
    stream = $false
}

try {
    $json2 = $body2 | ConvertTo-Json -Depth 10 -Compress
    $response2 = Invoke-RestMethod -Uri $ServerUrl -Method POST -ContentType "application/json" -Body $json2 -TimeoutSec 180
    Write-Host "SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response2.choices[0].message.content)" -ForegroundColor White
    exit 0
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

# Format 3: Try with image directly in content
Write-Host "`n[Format 3] image type directly..." -ForegroundColor Yellow
$body3 = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = @(
                @{ type = "text"; text = "Describe this image." }
                @{ type = "image"; image = $imageBase64 }
            )
        }
    )
    max_tokens = 100
    stream = $false
}

try {
    $json3 = $body3 | ConvertTo-Json -Depth 10 -Compress
    $response3 = Invoke-RestMethod -Uri $ServerUrl -Method POST -ContentType "application/json" -Body $json3 -TimeoutSec 180
    Write-Host "SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response3.choices[0].message.content)" -ForegroundColor White
    exit 0
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n❌ All vision formats failed. The model may not support vision via this API." -ForegroundColor Red
Write-Host "Consider using Qwen2.5-32B for text generation instead." -ForegroundColor Yellow

# Cleanup
Remove-Item $testImagePath -Force -ErrorAction SilentlyContinue
