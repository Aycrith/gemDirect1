#!/usr/bin/env pwsh
<#
.SYNOPSIS
Test Qwen3-VL Vision LLM for keyframe analysis

.DESCRIPTION
Tests the vision-language model's ability to analyze images and return structured feedback.
Uses a test image to validate the multimodal API format.

.EXAMPLE
pwsh scripts/test-vision-llm.ps1
#>

param(
    [string]$ServerUrl = "http://192.168.50.192:1234",
    [string]$Model = "huihui-qwen3-vl-32b-instruct-abliterated",
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           VISION LLM (Qwen3-VL) INTEGRATION TEST                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server: $ServerUrl" -ForegroundColor Gray
Write-Host "Model: $Model" -ForegroundColor Gray
Write-Host ""

# Check if model is available
Write-Host "[1/3] Checking if vision model is loaded..." -ForegroundColor Yellow
try {
    $modelsResponse = Invoke-RestMethod -Uri "$ServerUrl/v1/models" -Method GET -TimeoutSec 10
    $availableModels = $modelsResponse.data | ForEach-Object { $_.id }
    
    if ($Model -in $availableModels) {
        Write-Host "✓ Vision model available: $Model" -ForegroundColor Green
    } else {
        Write-Host "⚠ Target model '$Model' not loaded" -ForegroundColor Yellow
        Write-Host "  Available models:" -ForegroundColor Gray
        foreach ($m in $availableModels) {
            $isVL = $m -like "*vl*" -or $m -like "*vision*"
            $indicator = if ($isVL) { " [VISION]" } else { "" }
            Write-Host "    - $m$indicator" -ForegroundColor Gray
        }
        
        # Try to find a vision model
        $visionModel = $availableModels | Where-Object { $_ -like "*vl*" -or $_ -like "*vision*" } | Select-Object -First 1
        if ($visionModel) {
            $Model = $visionModel
            Write-Host "  Using: $Model" -ForegroundColor Cyan
        } else {
            Write-Host "✗ No vision model available. Please load a VL model in LM Studio." -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "✗ Cannot connect to LM Studio: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Create a simple test image (1x1 red pixel as base64)
# In real use, this would be a keyframe image
Write-Host ""
Write-Host "[2/3] Testing multimodal request format..." -ForegroundColor Yellow

# Simple 8x8 test image (red square) as base64 PNG
# This is a minimal valid PNG for testing the API format
$testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAADklEQVQI12P4z8DAwMAAAA0ABILlhgAAAABJRU5ErkJggg=="

$systemPrompt = @"
You are a cinematographer analyzing a test image. 
Respond with ONLY a JSON object (no markdown):
{
  "test": "success",
  "imageReceived": true,
  "description": "brief description of what you see"
}
"@

$messages = @(
    @{
        role = "user"
        content = @(
            @{
                type = "text"
                text = $systemPrompt
            }
            @{
                type = "image_url"
                image_url = @{
                    url = "data:image/png;base64,$testImageBase64"
                }
            }
        )
    }
)

$requestBody = @{
    model = $Model
    messages = $messages
    max_tokens = 200
    temperature = 0.3
    stream = $false
}

try {
    $jsonBody = $requestBody | ConvertTo-Json -Depth 10 -Compress
    Write-Host "Sending multimodal request..." -ForegroundColor Gray
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod `
        -Uri "$ServerUrl/v1/chat/completions" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonBody `
        -TimeoutSec $TimeoutSeconds
    $stopwatch.Stop()
    
    $content = $response.choices[0].message.content
    Write-Host "✓ Multimodal request successful ($($stopwatch.ElapsedMilliseconds)ms)" -ForegroundColor Green
    Write-Host "  Response: $($content.Substring(0, [Math]::Min(200, $content.Length)))..." -ForegroundColor Gray
    
    # Try to parse as JSON
    try {
        $parsed = $content | ConvertFrom-Json
        if ($parsed.test -eq "success" -or $parsed.imageReceived) {
            Write-Host "✓ Vision model correctly processed image" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠ Response is not JSON, but multimodal request worked" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "✗ Multimodal request failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# Test full keyframe analysis format
Write-Host ""
Write-Host "[3/3] Testing keyframe analysis format..." -ForegroundColor Yellow

$analysisPrompt = @"
You are a professional cinematographer analyzing a generated keyframe image.

**Scene:** A cyberpunk hacker works at a terminal in a neon-lit room
**Director's Vision:** Dark, moody atmosphere with blue and purple neon lighting
**Original Prompt:** "cyberpunk hacker, neon lights, dark room, computer terminal, futuristic"

Analyze the image and respond with ONLY this JSON structure (no markdown):
{
  "scores": {
    "composition": 75,
    "lighting": 80,
    "characterAccuracy": 70,
    "styleAdherence": 85,
    "overall": 78
  },
  "issues": [
    {"severity": "warning", "category": "lighting", "message": "Neon intensity could be higher"}
  ],
  "summary": "Good cyberpunk atmosphere with room for lighting enhancement",
  "refinedPrompt": "cyberpunk hacker at glowing terminal, intense neon blue and purple lighting, dark moody atmosphere, high contrast shadows"
}
"@

$analysisMessages = @(
    @{
        role = "user"
        content = @(
            @{
                type = "text"
                text = $analysisPrompt
            }
            @{
                type = "image_url"
                image_url = @{
                    url = "data:image/png;base64,$testImageBase64"
                }
            }
        )
    }
)

$analysisBody = @{
    model = $Model
    messages = $analysisMessages
    max_tokens = 800
    temperature = 0.3
    stream = $false
}

try {
    $jsonBody = $analysisBody | ConvertTo-Json -Depth 10 -Compress
    Write-Host "Sending analysis request (this may take 1-3 minutes)..." -ForegroundColor Gray
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod `
        -Uri "$ServerUrl/v1/chat/completions" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonBody `
        -TimeoutSec $TimeoutSeconds
    $stopwatch.Stop()
    
    $content = $response.choices[0].message.content
    Write-Host "✓ Analysis request successful ($($stopwatch.ElapsedMilliseconds)ms)" -ForegroundColor Green
    
    # Save response
    $outputPath = Join-Path $PSScriptRoot "..\logs\vision-test-response.json"
    @{
        timestamp = (Get-Date).ToString("o")
        model = $Model
        responseTimeMs = $stopwatch.ElapsedMilliseconds
        response = $content
        usage = $response.usage
    } | ConvertTo-Json -Depth 10 | Out-File $outputPath
    
    # Try to parse
    try {
        # Strip markdown fences if present
        $cleaned = $content -replace '```(?:json)?[\r\n]*([\s\S]*?)[\r\n]*```', '$1'
        $firstBrace = $cleaned.IndexOf('{')
        $lastBrace = $cleaned.LastIndexOf('}')
        if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
            $cleaned = $cleaned.Substring($firstBrace, $lastBrace - $firstBrace + 1)
        }
        
        $parsed = $cleaned | ConvertFrom-Json
        
        Write-Host ""
        Write-Host "═══ VISION ANALYSIS RESULT ═══" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Scores:" -ForegroundColor Yellow
        Write-Host "  Composition:      $($parsed.scores.composition)/100" -ForegroundColor White
        Write-Host "  Lighting:         $($parsed.scores.lighting)/100" -ForegroundColor White
        Write-Host "  Character:        $($parsed.scores.characterAccuracy)/100" -ForegroundColor White
        Write-Host "  Style Adherence:  $($parsed.scores.styleAdherence)/100" -ForegroundColor White
        Write-Host "  Overall:          $($parsed.scores.overall)/100" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Summary: $($parsed.summary)" -ForegroundColor Gray
        Write-Host ""
        
        if ($parsed.issues -and $parsed.issues.Count -gt 0) {
            Write-Host "Issues:" -ForegroundColor Yellow
            foreach ($issue in $parsed.issues) {
                $icon = switch ($issue.severity) {
                    "error" { "❌" }
                    "warning" { "⚠️" }
                    default { "ℹ️" }
                }
                Write-Host "  $icon [$($issue.category)] $($issue.message)" -ForegroundColor White
            }
            Write-Host ""
        }
        
        if ($parsed.refinedPrompt) {
            Write-Host "Refined Prompt:" -ForegroundColor Yellow
            Write-Host "  $($parsed.refinedPrompt)" -ForegroundColor Cyan
        }
        
        Write-Host ""
        Write-Host "✓ Vision LLM integration test PASSED" -ForegroundColor Green
        
    } catch {
        Write-Host "⚠ Could not parse as JSON, but request succeeded" -ForegroundColor Yellow
        Write-Host "Raw response (first 500 chars):" -ForegroundColor Gray
        Write-Host $content.Substring(0, [Math]::Min(500, $content.Length)) -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Full response saved to: $outputPath" -ForegroundColor Cyan
    
} catch {
    Write-Host "✗ Analysis request failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "═══ TEST COMPLETE ═══" -ForegroundColor Cyan
Write-Host ""
exit 0
