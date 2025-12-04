#!/usr/bin/env pwsh
# Quick test of Qwen3-VL text capabilities

$ErrorActionPreference = "Stop"
$ServerUrl = "http://192.168.50.192:1234/v1/chat/completions"
$Model = "huihui-qwen3-vl-32b-instruct-abliterated"

Write-Host "Testing Qwen3-VL text-only request..." -ForegroundColor Cyan

$body = @{
    model = $Model
    messages = @(
        @{ role = "user"; content = "What is 2+2? Reply with just the number." }
    )
    max_tokens = 20
    temperature = 0.1
    stream = $false
} | ConvertTo-Json -Depth 5

try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod -Uri $ServerUrl -Method POST -ContentType "application/json" -Body $body -TimeoutSec 120
    $stopwatch.Stop()
    
    Write-Host "SUCCESS in $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor Green
    Write-Host "Response: $($response.choices[0].message.content)" -ForegroundColor White
    Write-Host "Tokens: prompt=$($response.usage.prompt_tokens), completion=$($response.usage.completion_tokens)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
