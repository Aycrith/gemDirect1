# Story ➜ ComfyUI Automation Plan

_Last updated: 2025-11-11_

This plan maps the next-phase implementation work needed to connect the gemDirect1 story generator to the ComfyUI Stable Video Diffusion (SVD) workflow so the entire e2e helper can run unattended. The scope aligns with the user request (Sections A-F).

## Resolved Issues
- Aligned the SVD pipeline with the ComfyUI_examples `workflow_image_to_video.json` flow (ImageOnlyCheckpointLoader → VideoLinearCFGGuidance → SVD_img2vid_Conditioning → KSampler → VAEDecode → SaveImage), so the checkpoint receives the expected embeddings and conditioning inputs.
- `scripts/queue-real-workflow.ps1` now copies each scene keyframe into `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input`, patches `__KEYFRAME_IMAGE__`, `__SCENE_PREFIX__`, and `_meta.{scene_prompt,negative_prompt}`, prunes stale frames, saves `history.json`, and returns per-scene metrics for logging.
- `scripts/run-comfyui-e2e.ps1` orchestrates story creation, ComfyUI startup/polling, the scene loop, Vitest suites, warning detection for frame-floor breaches, and zips the entire `logs/<ts>` directory while writing a structured `run-summary.txt`.

## Known Gaps
- The story generator is still deterministic and detached from the Gemini/story-service backend, so story IDs, loglines, and prompts are not driven by real creative data yet.
- Failure handling treats fewer than 25 frames as a warning, but REST errors, ComfyUI timeouts, and missing keyframes still only surface via logs rather than metadata or retries.
- Artifact enrichment is incomplete: per-scene `history.json`, prompt metadata, and frame-set provenance are not surfaced to the UI/docs even though the archive contains the files.
- Test coverage does not exercise the placeholder patching logic or story generator output, leaving the scripts vulnerable to future workflow changes.

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
3. **Failure handling:** Wrap each scene invocation in `try/catch`. On failure:
   - Log `[Scene scene-002] ERROR: <message>` in `run-summary.txt`.
   - Continue to the next scene (so archive still includes partial data).
   - Surface an aggregated failure flag before zipping (non-zero exit at the very end if any scene failed).

## D. Artifact Enrichment

1. **Directory structure:**
   ```
   logs/<ts>/
     run-summary.txt
     story/
       story.json
       scenes/scene-001.json
       keyframes/scene-001.png
     scene-001/
       scene.json
       keyframe.png
       generated-frames/*.png
       history.json (optional future)
     vitest-comfyui.log
     vitest-e2e.log
   ```
2. **Zip contents:** `artifacts/comfyui-e2e-<ts>.zip` already mirrors `logs/<ts>`, so containing story assets now automatically enriches the archive.
3. **Summary line items:** After Vitest, append a “## Artifact Index” block inside `run-summary.txt` enumerating:
   - Story file path
   - Each scene folder with frame count & frame destination
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
   - Ensure each `scene-###/generated-frames` folder contains PNGs.
   - Confirm `logs/<ts>/story/story.json` references the same scene IDs and keyframe paths found on disk.
   - Check `vitest-*.log` for failures.
   - Verify `artifacts/comfyui-e2e-<ts>.zip` includes `story/` and per-scene directories.
4. **Failure triage guidance:** Document in README:
   - If frame count < 25, flag run as degraded, re-queue scene.
   - If REST errors occur, collect `history/<prompt_id>` response and attach to run summary.
   - If keyframes missing, rerun generator or point to `sample_frame_start.png`.
5. **Risk mitigations:** list prongs (missing keyframes, checkpoint mismatch, REST timeouts) plus the detection logic we’ll add (non-zero frame check, story JSON presence check).

---

This plan will be reflected in the updated helper, workflow, docs, and testing artefacts delivered in this session.
