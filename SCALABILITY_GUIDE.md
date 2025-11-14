# Scalability & Resource Planning Guide

**Status**: Reference Implementation  
**Last Updated**: November 13, 2025  
**Owner**: DevOps / Infrastructure Lead  

---

## Overview

This guide defines capacity planning, resource allocation, auto-scaling strategies, and queue back-pressure policies to ensure reliable operation under varying load.

---

## Capacity Thresholds

### Single GPU (RTX 3090 Reference)

```json
{
  "GPU": {
    "VramTotal": "24 GB",
    "VramAllocationPerScene": "14–16 GB",
    "AvailableForOS": "2 GB",
    "MaxConcurrentWorkflows": 1,
    "RecommendedReserveVRAM": "3 GB"
  },
  "ComfyUI": {
    "MaxQueueDepth": 5,
    "AvgSceneExecutionTime": "45–60 seconds",
    "MaxScenesPerHour": 60,
    "RecommendedBatchSize": 1
  },
  "LLM": {
    "ProviderURL": "http://192.168.50.192:1234/v1/chat/completions",
    "MaxConcurrentRequests": 3,
    "AvgResponseTime": "45–90 seconds",
    "MaxTokensPerRequest": 500
  }
}
```

### Bottleneck Analysis

| Resource | Bottleneck | Mitigation |
|----------|-----------|-----------|
| GPU VRAM | SVD + Stable Diffusion allocation | Reduce batch size, offload intermediate outputs, use quantization |
| LLM Throughput | Mistral 7B inference latency | Add LLM instance, use quantization, cache frequent prompts |
| Queue Depth | Polling latency if queue > 10 | Implement priority queue, back-pressure logic |
| Disk I/O | Frame file writes (30+ frames @ 1920x1080) | Use NVMe for output, async writes, compression |

---

## Queue Back-Pressure Policy

### Default Configuration

```powershell
# scripts/queue-real-workflow.ps1 parameters

$QueueConfig = @{
    # History polling
    SceneMaxWaitSeconds = 600          # Max time to wait for execution result
    SceneHistoryMaxAttempts = 0        # 0 = unbounded
    SceneHistoryPollIntervalSeconds = 2  # Wait between polls
    
    # Retry policy
    SceneRetryBudget = 1               # Allow 1 retry (2 total attempts)
    
    # Stability & marker handling
    ScenePostExecutionTimeoutSeconds = 30  # Wait after success for late frames
    StabilityWindowSeconds = 2          # File stability check window
    StabilityRetries = 3                # Attempts to achieve stability
    
    # Resource monitoring
    GPUHealthCheckIntervalSeconds = 30  # Probe GPU status
    MinAvailableVRAMMB = 3000           # Minimum VRAM to accept new work
    MaxQueueDepth = 5                   # Reject new scenes if queue exceeds this
}
```

### Queue Saturation Handling

When queue depth approaches `MaxQueueDepth`:

```powershell
if ($queueDepth -gt $MaxQueueDepth) {
    Write-Warning "Queue depth $queueDepth exceeds limit. Implementing back-pressure."
    
    # Option 1: Pause new submissions
    $pauseNewSubmissions = $true
    
    # Option 2: Increase retry budget (for faster resolution)
    $SceneRetryBudget = 0  # Disable retries, fail fast
    
    # Option 3: Reduce poll interval (faster completion detection)
    $SceneHistoryPollIntervalSeconds = 1
    
    # Log telemetry
    $System.FallbackNotes += "Queue back-pressure activated; depth=$queueDepth"
}
```

---

## GPU Resource Management

### VRAM Monitoring

Every scene execution includes VRAM telemetry:

```powershell
# Before execution
$VramBefore = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" | 
    Select-Object -ExpandProperty devices | 
    Select-Object -First 1 -ExpandProperty vram_free

# After execution
$VramAfter = [same endpoint]

$VramDelta = $VramAfter - $VramBefore  # Negative = memory used
```

### Fallback Strategy

If GPU VRAM drops below threshold:

```powershell
if ($VramAfter -lt $MinAvailableVRAMMB) {
    Write-Warning "GPU VRAM critical: ${VramAfter}MB available (min: ${MinAvailableVRAMMB}MB)"
    
    # Fallback actions:
    1. Log warning: "GPU memory pressure detected"
    2. Reduce batch size / resolution
    3. Clear GPU cache: Clear-ComfyUICache
    4. Wait for queue to drain before accepting new work
    5. Record fallback note in telemetry
}
```

### VRAM Delta Expectations

For RTX 3090 with SVD + Stable Diffusion:

| Operation | VRAM Delta (MB) | Duration (s) |
|-----------|-----------------|-------------|
| Text2Image + SVD Load | -12,000 | 5 |
| Stable Diffusion Inference | -8,000 | 20 |
| SVD Frame Generation | -10,000 | 30 |
| SaveImage + Cleanup | +6,000 | 5 |
| **Net Delta** | **-24,000 MB** | **60 s** |

**Recovery Strategy**: After execution, GPU automatically offloads models. Full VRAM recovery expected within 10 seconds.

---

## LM Studio Load Management

### Health Check & Rate Limiting

Before each story generation:

```powershell
# Health check (cached, runs once per run)
$lmHealthStatus = Invoke-WebRequest "$LocalLLMHealthcheckUrl" -TimeoutSec 5 | 
    ConvertFrom-Json

if ($lmHealthStatus.Status -eq "failed") {
    Write-Warning "LM Studio unavailable. Retrying in 5s..."
    Start-Sleep -Seconds 5
    
    # Fallback options:
    # 1. Use Ollama endpoint (different model)
    # 2. Use cached/templated prompts
    # 3. Pause story generation until LM Studio recovers
}

# Rate limiting: max 1 concurrent request to LM Studio
if ($LLMRequestInFlight) {
    Wait-For -Event "LLMResponseReceived" -TimeoutMilliseconds 120000
}
```

### Prompt Caching

To reduce LLM load for repeated story genres:

```powershell
$PromptCache = @{}

# Check cache before calling LM Studio
$cacheKey = "$Genre:$Mood"
if ($PromptCache.ContainsKey($cacheKey)) {
    $prompt = $PromptCache[$cacheKey]
    Write-Host "Prompt cache hit: $cacheKey"
} else {
    $prompt = Invoke-LLMRequest $storyBrief  # Calls LM Studio
    $PromptCache[$cacheKey] = $prompt
}
```

---

## Multi-GPU Setup (Future Scalability)

### Configuration for 2x RTX 3090s

```json
{
  "ComfyUIInstances": [
    {
      "InstanceId": "comfyui-gpu0",
      "GPUIndex": 0,
      "PortStart": 8188,
      "MaxConcurrentWorkflows": 2,
      "QueueManager": "central"
    },
    {
      "InstanceId": "comfyui-gpu1",
      "GPUIndex": 1,
      "PortStart": 8189,
      "MaxConcurrentWorkflows": 2,
      "QueueManager": "central"
    }
  ],
  "LoadBalancer": {
    "Strategy": "round-robin",
    "HealthCheckInterval": "30s",
    "Failover": "automatic"
  },
  "CentralQueue": {
    "Broker": "Redis or file-based",
    "Depth": 20,
    "PriorityLevels": 3
  }
}
```

### Implementation (Pseudo-code)

```powershell
# Route each scene to least-loaded GPU
function Get-BestComfyUIInstance {
    $instances = @("comfyui-gpu0", "comfyui-gpu1")
    
    $loads = $instances | ForEach-Object {
        $port = 8188 + [int]$_.Split('-')[-1] * 1
        $stats = Invoke-WebRequest "http://127.0.0.1:$port/system_stats"
        [PSCustomObject]@{
            Instance = $_
            Port = $port
            VramFree = $stats.devices[0].vram_free
            QueueSize = $stats.queue_size
        }
    }
    
    return ($loads | Sort-Object VramFree -Descending | Select-Object -First 1)
}

# Queue scene to best instance
$bestInstance = Get-BestComfyUIInstance
$prompt | Invoke-RestMethod "http://127.0.0.1:$($bestInstance.Port)/prompt"
```

---

## Throttling & Rate Limiting

### Story Generation Throttle

If ComfyUI queue depth exceeds threshold:

```powershell
$QueueStatsResponse = Invoke-RestMethod "http://127.0.0.1:8188/system_stats"
$QueueSize = $QueueStatsResponse.queue_size

if ($QueueSize -gt 5) {
    Write-Warning "ComfyUI queue depth ($QueueSize) exceeds threshold (5). Pausing story generation."
    Start-Sleep -Seconds 10
    # Retry story generation after wait
}
```

### LLM Request Throttle

Only 1 concurrent request to LM Studio:

```powershell
# Acquire lock before calling LM Studio
$LLMRequestLock = New-Object System.Threading.Mutex($false, "gemDirect1-LLM-Lock")
$LLMRequestLock.WaitOne() | Out-Null

try {
    $response = Invoke-WebRequest "$LocalLLMProviderUrl" -Body $payload
} finally {
    $LLMRequestLock.ReleaseMutex()
}
```

---

## Resource Telemetry

Every run logs resource metrics to `artifact-metadata.json`:

```json
{
  "System": {
    "ResourceMetrics": {
      "GPUHealthBefore": {
        "Name": "NVIDIA GeForce RTX 3090",
        "VramTotalMB": 24576,
        "VramFreeBefore": 24000,
        "UtilizationPercent": 0
      },
      "GPUHealthAfter": {
        "VramFreeAfter": 22600,
        "UtilizationPercent": 0
      },
      "ComfyUIStats": {
        "AverageQueueDepth": 1.2,
        "MaxQueueDepth": 3,
        "AverageExecutionTime": 52.5,
        "TotalScenesProcessed": 3
      },
      "LLMStats": {
        "TotalRequests": 3,
        "AverageResponseTime": 65.2,
        "CacheHitRatio": 0.33,
        "TimeoutCount": 0
      }
    },
    "Warnings": [
      "GPU queue depth reached 3 (threshold: 5)",
      "LLM response time 92s (threshold: 120s)"
    ]
  }
}
```

---

## Monitoring & Alerting

### Metrics Dashboard (Optional: Prometheus/Grafana)

```yaml
# Key metrics to track
metrics:
  - gpu_vram_free_mb
  - gpu_vram_used_percent
  - comfyui_queue_depth
  - comfyui_execution_time_seconds
  - llm_response_time_seconds
  - llm_cache_hit_ratio
  - scene_frame_count
  - scene_generation_failures
  - done_marker_wait_seconds
  - forced_copy_fallback_count

# Alert thresholds
alerts:
  gpu_vram_critical: 
    threshold: 3000  # MB free
    severity: critical
  comfyui_queue_backlog:
    threshold: 10
    severity: warning
  llm_response_timeout:
    threshold: 120  # seconds
    severity: warning
  forced_copy_spike:
    threshold: 0.25  # >25% of runs
    severity: warning
```

### Health Check Script

```powershell
# scripts/health-check.ps1

function Test-ResourceHealth {
    $results = @{}
    
    # GPU health
    $results.GPU = Test-GPUHealth -MinVramMB 3000
    
    # LM Studio health
    $results.LLM = Test-LLMHealth -TimeoutSeconds 5
    
    # ComfyUI health
    $results.ComfyUI = Test-ComfyUIHealth -CheckQueue $true
    
    # Overall status
    $results.Overall = @(
        $results.GPU.Status,
        $results.LLM.Status,
        $results.ComfyUI.Status
    ) -contains "failed" ? "UNHEALTHY" : "HEALTHY"
    
    return $results
}
```

Run via cron/scheduled task:

```powershell
# Schedule health check every 5 minutes
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once
$action = New-ScheduledTaskAction -Execute "pwsh" -Argument "-NoLogo -ExecutionPolicy Bypass -File 'C:\Dev\gemDirect1\scripts\health-check.ps1'"
Register-ScheduledTask -TaskName "gemDirect1-HealthCheck" -Trigger $trigger -Action $action -Force
```

---

## Scaling to Production

### Recommended Specs

| Environment | GPU | RAM | CPUs | Storage | Notes |
|---|---|---|---|---|---|
| Development | 1x RTX 3090 | 32 GB | 8 cores | 500 GB NVMe | Single user, dev testing |
| Staging | 2x RTX 3090 | 64 GB | 16 cores | 1 TB NVMe | Multi-user, realistic load |
| Production | 4x RTX 3090 | 256 GB | 32+ cores | 4+ TB NVMe | Clustered ComfyUI + LLM replica |

### Production Deployment

1. **Cluster ComfyUI instances** (1 per GPU)
2. **Load balancer**: Distribute scenes across ComfyUI instances
3. **Central queue broker**: Redis or RabbitMQ for job distribution
4. **LLM replica**: Warm standby Mistral instance or Ollama fallback
5. **Monitoring**: Prometheus + Grafana + PagerDuty for alerts
6. **Logging**: Centralized logging (ELK stack or cloud provider)

---

## Failure Recovery

### Automatic Failover

If a resource becomes unavailable:

```powershell
# GPU unavailable
if (-not (Test-ComfyUIHealth)) {
    Write-Error "ComfyUI unavailable. Waiting for recovery..."
    Start-Sleep -Seconds 30
    # Retry; if still unavailable after 5 retries, escalate to alert
}

# LM Studio unavailable
if (-not (Test-LLMHealth)) {
    Write-Warning "LM Studio unavailable. Using cached prompts or Ollama fallback."
    $LocalLLMProviderUrl = "http://127.0.0.1:11434/v1/chat/completions"  # Ollama endpoint
}
```

### Circuit Breaker Pattern

Prevent cascading failures:

```powershell
$CircuitBreaker = @{
    ComfyUI = @{ State = "CLOSED"; FailureCount = 0; Threshold = 5 }
    LLM = @{ State = "CLOSED"; FailureCount = 0; Threshold = 3 }
}

function Invoke-WithCircuitBreaker {
    param($ResourceName, $Action)
    
    $breaker = $CircuitBreaker[$ResourceName]
    
    if ($breaker.State -eq "OPEN") {
        throw "$ResourceName circuit open; failing fast"
    }
    
    try {
        & $Action
        $breaker.FailureCount = 0
    } catch {
        $breaker.FailureCount++
        if ($breaker.FailureCount -ge $breaker.Threshold) {
            $breaker.State = "OPEN"
            Write-Error "$ResourceName circuit opened after $($breaker.FailureCount) failures"
        }
        throw
    }
}
```

---

## Optimization Tips

1. **Reduce model load time**: Pre-load models on ComfyUI startup
2. **Cache layer**: Store generated scenes + prompts in Redis for reuse
3. **Batch processing**: If feasible, generate multiple scenes in parallel (multi-GPU)
4. **Progressive frame copying**: Start copying frames before ComfyUI finishes
5. **Compression**: Compress frames to .webp or H.265 for faster I/O

---

## References

- https://github.com/comfyanonymous/ComfyUI (VRAM optimization tips)
- https://lmstudio.ai/docs (LM Studio concurrency limits)
- https://learn.microsoft.com/dotnet/api/system.io.file.replace (Atomic operations)

