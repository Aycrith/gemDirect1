#!/usr/bin/env pwsh
# Debug script to test SaveImage with specific filename_prefix

$ComfyUrl = "http://127.0.0.1:8188"
$SceneId = "test-001"
$Prefix = "gemdirect1_$SceneId"

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting ComfyUI SaveImage debug test"
Write-Host "Prefix: $Prefix"

# Start ComfyUI
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting ComfyUI..."
Start-Process -FilePath "pwsh" -ArgumentList @(
    "-NoLogo",
    "-ExecutionPolicy", "Bypass",
    "-Command", @"
    `$env:PYTHONIOENCODING='utf-8'
    `$env:PYTHONLEGACYWINDOWSSTDIO='0'
    cd 'C:\ComfyUI\ComfyUI_windows_portable'
    .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 0.0.0.0 --port 8188 --enable-cors-header '*'
"@
) -PassThru -NoNewWindow | Out-Null

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Waiting for ComfyUI to start..."
Start-Sleep -Seconds 12

# Test connection
try {
    $health = Invoke-RestMethod -Uri "$ComfyUrl/system_stats" -TimeoutSec 5
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ ComfyUI is ready"
} catch {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ ComfyUI not responding: $_"
    exit 1
}

# Load workflow
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Loading workflow..."
$workflow = Get-Content "workflows/text-to-video.json" | ConvertFrom-Json

# Get a test keyframe
$keyframe = Get-Item "logs/*/story/keyframes/*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $keyframe) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ No keyframe found"
    exit 1
}

# Convert keyframe to base64
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Converting keyframe to base64..."
$keyframeBytes = [System.IO.File]::ReadAllBytes($keyframe.FullName)
$keyframeBase64 = [System.Convert]::ToBase64String($keyframeBytes)

# Patch workflow
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Patching workflow..."
Write-Host "  - Setting filename_prefix to: $Prefix"
Write-Host "  - Setting keyframe: $($keyframe.Name)"
Write-Host "  - Setting prompt: Test prompt"
Write-Host "  - Setting negative_prompt: ugly, bad quality"

$workflow."2".inputs.image = $keyframeBase64
$workflow."7".inputs.filename_prefix = $Prefix
$workflow."7"._meta.scene_prompt = "Test prompt"
$workflow."7"._meta.negative_prompt = "ugly, bad quality"

$workflowJson = $workflow | ConvertTo-Json -Depth 10

# Debug: Show the SaveImage node configuration
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] SaveImage node configuration:"
$workflow."7" | ConvertTo-Json | ForEach-Object { Write-Host "  $_" }

# Submit workflow
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Submitting workflow to ComfyUI..."
$clientId = "debug-$([guid]::NewGuid().ToString('N'))"
$payload = @{
    prompt = $workflow
    client_id = $clientId
}
$payloadJson = $payload | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method POST -ContentType 'application/json' -Body $payloadJson -TimeoutSec 15
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Prompt accepted"
    Write-Host "  Prompt ID: $($response.prompt_id)"
    $promptId = $response.prompt_id
} catch {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ Failed to submit workflow: $_"
    exit 1
}

# Poll for completion
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Polling for execution..."
$maxAttempts = 60
$pollCount = 0
$found = $false

while ($pollCount -lt $maxAttempts) {
    Start-Sleep -Seconds 1
    $pollCount++
    
    try {
        $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5 -ErrorAction Stop
        
        if ($history -and $history.$promptId -and $history.$promptId.outputs) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Execution complete (attempt $pollCount)"
            Write-Host "  Outputs: $($history.$promptId.outputs | ConvertTo-Json -Depth 2)"
            $found = $true
            break
        }
        
        # Check for status messages
        if ($history.$promptId.status -and $history.$promptId.status.messages) {
            $lastMessage = $history.$promptId.status.messages[-1]
            if ($pollCount % 10 -eq 0) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Still running (attempt $pollCount): $lastMessage"
            }
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠ Poll error: $_"
    }
}

if ($found) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Workflow completed, checking output directory..."
} else {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ Execution timeout after $maxAttempts attempts"
}

# Check for generated files
Start-Sleep -Seconds 2
$outputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
$files = @(Get-ChildItem "$outputDir" -Filter "${Prefix}*.png" -ErrorAction SilentlyContinue)

if ($files.Count -gt 0) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Found $($files.Count) frames:"
    foreach ($file in $files) {
        Write-Host "  - $($file.Name)"
    }
} else {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ No frames found with prefix '$Prefix'"
    Write-Host "  Files in output directory:"
    @(Get-ChildItem "$outputDir" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 20) | ForEach-Object {
        Write-Host "    - $($_.Name) ($(get-date $_.LastWriteTime -Format 'HH:mm:ss'))"
    }
}

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Test complete"
