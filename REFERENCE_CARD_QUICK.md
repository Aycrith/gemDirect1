# Reference Card: Windows-Agent Testing Session

## 🎯 What Was Delivered

### Documents (8 Files)
1. `QUICK_START_E2E_TODAY.md` - 3 commands, start now
2. `E2E_EXECUTION_CHECKLIST_20251111.md` - Step-by-step guide
3. `WINDOWS_AGENT_TEST_ITERATION_PLAN.md` - Comprehensive reference
4. `WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md` - Session overview
5. `DOCUMENTATION_INDEX_20251111.md` - Navigation map
6. `VISUAL_ROADMAP_20251111.md` - Diagrams & flowcharts
7. `SESSION_DELIVERY_SUMMARY_20251111.md` - Handoff summary
8. `START_HERE_COMPLETE_DELIVERY.md` - This delivery

### Scripts (1 File)
- `scripts/verify-svd-model.ps1` - SVD auto-download helper

---

## 🚀 Three Quick Commands

### 1. Download SVD Model (15-30 min)
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

### 2. Run E2E Tests (10-20 min)
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

### 3. Review Results (5 min)
```powershell
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$ts/run-summary.txt" | Select-Object -Last 30
```

**Total Time**: 30-55 minutes

### LM Studio / LLM Variables
```powershell
$env:LOCAL_STORY_PROVIDER_URL = 'http://192.168.50.192:1234/v1/chat/completions'
$env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
$env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
$env:LOCAL_LLM_SEED = '42'
$env:LOCAL_LLM_TEMPERATURE = '0.35'
$env:LOCAL_LLM_TIMEOUT_MS = '120000'
Invoke-WebRequest $env:LOCAL_STORY_PROVIDER_URL.Replace('/v1/chat/completions','/v1/models') | Out-Null
```

---

## ✅ Environment Status

| Component | Status | Check |
|-----------|--------|-------|
| Node.js | ✓ v22.19.0 | `node -v` |
| PowerShell | ✓ 7.5.3 | `$PSVersionTable` |
| ComfyUI | ✓ Running | `Test-NetConnection -ComputerName 127.0.0.1 -Port 8188` |
| SVD Model | ⏳ Missing | `Test-Path C:\ComfyUI\...\SVD\svd_xt.safetensors` |

---

## 📊 Expected Results

```
Success Indicators:
├─ Frames generated: 75/75 ✓
├─ Test exit codes: 0, 0, 0 ✓
├─ History retrieved: 3/3 ✓
├─ Validation passed: Yes ✓
└─ Archive created: Yes ✓

Failure Indicators:
├─ Exit code: 1 (non-zero)
├─ Frames: < 50
├─ Tests: Any exit code ≠ 0
└─ Errors: Red text in output
```

---

## 📚 Which Document Do I Need?

| Your Need | Document |
|-----------|----------|
| Start NOW | QUICK_START_E2E_TODAY.md |
| Step-by-step | E2E_EXECUTION_CHECKLIST_20251111.md |
| Deep understanding | WINDOWS_AGENT_TEST_ITERATION_PLAN.md |
| Find anything | DOCUMENTATION_INDEX_20251111.md |
| Troubleshoot | E2E_EXECUTION_CHECKLIST_20251111.md Section 5 |
| Status update | WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md |
| Visual overview | VISUAL_ROADMAP_20251111.md |

---

## 🔴 Critical Blocker

**File Needed**: `svd_xt.safetensors` (~2.5 GB)  
**Location**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\`  

**Solution**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

---

## ⚡ Quick Commands

```powershell
# Check if SVD is present
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"

# Check ComfyUI is running
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188

# View latest run summary
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$ts/run-summary.txt"

# View latest metadata
$metadata = Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json
$metadata.Scenes | Select-Object SceneId, FrameCount, Success | Format-Table

# Check frame count
$total = 0; for ($i = 1; $i -le 3; $i++) { $count = @(Get-ChildItem "logs/$ts/scene_$i/generated-frames" -File 2>/dev/null).Count; Write-Host "Scene $i: $count"; $total += $count }; Write-Host "Total: $total"
```

---

## 📋 Success Checklist (11 Items)

- [ ] Exit code = 0
- [ ] 3 scenes generated
- [ ] 75 frames total (25 per scene)
- [ ] Scene 1 success = True
- [ ] Scene 2 success = True
- [ ] Scene 3 success = True
- [ ] History retrieved = 3/3
- [ ] ComfyUI tests = 0
- [ ] E2E tests = 0
- [ ] Scripts tests = 0
- [ ] Validation passed

**All ✓ = SUCCESS**

---

## 🎯 What to Do Next

1. **Immediate** (Today):
   - Download SVD model (1 command)
   - Run E2E tests (1 command)
   - Review results (1-2 commands)

2. **Short-term** (This week):
   - Document findings
   - Plan iteration 2
   - Test with LLM enhancement

3. **Medium-term** (Next sprint):
   - Increase scene count
   - Measure performance
   - Optimize GPU usage

---

## 📞 Help

**Can't find something?** → See `DOCUMENTATION_INDEX_20251111.md`

**Error during execution?** → Check `E2E_EXECUTION_CHECKLIST_20251111.md` Section 5

**Need background?** → Read `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`

**Just want to start?** → Follow `QUICK_START_E2E_TODAY.md`

---

## ✨ What Makes This Ready

✅ All environment components validated  
✅ Single clear blocker identified  
✅ 8 comprehensive documents  
✅ 1 helper script  
✅ 6 troubleshooting scenarios  
✅ 11 success criteria  
✅ Multiple documentation entry points  
✅ Copy-paste ready commands  
✅ Expected outputs documented  
✅ Post-run analysis procedures  

---

**Status**: ✅ READY FOR EXECUTION  
**Blocker**: ⏳ SVD model (15-30 min to resolve)  
**Time to Complete**: 30-55 minutes total

**Next**: Download SVD → Run tests → Review results

---

**Reference Card v1.0** | November 11, 2025

---

### 2025-11-12 notes
- LM Studio must answer `/v1/models` before ComfyUI spins up (configurable via `LOCAL_LLM_HEALTHCHECK_URL` or `LOCAL_LLM_SKIP_HEALTHCHECK` if you intentionally skip the probe), so we fail fast when the model is unreachable.
- Queue tuning moved to flags/env vars: `-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, `-SceneHistoryPollIntervalSeconds`, and `-ScenePostExecutionTimeoutSeconds` (or the matching `SCENE_*`) now surface in run summaries, `artifact-metadata.json`, and the Artifact Snapshot/Timeline cards so future agents can read the resolved poll limit, post-exec timeout, and retry budget without digging into scripts.
- Telemetry (duration, max wait, poll interval, GPU/VRAM, poll limits, exit reasons, fallback notes) is enforced via `scripts/validate-run-summary.ps1` plus the Vitest harness; missing `[Scene …] Telemetry` lines or incomplete GPU data are treated as hard failures, and the UI now mirrors those statuses (queue policy card, poll log counts, VRAM delta badges, warnings) following ComfyUI’s `/history` lifecycle from `websockets_api_example.py`.

## ?? Required Telemetry & Queue Policy Orientation
1. **LM Studio health check**: scripts/run-comfyui-e2e.ps1 probes /v1/models before ComfyUI starts, logs override/fallback notes (LOCAL_LLM_HEALTHCHECK_URL / LOCAL_LLM_SKIP_HEALTHCHECK=1), and surfaces warning lines so future agents can avoid running when the story LLM is dead.[lm-health]
2. **Queue knobs & metadata**: SceneMaxWaitSeconds, SceneHistoryPollIntervalSeconds, SceneHistoryMaxAttempts, ScenePostExecutionTimeoutSeconds, and SceneRetryBudget (and their SCENE_* env vars) appear inside QueueConfig, each scene’s HistoryConfig, and SceneRetryBudget values inside 
un-summary.txt, rtifact-metadata.json, and the UI policy card/timeline so the poll budget is auditable.
3. **Telemetry enforcement policy**: Every [Scene .] Telemetry: line must list DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, pollLimit (text matching metadata), HistoryExitReason (maxWait/attemptLimit/postExecution/success), ExecutionSuccessDetected, ExecutionSuccessAt, PostExecutionTimeoutSeconds, postExecTimeoutReached, GPU Name, VRAMBeforeMB, VRAMAfterMB, VRAMDeltaMB, fallback notes (e.g., /system_stats failure that triggers the 
vidia-smi fallback), and SceneRetryBudget. Missing data or mismatched pollLimit now fails alidate-run-summary.ps1/Vitest, and queues rely on the /history states (xecution_success, status_str, xitReason) from [websocket_api_example.py][comfy-history] as the final success signal.
4. **Artifact snapshot expectations**: The Artifact Snapshot and Timeline UI must present the queue policy card, telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, pollLimit, HistoryExitReason, postExec timeout flag, ExecutionSuccessAt), poll log counts/warnings-only filter, GPU info + VRAM delta, fallback warnings, archive links (Vitest logs + rtifacts/comfyui-e2e-<ts>.zip), and LLM metadata (provider, model, request format, seed, duration, errors).
5. **Docs-first guardrail**: Read README.md, DOCUMENTATION_INDEX_20251111.md, STORY_TO_VIDEO_PIPELINE_PLAN.md, STORY_TO_VIDEO_TEST_CHECKLIST.md, WORKFLOW_FIX_GUIDE.md, HANDOFF_SESSION_NOTES.md, QUICK_START_E2E_TODAY.md, WINDOWS_AGENT_TEST_ITERATION_PLAN.md, and notes/codex-agent-notes-20251111.md before touching scripts/UI so the LM Studio health check, queue knobs, telemetry enforcement, and Artifact Snapshot/Timeline expectations stay top of mind.
6. **UI metadata handshake**: Artifact Snapshot/Timeline cards mirror logs/<ts>/artifact-metadata.json and public/artifacts/latest-run.json, so their queue policy card, telemetry badges, GPU stats, fallback warnings, Vitest logs, and archive references must align with what the helper logs and the validator enforces.

[lm-health]: https://lmstudio.ai/docs/api#health-checks
[comfy-history]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
