param(
    [string] $ComfyUrl = 'http://127.0.0.1:8188'
)

Write-Host "[Test] Starting ComfyUI direct test..." -ForegroundColor Cyan

# Step 1: Check connection
Write-Host "`n[1] Testing ComfyUI connection..."
try {
    $stats = Invoke-RestMethod -Uri "$ComfyUrl/system_stats" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✓ ComfyUI is accessible"
    if ($stats.devices) {
        Write-Host "  GPU: $($stats.devices[0].name)"
    }
}catch {
    Write-Host "✗ Cannot connect to ComfyUI: $_"
    exit 1
}

# Step 2: Check queue
Write-Host "`n[2] Checking queue status..."
try {
    $queue = Invoke-RestMethod -Uri "$ComfyUrl/queue" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✓ Queue accessible"
    Write-Host "  Queued: $($queue.queue_pending.Count) / Running: $($queue.queue_running.Count)"
} catch {
    Write-Host "✗ Cannot access queue: $_"
}

# Step 3: Check history
Write-Host "`n[3] Checking history..."
try {
    $history = Invoke-RestMethod -Uri "$ComfyUrl/history" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✓ History accessible"
    Write-Host "  Total prompts: $($history.PSObject.Properties.Count)"
} catch {
    Write-Host "✗ Cannot access history: $_"
}

# Step 4: Load and validate workflow
Write-Host "`n[4] Loading workflow..."
$workflowPath = 'C:\Dev\gemDirect1\workflows\text-to-video.json'
if (-not (Test-Path $workflowPath)) {
    Write-Host "✗ Workflow not found at $workflowPath"
    exit 1
}

try {
    $workflow = Get-Content $workflowPath -Raw | ConvertFrom-Json
    Write-Host "✓ Workflow loaded"
    Write-Host "  Nodes: $($workflow.PSObject.Properties.Count)"
} catch {
    Write-Host "✗ Failed to load workflow: $_"
    exit 1
}

# Step 5: Queue a test prompt
Write-Host "`n[5] Queueing test prompt..."
$testId = "test-$(Get-Random -Minimum 1000 -Maximum 9999)"
$keyframeTarget = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input\test_keyframe.png'

# Check if we have a keyframe
if (-not (Test-Path $keyframeTarget)) {
    Write-Host "✗ No test keyframe at $keyframeTarget"
    Write-Host "  Skipping queue test"
} else {
    # Prepare workflow
    $workflow.'2'.inputs.image = "test_keyframe.png"
    $workflow.'2'.widgets_values[0] = "test_keyframe.png"  
    $workflow.'7'.inputs.filename_prefix = $testId
    
    $payload = @{
        prompt = $workflow
        client_id = $testId
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method POST -ContentType 'application/json' -Body $payload -TimeoutSec 15 -ErrorAction Stop
        $promptId = $response.prompt_id
        Write-Host "✓ Prompt queued"
            Write-Host "  Prompt ID: $promptId"
            Write-Host "  Client ID: $testId"
            
            # Step 6: Poll history for the prompt
            Write-Host "`n[6] Polling history for prompt..."
            $pollCount = 0
            $pollMax = 20
            $found = $false
            
            while ($pollCount -lt $pollMax -and -not $found) {
                $pollCount += 1
                Start-Sleep -Seconds 1
                
                try {
                    $historyData = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5 -ErrorAction Stop
                    if ($historyData -and $historyData.$promptId) {
                        Write-Host "✓ Prompt found in history after ${pollCount} seconds"
                        Write-Host "  Status: $(if ($historyData.$promptId.status) { $historyData.$promptId.status } else { 'processing' })"
                        $found = $true
                    } else {
                        Write-Host "  Poll ${pollCount}/${pollMax}: pending..."
                    }
                } catch {
                    Write-Host "  Poll ${pollCount} error: $_"
                }
            }
            
            if (-not $found) {
                Write-Host "✗ Prompt NOT found in history after ${pollMax} seconds"
            Write-Host "`n  This indicates a critical issue: prompts are not being recorded"
        }
        
    } catch {
        Write-Host "✗ Failed to queue prompt: $_"
    }
}

Write-Host "`n[Test] Complete" -ForegroundColor Cyan
