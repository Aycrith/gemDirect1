# Quick Start: SVD Download → E2E Tests → Results

**Status**: Environment ready ✓ | Blocked on SVD model | Tests ready to execute

---

## 1. Download SVD Model (15-30 minutes)

**Check if present**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1
```

**Download (if missing)**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

✓ Wait for completion (you'll see: "✓ SVD model downloaded successfully!")

---

## 2. Run Full E2E Test Suite (10-20 minutes)

**Prep local LLM (once per session)**:
```powershell
$env:LOCAL_STORY_PROVIDER_URL = 'http://192.168.50.192:1234/v1/chat/completions'
$env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
$env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
$env:LOCAL_LLM_SEED = '42'
$env:LOCAL_LLM_TEMPERATURE = '0.35'
$env:LOCAL_LLM_TIMEOUT_MS = '120000'
Invoke-WebRequest $env:LOCAL_STORY_PROVIDER_URL.Replace('/v1/chat/completions','/v1/models') | Out-Null
```

**Execute**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

**What happens**:
- ✓ Generates 3-scene story
- ✓ Processes each scene through SVD (3-5 min per scene)
- ✓ Generates 75 PNG frames (25 per scene)
- ✓ Runs Vitest suites
- ✓ Creates metadata & archive

✓ Wait for "Story-to-video e2e complete!" message

---

## 3. Review Results (5 minutes)

**Get timestamp of latest run**:
```powershell
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Write-Host "Latest run: $ts"
```

**View summary**:
```powershell
Get-Content "logs/$ts/run-summary.txt" | Select-Object -Last 30
```

**Check frame count**:
```powershell
$total = 0
for ($i = 1; $i -le 3; $i++) {
    $count = @(Get-ChildItem "logs/$ts/scene_$i/generated-frames" -File 2>/dev/null).Count
    Write-Host "Scene $i: $count frames"
    $total += $count
}
Write-Host "TOTAL: $total / 75 ✓"
```

**View metadata**:
```powershell
$metadata = Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json
$metadata.Scenes | Select-Object SceneId, FrameCount, Success, HistoryRetrieved | Format-Table
```

---

## Success Indicators

✓ All output looks like this:

```
[HH:mm:ss] Story ready: story-xyz (scenes=3)
[HH:mm:ss] [Scene scene_1][Attempt 1] Frames=25 Duration=180s Prefix=gemdirect1_scene_1
[HH:mm:ss] [Scene scene_2][Attempt 1] Frames=25 Duration=175s Prefix=gemdirect1_scene_2
[HH:mm:ss] [Scene scene_3][Attempt 1] Frames=25 Duration=182s Prefix=gemdirect1_scene_3
[HH:mm:ss] Scene summary: 3/3 succeeded | total frames=75 | requeues=0
[HH:mm:ss] [Validation] run-summary validation passed

============================
Story-to-video e2e complete!
Logs: logs/{timestamp}
Summary: logs/{timestamp}/run-summary.txt
==============================
```

---

## Troubleshooting (If Needed)

| Symptom | Fix | Time |
|---------|-----|------|
| SVD download fails | Retry command or use browser option (see plan) | 5 min |
| Frames < 25 | History polling timeout (check metadata) | 10 min |
| E2E fails | Check vitest-*.log, see troubleshooting guide | 15 min |
| ComfyUI crashes | Restart: Stop-Process (python), then re-run | 2 min |

**Detailed help**: See `E2E_EXECUTION_CHECKLIST_20251111.md`

---

## Artifacts Generated

After successful run, check:

✓ Frames: `logs/{timestamp}/scene_*/generated-frames/*.png` (75 total)  
✓ Metadata: `logs/{timestamp}/artifact-metadata.json` (machine-readable)  
✓ Archive: `artifacts/comfyui-e2e-{timestamp}.zip` (~500 MB)  
✓ Dashboard feed: `public/artifacts/latest-run.json`  

---

## Total Time Estimate

| Step | Time | Cumulative |
|------|------|-----------|
| SVD Download | 15-30 min | 15-30 min |
| E2E Test Suite | 10-20 min | 25-50 min |
| Results Review | 5 min | 30-55 min |
| **TOTAL** | **30-55 min** | |

---

## Next Steps After Success

1. **Create report**: Document results in markdown
2. **Archive logs**: Clean up old runs if needed
3. **Plan iteration 2**: Run with LLM enhancement, more scenes, etc.

---

**Ready to start?** Begin with SVD download command above ↑

---

### 2025-11-12 heads-up
- The helper now performs a `/v1/models` probe automatically before ComfyUI launches; keep LM Studio online or set `LOCAL_LLM_HEALTHCHECK_URL` / `LOCAL_LLM_SKIP_HEALTHCHECK=1` if you intentionally want to override/skip the check (see https://lmstudio.ai/docs/api#health-checks).
- Tune history polling via env vars (`SCENE_MAX_WAIT_SECONDS`, `SCENE_HISTORY_MAX_ATTEMPTS`, `SCENE_HISTORY_POLL_INTERVAL_SECONDS`, `SCENE_POST_EXECUTION_TIMEOUT_SECONDS`) or the matching `-Scene*` flags instead of editing scripts; the queue policy you choose is echoed back in `run-summary.txt`, `artifact-metadata.json`, and the Artifact Snapshot/Timeline UI so downstream agents can see the resolved poll limit, post-exec timeout, and SceneRetryBudget.
- Telemetry for every scene (duration, poll cadence, GPU + VRAM delta, poll limit, exit reason, fallback notes) is now validated by `scripts/validate-run-summary.ps1` and a dedicated Vitest harness—treat missing `[Scene …] Telemetry` lines or GPU/VRAM data as hard failures, and the UI surfaces the same poll log counts, warnings, and telemetry alerts that trace ComfyUI’s `/history` journey (`websockets_api_example.py`).
- Before editing scripts or UI, read README.md, DOCUMENTATION_INDEX_20251111.md, STORY_TO_VIDEO_PIPELINE_PLAN.md, STORY_TO_VIDEO_TEST_CHECKLIST.md, WORKFLOW_FIX_GUIDE.md, HANDOFF_SESSION_NOTES.md, REFERENCE_CARD_QUICK.md, WINDOWS_AGENT_TEST_ITERATION_PLAN.md, and notes/codex-agent-notes-20251111.md so the LM Studio health check, queue knobs, telemetry enforcement, and Artifact Snapshot/Timeline expectations stay top of mind.
- Ensure the Artifact Snapshot/Timeline cards render the queue policy card, telemetry badges, GPU stats, fallback warnings, Vitest logs, and archive links so the UI mirrors the validator output.

## Telemetry & Queue Policy Requirements
1. **LM Studio health check**: scripts/run-comfyui-e2e.ps1 hits /v1/models before ComfyUI runs, records the result in 
un-summary.txt/rtifact-metadata.json, and lets you override the target with LOCAL_LLM_HEALTHCHECK_URL or skip via LOCAL_LLM_SKIP_HEALTHCHECK=1 so intentionally blocked endpoints can still be used; the warning is surfaced to downstream agents so they can change the provider before rerunning.[lm-health]
2. **Queue knobs + metadata surfaces**: SceneMaxWaitSeconds, SceneHistoryPollIntervalSeconds, SceneHistoryMaxAttempts, ScenePostExecutionTimeoutSeconds, and SceneRetryBudget (plus the SCENE_* env vars) appear in QueueConfig, each scene’s HistoryConfig, and SceneRetryBudget outputs inside 
un-summary.txt, rtifact-metadata.json, and public/artifacts/latest-run.json; the Artifact Snapshot policy card and Timeline Editor re-display those figures so reviewers know the configured poller, retry, and post-exec budgets.
3. **Telemetry enforcement policy**: Every scene attempt must emit DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, pollLimit (the textual value must match the metadata number), HistoryExitReason (maxWait/attemptLimit/postExecution/success), ExecutionSuccessDetected, ExecutionSuccessAt, PostExecutionTimeoutSeconds, postExecTimeoutReached, GPU Name, VRAMBeforeMB, VRAMAfterMB, VRAMDeltaMB, fallback notes (e.g., /system_stats failure triggering the 
vidia-smi fallback), and SceneRetryBudget. alidate-run-summary.ps1, Vitest, and the UI treat missing telemetry or mismatched pollLimit as failures, and we rely on the xecution_success state described in [websocket_api_example.py][comfy-history] as the definitive signal before closing a scene.
4. **Artifact snapshot expectations**: The Artifact Snapshot/Timeline UI must show the queue policy card, telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, pollLimit, HistoryExitReason, postExec timeout state, ExecutionSuccessAt), poll log counts/warnings-only filter, GPU info with VRAM delta, fallback warnings, archive links (Vitest logs + rtifacts/comfyui-e2e-<ts>.zip), and LLM metadata (provider URL/model, request format, seed, duration, errors) so the telemetry aligns with the log/metadata story.

[lm-health]: https://lmstudio.ai/docs/api#health-checks
[comfy-history]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
