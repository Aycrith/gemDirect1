# Story ➜ ComfyUI Automation Plan

_Last updated: 2025-11-11_

This plan maps the next-phase implementation work needed to connect the gemDirect1 story generator to the ComfyUI Stable Video Diffusion (SVD) workflow so the entire e2e helper can run unattended. The scope aligns with the user request (Sections A-F).

## Resolved Issues
- Aligned the SVD pipeline with the ComfyUI_examples `workflow_image_to_video.json` flow (ImageOnlyCheckpointLoader   VideoLinearCFGGuidance   SVD_img2vid_Conditioning   KSampler   VAEDecode   SaveImage), so the checkpoint receives the expected embeddings and conditioning inputs.
- `scripts/queue-real-workflow.ps1` now copies each scene keyframe into `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input`, patches `__KEYFRAME_IMAGE__`, `__SCENE_PREFIX__`, and `_meta.{scene_prompt,negative_prompt}`, prunes stale frames, saves `history.json`, and returns per-scene metrics for logging.
- `scripts/run-comfyui-e2e.ps1` orchestrates story creation, ComfyUI startup/polling, the scene loop, Vitest suites, warning detection for frame-floor breaches, and zips the entire `logs/<ts>` directory while writing a structured `run-summary.txt`.
- Local LLM prompts are now first-class: whenever `LOCAL_STORY_PROVIDER_URL` is set the generator records provider URL, seed, duration, and fallback warnings and threads moods/expected frame floors through story JSON, run summaries, artifact metadata, and the UI. The CLI now understands `LOCAL_LLM_MODEL`, `LOCAL_LLM_REQUEST_FORMAT=openai-chat`, and `LOCAL_LLM_TIMEOUT_MS` so LM Studio’s `/v1/chat/completions` endpoint can be used directly (no extra proxy).
- Per-scene telemetry (GPU model, VRAM deltas, poll cadence, runtime) is emitted by `queue-real-workflow.ps1`, enforced by `validate-run-summary.ps1`, and rendered in both the Artifact Snapshot and Timeline Editor for quick triage. If `/system_stats` is unavailable the script now falls back to `nvidia-smi` so GPU/VRAM readings always appear in `[Scene …] Telemetry:` lines.

## Known Gaps
- The story generator now talks to LM Studio via the OpenAI chat schema, but it is still detached from the hosted Gemini/story-service backend (no multi-user persistence or creative briefs yet).
- Auto retries + `[Scene …] HISTORY WARNING` logging now surface REST or history issues, but we still need a follow-on workflow to escalate repeat failures or to notify the helper operator when a scene exceeds the retry budget.
- Artifact metadata now lists prompts, warnings, requeue timelines, and Vitest logs, yet the rest of the UI (timeline, history explorer) is not consuming that metadata; future work should feed those contexts into additional panels beyond the Artifact Snapshot.
- Unit tests now cover the story generator + workflow patcher helpers, but there is still no coverage for the ComfyUI REST client/service glue that orchestrates retries and metadata writes.

## Lessons Learned
- Placeholder patching is reliable, so we can keep the workflow JSON static while `queue-real-workflow.ps1` injects context (keyframes, prompts, prefixes) immediately before posting.
- Vitest suites need `--pool=vmThreads` on Windows to avoid fork/thread timeouts; always capture their exit codes via redirected log files.
- Standardizing `run-summary.txt` (with `## Story`, per-scene lines, warnings, and a `## Artifact Index`) plus archiving the entire `logs/<ts>` tree keeps each run auditable for later agents.

- `run-comfyui-e2e.ps1` now probes the LM Studio `/v1/models` endpoint (configurable via `LOCAL_LLM_HEALTHCHECK_URL` or `LOCAL_LLM_SKIP_HEALTHCHECK`) before ComfyUI launches, so we fail fast instead of grinding through a run with fallback prompts.
- Queue telemetry is fully configurable: `-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, `-SceneHistoryPollIntervalSeconds`, and `-ScenePostExecutionTimeoutSeconds` (plus the matching `SCENE_*` env vars) bubble through the PowerShell runner, metadata, run summaries, and the React Artifact Snapshot so retry budgets can be tuned and audited. Each scene’s `HistoryConfig`/`HistoryPollLog` mirrors the status ladder shown in ComfyUI’s [`websockets_api_example.py`](https://github.com/comfyanonymous/ComfyUI/blob/master/websockets_api_example.py), so `[Scene …] HISTORY WARNING/ERROR` lines can reference `maxWait`, `attemptLimit`, and `postExecution` exit reasons that the queue poller emits.
- Telemetry enforcement moved into `scripts/validate-run-summary.ps1`, the Vitest harness in `scripts/run-vitests.ps1`, and the TypeScript test at `scripts/__tests__/validateRunSummary.test.ts`; they all expect `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, GPU name, and VRAM before/after plus the literal `pollLimit` token inside `[Scene …] Telemetry` lines, so missing GPU telemetry or fallback notes now fail the run before archiving.
- The Artifact Snapshot + Timeline views consume the new metadata (`QueueConfig`, per-scene `HistoryConfig`, `Telemetry`, warnings, and archive links) so history issues, GPU/VRAM delta, fallback notes, and archive references are visible without opening raw JSON.

---

## A. Story Generation & Scene Assets

1. **Source of truth:** There is no CLI wrapper for the existing story services, so we will add `scripts/generate-story-scenes.ts`. It will:
   - Stub a cinematic story (logline, director vision, scene summaries) using deterministic sample data.
   - Emit `story.json` plus `scene-###.json` files into `logs/<ts>/story/`.
   - Copy or synthesize keyframe PNGs per scene (initially by duplicating `sample_frame_start.png`) and record their paths.
2. **Invocation:** `scripts/run-comfyui-e2e.ps1` will call:
   ```powershell
   node --loader ts-node/esm .\scripts\generate-story-scenes.ts --output "$RunDir\story" --scenes 3 --sampleKeyframe "$ProjectRoot\sample_frame_start.png"
   ```
   The generator will print a short summary and exit non-zero if it fails to write `story/story.json`.
3. **Logging:** Each generated scene entry will include `{ id, title, prompt, summary, keyframePath }`. The helper copies those JSON snippets into `run-summary.txt` under a `## Story` section for traceability.

4. **Local LLM contract:** When operators pass `--useLocalLLM` (or set `LOCAL_STORY_PROVIDER_URL`), the generator now issues an OpenAI-style chat request to the LM Studio endpoint defined by `LOCAL_STORY_PROVIDER_URL`/`LOCAL_LLM_MODEL`. The loader honors `LOCAL_LLM_REQUEST_FORMAT=openai-chat`, `LOCAL_LLM_TEMPERATURE`, `LOCAL_LLM_TIMEOUT_MS` (set to 120 000ms for the 7B model), and `LOCAL_LLM_SEED` so story IDs/loglines/prompts inherit the local model’s output. Failures are logged as `[Story] WARNING …` and the deterministic fallback scenes are reused automatically.

## B. Prompt/Keyframe Injection into ComfyUI

1. **Workflow placeholders:** Update `workflows/text-to-video.json` so:
   - `LoadImage.inputs.image` and `widgets_values[0]` use `__KEYFRAME_IMAGE__`.
   - `SaveImage.inputs.filename_prefix` uses `__SCENE_PREFIX__`.
   - `_meta.scene_prompt` / `_meta.negative_prompt` store `__SCENE_PROMPT__` / `__NEGATIVE_PROMPT__`.
   - Add a `Note` node capturing `__SCENE_PROMPT__` for UI visibility (optional but harmless).
2. **Patch step:** `scripts/queue-real-workflow.ps1` will load the template via `ConvertFrom-Json`, mutate those fields per scene, then `ConvertTo-Json -Depth 10` before POSTing. Pseudo-code:
   ```powershell
   $workflow = Get-Content $WorkflowPath -Raw | ConvertFrom-Json
   $workflow.'2'.inputs.image = $keyframeName
   $workflow.'7'.inputs.filename_prefix = $scenePrefix
   $workflow.'7'._meta.scene_prompt = $Prompt
   $workflow.'8'.widgets_values[0] = $Prompt  # Note node
   $payload = @{ prompt = $workflow; client_id = "scene-$SceneId-$guid" }
   Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method POST -Body ($payload | ConvertTo-Json -Depth 10)
   ```
3. **Keyframe handling:** Each run copies the scene’s keyframe into `C:\ComfyUI\...\input\scene-###-keyframe.png` before patching the workflow. This guarantees ComfyUI resolves the relative `LoadImage` path.

## C. Looping Over Scenes (`run-comfyui-e2e.ps1`)

1. **Sequence:**
   1. Initialize run directory + summary.
   2. Generate story assets (`story/` folder) and log them.
   3. Start ComfyUI, ensure readiness.
   4. For each scene in `story.json`:
      - Create `logs/<ts>/<sceneId>/`.
      - Copy the scene JSON & keyframe into that folder.
      - Call `queue-real-workflow.ps1 -SceneId ... -Prompt ... -KeyframePath ... -SceneOutputDir ...`.
      - Capture result object, log `frames`, `duration`, `errors`.
      - Copy ComfyUI PNGs into `<sceneId>/generated-frames`.
      - Append run-summary lines: `[Scene scene-001] frames=25, prefix=gemdirect1_scene-001`.
   5. After all scenes, run Vitest suites (already implemented steps 5–6).
   6. Archive `logs/<ts>` (which now contains `story/`, per-scene folders, Vitest logs).
2. **Success criteria:** Scene succeeds if `FrameCount >= 1`, REST calls return 2xx, and queue history responds without errors. Add optional warning if `<25` frames.
3. **Failure handling + retries:** Each scene invocation is wrapped in `try/catch`, the helper enforces Node ≥ 22.19.0 up front, and the history poller now keeps retrying until `MaxWaitSeconds` (set `MaxAttemptCount` to >0 if you need a hard cap). Auto requeues still trigger when there are no frames, the frame floor is missed, or history polling ultimately fails. Every attempt prints `[Scene <id>][Attempt <n>] …` plus the matching `[Scene …] HISTORY WARNING/ERROR`/`WARNING: Frame count below floor` lines so `scripts/validate-run-summary.ps1` can assert that degraded scenes were documented. Aggregated failure flags remain in place (最终 exit > 0 if any scene still fails after the retry budget) so CI/agents can bail quickly.

## D. Artifact Enrichment

1. Each run now gathers metadata (story logline, prompts, director vision, per-scene frame counts, frame floors, warnings/errors, history poll timelines, requeue summaries, Vitest logs, archive path) into `logs/<ts>/artifact-metadata.json` and mirrors the same payload to `public/artifacts/latest-run.json`. The React Artifact Snapshot panel reads that file so reviewers can inspect prompts, keyframes, attempt counts, and vitest log paths without opening Explorer.

2. **Directory structure:**
   ```
   logs/<ts>/
     run-summary.txt
     artifact-metadata.json
     vitest-results.json
     story/
       story.json
       scenes/scene-001.json
       keyframes/scene-001.png
     scene-001/
       scene.json
       keyframe.png
       generated-frames/*.png
       history.json
     vitest-comfyui.log
     vitest-e2e.log
     vitest-scripts.log
   ```
3. **Zip contents:** `artifacts/comfyui-e2e-<ts>.zip` already mirrors `logs/<ts>`, so containing story assets now automatically enriches the archive.
4. **Summary line items:** After Vitest, append a “## Artifact Index” block inside `run-summary.txt` enumerating:
   - Story file path
   - Each scene folder with frame count & frame destination
   - Vitest comfyUI/e2e/scripts logs + `vitest-results.json`
   - Zip path

## E. Documentation & Meta-Docs

1. **README.md:** Expand “Automated ComfyUI E2E” to describe the story generator step, per-scene looping, keyframe copying, and validation commands.
2. **E2E_TEST_FIX_COMPLETE.md:** Update Executive Summary + Validation Output with the new multi-scene evidence (story folder, frame copies, zips).
3. **NEXT_SESSION_ACTION_PLAN.md:** Replace the quick-start list with instructions that emphasize inspecting `story/` assets, per-scene folders, and run-summary sections. Include follow-ups for improving story realism.
4. **WORKFLOW_FIX_GUIDE.md & HANDOFF_SESSION_NOTES.md:** Add sections documenting the placeholder-enabled workflow, queue-script parameterization, and new validation checklist.
5. **Executive summary / meta docs:** Introduce a short “Story-to-Video pipeline overview” plus a validation checklist for future agents (mirrors Section F below).

## F. QA & Testing Plan

1. **Manual prep:**
   - Run `node --loader ts-node/esm scripts/generate-story-scenes.ts --dryRun` to preview outputs (optional).
   - Confirm `story.json` exists and keyframe files are placed under `logs/<ts>/story/keyframes/`.
2. **Automated helper run:**
   - `powershell -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-comfyui-e2e.ps1`
   - Validate console lines: `Scene scene-001 => FrameCount: ###`, `Vitest ... completed`.
3. **Post-run inspection:**
   - Ensure each `scene-###/generated-frames` folder contains PNGs and that `history.json` exists even when history polling warned/retried.
   - Confirm `logs/<ts>/story/story.json` references the same scene IDs and keyframe paths found on disk.
   - Check `vitest-comfyui.log`, `vitest-e2e.log`, `vitest-scripts.log`, and `vitest-results.json` for failures; the helper writes their absolute paths into `## Artifact Index`.
   - Verify `artifacts/comfyui-e2e-<ts>.zip` mirrors the entire `logs/<ts>` directory (story folder, scene folders, vitest logs, artifact metadata).
   - Open the Artifact Snapshot panel (or `public/artifacts/latest-run.json`) and ensure it reports story metadata, prompts, history poll timelines, warnings, requeue counts, and Vitest logs that match what you observed on disk.
   - Re-run `scripts/validate-run-summary.ps1 -RunDir logs/<ts>` if you edit the summary manually; the validator now enforces `[Scene …] HISTORY WARNING/ERROR` and `WARNING: Frame count below floor` entries whenever the artifact metadata marks history failures or low frame counts.
4. **Failure triage guidance:** Document in README:
   - If frame count < 25, flag run as degraded. The helper already retries once automatically, so add context in `run-summary.txt` about why the second attempt still failed.
   - If REST errors occur, collect `history/<prompt_id>` response and attach to the run summary; the helper now lists each error inside `HistoryPollLog`/`HistoryErrors` for the Artifact Snapshot.
   - If keyframes missing, rerun generator or point to `sample_frame_start.png` so the next attempt can continue.
5. **Risk mitigations:** list prongs (missing keyframes, checkpoint mismatch, REST timeouts) plus the detection logic we’ll add (non-zero frame check, story JSON presence check).

---

This plan will be reflected in the updated helper, workflow, docs, and testing artefacts delivered in this session.

## G. Telemetry & Queue Policy Requirements
1. **LM Studio health probe**: `scripts/run-comfyui-e2e.ps1` now hits LM Studio's `/v1/models` health check before ComfyUI launches, records the result in `run-summary.txt` and `artifact-metadata.json`, and lets you override the target via `LOCAL_LLM_HEALTHCHECK_URL` or skip the probe entirely with `LOCAL_LLM_SKIP_HEALTHCHECK=1` so intentionally proxied hosts can still be used. This early probe saves time by failing before the heavy workflow starts when the story LLM is unresponsive, and any override/fallback note becomes a warning for downstream reviewers to replay the assumption in their next attempt.[lm-health]
2. **Queue knobs & metadata surfaces**: Every knob (`SceneMaxWaitSeconds`, `SceneHistoryPollIntervalSeconds`, `SceneHistoryMaxAttempts`, `ScenePostExecutionTimeoutSeconds`, `SceneRetryBudget`, and their `SCENE_*` env equivalents) is resolved from CLI flags/env vars, written into `QueueConfig` and the per-scene `HistoryConfig` inside `artifact-metadata.json`, mirrored to `public/artifacts/latest-run.json`, and re-rendered inside the React Artifact Snapshot policy card and per-scene timeline banners so each run advertises how aggressively the poller, retry, and post-exec timers were configured.
3. **Telemetry enforcement policy**: Every scene is expected to publish `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, `pollLimit` (text vs metadata value must match), `HistoryExitReason` (maxWait/attemptLimit/postExecution/success), `ExecutionSuccessDetected`, `ExecutionSuccessAt`, `PostExecutionTimeoutSeconds` (with `postExecTimeoutReached`), GPU `Name`, `VRAMBeforeMB`, `VRAMAfterMB`, `VRAMDeltaMB`, plus fallback notes (e.g., `/system_stats` failure or `nvidia-smi` fallback). These telemetry fields are validated by `scripts/validate-run-summary.ps1`, the Vitest harness, and the UI so any missing GPU info, mismatched poll limit, or absent telemetry line halts the archive. The success signal comes from ComfyUI's `/history` sequence (`execution_success`, `status_str`, `exitReason`), so paging through history behaves the same as the official [`websocket_api_example.py`][comfy-history] while honoring the configured poll budgets.
4. **Artifact snapshot expectations**: The Artifact Snapshot/Timeline view must present the queue policy card, telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, `pollLimit`, `HistoryExitReason`, `postExec` timeout flag, `ExecutionSuccessAt`), poll log counts, GPU info (name + VRAM delta) with fallback warnings, archive links (Vitest logs and `artifacts/comfyui-e2e-<ts>.zip`), and LLM metadata (provider, model, request format, seed, duration, errors). `HistoryPollLog`, `HistoryErrors`, `SceneRetryBudget`, and `QueueConfig` values in the metadata keep the UI, run summary, and archive aligned so every warning or fallback note surfaces as a badge or log line in the viewer.

-5. **Docs-first guardrail**: Before touching scripts, validators, or UI, read the required meta docs (README.md, DOCUMENTATION_INDEX_20251111.md’s “Required Telemetry & Queue Policy Orientation,” STORY_TO_VIDEO_TEST_CHECKLIST.md, WORKFLOW_FIX_GUIDE.md, HANDOFF_SESSION_NOTES.md, QUICK_START_E2E_TODAY.md, REFERENCE_CARD_QUICK.md, WINDOWS_AGENT_TEST_ITERATION_PLAN.md, and notes/codex-agent-notes-20251111.md) so the LM Studio health check, queue knobs, telemetry enforcement, and artifact expectations are top of mind.
-6. **UI metadata handshake**: Artifact Snapshot/Timeline panels mirror logs/<ts>/artifact-metadata.json and public/artifacts/latest-run.json, so queue policy cards, telemetry badges, GPU stats, fallback warnings, archive links, and LLM metadata in the UI must always match what the helper logs and what the validator enforces.

[lm-health]: https://lmstudio.ai/docs/api#health-checks
[comfy-history]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
