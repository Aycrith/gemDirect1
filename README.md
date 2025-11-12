<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1uvkkeiyDr3iI4KPyB4ICS6JaMrDY4TjF

## Run Locally

**Prerequisites:**  Node.js ≥ 22.19.0 (the helper scripts now enforce this at runtime and will exit early if `node -v` reports an older version).


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
5. **Artifact snapshot + telemetry**: The helper builds `logs/<ts>/artifact-metadata.json` (story metadata, LLM provenance, moods, per-scene prompts, frame counts, GPU telemetry, warnings, history poll attempts, requeue summaries, Vitest logs, archive path) and mirrors it to `public/artifacts/latest-run.json`. The React **Artifact Snapshot** panel now surfaces these details with a warnings-only filter, duration/GPU summaries, and per-scene storyline context so you can audit runs without leaving the app.
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
