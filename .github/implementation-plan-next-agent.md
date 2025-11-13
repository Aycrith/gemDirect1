## Implementation Plan — Next AI Coding Agent

Purpose
-------
This document is an actionable, doc-first prompt for the next AI coding agent working on branch `feature/local-integration-v2`. It summarizes what was changed, why, what to read first, how to run the tests and E2E harness safely on Windows (pwsh), and the exact acceptance criteria for any further work.

MANDATORY: read these docs first (do not proceed until done)
--------------------------------------------------------
- TELEMETRY_CONTRACT.md
- COMFYUI_INTEGRATION.md
- COMFYUI_LOCAL_RUNBOOK.md
- COMFYUI_CLEAN_INSTALL.md
- COMFYUI_TEST_GUIDE.md
- COMFYUI_QUICK_REFERENCE.md
- scripts/ (read relevant *.ps1 scripts: `queue-real-workflow.ps1`, `run-comfyui-e2e.ps1`, `run-vitests.ps1`, `validate-run-summary.ps1`)

High-level goal
---------------
Make telemetry and end-to-end orchestration robust and repeatable. Specifically:
- Guarantee each scene writes a Telemetry object that satisfies the telemetry contract.
- Harden GPU telemetry collection (prefer `/system_stats`, fallback to `nvidia-smi`).
- Avoid killing an externally-managed ComfyUI process; only Stop-Process a process started by the orchestrator.
- Reduce 0-frame requeue races by improving frame-selection and (next) adding timestamp verification.

What was changed already (context)
---------------------------------
- scripts/queue-real-workflow.ps1 — defensive initialization of frame collections, try/catch telemetry fallback, tolerant GPU snapshot (nvidia-smi fallback), improved frame-selection by picking the most recently-updated output directory.
- scripts/run-comfyui-e2e.ps1 — probe/reuse running ComfyUI, Stop-Process safety guard (only stop expected embedded Python process), preserve best-attempt frame counts.
- scripts/__tests__/stopProcessGuard.test.ts — vitest test asserting the safety guard exists.
- scripts/__tests__/queueFrameSelection.test.ts — vitest test asserting the frame-selection debug markers exist.

Artifacts from recent validation runs
-----------------------------------
- Logs: logs/20251112-205615 and logs/20251112-212729
- Artifacts: artifacts/comfyui-e2e-20251112-205615.zip, artifacts/comfyui-e2e-20251112-212729.zip
- Both runs produced artifact-metadata.json per run and validated successfully with validate-run-summary.ps1 (run-summary validation: PASS). Note: some scenes had 0-frame attempts but the orchestrator preserves the best-attempt frames in the final artifact metadata.

How to run (Windows pwsh) — SAFELY
---------------------------------
Important: use scripts/safe-terminal.ps1 wrapper for any commands that interact with background services (ComfyUI/Dev server). This wrapper prevents killing ongoing background processes.

1) Run Vitest suites (local quick-check):

   & 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command '.\scripts\run-vitests.ps1 -ProjectRoot C:\Dev\gemDirect1 -RunDir C:\Dev\gemDirect1\logs\test-run-$(Get-Date -Format yyyyMMdd-HHmmss)'

2) Run the full story→ComfyUI E2E orchestrator (default flags used in previous validated runs):

   & 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command '.\scripts\run-comfyui-e2e.ps1 -SceneMaxWaitSeconds 600 -SceneHistoryMaxAttempts 3 -SceneHistoryPollIntervalSeconds 2 -ScenePostExecutionTimeoutSeconds 30 -SceneRetryBudget 1 -UseLocalLLM' -WorkingDirectory 'C:\Dev\gemDirect1'

Notes/Precautions
- Do NOT run Stop-Process or other process-killing commands directly; use the orchestrator which contains a guard that only kills a ComfyUI process the script started (matches expected embedded python path).
- If you need to start ComfyUI manually, prefer using the provided VS Code task "Start ComfyUI Server" (it starts the portable ComfyUI on port 8188) and let the orchestrator reuse it.
- Ensure `nvidia-smi` is available on PATH (Windows default location is `C:\Windows\system32\nvidia-smi.exe`) for the GPU fallback.

Acceptance criteria (before filing a PR)
--------------------------------------
1) All Vitest suites pass (exit code 0). Use `run-vitests.ps1`.
2) Full E2E run (`run-comfyui-e2e.ps1`) completes and `validate-run-summary.ps1` reports PASS.
3) The produced `artifact-metadata.json` contains a `Telemetry` object for every scene, and each Telemetry must include the validator-required fields (see TELEMETRY_CONTRACT.md). Minimum required fields to verify programmatically:
   - Telemetry.DurationSeconds
   - Telemetry.ExecutionSuccessDetected (boolean)
   - Telemetry.HistoryExitReason (enum: success|maxWait|attemptLimit|postExecution|unknown)
   - Telemetry.GPU.VramBeforeMB
   - Telemetry.GPU.VramAfterMB
   - Telemetry.GPU.VramDeltaMB
   - Telemetry.System.FallbackNotes (array or empty)

Next tasks assigned to you (ordered)
----------------------------------
1) Implement telemetry-contract Vitest assertions (required): write tests that assert the queue script and artifact metadata contain the validator-required telemetry keys and types. (High priority)
2) Instrument frame-write timestamp verification in `queue-real-workflow.ps1`: when copying frames, record and verify source file LastWriteTime and use a small verification/backoff to avoid copying partially-written files. (High priority)
3) Run an extended stability sweep (5–10 consecutive E2E runs) and collect statistics (requeue frequency, per-scene Telemetry completeness). Add a short summary report in logs/ with aggregated counts. (Medium priority)
4) Update TELEMETRY_CONTRACT.md and COMFYUI_RUNBOOK docs to document the System.FallbackNotes and best-attempt selection semantics. (Low/medium)

If you run into failures
-----------------------
- First, re-read TELEMETRY_CONTRACT.md — the validator is strict about exact field names.
- Check `logs/<latest-run>/queue-error-debug.txt` if present for per-scene stack traces.
- Check `logs/<latest-run>/run-summary.txt` and `artifact-metadata.json` for why a scene failed (look for SceneAttemptSummaries and ExecutionSuccessDetected flags).
- Common fixes: defensive-initialization of collections, null-safe reading of GPU fields, ensure attempt preservation logic picks the highest FrameCount attempt.

Hand-off
--------
Place any new tests under `scripts/__tests__/` and run `run-vitests.ps1` locally. Commit changes on branch `feature/local-integration-v2` and open a PR for review. Include the run artifact link(s) and at least two E2E runs demonstrating stability.

Contact
-------
If you need context, look at the recent runs and files in `logs/20251112-205615` and `logs/20251112-212729` — they include full run artifacts and validated metadata examples.

Good luck — remember: docs first, tests next, then E2E. Use the safe-terminal wrapper for any command that touches ComfyUI or background processes.
