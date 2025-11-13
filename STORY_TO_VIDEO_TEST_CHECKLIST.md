# Story-to-Video Test Checklist

## LM Studio health check
- The helper now probes LM Studio's `/v1/models` endpoint before launching ComfyUI, logs the outcome in `run-summary.txt`/`artifact-metadata.json`, and lets you override the probe target with `LOCAL_LLM_HEALTHCHECK_URL` or skip it with `LOCAL_LLM_SKIP_HEALTHCHECK=1` when a proxy blocks `/models`. Failing fast on a dead LLM saves runtime and writes a warning that downstream reviewers can trace back to the documented override (see [LM Studio health checks][lm-health]).

## Queue knobs & metadata surfaces
- Every queue knob (`SceneMaxWaitSeconds`, `SceneHistoryPollIntervalSeconds`, `SceneHistoryMaxAttempts`, `ScenePostExecutionTimeoutSeconds`, `SceneRetryBudget` plus the matching `SCENE_*` env vars) is resolved from CLI flags or environment variables, copied into the `QueueConfig` payload, and mirrored across `run-summary.txt`, `artifact-metadata.json`, and `public/artifacts/latest-run.json`. The React Artifact Snapshot policy card and Timeline Editor banners replay these values so reviewers know how long we waited per scene, how often we polled, and how the retry budget was spent.

## Telemetry enforcement policy
- Every scene attempt must emit telemetry fields and warnings, including:
  - `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, `pollLimit` (the text inside `[Scene .] Telemetry:` must match the numeric metadata value), `HistoryExitReason` (maxWait/attemptLimit/postExecution/success), `ExecutionSuccessDetected`, `ExecutionSuccessAt`, `PostExecutionTimeoutSeconds`, and `postExecTimeoutReached`.
  - GPU `Name`, `VRAMBeforeMB`, `VRAMAfterMB`, `VRAMDeltaMB`, plus fallback notes when `/system_stats` fails or `nvidia-smi` is used instead of the statistics endpoint.
  - Poll warnings/errors, `HistoryPollLog` entries, and `SceneRetryBudget` exposures so `scripts/validate-run-summary.ps1`, Vitest, and the UI can ensure missing telemetry or mismatched hours (e.g., poll limit) halt the run.
  - `ExecutionSuccess` detection follows ComfyUI’s `/history` messaging (`execution_success`, `status_str`, `exitReason`) as shown in [`websocket_api_example.py`][comfy-history], so the queue script keeps polling until success, max wait, max attempts, or post-execution timeout dictates the exit reason.

## Artifact snapshot expectations
- The Artifact Snapshot and Timeline views must render:
  - A queue policy card that lists `QueueConfig`, per-scene `HistoryConfig`, and `SceneRetryBudget`.
  - Telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, `pollLimit`, `HistoryExitReason`, `postExec` timeout flag, `ExecutionSuccessAt`), poll log counts, and a warnings-only filter so degraded scenes can be isolated.
  - GPU information (name plus VRAM delta), fallback warnings, archive links (Vitest logs and `artifacts/comfyui-e2e-<ts>.zip`), and LLM metadata (provider URL/model, request format, seed, duration, and any error details).

- **Docs-first guardrail**: Before editing scripts or UI, read the telemetry/queue docs (README.md, DOCUMENTATION_INDEX_20251111.md, STORY_TO_VIDEO_PIPELINE_PLAN.md, WORKFLOW_FIX_GUIDE.md, HANDOFF_SESSION_NOTES.md, QUICK_START_E2E_TODAY.md, REFERENCE_CARD_QUICK.md, WINDOWS_AGENT_TEST_ITERATION_PLAN.md, and notes/codex-agent-notes-20251111.md) so the LM Studio health check, queue knobs, telemetry enforcement, and artifact expectations stay top of mind.
[lm-health]: https://lmstudio.ai/docs/api#health-checks
[comfy-history]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
