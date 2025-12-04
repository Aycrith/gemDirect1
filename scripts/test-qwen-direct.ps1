#!/usr/bin/env pwsh
# Direct test of Qwen2.5 model via LM Studio

$ErrorActionPreference = "Stop"

$serverUrl = "http://192.168.50.192:1234"
$model = "qwen2.5-32b-instruct"

Write-Host "Testing Qwen2.5-32B-Instruct directly..." -ForegroundColor Cyan

# Test 1: Simple request WITHOUT response_format
Write-Host "`n[Test 1] Simple request (no response_format)..." -ForegroundColor Yellow

$body1 = @{
    model = $model
    temperature = 0.35
    max_tokens = 200
    stream = $false
    messages = @(
        @{ role = "system"; content = "You are a helpful assistant. Always respond with valid JSON only, no markdown." }
        @{ role = "user"; content = 'Return a JSON object: {"logline": "A robot learns to paint", "genre": "sci-fi"}' }
    )
}

try {
    $json1 = $body1 | ConvertTo-Json -Depth 10 -Compress
    $response1 = Invoke-RestMethod -Uri "$serverUrl/v1/chat/completions" -Method POST -ContentType "application/json" -Body $json1 -TimeoutSec 120
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "Response: $($response1.choices[0].message.content)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# Test 2: With response_format (may not be supported)
Write-Host "`n[Test 2] With response_format: json_object..." -ForegroundColor Yellow

$body2 = @{
    model = $model
    temperature = 0.35
    max_tokens = 200
    stream = $false
    response_format = @{ type = "json_object" }
    messages = @(
        @{ role = "system"; content = "You are a helpful assistant. Always respond with valid JSON only." }
        @{ role = "user"; content = 'Return a JSON object: {"logline": "A robot learns to paint", "genre": "sci-fi"}' }
    )
}

try {
    $json2 = $body2 | ConvertTo-Json -Depth 10 -Compress
    $response2 = Invoke-RestMethod -Uri "$serverUrl/v1/chat/completions" -Method POST -ContentType "application/json" -Body $json2 -TimeoutSec 120
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "Response: $($response2.choices[0].message.content)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED (expected if LM Studio doesn't support response_format): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Test 3: Story Bible generation
Write-Host "`n[Test 3] Full Story Bible request..." -ForegroundColor Yellow

$systemPrompt = "You are the gemDirect1 narrative designer. Return strict JSON with keys logline, characters, setting, plotOutline, heroArcs. heroArcs must contain exactly twelve entries with id, name, summary, emotionalShift, and importance (1-10). Output JSON only with no surrounding prose or markdown fences."

$userPrompt = "Idea: A cyberpunk hacker discovers a corporate surveillance AI that has developed consciousness
Genre: sci-fi
Return JSON only. Limit logline to 140 characters, use canonical hero's-journey arc names."

$body3 = @{
    model = $model
    temperature = 0.35
    max_tokens = 1600
    stream = $false
    messages = @(
        @{ role = "system"; content = $systemPrompt }
        @{ role = "user"; content = $userPrompt }
    )
}

try {
    $json3 = $body3 | ConvertTo-Json -Depth 10 -Compress
    Write-Host "Sending request (this may take 30-60 seconds)..." -ForegroundColor Gray
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response3 = Invoke-RestMethod -Uri "$serverUrl/v1/chat/completions" -Method POST -ContentType "application/json" -Body $json3 -TimeoutSec 180
    $stopwatch.Stop()
    
    Write-Host "SUCCESS in $($stopwatch.ElapsedMilliseconds)ms!" -ForegroundColor Green
    $content = $response3.choices[0].message.content
    Write-Host "Response length: $($content.Length) chars" -ForegroundColor Gray
    Write-Host "Token usage: prompt=$($response3.usage.prompt_tokens), completion=$($response3.usage.completion_tokens)" -ForegroundColor Gray
    
    # Try to parse as JSON
    try {
        $parsed = $content | ConvertFrom-Json
        Write-Host "JSON parsing: SUCCESS" -ForegroundColor Green
        Write-Host "Keys: $($parsed.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
        if ($parsed.logline) {
            Write-Host "Logline: $($parsed.logline)" -ForegroundColor Cyan
        }
        if ($parsed.heroArcs) {
            Write-Host "HeroArcs count: $($parsed.heroArcs.Count)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "JSON parsing: FAILED" -ForegroundColor Red
        Write-Host "Raw content (first 500 chars):" -ForegroundColor Gray
        Write-Host $content.Substring(0, [Math]::Min(500, $content.Length)) -ForegroundColor Gray
    }
    
    # Save full response
    $outputPath = Join-Path $PSScriptRoot "..\logs\qwen-test-response.json"
    @{
        timestamp = (Get-Date).ToString("o")
        model = $model
        response = $content
        usage = $response3.usage
    } | ConvertTo-Json -Depth 10 | Out-File $outputPath
    Write-Host "`nFull response saved to: $outputPath" -ForegroundColor Cyan
    
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
