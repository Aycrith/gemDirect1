# Story ➜ Video Testing Checklist

_Last updated: 2025-11-11_

Use this checklist whenever you validate a ComfyUI run triggered by `scripts/run-comfyui-e2e.ps1`. It captures the expected artifacts, logging format, and failure triage steps for the new story-driven pipeline referenced in `README.md`, `E2E_TEST_FIX_COMPLETE.md`, and `STORY_TO_VIDEO_PIPELINE_PLAN.md`.

---

## 1. Pre-run sanity checks

1. **Docs first**: Re-read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and the Automated ComfyUI E2E section in `README.md`. They summarize the story stub, placeholders, and helper flow (aligned with the [ComfyUI_examples SVD workflow](https://github.com/comfyanonymous/ComfyUI_examples/blob/master/video/workflow_image_to_video.json) and SVD guidance from [ComfyUI-Stable-Video-Diffusion](https://github.com/thecooltechguy/ComfyUI-Stable-Video-Diffusion) / [ComfyUI Txt2Video SVD on Civitai](https://civitai.com/models/211703/comfyui-txt2video-with-svd)).
2. **Models installed**: Verify `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt*.safetensors` exists.
3. **Clean slate**: Close stray `node`, `npm`, `python`, or ComfyUI processes.

## 2. Execute the helper

```powershell
cd C:\Dev\gemDirect1
powershell -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-comfyui-e2e.ps1
```

Watch the console for:

Note: There is a small helper to run the Vitest suites and capture logs locally:

```powershell
# Run the two Vitest suites and capture logs under logs/<ts>/
powershell -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-vitests.ps1
```

`run-comfyui-e2e.ps1` will also call this helper automatically for Steps 6/7 and write the Vitest logs into the current run directory.

## 3. Post-run inspection

1. **Story assets**
   - Open `logs/<ts>/story/story.json` and confirm it lists the same scene IDs that appear later in the run summary.
   - Check `story/scenes/scene-###.json` + `story/keyframes/scene-###.png` for each scene.
2. **Scene folders**
   - Ensure every `logs/<ts>/<sceneId>/` folder contains:
     - `scene.json`
     - `keyframe.png`
     - `history.json`
     - `generated-frames/*.png` (one folder per scene)
   - Frame counts must match the `[Scene ...] Frames=##` line in `run-summary.txt`.
3. **Vitest logs**
   - Review `logs/<ts>/vitest-comfyui.log` and `logs/<ts>/vitest-e2e.log`. Exit codes are recorded in `run-summary.txt`; repro failures before handoff.
4. **Archive**
   - Confirm `artifacts/comfyui-e2e-<ts>.zip` exists and contains the entire `logs/<ts>` folder (story, scenes, frames, Vitest logs).

## 4. Failure triage

- **Scene failure**: If the queue script throws or returns `FrameCount = 0`, keep the `logs/<ts>` folder as evidence, fix the root cause (workflow mismatch, missing checkpoint, REST error), then rerun. Note the failing scene in `run-summary.txt`.
- **Low frame count (<25)**: Treat as degraded. Either adjust parameters/retry the scene or document the reason (e.g., GPU exhaustion) in the summary before handing off.
- **Vitest failures**: Re-run the failing suite with the command printed in `README.md`; attach logs to the run summary.
- **Missing story assets**: Re-run `scripts/generate-story-scenes.ts` manually to regenerate `story/` and copy the results into the run folder before retrying the helper.

## 5. Run-summary template

Before you run `scripts/run-comfyui-e2e.ps1`, make sure you’ve read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and `STORY_TO_VIDEO_TEST_CHECKLIST.md`; use the template below as the structure that `Add-RunSummary` already writes automatically.

```
E2E Story-to-Video Run: <timestamp>
[HH:MM:SS] Story ready: <storyId> (scenes=<n>)
[HH:MM:SS] Director's vision: <text>
[HH:MM:SS] Story logline: <text>
[HH:MM:SS] [Scene scene-001] Frames=60 Duration=84s Prefix=gemdirect1_scene-001
[HH:MM:SS] [Scene scene-002] WARNING: Frame count below floor (23/25)
...
[HH:MM:SS] Step 6: Vitest comfyUI suite completed in 1.4s (code 0)
[HH:MM:SS] Step 7: Vitest e2e suite completed in 1.5s (code 0)
## Artifact Index
Story folder: C:\Dev\gemDirect1\logs\<ts>\story
Scenes captured: <n>
Total frames copied: <sum>
Vitest comfyUI log: <path>
Vitest e2e log: <path>
Archive: C:\Dev\gemDirect1\artifacts\comfyui-e2e-<ts>.zip
```

Use the checklist below to verify each section:
- Story lines must mirror `logs/<ts>/story/story.json` (ID, logline, director vision) so later agents can trace which prompts generated these frames.
- Each `[Scene ...]` line should report frames, duration, prefix, and inline warnings/errors for short runs or REST failures.
- Step 6/7 entries must mention the Vitest suite name, runtime, and exit code; the referenced log files live under `logs/<ts>/vitest-*.log`.
- `## Artifact Index` must enumerate the story folder path, captured scene count, total frames, Vitest log paths, and the zipped archive path. Confirm `artifacts/comfyui-e2e-<ts>.zip` contains the entire `logs/<ts>` tree, including per-scene `history.json` and `generated-frames`.
- If you diverge from this format, note the deviation in the log so downstream agents can still parse the run summary.

Add warning/error lines exactly where issues occur (scene failure, Vitest timeout, etc.) so each run remains auditable.

---

By following this checklist you ensure every run is auditable: prompts map to frames, frames map to archives, and the log records enough context for the next person to continue without redoing your investigation.
