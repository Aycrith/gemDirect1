# Telemetry Contract & Queue Policy Specification

**Version**: 1.0  
**Last Updated**: November 12, 2025  
**Status**: Active | Required Reading

---

## Overview

The gemDirect1 helper enforces a strict telemetry contract so every automated run is fully auditable and reproducible. This document defines:

1. **Queue Policy Knobs** - configurable parameters that control polling, retry, and timeout behavior
2. **Telemetry Fields** - metrics collected during scene execution
3. **Enforcement Points** - where validation occurs (validator, Vitest, UI)
4. **External References** - authoritative sources for each telemetry concept

---

## Queue Policy Knobs

These parameters control how aggressively the helper polls ComfyUI and how many retries are allowed.

### CLI Parameters & Environment Variables

| Knob | CLI Param | ENV Var | Default | Unit | Purpose |
|------|-----------|---------|---------|------|---------|
| History Max Wait | `-SceneMaxWaitSeconds` | `SCENE_MAX_WAIT_SECONDS` | 600 | seconds | How long to keep polling `/history/<promptId>` for results |
| History Max Attempts | `-SceneHistoryMaxAttempts` | `SCENE_HISTORY_MAX_ATTEMPTS` | 0 (unbounded) | count | Max number of HTTP requests to `/history/...`; 0 means no limit |
| History Poll Interval | `-SceneHistoryPollIntervalSeconds` | `SCENE_HISTORY_POLL_INTERVAL_SECONDS` | 2 | seconds | Sleep duration between consecutive polls |
| Post-Execution Timeout | `-ScenePostExecutionTimeoutSeconds` | `SCENE_POST_EXECUTION_TIMEOUT_SECONDS` | 30 | seconds | How long to wait after `execution_success` flag appears before closing |
| Scene Retry Budget | `-SceneRetryBudget` | `SCENE_RETRY_BUDGET` | 1 | count | How many automatic requeues (1 = try twice total) |

### External Reference
- **ComfyUI Queue Lifecycle**: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
  - Defines the `/history` response structure, `execution_success` flag, and status transitions
  - Used to determine when a scene attempt has truly completed

### Metadata Mapping

Each knob flows through the system:
1. **CLI/ENV → Script**: `run-comfyui-e2e.ps1` parses and validates knobs
2. **Script → Queue Script**: Passed to `queue-real-workflow.ps1` as parameters
3. **Queue Script → Artifact**: Stored in telemetry and metadata JSON
4. **Metadata → Summary**: Rendered in `run-summary.txt` as:
   ```
   Queue policy: sceneRetries=1, historyMaxWait=600s, historyPollInterval=2s, historyMaxAttempts=unbounded, postExecutionTimeout=30s
   ```
5. **Summary → Validator**: Cross-checked against `artifact-metadata.json` QueueConfig values
6. **Metadata → UI**: Queue policy card displays knobs in Artifact Snapshot / Timeline

---

## Telemetry Fields

Every scene attempt emits telemetry describing its execution. These fields appear in:
- `artifact-metadata.json` (Scenes[*].Telemetry)
- `run-summary.txt` ([Scene ...] Telemetry: ...)
- `public/artifacts/latest-run.json` (latest snapshot)

### Core Execution Metrics

| Field | Type | Source | Unit/Format | Example |
|-------|------|--------|-------------|---------|
| **DurationSeconds** | float | `(End - Start).TotalSeconds` | seconds | 45.2 |
| **QueueStart** | ISO8601 | Timer start | timestamp | 2025-11-12T10:23:00Z |
| **QueueEnd** | ISO8601 | Timer end | timestamp | 2025-11-12T10:23:45Z |

**Purpose**: Total wall-clock time from prompt POST to frames copied. Used to assess whether queue operations completed within acceptable time.

### History Polling Metrics

| Field | Type | Source | Unit/Format | Example |
|-------|------|--------|-------------|---------|
| **HistoryAttempts** | int | `++historyAttempts` in poll loop | count | 150 |
| **HistoryAttemptLimit** | int | CLI param (0 if unbounded) | count | 0 (meaning unbounded) |
| **pollLimit** | string (derived) | `if (HistoryAttemptLimit > 0) { HistoryAttemptLimit.ToString() } else { "unbounded" }` | text | "150" or "unbounded" |
| **MaxWaitSeconds** | int | CLI param | seconds | 600 |
| **PollIntervalSeconds** | int | CLI param | seconds | 2 |
| **HistoryExitReason** | enum | Logic in queue script | string | "success" \| "maxWait" \| "attemptLimit" \| "postExecution" |

**Purpose**: Explains how the history poll loop terminated (did we get results? hit time limit? hit attempt limit?).

**HistoryExitReason Values** (per ComfyUI `/history` API):
- `"success"` - `/history/<promptId>` contained the prompt results
- `"maxWait"` - Time expired (exceeded SceneMaxWaitSeconds)
- `"attemptLimit"` - Poll attempts exhausted (exceeded HistoryMaxAttempts when > 0)
- `"postExecution"` - Hit post-execution timeout after success detected
- `"unknown"` - Unexpected termination

**External Reference**: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
- The example shows how to wait for `execution_success` in the history response
- Status codes like `"executing"`, `"executed"`, etc. inform our exit reason logic

### Execution Success Indicators

| Field | Type | Source | Unit/Format | Example |
|-------|------|--------|-------------|---------|
| **ExecutionSuccessDetected** | bool | `$historyData -ne $null` | true/false | true |
| **ExecutionSuccessAt** | ISO8601 | Timestamp when history detected | timestamp | 2025-11-12T10:23:05Z |

**Purpose**: Signals whether `/history/<promptId>` ever returned results (true) or polling ended without results (false).

### Post-Execution Monitoring

| Field | Type | Source | Unit/Format | Example |
|-------|------|--------|-------------|---------|
| **PostExecutionTimeoutSeconds** | int | CLI param | seconds | 30 |
| **HistoryPostExecutionTimeoutReached** | bool | Flag if timeout exceeded after success | true/false | false |

**Purpose**: Tracks whether we continued waiting after execution_success appeared (to collect any late frames or outputs).

### Scene Retry Control

| Field | Type | Source | Unit/Format | Example |
|-------|------|--------|-------------|---------|
| **SceneRetryBudget** | int | CLI param | count | 1 |

**Purpose**: Total retries allowed for this scene. Compared against actual attempts (AttemptsRun) to determine if requeue was triggered.

### GPU/VRAM Telemetry

| Field | Type | Source | Unit/Format | Example |
|-------|------|--------|-------------|---------|
| **GPU.Name** | string | `$stats.devices[0].name` or nvidia-smi fallback | text | "NVIDIA GeForce RTX 3090" |
| **GPU.Type** | string | `$stats.devices[0].type` or nvidia-smi | text | "cuda" |
| **GPU.Index** | int | `$stats.devices[0].index` | index | 0 |
| **GPU.VramTotal** | bytes | `$stats.devices[0].vram_total` | bytes | 25,589,547,008 |
| **GPU.VramFreeB before** | bytes | `/system_stats` before execution | bytes | 25,200,000,000 |
| **GPU.VramFreeBefore** | bytes | `/system_stats` backup value | bytes (alt source) | 25,200,000,000 |
| **GPU.VramBeforeMB** | float | `VramFreeB before / 1048576` | MB | 24000.0 |
| **GPU.VramFreeAfter** | bytes | `/system_stats` after execution | bytes | 23,700,000,000 |
| **GPU.VramAfterMB** | float | `VramFreeAfter / 1048576` | MB | 22600.0 |
| **GPU.VramDeltaMB** | float | `VramAfterMB - VramBeforeMB` | MB | -1400.0 |

**Purpose**: Tracks GPU memory usage during execution. Negative delta = memory allocated. Helps diagnose OOM issues and model loading problems.

**Fallback Behavior**: If `/system_stats` fails:
- Attempt `nvidia-smi` fallback (Windows/Linux only)
- Record fallback note in System.FallbackNotes
- Validator allows telemetry to pass if fallback is documented

**External Reference**: https://lmstudio.ai/docs/api#health-checks
- ComfyUI `/system_stats` endpoint structure
- LM Studio probe pattern (used as health check baseline)

---

### Frame stability & copy heuristics

To reduce the incidence of partial or in-progress image files being copied while ComfyUI is still writing, the queue helper implements a short stability window and retry policy before copying frames from the output directory.

- Stability window (default): 2 seconds
- Stability retries (default): 3 attempts
- Candidate selection: choose the output directory with the most recent LastWriteTime and highest file count when available
- Forced-copy policy: if stability window is not reached after retries, copy anyway but emit a telemetry warning and include a note in System.FallbackNotes

These values are configurable in the orchestration script and deliberately small to balance run latency against file-consistency. If runs continue to show "frame count below floor" warnings, operators should consider:

1. Increasing the stability window to 3–5 seconds
2. Instrumenting the ComfyUI workflow to emit a final marker file (e.g., `.done`) after all frames are flushed
3. Using an atomic write pattern in downstream nodes (write temp file + rename)

When a forced-copy occurs the telemetry object will include a descriptive entry in `System.FallbackNotes` (e.g., "forced-copy-after-stability-retries"). This informs auditors and the UI that frames may have been copied before the producer finished writing.

Producer-side done marker (atomic semantics)
-------------------------------------------
To reduce races and avoid copying partially-written marker files, producer-side sentinels or in-workflow script nodes SHOULD write the final marker using an atomic pattern: write the marker to a temporary filename (e.g. `<prefix>.done.tmp`) and then rename/move it to `<prefix>.done`. The helper includes `scripts/generate-done-markers.ps1` which implements this pattern (write tmp → Move-Item into place). Consumers (`queue-real-workflow.ps1`) wait for the canonical `.done` marker (within a configured timeout) before copying frames when `-WaitForDoneMarker` is enabled. This pattern is consistent with common Windows file-replace semantics (write-to-temp + rename), which minimizes observers seeing partial JSON content.

Reference: https://learn.microsoft.com/dotnet/api/system.io.file.replace (File.Replace guidance and atomic replace semantics)

### Sentinel & forced-copy telemetry

Every scene telemetry record includes sentinel state and forced-copy metadata so validators/UI can determine whether the producer marker was honored or a fallback path executed. `queue-real-workflow.ps1` writes these fields into `Scenes[*].Telemetry`, and `run-comfyui-e2e.ps1` mirrors them inside the `[Scene ...] Telemetry:` line that the validator parses.

| Field | Type | Source | Example |
|-------|------|--------|---------|
| **DoneMarkerDetected** | bool | `queue-real-workflow.ps1` | `true` |
| **DoneMarkerWaitSeconds** | float | Seconds spent waiting for `<prefix>.done` | `0.0` |
| **DoneMarkerPath** | string | Path to the detected `.done` file (sentinel or local copy) | `C:\ComfyUI\output\gemdirect1_scene-001.done` |
| **ForcedCopyTriggered** | bool | Stability-failsafe that copied frames before marker/stability window | `false` |
| **ForcedCopyDebugPath** | string | When forced copy triggered, path to `forced-copy-debug-<ts>.txt` describing the candidate | `logs\20251112-102345\scene-001\forced-copy-debug-20251112.txt` |

**Purpose**: Enables the validator/UI to differentiate clean runs (marker detected in time) from forced-copy fallbacks and to present links to the generated debug dump when copies proceeded early. `System.FallbackNotes` also records the warning text (e.g., "Forced copy after stability retries; see ..." or "Done marker not found after 60 seconds"), so summaries and UI badges can show the same warning string that triggered the fallback.

### System Diagnostics & Fallbacks

| Field | Type | Source | Example |
|-------|------|--------|---------|
| **System.Before** | object | `/system_stats` response before | `{ "system": { ... }, "devices": [ ... ] }` |
| **System.After** | object | `/system_stats` response after | `{ "system": { ... }, "devices": [ ... ] }` |
| **System.FallbackNotes** | array(string) | Warnings if `/system_stats` failed | `[ "/system_stats unavailable before execution; using nvidia-smi fallback" ]` |

**Purpose**: Documents when primary GPU/system stat collection failed and alternative methods were used.

---

## Telemetry Enforcement

### Where Telemetry Is Required

1. **queue-real-workflow.ps1** - Collects all telemetry into `$telemetry` object
2. **run-comfyui-e2e.ps1** - Logs telemetry to `[Scene ...] Telemetry: ...` line in run-summary.txt
3. **artifact-metadata.json** - Stores complete Telemetry object per scene
4. **scripts/validate-run-summary.ps1** - Validator checks for all required fields
5. **scripts/__tests__/validateRunSummary.test.ts** - Vitest harness checks telemetry presence
6. **UI (Artifact Snapshot / Timeline)** - Renders telemetry badges

### Validator Checks (scripts/validate-run-summary.ps1)

For each scene, validator asserts:

```powershell
# Metadata presence
✓ $scene.Telemetry exists
✓ $scene.Telemetry.DurationSeconds is not null
✓ $scene.Telemetry.MaxWaitSeconds is not null
✓ $scene.Telemetry.PollIntervalSeconds is not null
✓ $scene.Telemetry.HistoryAttempts is not null
✓ $scene.Telemetry.HistoryAttemptLimit is not null
✓ $scene.Telemetry.HistoryExitReason is in ('success', 'maxWait', 'attemptLimit', 'postExecution', 'unknown')
✓ $scene.Telemetry.ExecutionSuccessDetected exists
✓ $scene.Telemetry.ExecutionSuccessAt exists (required if ExecutionSuccessDetected = true)
✓ $scene.Telemetry.PostExecutionTimeoutSeconds is not null
✓ $scene.Telemetry.HistoryPostExecutionTimeoutReached exists
✓ $scene.Telemetry.SceneRetryBudget is not null
✓ $scene.Telemetry.GPU.Name is not blank
✓ $scene.Telemetry.GPU.VramBeforeMB is not null
✓ $scene.Telemetry.GPU.VramAfterMB is not null
✓ $scene.Telemetry.GPU.VramDeltaMB is not null
✓ $scene.Telemetry.System.FallbackNotes exists (may be empty array)

# Summary line presence & matching
✓ [Scene ...] Telemetry: line exists in run-summary.txt
✓ pollLimit=<value> in telemetry line matches metadata HistoryAttemptLimit ("unbounded" if 0, otherwise the number)
✓ SceneRetryBudget=<value> in telemetry line matches metadata SceneRetryBudget
✓ DurationSeconds=<value> in summary matches (rounded to 1 decimal)
✓ All fallback notes in metadata appear in the summary line

# Frame & history status
✓ If FrameCount < FrameFloor: summary has "WARNING: Frame count below floor" line
✓ If HistoryRetrieved = false: summary has "HISTORY WARNING/ERROR" line
✓ If ExecutionSuccessDetected = true: ExecutionSuccessAt must not be null
```

**Failure Mode**: If any check fails, validator emits error and exits with code 2. Run is considered invalid.

### Vitest Checks (scripts/__tests__/validateRunSummary.test.ts)

Parallel test suite covering:
- Telemetry field presence for all required metrics
- Exit reason validation (one of enum values)
- VRAM delta computation consistency
- Fallback notes correlation with summary
- pollLimit text matching
- SceneRetryBudget matching

---

## Queue Policy Line Format

The runner logs a single `Queue policy:` line at the beginning of each run:

```
Queue policy: sceneRetries=1, historyMaxWait=600s, historyPollInterval=2s, historyMaxAttempts=unbounded, postExecutionTimeout=30s
```

Format:
- `sceneRetries=<N>` - SceneRetryBudget value
- `historyMaxWait=<N>s` - SceneMaxWaitSeconds value  
- `historyPollInterval=<N>s` - SceneHistoryPollIntervalSeconds value
- `historyMaxAttempts=<N>|unbounded` - HistoryMaxAttempts value (0 → "unbounded")
- `postExecutionTimeout=<N>s` - ScenePostExecutionTimeoutSeconds value

This line is cross-checked by the validator to ensure run-summary.txt values match artifact-metadata.json QueueConfig fields.

---

## LM Studio Health Check Contract

### Pre-Workflow Health Check

Before ComfyUI starts, `run-comfyui-e2e.ps1` probes the local LLM:

**Default Behavior**:
1. If `LOCAL_STORY_PROVIDER_URL` is set, derive health check URL (convert `/v1/chat/completions` → `/v1/models`)
2. POST request with 5-second timeout
3. Expect HTTP 200 with `{ "data": [ ... ], ... }` or `{ "models": [ ... ] }`
4. Log success/failure in run-summary.txt and artifact-metadata.json
5. Exit immediately if health check fails (unless `LOCAL_LLM_SKIP_HEALTHCHECK=1`)

**Override Options**:
- `LOCAL_LLM_HEALTHCHECK_URL=<custom_url>` - Use different health check endpoint
- `LOCAL_LLM_SKIP_HEALTHCHECK=1` - Skip health check entirely (not recommended)

**Response Handling**:
```powershell
# Success response
{
  "Status": "success",
  "Models": 1,
  "Url": "http://192.168.50.192:1234/v1/models",
  "Timestamp": "2025-11-12T10:23:00Z"
}

# Failure response
{
  "Status": "failed",
  "Error": "Connection timeout",
  "Url": "http://192.168.50.192:1234/v1/models",
  "Timestamp": "2025-11-12T10:23:00Z"
}
```

**Run Summary Entry**:
```
[LLM] Health check: success (url=http://192.168.50.192:1234/v1/models, models=1, override=default)
```

**External Reference**: https://lmstudio.ai/docs/api#health-checks
- LM Studio API documentation for `/v1/models` endpoint
- Used to validate LLM is ready before spinning up ComfyUI

---

## Artifact Metadata Structure

Every run generates `logs/<timestamp>/artifact-metadata.json`:

```json
{
  "RunId": "20251112-102345",
  "Timestamp": "2025-11-12T10:23:45Z",
  "RunDir": "C:\\Dev\\gemDirect1\\logs\\20251112-102345",
  "QueueConfig": {
    "SceneRetryBudget": 1,
    "HistoryMaxWaitSeconds": 600,
    "HistoryMaxAttempts": 0,
    "HistoryPollIntervalSeconds": 2,
    "PostExecutionTimeoutSeconds": 30
  },
  "LLMHealthInfo": {
    "Url": "http://192.168.50.192:1234/v1/models",
    "Status": "success",
    "Models": 1,
    "Skipped": false
  },
  "Story": { ... },
  "Scenes": [
    {
      "SceneId": "scene_001",
      "Title": "...",
      "FrameCount": 25,
      "Success": true,
      "MeetsFrameFloor": true,
      "HistoryRetrieved": true,
      "HistoryErrors": [],
      "AttemptsRun": 1,
      "Requeued": false,
      "Telemetry": {
        "DurationSeconds": 45.2,
        "QueueStart": "2025-11-12T10:23:00Z",
        "QueueEnd": "2025-11-12T10:23:45Z",
        "MaxWaitSeconds": 600,
        "PollIntervalSeconds": 2,
        "HistoryAttempts": 150,
        "HistoryAttemptLimit": 0,
        "HistoryExitReason": "success",
        "ExecutionSuccessDetected": true,
        "ExecutionSuccessAt": "2025-11-12T10:23:05Z",
        "PostExecutionTimeoutSeconds": 30,
        "HistoryPostExecutionTimeoutReached": false,
        "SceneRetryBudget": 1,
        "GPU": {
          "Name": "NVIDIA GeForce RTX 3090",
          "Type": "cuda",
          "Index": 0,
          "VramTotal": 25589547008,
          "VramBeforeMB": 24000.0,
          "VramAfterMB": 22600.0,
          "VramDeltaMB": -1400.0
        },
        "System": {
          "FallbackNotes": []
        }
      }
    }
  ],
  "VitestLogs": { ... },
  "ArchivePath": "..."
}
```

---

## UI Metadata Contract

Components consuming artifact metadata must display:

### Queue Policy Card
- Scene Retry Budget
- History Max Wait (seconds)
- History Max Attempts (or "unbounded")
- History Poll Interval (seconds)
- Post-Execution Timeout (seconds)

### Telemetry Badges
- Duration (seconds)
- Max Wait (seconds)
- Poll Interval (seconds)
- Poll Limit (text: "N" or "unbounded")
- Exit Reason (success/maxWait/attemptLimit/postExecution/unknown)
- Execution Success At (time)
- Post-Exec Timeout (seconds) [if reached]
- History Attempts (count)

### GPU Info
- GPU Name
- VRAM Before (MB)
- VRAM After (MB)
- VRAM Delta (MB) with color coding (red for negative = memory used)

### Fallback Warnings
- If System.FallbackNotes array is not empty, display as yellow warnings
- Example: "/system_stats unavailable; using nvidia-smi fallback"

### Archive & Logs
- Link to vitest-comfyui.log
- Link to vitest-e2e.log
- Link to vitest-scripts.log
- Link to comfyui-e2e-<timestamp>.zip

---

## References Summary

| Component | External Reference | Why It Matters | Citation Location |
|-----------|-------------------|---|---|
| History Poll Exit Reasons | [ComfyUI websocket_api_example.py](https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py) | Defines /history response structure, execution_success signal, status transitions | queue-real-workflow.ps1:106, run-comfyui-e2e.ps1:544 |
| LM Studio Health Check | [LM Studio API Health Checks](https://lmstudio.ai/docs/api#health-checks) | `/v1/models` endpoint, override patterns, skip flag semantics | run-comfyui-e2e.ps1:61-62, 283-299 |
| VRAM Calculation | ComfyUI /system_stats response | devices[*].vram_free and vram_total fields | queue-real-workflow.ps1:33-62 |
| GPU Telemetry | NVIDIA nvidia-smi output | Fallback when /system_stats unavailable | queue-real-workflow.ps1:257-262 |

---

## Change Log

| Date | Author | Change | Status |
|------|--------|--------|--------|
| 2025-11-12 | AI Agent | Initial contract document | Active |

