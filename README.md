<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1uvkkeiyDr3iI4KPyB4ICS6JaMrDY4TjF

## Run Locally

**Prerequisites:**  Node.js


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

- Run `scripts/run-comfyui-e2e.ps1` from PowerShell with `-ExecutionPolicy Bypass` to orchestrate the full story ➜ video loop:
  1. **Story + keyframes**: `scripts/generate-story-scenes.ts` synthesizes a 3-scene narrative, writes `logs/<ts>/story/story.json`, and copies per-scene keyframes (defaults to `sample_frame_start.png`).
  2. **Scene loop**: `scripts/queue-real-workflow.ps1` now accepts per-scene `-SceneId/-Prompt/-KeyframePath` parameters, patches placeholders inside `workflows/text-to-video.json` (derived from the [ComfyUI_examples SVD workflow](https://github.com/comfyanonymous/ComfyUI_examples/blob/master/video/workflow_image_to_video.json)), posts to `/prompt`, and copies `gemdirect1_<sceneId>*` frames into `logs/<ts>/<sceneId>/generated-frames`. Prompts are also embedded in the workflow metadata so Comfy’s UI can display them alongside the frames.
  3. **Validation**: For each scene, the helper records frame counts, the copied folder, and any errors inside `run-summary.txt`. If a scene generates <25 frames, it is marked as a warning but subsequent scenes continue.
  4. **Tests**: After the scene loop finishes, the script runs `services/comfyUIService.test.ts` and `services/e2e.test.ts` via Vitest (`vmThreads` pool) and captures the logs beside the artifacts.
  5. **Archival**: ComfyUI stops, then the helper zips the entire `logs/<ts>` directory (story folder, scene folders, Vitest logs) into `artifacts/comfyui-e2e-<ts>.zip`.

- Post-run checklist:
  - Read `logs/<ts>/run-summary.txt`, confirming the `## Story`, per-scene frame lines, warnings, and `## Artifact Index` entries reflect what you saw in the console (frame counts, durations, Vitest exit codes).
  - Local test helper: you can run the Vitest suites and capture their logs using the helper script `scripts/run-vitests.ps1`. When run standalone it creates a timestamped `logs/<ts>/` folder with `vitest-comfyui.log`, `vitest-e2e.log`, and `run-summary.txt`. `scripts/run-comfyui-e2e.ps1` now calls this helper automatically for Steps 6/7 and will colocate the Vitest logs in the main run folder.
  - Inspect each `logs/<ts>/<sceneId>/` folder: check `scene.json`, `keyframe.png`, `history.json`, and the `generated-frames/*.png` files and make sure the frame count matches the `run-summary.txt` warning/measurement.
  - Confirm `artifacts/comfyui-e2e-<ts>.zip` mirrors the `logs/<ts>` tree (story folder, scene folders, generated frames, `history.json`, Vitest logs) before sharing the archive.
  - Use the run-summary template in `STORY_TO_VIDEO_TEST_CHECKLIST.md` as your guide when evaluating the logged sections and artifact index entries.
- Troubleshooting tips:
  - If frame counts stay at 0, verify `ComfyUI/models/checkpoints/SVD/` contains `svd_xt*.safetensors` (see [thecooltechguy/ComfyUI-Stable-Video-Diffusion](https://github.com/thecooltechguy/ComfyUI-Stable-Video-Diffusion) for model expectations) and that `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output` is writable.
  - Alternate SVD prompt wiring examples (e.g., [ComfyUI Txt2Video with SVD on Civitai](https://civitai.com/models/211703/comfyui-txt2video-with-svd)) are referenced in `STORY_TO_VIDEO_PIPELINE_PLAN.md` if you need to adjust node mappings.
- Need a step-by-step validation flow? Follow `STORY_TO_VIDEO_TEST_CHECKLIST.md` for the exact commands, verification steps, and run-summary template.
