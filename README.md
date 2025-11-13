<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1uvkkeiyDr3iI4KPyB4ICS6JaMrDY4TjF

## Run Locally

**Prerequisites:**  Node.js >= 22.19.0 (the helper scripts now enforce this at runtime and will exit early if `node -v` reports an older version).

### Local LLM (LM Studio) requirements

- Install [LM Studio](https://lmstudio.ai/) with the **mistralai/mistral-7b-instruct-v0.3** GGUF (Q4_K_M) model and launch the HTTP server (`http://192.168.50.192:1234/v1/chat/completions` is the validated address). Keep LM Studio in CPU-only mode so the RTX 3090 remains fully available for ComfyUI.
- Export the following variables (or place them in your PowerShell profile) before running `scripts/run-comfyui-e2e.ps1`:
  ```powershell
  $env:LOCAL_STORY_PROVIDER_URL = 'http://192.168.50.192:1234/v1/chat/completions'
  $env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
  $env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
  $env:LOCAL_LLM_SEED = '42'
  $env:LOCAL_LLM_TEMPERATURE = '0.35'
  $env:LOCAL_LLM_TIMEOUT_MS = '120000'   # ~90s generation time
  ```
- The helper now performs a `/v1/models` probe before ComfyUI spins up so we never waste a run on a dead LLM instance. Override the probe target with `LOCAL_LLM_HEALTHCHECK_URL` or skip the check (not recommended) with `LOCAL_LLM_SKIP_HEALTHCHECK=1`.
- When the probe hits a non-responsive LM Studio instance it raises an error immediately, so you can gracefully fall back to another provider or set [`LOCAL_LLM_SKIP_HEALTHCHECK=1`](https://lmstudio.ai/docs/api#health-checks) if the endpoint intentionally blocks `/models` entirely; the override is handy when the default `/v1/models` path is behind a proxy or you want to hit a different host than the story generator’s prompts.
- Verify the endpoint before a headless run: `Invoke-WebRequest http://192.168.50.192:1234/v1/models`.
- If LM Studio is offline, fall back to Ollama by swapping `LOCAL_STORY_PROVIDER_URL`/`LOCAL_LLM_MODEL` (keep `LOCAL_LLM_REQUEST_FORMAT=openai-chat`). Note the fallback in `run-summary.txt`.
### Queue knobs, telemetry enforcement, and artifact snapshots
- The helper resolves every queue knob (`SceneMaxWaitSeconds`, `SceneHistoryPollIntervalSeconds`, `SceneHistoryMaxAttempts`, `ScenePostExecutionTimeoutSeconds`, `SceneRetryBudget`, plus the CLI flags/`SCENE_*` env vars that mirror them) before ComfyUI spins up, surfaces them as `QueueConfig`, per-scene `HistoryConfig`, and `SceneRetryBudget` in `run-summary.txt`, `artifact-metadata.json`, and `public/artifacts/latest-run.json`, and renders the same numbers inside the Artifact Snapshot policy card and Timeline Editor banners. These knobs drive the poll loop budget, post-execution wait, and total retry allowance reported back to reviewers so every agent knows the poller aggressiveness without opening JSON.
- Telemetry enforcement now insists on the same fields every scene attempt emits: `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, `pollLimit` (text and metadata value must match), `HistoryExitReason` (maxWait/attemptLimit/postExecution/success), `ExecutionSuccessDetected`, `ExecutionSuccessAt`, `PostExecutionTimeoutSeconds` (and `postExecTimeoutReached`), GPU `Name`, `VRAMBeforeMB`, `VRAMAfterMB`, `VRAMDeltaMB`, plus any fallback notes (e.g., `/system_stats` failure or `nvidia-smi` fallback). We treat `execution_success` from ComfyUI's `/history` sequence as the success signal for every attempt, so the validator, Vitest harness, and UI look for that event before closing a scene (following the `/history` message structure from [`websocket_api_example.py`][2]). Missing telemetry lines, mismatched `pollLimit`, or absent GPU/VRAM numbers fail validation before the run archives, and the queue policy card/Timeline badges use the same metadata to explain retry budgets, poll pacing, and GPU usage for reviewers.
- Artifact snapshots must now display the queue policy card, telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, `pollLimit`, `HistoryExitReason`, `postExec` timeout flag, `ExecutionSuccessAt`), poll log counts, GPU info with name and VRAM delta plus fallback warnings, archive links (Vitest logs, zip), and LLM metadata (provider, model, request format, seed, duration, errors). These badges/reference links mirror the logs, show history warnings or fallback notes, and keep the telemetry/poll limit text synchronized with the metadata so the UI and run artifacts tell the same story about failures or successes. Assumed behavior: LM Studio’s `/v1/models` probe (configurable via `LOCAL_LLM_HEALTHCHECK_URL` or skipped with `LOCAL_LLM_SKIP_HEALTHCHECK=1` per [LM Studio health checks][1]) stays available before ComfyUI launches, and we fallback only after logging the warning so downstream agents can retrace the attempt.
- **Documentation-first discipline**: Before editing scripts or UI, read `DOCUMENTATION_INDEX_20251111.md` (especially the “Required Telemetry & Queue Policy Orientation” block), `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `STORY_TO_VIDEO_TEST_CHECKLIST.md`, `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `QUICK_START_E2E_TODAY.md`, `REFERENCE_CARD_QUICK.md`, `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`, and `notes/codex-agent-notes-20251111.md` so the LM Studio health check, queue knobs, telemetry requirements, and artifact expectations are obvious.

Producer done-marker semantics
-----------------------------
To avoid races between ComfyUI's SaveImage node and the consumer poller, the helper relies on a producer-side "done" marker file. Producer sentinels (or in-workflow script nodes) write a temporary file and atomically rename it into place (e.g. `<prefix>.done.tmp` → `<prefix>.done`). This prevents consumers from copying partially-written JSON marker files. The repository includes `scripts/generate-done-markers.ps1` which creates these markers when sequences appear stable or when ComfyUI history reports `execution_success` and lists output filenames. The atomic-write pattern follows common Windows file-replace semantics (write temp → move/replace) to minimize observers seeing partial content. See `scripts/generate-done-markers.ps1` and `workflows/text-to-video.json` (Write Done Marker node) for details.
In-workflow node and sentinel-as-service
---------------------------------------

If you prefer the workflow itself to emit the done marker (rather than relying on the external sentinel), you can use the provided helper `comfyui_nodes/write_done_marker.py`.

- To use inside ComfyUI:
  1. Copy `comfyui_nodes/write_done_marker.py` into your ComfyUI installation under `custom_nodes/` and call `write_done_marker(output_dir, prefix, frame_count)` from a Script node, or
  2. Use a Shell/Run node to invoke the helper directly (example shown below).

Example CLI invocation (safe for Script/Shell nodes):

```powershell
# from the host where ComfyUI runs
python C:\path\to\comfyui_nodes\write_done_marker.py --output-dir "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" --prefix gemdirect1_scene-001 --frames 25
```

Sentinel as a Scheduled Task (Windows)
-------------------------------------

You can keep the external sentinel running across logins by registering it as a Scheduled Task instead of manually starting it each session. A helper script is provided at `scripts/install-sentinel-scheduledtask.ps1` (install/uninstall modes). Example:

```powershell
# Install the scheduled task for the current user (no admin required)
pwsh ./scripts/install-sentinel-scheduledtask.ps1 -Action install -ScriptPath 'C:\Dev\gemDirect1\scripts\generate-done-markers.ps1'

# Uninstall
pwsh ./scripts/install-sentinel-scheduledtask.ps1 -Action uninstall
```

Notes:
- The scheduled task registers a per-user logon trigger (no admin rights), which runs the sentinel in the background whenever the user logs in. For a system-level task you can adapt the script to use a service account and require elevation.
- If you need atomic semantics across different filesystems or network shares, prefer using a native replace (e.g., .NET File.Replace) or ensure the tmp and final file live on the same filesystem — os.replace / os.rename / Move-Item semantics only guarantee atomicity on the same mount.

References: https://learn.microsoft.com/dotnet/api/system.io.file.replace (atomic replace guidance), https://github.com/comfyanonymous/ComfyUI (history API examples)
- **UI metadata handshake**: The Artifact Snapshot and Timeline panels mirror the same data stored in `logs/<ts>/artifact-metadata.json` and `public/artifacts/latest-run.json`, so the queue policy card, telemetry chips, GPU stats, fallback warnings, Vitest logs, and archive references must always agree with what the helper logs and the validator enforces.

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

### Local Testing Notes

- Node **22.12.0 or newer** is required. On Linux/macOS install Node 22.19.0 and add `/usr/local/node-v22.19.0/bin` to `PATH`; on Windows install Node 22.19.0 to `C:\Tools\node-v22.19.0-win-x64` and prepend that folder to your user `PATH` so `node -v` reports `v22.19.0`.
- The ComfyUI service tests currently need the `vmThreads` pool to avoid fork/thread timeouts. Run the targeted suite with:

  ```
  node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/comfyUIService.test.ts
  ```

  This command matches the validated workflow from both Linux and Windows environments.
- Before running the helper, read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and `STORY_TO_VIDEO_TEST_CHECKLIST.md` to understand the story/keyframe → ComfyUI flow and the structured `run-summary.txt` template that the helper emits.

### Automated ComfyUI E2E

- Run `scripts/run-comfyui-e2e.ps1` from PowerShell with `-ExecutionPolicy Bypass` (optionally pass `-MaxSceneRetries <n>` to control the auto-requeue floor). The helper now verifies `node -v` (≥ 22.19.0) before doing any work and drives the entire story ➜ video loop:
1. **Story + keyframes**: `scripts/generate-story-scenes.ts` synthesizes a three-scene story, writes `logs/<ts>/story/story.json`, and copies per-scene keyframes (defaults to `sample_frame_start.png`). When `LOCAL_STORY_PROVIDER_URL` is set, the helper automatically routes the request through your local LLM, records the provider URL/seed/duration/error data, and captures those details (plus any fallback warnings) inside `story.json`, `run-summary.txt`, and `artifact-metadata.json`.
  2. **Scene loop + retries**: `scripts/queue-real-workflow.ps1` patches placeholders inside `workflows/text-to-video.json`, posts to `/prompt`, polls `/history/<promptId>`, and copies `gemdirect1_<sceneId>*` frames into `logs/<ts>/<sceneId>/generated-frames`. Each queue attempt logs a history-poll timeline, collects REST errors, and the runner automatically requeues once when history retrieval fails, no frames were copied, or the frame count falls below the floor defined on the scene payload.
  3. **Validation & failure protocol**: For every attempt the helper writes `[Scene ...][Attempt ...]` lines plus explicit `[Scene ...] HISTORY WARNING/ERROR` and `WARNING: Frame count below floor (...)` entries into `run-summary.txt`. The `validate-run-summary.ps1` script (called automatically) cross-references `artifact-metadata.json` to ensure those lines exist for any scene that degraded.
  4. **Tests**: After the scene loop finishes the helper runs three Vitest suites via `scripts/run-vitests.ps1` (`services/comfyUIService.test.ts`, `services/e2e.test.ts`, and everything under `scripts/__tests__`). The helper now invokes the local Vitest CLI directly (`node ./node_modules/vitest/vitest.mjs …`) to avoid npm shim issues, so logs are reliable (`vitest-comfyui.log`, `vitest-e2e.log`, `vitest-scripts.log`, plus `vitest-results.json`).
- **Queue policy knobs**: pass `-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, or `-SceneHistoryPollIntervalSeconds` (or set `SCENE_MAX_WAIT_SECONDS`, `SCENE_HISTORY_MAX_ATTEMPTS`, `SCENE_HISTORY_POLL_INTERVAL_SECONDS`) to tune history polling budgets without editing scripts. The helper records the resolved policy (and your `-MaxSceneRetries` value) inside `run-summary.txt`, `artifact-metadata.json`, and the React viewers so downstream agents know exactly how aggressively the poller was configured.
- **Queue policy knobs**: pass `-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, `-SceneHistoryPollIntervalSeconds`, or `-ScenePostExecutionTimeoutSeconds` (or set the matching `SCENE_*` env vars) to tune how long we wait for `/history` messages and how long we continue polling after the `execution_success` flag appears. These knobs flow through every run artifact: `QueueConfig`/`HistoryConfig` in `artifact-metadata.json`, the Artifact Snapshot policy card, and the Timeline editor’s per-scene banner. The validator at `scripts/validate-run-summary.ps1` now asserts that each scene’s telemetry contains `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, GPU name, and VRAM (before/after) plus the poll-limit text inside `[Scene ...] Telemetry` lines, so missing GPU telemetry or pollLimit values surface as hard failures before archiving a run.
  The history poller mirrors the status ladder shown in ComfyUI’s [`websockets_api_example.py`](https://github.com/comfyanonymous/ComfyUI/blob/master/websockets_api_example.py) so every `[Scene ...] HISTORY WARNING/ERROR` line cites the same reason (`maxWait`, `attemptLimit`, `postExecution`, etc.), and `System.FallbackNotes` captures the `/system_stats` failures that trigger the `nvidia-smi` fallback.
5. **Artifact snapshot + telemetry**: The helper builds `logs/<ts>/artifact-metadata.json` (story metadata, LLM provenance, moods, per-scene prompts, frame counts, GPU telemetry, warnings, history poll attempts, requeue summaries, Vitest logs, archive path) and mirrors it to `public/artifacts/latest-run.json`. The React **Artifact Snapshot** panel now surfaces these details with a warnings-only filter, duration/GPU summaries, and per-scene storyline context so you can audit runs without leaving the app. The Artifact Snapshot and Timeline editor now render the `QueueConfig`/`HistoryConfig` knobs alongside GPU/VRAM deltas, pollLimit badges, exit reasons, fallback notes, and archive references so you can trace every warning without opening raw JSON.
  6. **Archival**: ComfyUI shuts down after the suites complete and `artifacts/comfyui-e2e-<ts>.zip` is generated. The archive mirrors the entire `logs/<ts>` directory (story folder, scenes, history files, generated frames, vitest logs, and run summary).

- Post-run checklist:
  - Read `logs/<ts>/run-summary.txt`, confirming `## Story`, `[Scene ...][Attempt ...]`, `[Scene ...] HISTORY WARNING/ERROR`, `Requeue requested`, and `## Artifact Index` entries match what you observed on the console (frame counts, durations, Vitest exit codes, zip path, vitest-scripts log).
  - Run the lightweight unit suites with `node ./node_modules/vitest/vitest.mjs run scripts/__tests__` (or the bundled `scripts/run-vitests.ps1`) before launching the heavy helper. These tests cover the story generator helpers and workflow patcher edge cases (missing keyframes, LLM fallback, placeholder safety).
  - Inspect each `logs/<ts>/<sceneId>/` folder: make sure `scene.json`, `keyframe.png`, `history.json`, and `generated-frames/*.png` exist and that frame counts align with the summary/metadata warnings.
- Open the **Artifact Snapshot** panel or `public/artifacts/latest-run.json` to confirm prompts, moods, keyframe paths, history poll timestamps, telemetry (duration + GPU + VRAM), warnings, Vitest log paths, and archive references are surfaced. Use the new warnings-only filter in the UI to highlight degraded scenes.
  - Confirm `artifacts/comfyui-e2e-<ts>.zip` mirrors the `logs/<ts>` tree before attaching it to a PR or handoff. Reviewers can validate the upload by downloading `comfyui-e2e-logs` from the workflow run.
  - Use `STORY_TO_VIDEO_TEST_CHECKLIST.md` for the expected `run-summary.txt` template, validation commands, and new failure protocol (requeue guidance, history warning requirements).
  - If you manually tweak `run-summary.txt`, rerun `scripts/validate-run-summary.ps1 -RunDir logs/<ts>` so the `[Scene ...] HISTORY WARNING/ERROR` and `WARNING: Frame count below floor` entries continue to line up with `artifact-metadata.json`.

- Failure triage tips:
  - If frame counts stay at 0, verify `ComfyUI/models/checkpoints/SVD/` contains `svd_xt*.safetensors` (see [thecooltechguy/ComfyUI-Stable-Video-Diffusion](https://github.com/thecooltechguy/ComfyUI-Stable-Video-Diffusion)) and ensure `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output` is writable. The helper will requeue once automatically and stamp `[Scene ...] ERROR: No frames copied`.
  - History timeouts now surface via `[Scene ...] HISTORY WARNING` entries and the per-attempt poll timeline embedded in `artifact-metadata.json`. The poller now keeps retrying until `MaxWaitSeconds`, so if a scene eventually succeeds you will still see the final `[Scene ...] Frames=##` line without needing to restart. Investigate `logs/<ts>/<sceneId>/history.json` plus the `HistoryPollLog` array rendered by the Artifact Snapshot when history never resolves.
  - Alternate SVD prompt wiring examples (e.g., [ComfyUI Txt2Video with SVD on Civitai](https://civitai.com/models/211703/comfyui-txt2video-with-svd)) are referenced in `STORY_TO_VIDEO_PIPELINE_PLAN.md` if you need to adjust node mappings.
- CI automation:
  - `.github/workflows/pr-vitest.yml` (Windows, Node 22) runs `npm exec vitest -- run --reporter json --outputFile vitest-report.json` on every PR and uploads the JSON report for reviewers. Trigger the workflow manually with `runFullE2E = true` to run the helper on a workstation that already has ComfyUI installed—the resulting `comfyui-e2e-<ts>.zip` is published as the `comfyui-e2e-logs` artifact for inspection.
[1]: https://lmstudio.ai/docs/api#health-checks
[2]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
