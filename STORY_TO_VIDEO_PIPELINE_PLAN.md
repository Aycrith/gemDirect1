# Story ➜ ComfyUI Automation Plan

_Last updated: 2025-11-11_

This plan maps the next-phase implementation work needed to connect the gemDirect1 story generator to the ComfyUI Stable Video Diffusion (SVD) workflow so the entire e2e helper can run unattended. The scope aligns with the user request (Sections A-F).

## Resolved Issues
- Aligned the SVD pipeline with the ComfyUI_examples `workflow_image_to_video.json` flow (ImageOnlyCheckpointLoader   VideoLinearCFGGuidance   SVD_img2vid_Conditioning   KSampler   VAEDecode   SaveImage), so the checkpoint receives the expected embeddings and conditioning inputs.
- `scripts/queue-real-workflow.ps1` now copies each scene keyframe into `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input`, patches `__KEYFRAME_IMAGE__`, `__SCENE_PREFIX__`, and `_meta.{scene_prompt,negative_prompt}`, prunes stale frames, saves `history.json`, and returns per-scene metrics for logging.
- `scripts/run-comfyui-e2e.ps1` orchestrates story creation, ComfyUI startup/polling, the scene loop, Vitest suites, warning detection for frame-floor breaches, and zips the entire `logs/<ts>` directory while writing a structured `run-summary.txt`.
- Local LLM prompts are now first-class: whenever `LOCAL_STORY_PROVIDER_URL` is set the generator records provider URL, seed, duration, and fallback warnings and threads moods/expected frame floors through story JSON, run summaries, artifact metadata, and the UI.
- Per-scene telemetry (GPU model, VRAM deltas, poll cadence, runtime) is emitted by `queue-real-workflow.ps1`, enforced by `validate-run-summary.ps1`, and rendered in both the Artifact Snapshot and Timeline Editor for quick triage.

## Known Gaps
- The story generator is still deterministic and detached from the Gemini/story-service backend, so story IDs, loglines, and prompts are not driven by real creative data yet.
- Auto retries + `[Scene …] HISTORY WARNING` logging now surface REST or history issues, but we still need a follow-on workflow to escalate repeat failures or to notify the helper operator when a scene exceeds the retry budget.
- Artifact metadata now lists prompts, warnings, requeue timelines, and Vitest logs, yet the rest of the UI (timeline, history explorer) is not consuming that metadata; future work should feed those contexts into additional panels beyond the Artifact Snapshot.
- Unit tests now cover the story generator + workflow patcher helpers, but there is still no coverage for the ComfyUI REST client/service glue that orchestrates retries and metadata writes.

## Lessons Learned
- Placeholder patching is reliable, so we can keep the workflow JSON static while `queue-real-workflow.ps1` injects context (keyframes, prompts, prefixes) immediately before posting.
- Vitest suites need `--pool=vmThreads` on Windows to avoid fork/thread timeouts; always capture their exit codes via redirected log files.
- Standardizing `run-summary.txt` (with `## Story`, per-scene lines, warnings, and a `## Artifact Index`) plus archiving the entire `logs/<ts>` tree keeps each run auditable for later agents.

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

