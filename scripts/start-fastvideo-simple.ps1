#!/usr/bin/env pwsh
# Simple FastVideo server starter (bypasses complex launcher for testing)

Write-Host "Starting FastVideo server directly..." -ForegroundColor Cyan

# Activate venv
& 'C:\Dev\gemDirect1\fastvideo-env\Scripts\Activate.ps1'

# Set environment
$env:FASTVIDEO_MODEL_ID = "hao-ai-lab/FastHunyuan-diffusers"
$env:FASTVIDEO_HOME = "C:\Users\camer\fastvideo"

# Start server
Write-Host "Server starting on http://127.0.0.1:8055" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

python 'C:\Dev\gemDirect1\scripts\fastvideo\fastvideo_server.py'
