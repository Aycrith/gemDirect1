# Operations & Monitoring Guide

**Status**: Reference Implementation  
**Last Updated**: November 13, 2025  
**Owner**: DevOps / SRE Team  

---

## Overview

This guide provides operational procedures, monitoring dashboards, and incident response playbooks for the gemDirect1 pipeline in production.

---

## Key Metrics to Monitor

### Real-Time Dashboards

Display these metrics on a shared dashboard (Grafana, DataDog, etc.):

#### GPU Health
- **VRAM Free (MB)**: Current available GPU memory
- **VRAM Utilization (%)**: Percentage of VRAM in use
- **GPU Utilization (%)**: GPU core utilization
- **Temperature (°C)**: GPU die temperature

**Alert Thresholds**:
```
VRAM Free < 3000 MB          → WARNING (orange)
VRAM Free < 1000 MB          → CRITICAL (red)
GPU Temp > 85°C              → WARNING
GPU Temp > 95°C              → CRITICAL (potential throttling)
```

#### ComfyUI Queue Health
- **Queue Depth**: Number of pending scenes
- **Average Execution Time (s)**: Wall-clock time per scene
- **Failed Scenes (%)**: Percentage of scenes that require requeue
- **Done-Marker Detection Rate (%)**: % of scenes with marker vs. forced-copy fallback

**Alert Thresholds**:
```
Queue Depth > 10             → WARNING
Failed Scenes % > 10%        → WARNING (regressions)
Done-Marker Rate < 90%       → WARNING (forced-copy spike)
Avg Execution Time > 120s    → WARNING (possible slowdown)
```

#### LLM (LM Studio) Health
- **Response Time (ms)**: Average latency for prompt generation
- **Cache Hit Ratio (%)**: % of prompts served from cache
- **Error Rate (%)**: % of failed requests
- **Active Connections**: Current concurrent requests

**Alert Thresholds**:
```
Response Time > 120000 ms    → WARNING (>2 min generation)
Error Rate > 5%              → WARNING
Active Connections > 3       → INFO (expected; single-threaded)
```

#### Story Generation Quality (Aggregated Weekly)
- **Coherence Score (avg)**: Average human review score
- **Diversity Entropy (avg)**: Average thematic diversity
- **Semantic Alignment (avg)**: Average prompt-to-scene match
- **Frame Count (avg)**: Average frames generated per scene

**Alert Thresholds**:
```
Coherence Score < 3.8/5      → WARNING (quality regression)
Diversity Entropy < 1.9      → WARNING (repetitive scenes)
Semantic Alignment < 0.70    → WARNING (prompt mismatch)
Frame Count < 22             → WARNING (below floor)
```

---

## Weekly Review Checklist

Every Friday, DevOps/QA team completes this checklist:

### 1. Sweep Report Analysis (1 hour)

```powershell
# Generate sweep report from all runs this week
pwsh ./scripts/generate-sweep-report.ps1 -WeekStart "$(Get-Date).AddDays(-7).ToString('yyyy-MM-dd'))"

# Output: logs/stability-sweep-<timestamp>/report.json
```

**Review Items**:
- [ ] All runs completed successfully (exit code 0)
- [ ] No scenes with FrameCount < 25 (floor violation)
- [ ] No scenes with ForcedCopyTriggered > 10% (forced-copy spike)
- [ ] No scenes with HistoryExitReason = "maxWait" (timeout spike)
- [ ] GPU VRAM delta within expected range (see QUALITY_METRICS.md)
- [ ] LLM health check passed for all runs (no "unavailable" entries)

**Regression Criteria**:
```json
{
  "FrameCountRegression": "Min < 24 (was >= 25 previous week)",
  "ForcedCopySpike": "Rate > 15% (was < 10% previous week)",
  "LatencyRegression": "P95 > 140s (was <= 120s previous week)",
  "QualityDegradation": "Coherence < 3.8 (was >= 4.0 previous week)"
}
```

### 2. Fallback & Warning Audit (30 min)

```powershell
# Scan all System.FallbackNotes from the week
Get-ChildItem logs/ -Filter artifact-metadata.json -Recurse | 
    ForEach-Object {
        $meta = Get-Content $_ | ConvertFrom-Json
        $meta.Scenes | Where-Object { $_.Telemetry.System.FallbackNotes } | 
            Select-Object SceneId, @{N="Notes"; E={$_.Telemetry.System.FallbackNotes -join "; "}}
    } | Group-Object Notes | Sort-Object Count -Descending
```

**Common Patterns to Track**:
| Fallback Note | Frequency | Action |
|---|---|---|
| "/system_stats unavailable; using nvidia-smi" | >20% of runs | Investigate ComfyUI `/system_stats` endpoint health |
| "Forced copy after stability retries" | >10% of runs | Increase stability window (default 2s → 3–5s) or add write-done marker |
| "GPU memory pressure detected" | >5% of runs | Reduce batch size, add swap memory, or upgrade GPU |
| "LM Studio timeout; retrying" | >2% of runs | Increase LLM timeout (default 120s), add LLM replica, or reduce concurrency |

### 3. Performance Trend Analysis (30 min)

Create a trend chart (example weekly):

```
Week 1  Week 2  Week 3  Week 4  Trend
-----  -----  -----  -----  -----
P95 Latency (s):
 110   → 105  → 108  → 112  → flat (expected variance)

Coherence Score:
 3.8   → 3.9  → 4.1  → 4.0  → improving (good!)

GPU VRAM Delta (GB):
-14.2  → -15.1 → -15.8 → -14.9 → stable (expected)

Forced-Copy Rate (%):
  8.2   → 7.1  → 9.3  → 12.5  → ⚠️ INCREASING
```

**Escalation Criteria**:
- P95 latency increased >15% from baseline → GPU contention likely
- Coherence score dropped >0.3 points → Adjust prompt templates
- Forced-copy rate spiked >10% → Investigate done-marker reliability or output directory

### 4. LLM & Model Review (30 min)

Check if any model updates or LM Studio configuration changes are needed:

- [ ] LM Studio version still on target (verify `~/.cache/lm-studio/version`)
- [ ] Model checkpoint matches documented version (e.g., `mistral-7b-instruct-v0.3`)
- [ ] Any new models added to LM Studio library? (catalog growth)
- [ ] LM Studio health check success rate ≥ 99%
- [ ] Any timeout/error patterns in LLM logs?

### 5. Infrastructure Capacity Review (30 min)

- [ ] Disk space remaining on GPU machine (logs/ and output directories)
- [ ] Disk I/O performance stable? (no slowdowns copying frames)
- [ ] ComfyUI Python version stable; any crash dumps?
- [ ] Any Windows updates pending that could affect stability?
- [ ] Network connectivity stable (esp. if LM Studio on different machine)

### 6. Documentation & Process Updates (30 min)

- [ ] Update MONITORING_GUIDE.md with new findings
- [ ] Update SCALABILITY_GUIDE.md if capacity thresholds changed
- [ ] Log lessons learned in `docs/WEEKLY_REVIEW_LOG.md` (new file)
- [ ] Escalate any items requiring architectural changes to product team

### 7. Escalation & Action Items

Document outcome in `logs/WEEKLY_REVIEW_<date>.md`:

```markdown
# Weekly Review: 2025-11-17

## Summary
- 18 runs executed; 16 completed successfully (89% success rate)
- 2 runs failed: GPU OOM on long sequences
- Forced-copy rate increased to 12.5% (regression from 8.2%)

## Issues Identified
1. ⚠️ Forced-copy spike: Investigation shows done-marker timeout on 2 scenes
   - Root cause: ComfyUI write node slow; file system lag
   - Action: Increase done-marker timeout from 60s to 90s
   
2. GPU OOM during sequence generation
   - Root cause: New SVD model checkpoint larger than expected
   - Action: Verify VRAM allocation; consider quantization or batch-size reduction

## Metrics Status
✓ Coherence: 4.1/5 (improving!)
⚠ Forced-copy: 12.5% (above threshold)
✓ Latency P95: 108s (stable)
✓ Frame count: avg 27 (above floor)

## Actions This Week
- [ ] Increase done-marker timeout to 90s in queue-real-workflow.ps1
- [ ] Investigate SVD model VRAM usage; test quantization
- [ ] Add GPU memory pressure alerts to dashboard
- [ ] Schedule LM Studio version check next week

## Owner: DevOps Team
## Review Date: 2025-11-17
## Next Review: 2025-11-24
```

---

## Incident Response Playbooks

### Incident: LM Studio Unavailable

**Severity**: HIGH (blocks story generation)

**Detection**:
- LM Studio health check fails (timeout or non-200 status)
- LM Studio process not running or crashed
- Network unreachable (if on remote host)

**Immediate Response** (5 min):

```powershell
# 1. Check LM Studio status
Invoke-WebRequest http://192.168.50.192:1234/v1/models -ErrorAction SilentlyContinue

# 2. Check process status
Get-Process | Where-Object { $_.ProcessName -like "*lm-studio*" -or $_.Name -like "*python*" }

# 3. Restart LM Studio if hung
# (Manual: launch LM Studio app or CLI)

# 4. Check network connectivity (if remote)
Test-NetConnection 192.168.50.192 -Port 1234

# 5. Fallback: Switch to Ollama
$env:LOCAL_STORY_PROVIDER_URL = "http://127.0.0.1:11434/v1/chat/completions"
$env:LOCAL_LLM_MODEL = "mistral:7b"
```

**Sustained Response** (15 min):

```powershell
# If LM Studio doesn't recover within 5 min:

# 1. Pause story generation
$PauseStoryGeneration = $true

# 2. Use cached prompts or template fallback
# (In React: UI shows "LLM unavailable; using template stories")

# 3. Continue ComfyUI queue if scenes are already queued
# (Queue can run independent of story generation)

# 4. Log incident
Write-EventLog -LogName "Application" -Source "gemDirect1" -EventId 1001 `
    -Message "LM Studio unavailable; switched to template stories"

# 5. Notify team (via Slack, email, PagerDuty)
# (If available: Invoke-WebHook to incident channel)
```

**Recovery Checklist**:
- [ ] LM Studio running and `/v1/models` responding
- [ ] Network connectivity verified
- [ ] Mistral model loaded and responding to `/v1/chat/completions`
- [ ] Resume story generation
- [ ] Verify next run completes successfully

**Post-Incident**:
- [ ] Document in INCIDENT_LOG.md
- [ ] Review LM Studio logs for crash cause
- [ ] Consider increasing LM Studio health check frequency or timeout
- [ ] Add alerting if unavailable > 5 minutes

---

### Incident: GPU OOM (Out of Memory)

**Severity**: HIGH (stops scene generation; queue stalled)

**Detection**:
- GPU VRAM drops below 1 GB
- ComfyUI returns error: "CUDA out of memory"
- Execution fails with zero frames copied

**Immediate Response** (5 min):

```powershell
# 1. Check current GPU VRAM
Invoke-RestMethod http://127.0.0.1:8188/system_stats | 
    Select-Object -ExpandProperty devices | Select-Object name, vram_free, vram_total

# 2. If VRAM < 2 GB, clear cache
Invoke-RestMethod http://127.0.0.1:8188/system_stats -Method Post -Body '{"action": "clear_cache"}'

# 3. Reduce batch size for next scene
# (In workflow: Reduce SVD frame count or resolution)

# 4. Wait for GPU memory to recover (~10 sec)
Start-Sleep -Seconds 10

# 5. Retry scene with reduced batch size
```

**Sustained Response** (15 min):

```powershell
# If OOM persists:

# 1. Stop ComfyUI completely
pwsh ./scripts/run-comfyui-e2e.ps1 -StopComfyUI

# 2. Reboot GPU (hard power reset if possible)
# or restart ComfyUI cleanly

# 3. Verify GPU VRAM recovered
# (Expect max free after restart)

# 4. Reduce workflow complexity:
#    - Lower SVD resolution (1280x720 → 1024x576)
#    - Reduce frame count
#    - Quantize models if available

# 5. Restart story generation
```

**Recovery Checklist**:
- [ ] GPU VRAM > 15 GB available
- [ ] ComfyUI restarted and responding
- [ ] `/system_stats` endpoint healthy
- [ ] Test small scene; verify frames generated
- [ ] Resume full queue

**Post-Incident**:
- [ ] Document VRAM requirement in README
- [ ] Consider GPU upgrade if OOM recurring (< 3 scenes/run)
- [ ] Add telemetry warning if VRAM delta > 90% of available
- [ ] Schedule GPU memory profiling session

---

### Incident: Done-Marker Never Appears (Forced-Copy Spike)

**Severity**: MEDIUM (scenes complete but reliability degrades)

**Detection**:
- ForcedCopyTriggered = true for >10% of scenes
- DoneMarkerDetected = false for consecutive scenes
- Forced-copy debug logs appearing frequently

**Immediate Response** (10 min):

```powershell
# 1. Check ComfyUI write-done-marker node status
# Look at ComfyUI logs: tail -f output.log | grep "done"

# 2. Verify output directory exists and is writable
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
Get-ChildItem "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# 3. Check for .done.tmp files (orphaned temp files)
Get-ChildItem "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" -Filter "*.done.tmp" | Remove-Item

# 4. Verify write_done_marker.py deployed correctly
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\write_done_marker.py"

# 5. Increase done-marker wait timeout (temporary)
$env:DONE_MARKER_WAIT_SECONDS = 90  # (default 60)
```

**Investigation** (15 min):

```powershell
# 1. Check ComfyUI node execution logs
# (In ComfyUI UI: check Execution tab for errors)

# 2. Inspect a recent forced-copy debug dump
Get-Content "logs\20251113-102345\scene-001\forced-copy-debug-20251113.txt"
# Should show: candidate dir, file count, last write time

# 3. Compare with .done files that ARE present
# Look for timing differences: how long after SaveImage does .done appear?

# 4. Check file system performance (esp. if network share)
# Time a file write + move operation
```

**Sustained Response** (30 min):

```powershell
# Permanent fixes:

# Option 1: Increase stability window
# In queue-real-workflow.ps1:
$StabilityWindowSeconds = 5  # (default 2)
$StabilityRetries = 5         # (default 3)

# Option 2: Debug node chain
# In workflows/text-to-video.json:
# - Verify SaveImage node completes before .done writer
# - Add explicit delay node (1 second) before .done writer
# - Check node connection order

# Option 3: Move output to local NVMe
# If output is on network share, move to local disk:
# C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output (local, fast)

# Option 4: Verify atomic rename semantics
# Check NTFS vs. network file system (SMB has different guarantees)
```

**Recovery Checklist**:
- [ ] ForcedCopyTriggered rate back to < 5% (over 10 runs)
- [ ] DoneMarkerDetected = true for next 10 runs
- [ ] Average done-marker wait time < 5 seconds
- [ ] No orphaned .done.tmp files
- [ ] Output directory health verified

**Post-Incident**:
- [ ] Document root cause in INCIDENT_LOG.md
- [ ] If file system issue, migrate output to local NVMe
- [ ] Add monitoring for forced-copy rate; alert if > 10%
- [ ] Review ComfyUI node timing; add explicit delay if needed

---

### Incident: Telemetry Contract Violation

**Severity**: HIGH (validation fails; run becomes unusable)

**Detection**:
- `verify-telemetry-contract.ps1` exits with code 2
- Validator reports: "Missing GPU telemetry" or "HistoryAttempts not recorded"
- UI cannot render scene metadata (missing fields)

**Immediate Response** (10 min):

```powershell
# 1. Check which field is missing
pwsh ./scripts/verify-telemetry-contract.ps1 -RunDir "logs\<latest_timestamp>" -Verbose

# Output example:
# ERROR: Scene scene_001: Missing field Telemetry.GPU.VramBeforeMB
# ERROR: Scene scene_001: HistoryExitReason not in valid enum values

# 2. Re-run queue script with debug logging
$DebugLogging = $true

# 3. Check artifact-metadata.json structure
Get-Content "logs\<latest_timestamp>\artifact-metadata.json" | ConvertFrom-Json | 
    Select-Object -ExpandProperty Scenes | 
    Select-Object -First 1 | 
    Select-Object -ExpandProperty Telemetry | 
    Get-Member

# 4. Identify root cause (see table below)
```

**Common Telemetry Contract Violations**:

| Missing Field | Root Cause | Fix |
|---|---|---|
| GPU.VramBeforeMB | `/system_stats` failed; nvidia-smi fallback incomplete | Add fallback logging; ensure nvidia-smi installed |
| GPU.VramAfterMB | Same as above | Same as above |
| HistoryAttempts | Poll loop counter not incremented | Check loop logic in queue-real-workflow.ps1:111 |
| HistoryExitReason | Exit reason logic broken | Verify enum values: success/maxWait/attemptLimit/postExecution/unknown |
| DoneMarkerDetected | Telemetry object incomplete | Ensure telemetry collected even if done-marker not found |
| ExecutionSuccessAt | History poll never returned results | Verify ComfyUI `/history` endpoint responding |

**Recovery**:

```powershell
# 1. Identify the missing field (from validator error)

# 2. Check queue script for the collection logic
# Example: searching for GPU VRAM collection
grep -n "VramBeforeMB\|VramAfterMB" ./scripts/queue-real-workflow.ps1

# 3. Fix the collection logic (usually 1–2 line fix)

# 4. Rerun affected scene(s)
pwsh ./scripts/queue-real-workflow.ps1 -SceneId scene_001 -DebugLogging

# 5. Verify telemetry now complete
pwsh ./scripts/verify-telemetry-contract.ps1 -RunDir "logs\<latest_timestamp>"

# Should exit 0 (success)
```

**Post-Incident**:
- [ ] Document root cause (code bug, external service failure, etc.)
- [ ] Add unit test to catch missing field in vitest suite
- [ ] Update TELEMETRY_CONTRACT.md with clarification if unclear
- [ ] Review queue script for other potential gaps

---

## Escalation Matrix

| Issue | Severity | First Response | Escalation | Owner |
|---|---|---|---|---|
| LM Studio unavailable | HIGH | Switch to fallback; pause story gen | Contact AI team; check LM Studio logs | DevOps → AI Lead |
| GPU OOM | HIGH | Clear cache; reduce batch size | Evaluate GPU upgrade | DevOps → Infrastructure |
| Done-marker never appears | MEDIUM | Increase timeout; debug node chain | Check file system; migrate output | DevOps → Workflow Lead |
| Forced-copy rate spike | MEDIUM | Investigate; log incident | Review ComfyUI node timing | DevOps → Workflow Lead |
| Telemetry contract violation | HIGH | Fix collection logic; rerun | Review test coverage | DevOps → QA |
| Performance regression | MEDIUM | Check GPU/LLM health | Review model/prompt changes | DevOps → Product |
| High error rate in validators | MEDIUM | Rerun validator; inspect artifacts | Review error logs | QA → Engineering |

---

## Monitoring Dashboard Template (Grafana/Kibana JSON)

```json
{
  "dashboard": {
    "title": "gemDirect1 Pipeline Health",
    "panels": [
      {
        "title": "GPU VRAM Status",
        "targets": [
          { "expr": "gpu_vram_free_mb" },
          { "expr": "gpu_vram_total_mb" }
        ]
      },
      {
        "title": "ComfyUI Queue Depth",
        "targets": [
          { "expr": "comfyui_queue_depth" },
          { "expr": "comfyui_queue_max_depth" }
        ]
      },
      {
        "title": "Story Generation Success Rate",
        "targets": [
          { "expr": "rate(scene_success_total[1h])" }
        ]
      },
      {
        "title": "LLM Response Time (P95)",
        "targets": [
          { "expr": "histogram_quantile(0.95, llm_response_time_seconds)" }
        ]
      },
      {
        "title": "Forced-Copy Rate",
        "targets": [
          { "expr": "rate(forced_copy_total[1h]) / rate(scene_total[1h])" }
        ]
      }
    ]
  }
}
```

---

## References

- TELEMETRY_CONTRACT.md – All telemetry fields and enforcement
- SCALABILITY_GUIDE.md – Resource thresholds and capacity planning
- QUALITY_METRICS.md – KPI definitions and baselines
- scripts/verify-telemetry-contract.ps1 – Automated validation
- scripts/generate-sweep-report.ps1 – Weekly aggregation

