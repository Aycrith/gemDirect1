# ?? Next Session Action Plan

**Updated**: November 11, 2025  
**For**: The next development agent who picks up gemDirect1  
**Estimated Duration**: 20–90 min (verification-first, optional rerun)

---

**Heads up**: before editing any scripts, re-read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and `STORY_TO_VIDEO_TEST_CHECKLIST.md` so you understand the story → keyframe → ComfyUI loop and the required `run-summary.txt` template that drives the artifact index.

## ? Quick Start (First 5 Minutes)

### 1. Review the latest log bundle
- Open `logs/<timestamp>/run-summary.txt`. Confirm it has three sections:
  1. `## Story` (story ID, director vision, scene count)
  2. Per-scene lines like `[Scene scene-001] Frames=60 Duration=84s Prefix=gemdirect1_scene-001`
  3. `## Artifact Index` listing the story folder, Vitest logs, and zip path.
- Inspect `logs/<timestamp>/story/story.json` plus `story/scenes/*.json` and `story/keyframes/*.png`. These must line up with the folders under `logs/<timestamp>/<sceneId>/`.
- Spot-check each `logs/<timestamp>/<sceneId>/generated-frames` directory and confirm the PNG counts match the summary lines.
- Verify `artifacts/comfyui-e2e-<timestamp>.zip` contains the entire structure above before trusting a run.

### 2. Read the references
- Skim `STORY_TO_VIDEO_PIPELINE_PLAN.md` for the architectural rationale and citations (ComfyUI_examples, Civitai SVD reference workflows, etc.).
- Use `README.md` (Automated ComfyUI E2E section) and `STORY_TO_VIDEO_TEST_CHECKLIST.md` as your canonical “how to rerun + validate” guides.
- Keep `E2E_TEST_FIX_COMPLETE.md` handy—it now documents the story ➜ ComfyUI loop.

### 3. Ready the environment
- When you rerun the helper, always start from the repo root:
  ```powershell
  cd C:\Dev\gemDirect1
  powershell -NoLogo -ExecutionPolicy Bypass -File ".\scripts\run-comfyui-e2e.ps1"
  ```
- Watch for `[Scene ...] Frames=##` logs. The helper continues even if a scene fails but exits with `1` in that case.
- If you need to debug a specific scene, re-run with the same `story/story.json` by copying it into a fresh run directory or by wiring your own prompts into `queue-real-workflow.ps1`.

---

## ?? Priority-Based Task List

### ? BLOCKING — Verify the story ➜ video artifact

**Task**: Treat the latest `logs/<timestamp>` as evidence only after it passes the checklist  
**Status**: Fresh run recommended per milestone  
**Steps**:
1. Follow `STORY_TO_VIDEO_TEST_CHECKLIST.md` verbatim (story folder → scene folders → frames → Vitest logs → zip).
2. Confirm every scene copied ≥1 frame and that warnings for `<25` frames are recorded in `run-summary.txt`.
3. Preserve any failure directories; do **not** delete them before the next agent inspects them.

### ?? SECONDARY - Near-term improvements

- **Story generator integration**: Swap the deterministic stub in `scripts/generate-story-scenes.ts` for the Gemini-backed story service, persist real loglines/keyframes, and funnel that metadata into `run-summary.txt`/`story/story.json`.
- **Tests**: Add Vitest coverage for the placeholder patching (`queue-real-workflow.ps1` behavior is mirrored in `services/comfyUIService.ts`).
- **UI Surfacing**: Surface `story/story.json`, per-scene `history.json`, and `generated-frames` previews in the React UI while honoring the `run-summary.txt` artifact index so the web app can replay the helper output without filesystem dives.
- **Docs**: Keep `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, and this plan synchronized whenever workflow placeholders or helper behavior changes.

### ?? TERTIARY — Nice to have

- Generate a `frame-validation.json` per scene (min/max timestamps, total file size) inside `run-comfyui-e2e.ps1` and fail if two consecutive scenes drop below the frame floor.
- Experiment with alternate SVD prompt mappings (e.g., [ComfyUI Txt2Video with SVD](https://civitai.com/models/211703/comfyui-txt2video-with-svd)) once the base pipeline is rock-solid.

---

## ?? Status Dashboard

### What's Working ?
- `scripts/generate-story-scenes.ts` + `scripts/queue-real-workflow.ps1` + `scripts/run-comfyui-e2e.ps1` now automate the full story ➜ keyframe ➜ ComfyUI loop.
- `workflows/text-to-video.json` uses placeholders (`__KEYFRAME_IMAGE__`, `__SCENE_PREFIX__`, metadata prompts) so we can inject scene data without editing JSON manually.
- Both Vitest suites run after every helper invocation; their logs (with exit codes) land under `logs/<ts>/`.

### What Needs Testing ??
- Additional Vitest/unit coverage for the workflow mapping + story generator.
- UI playback of generated frames (pulling from `history.json` + `generated-frames`) once `final_output` surfaces.
- Model/regression testing when new checkpoints are dropped into `ComfyUI\models\checkpoints\SVD\`.

### Known blockers ?
- Optional ComfyUI nodes (VHS, Copilot, etc.) remain disabled until validated.
- The helper warns (but does not fail) if a scene produces <25 frames—treat those runs as degraded until acknowledged.

---

## ?? Key Files Reference

### Documentation
- `README.md` — Local run instructions + Automated ComfyUI E2E (story-first flow).
- `STORY_TO_VIDEO_PIPELINE_PLAN.md` — Actionable plan + references to ComfyUI_examples and community workflows.
- `STORY_TO_VIDEO_TEST_CHECKLIST.md` — Step-by-step validation checklist + run-summary template.
- `E2E_TEST_FIX_COMPLETE.md` — Narrative of the fixes and validation evidence.
- `HANDOFF_SESSION_NOTES.md` — Historical context; now includes the story ➜ video pipeline summary.

### Core Automation
- `scripts/generate-story-scenes.ts` — Story stub (logline, prompts, per-scene keyframes).
- `workflows/text-to-video.json` — Placeholder-enabled SVD workflow (ImageOnlyCheckpointLoader ➜ SVD_img2vid ➜ SaveImage).
- `scripts/queue-real-workflow.ps1` — Scene-aware workflow patching + frame copying.
- `scripts/run-comfyui-e2e.ps1` — Orchestrates story generation, ComfyUI lifecycle, Vitest runs, and artifact archival.
- `services/comfyUIService.ts` — Programmatic integration (watch this if you add more automation/tests).

---

## ?? Git/Commit Considerations

- `scripts/run-comfyui-e2e.ps1`, `scripts/queue-real-workflow.ps1`, and `workflows/text-to-video.json` now work as a set. Update them together and mention the trio in commit messages.
- If you tweak the workflow placeholders or add prompts, update `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `WORKFLOW_FIX_GUIDE.md`, this plan, and `README.md` in the same commit.
- When you produce a new artifact, note the timestamp in `NEXT_SESSION_ACTION_PLAN.md` so the next agent knows which log bundle to open first.
