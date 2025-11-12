# Story ➜ Video Testing Checklist

_Last updated: 2025-11-11_

Use this checklist whenever you validate a ComfyUI run triggered by `scripts/run-comfyui-e2e.ps1`. It captures the expected artifacts, logging format, and failure triage steps for the new story-driven pipeline referenced in `README.md`, `E2E_TEST_FIX_COMPLETE.md`, and `STORY_TO_VIDEO_PIPELINE_PLAN.md`.

---

## 1. Pre-run sanity checks

1. **Docs first**: Re-read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and the Automated ComfyUI E2E section in `README.md`. They summarize the story stub, placeholders, and helper flow (aligned with the [ComfyUI_examples SVD workflow](https://github.com/comfyanonymous/ComfyUI_examples/blob/master/video/workflow_image_to_video.json) and SVD guidance from [ComfyUI-Stable-Video-Diffusion](https://github.com/thecooltechguy/ComfyUI-Stable-Video-Diffusion) / [ComfyUI Txt2Video SVD on Civitai](https://civitai.com/models/211703/comfyui-txt2video-with-svd)).
2. **Node.js version**: Run `node -v` and ensure it reports **v22.19.0 or newer**. The helper scripts now enforce this requirement and will exit early if an older runtime is detected.
2. **Models installed**: Verify `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt*.safetensors` exists.
3. **Clean slate**: Close stray `node`, `npm`, `python`, or ComfyUI processes.
4. **Optional story generator**: If you want cinematic prompts from your own Gemini/local LLM, set `LOCAL_STORY_PROVIDER_URL` and run `scripts/generate-story-scenes.ts --useLocalLLM` before invoking `run-comfyui-e2e.ps1`. The env var can also be set through `.env.local` for repeated runs.

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
  - Frame counts must match the `[Scene ...][Attempt ...] Frames=##` line in `run-summary.txt`. When the helper retries a scene you should see multiple attempts, warnings, and requeue lines.
3. **Vitest logs**
   - Review `logs/<ts>/vitest-comfyui.log`, `logs/<ts>/vitest-e2e.log`, `logs/<ts>/vitest-scripts.log`, and `logs/<ts>/vitest-results.json`. Exit codes are recorded in `run-summary.txt`; repro failures before handoff.
4. **Artifact snapshot + archive**
   - Confirm `artifacts/comfyui-e2e-<ts>.zip` exists and contains the entire `logs/<ts>` folder (story, scenes, frames, Vitest logs, `artifact-metadata.json`, `vitest-results.json`).
   - Open the Artifact Snapshot panel (or `public/artifacts/latest-run.json`) and verify it reports the same story metadata, prompts, frame floors, warnings, `HistoryPollLog` entries, Vitest log locations, and archive path as the files you inspected.

## 4. Failure triage

- **Scene failure**: If the queue script throws or returns `FrameCount = 0`, the helper will requeue once automatically and stamp `[Scene ...] ERROR: No frames copied` plus `[Scene ...] HISTORY WARNING`. Keep the `logs/<ts>` folder as evidence, fix the root cause (workflow mismatch, missing checkpoint, REST error), then rerun if the second attempt also fails.
- **Low frame count (<25)**: Treat as degraded. Either adjust parameters/retry the scene (the auto retry will already consume one attempt) or document the reason (e.g., GPU exhaustion) in the summary before handing off.
- **Vitest failures**: Re-run the failing suite with the command printed in `README.md`/`scripts/run-vitests.ps1`; attach `vitest-*.log` plus `vitest-results.json` to the run summary.
- **History warnings**: Use the Artifact Snapshot panel or `HistoryPollLog` array in `artifact-metadata.json` to see each attempt, timestamp, and REST error. Mirror the same detail into `[Scene ...] HISTORY WARNING/ERROR` lines so the validator and next agent can follow the trail.
- **Missing story assets**: Re-run `scripts/generate-story-scenes.ts` manually to regenerate `story/` and copy the results into the run folder before retrying the helper.

## 5. Run-summary template

Before you run `scripts/run-comfyui-e2e.ps1`, make sure you’ve read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and `STORY_TO_VIDEO_TEST_CHECKLIST.md`; use the template below as the structure that `Add-RunSummary` already writes automatically.

```
E2E Story-to-Video Run: <timestamp>
[HH:MM:SS] Story ready: <storyId> (scenes=<n>)
[HH:MM:SS] Director's vision: <text>
[HH:MM:SS] Story logline: <text>
[HH:MM:SS] Story LLM status: <status/provider/seed/duration>
[HH:MM:SS] [Scene scene-001][Attempt 1] Frames=60 Duration=84s Prefix=gemdirect1_scene-001
[HH:MM:SS] [Scene scene-001] Telemetry: duration=84s | maxWait=600s | historyAttempts=45 | gpu=RTX 4090 vram=10.2GB/9.8GB
[HH:MM:SS] [Scene scene-001] HISTORY WARNING: <details> (attempts=3)
[HH:MM:SS] [Scene scene-002] WARNING: Frame count below floor (23/25)
...
[HH:MM:SS] Step 6: Vitest comfyUI suite completed in 1.4s (code 0)
[HH:MM:SS] Step 7: Vitest e2e suite completed in 1.5s (code 0)
[HH:MM:SS] Step 8: Vitest scripts suite completed in 0.4s (code 0)
## Artifact Index
Story folder: C:\Dev\gemDirect1\logs\<ts>\story
Scenes captured: <n>
Total frames copied: <sum>
Vitest comfyUI log: <path>
Vitest e2e log: <path>
Vitest scripts log: <path>
Vitest results json: <path>
Archive: C:\Dev\gemDirect1\artifacts\comfyui-e2e-<ts>.zip
```

Use the checklist below to verify each section:
- Story lines must mirror `logs/<ts>/story/story.json` (ID, logline, director vision) so later agents can trace which prompts generated these frames.
- Each `[Scene ...][Attempt ...]` line should report frames, duration, prefix, and inline warnings/errors for short runs or REST failures. If history polling failed or the helper retried, you must also see `[Scene ...] HISTORY WARNING/ERROR` and `Requeue requested` lines.
- Step 6/7/8 entries must mention the Vitest suite name, runtime, and exit code; the referenced log files live under `logs/<ts>/vitest-*.log`.
- `## Artifact Index` must enumerate the story folder path, captured scene count, total frames, Vitest log paths (`comfyUI`, `e2e`, `scripts`), `vitest-results.json`, and the zipped archive path. Confirm `artifacts/comfyui-e2e-<ts>.zip` contains the entire `logs/<ts>` tree, including per-scene `history.json` and `generated-frames`.
- If you diverge from this format, note the deviation in the log so downstream agents can still parse the run summary. Missing [Scene ...] Telemetry: lines should be treated as a failure whenever telemetry exists in rtifact-metadata.json.

Add warning/error lines exactly where issues occur (scene failure, Vitest timeout, etc.) so each run remains auditable.

## 6. Unit test coverage

- Run `npm exec vitest -- run scripts/__tests__` (or `powershell -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-vitests.ps1`) before invoking the heavy helper to validate the story generator helpers and workflow patcher logic. The helper script now captures `vitest-comfyui.log`, `vitest-e2e.log`, `vitest-scripts.log`, and `vitest-results.json`, and the `pr-vitest` workflow (Node 22) uploads `vitest-report.json` so you can inspect failures without rerunning locally.

---

By following this checklist you ensure every run is auditable: prompts map to frames, frames map to archives, and the log records enough context for the next person to continue without redoing your investigation.



