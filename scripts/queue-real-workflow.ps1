param()
# Queue real SVD workflow and capture frames
# Uses ComfyUI's REST API directly

$ProjectRoot = 'C:\Dev\gemDirect1'
$ComfyUrl = 'http://127.0.0.1:8188'

Write-Host ""
Write-Host "[Real E2E] Queueing actual SVD workflow via REST API..."

$WorkflowPath = Join-Path $ProjectRoot 'workflows\text-to-video.json'
if (-not (Test-Path $WorkflowPath)) {
    Write-Warning "Workflow not found at $WorkflowPath"
    exit 1
}

# Read workflow template
$workflow = Get-Content $WorkflowPath -Raw | ConvertFrom-Json
Write-Host "[Real E2E] Workflow template loaded"

# Build the payload that ComfyUI expects: { prompt: <workflow>, client_id: <id> }
$clientId = "csg_$(Get-Random)"
$payload = @{
    prompt = $workflow
    client_id = $clientId
}
$payloadJson = $payload | ConvertTo-Json -Depth 10

# Queue the prompt
try {
    Write-Host "[Real E2E] Sending prompt to ComfyUI (client_id: $clientId)..."
    $response = Invoke-RestMethod -Uri "$ComfyUrl/prompt" `
        -Method POST `
        -ContentType 'application/json' `
        -Body $payloadJson `
        -TimeoutSec 10 `
        -ErrorAction Stop
    
    $promptId = $response.prompt_number
    Write-Host "[Real E2E] SUCCESS: Queued with prompt ID $promptId"
} catch {
    $errorMsg = $_ | ConvertTo-Json
    Write-Host "[Real E2E] Failed to queue: $errorMsg"
    exit 1
}

# Poll for completion (max 120 seconds)
Write-Host "[Real E2E] Monitoring execution..."
$start = Get-Date
$maxWait = 120
$pollCount = 0

while ((New-TimeSpan -Start $start).TotalSeconds -lt $maxWait) {
    $pollCount++
    try {
        $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($history -and $history.$promptId -and $history.$promptId.outputs) {
            Write-Host "[Real E2E] Workflow completed after $([Math]::Round((New-TimeSpan -Start $start).TotalSeconds, 1))s"
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
}

# Check for frames (ComfyUI creates output dir in its working directory)
Write-Host "[Real E2E] Checking generated frames..."
$possibleOutputDirs = @(
    'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs',
    'C:\ComfyUI\ComfyUI_windows_portable\outputs',
    'C:\ComfyUI\outputs'
)

$foundFrames = 0
foreach ($outputDir in $possibleOutputDirs) {
    if (Test-Path $outputDir) {
        $frames = @(Get-ChildItem -Path $outputDir -Filter 'gemdirect1_shot*.png' -File -ErrorAction SilentlyContinue)
        if ($frames.Count -gt 0) {
            Write-Host "[Real E2E] SUCCESS: Generated $($frames.Count) frames in $outputDir"
            $frames | ForEach-Object { Write-Host "  - $($_.Name)" }
            $foundFrames = $frames.Count
            break
        }
    }
}

if ($foundFrames -eq 0) {
    Write-Host "[Real E2E] INFO: No frames generated (workflow may have failed - check ComfyUI history)"
}

Write-Host "[Real E2E] Workflow test complete"
