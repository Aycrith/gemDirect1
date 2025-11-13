# Windows-Agent Testing - Complete Documentation Index

**Session Date**: November 11, 2025  
**Environment Status**: ✓ VALIDATED | ⏳ READY FOR E2E (pending SVD model)  
**Documentation Generated**: 4 comprehensive guides

---
## ?? Required Telemetry & Queue Policy Orientation

Reading the quick navigation docs above is the _required first step_ before editing scripts, UI hooks, or validators so you understand how the helper enforces LM Studio health checks, queue knobs, and telemetry requirements.[lm-health]
1. **LM Studio health check**: `scripts/run-comfyui-e2e.ps1` hits `/v1/models` before launching ComfyUI, records override/fallback notes (`LOCAL_LLM_HEALTHCHECK_URL` / `LOCAL_LLM_SKIP_HEALTHCHECK=1`), and surfaces warnings in `run-summary.txt`/`artifact-metadata.json`.
2. **Queue knobs & metadata**: `SceneMaxWaitSeconds`, `SceneHistoryPollIntervalSeconds`, `SceneHistoryMaxAttempts`, `ScenePostExecutionTimeoutSeconds`, and `SceneRetryBudget` plus the matching `SCENE_*` env vars are resolved into `QueueConfig`, each scene’s `HistoryConfig`, and `SceneRetryBudget` and re-rendered inside the Artifact Snapshot policy card and Timeline Editor.
3. **Telemetry enforcement policy**: Every `[Scene .] Telemetry:` line must list `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, `pollLimit` (text matching metadata), `HistoryExitReason` (maxWait/attemptLimit/postExecution/success), `ExecutionSuccessDetected`, `ExecutionSuccessAt`, `PostExecutionTimeoutSeconds`, `postExecTimeoutReached`, GPU `Name`, `VRAMBeforeMB`, `VRAMAfterMB`, `VRAMDeltaMB`, fallback notes (e.g., `/system_stats` failure triggering the `nvidia-smi` fallback), and `SceneRetryBudget`. This telemetry is validated by `scripts/validate-run-summary.ps1`, Vitest, and the UI, and the queue script honors the `/history` states (`execution_success`, `status_str`, `exitReason`) described in [`websocket_api_example.py`][comfy-history].
4. **Artifact snapshot expectations**: The Artifact Snapshot/Timeline UI must display the queue policy card, telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, `pollLimit`, `HistoryExitReason`, `postExec` timeout state, `ExecutionSuccessAt`), poll log counts/warnings-only filter, GPU info + VRAM delta and fallback warnings, archive links (Vitest logs + `artifacts/comfyui-e2e-<ts>.zip`), and LLM metadata (provider, model, request format, seed, duration, errors).


5. **Docs-first guardrail**: Read README.md, STORY_TO_VIDEO_PIPELINE_PLAN.md, STORY_TO_VIDEO_TEST_CHECKLIST.md, WORKFLOW_FIX_GUIDE.md, HANDOFF_SESSION_NOTES.md, QUICK_START_E2E_TODAY.md, REFERENCE_CARD_QUICK.md, WINDOWS_AGENT_TEST_ITERATION_PLAN.md, and notes/codex-agent-notes-20251111.md before editing scripts or UI so the LM Studio health check, queue knobs, telemetry enforcement, and artifact expectations are locked in.
6. **UI metadata handshake**: Artifact Snapshot/Timeline cards mirror logs/<ts>/artifact-metadata.json and public/artifacts/latest-run.json, so their queue policy cards, telemetry badges, GPU stats, fallback warnings, Vitest logs, and archive references must match the validator-approved data.

[lm-health]: https://lmstudio.ai/docs/api#health-checks
[comfy-history]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
