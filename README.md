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

### Automated ComfyUI E2E

- Use `scripts/run-comfyui-e2e.ps1` to drive a reproducible end-to-end run. It:
  1. Starts the local ComfyUI server (`C:\ComfyUI\start-comfyui.bat`) and records `system_stats.json`.
  2. Launches `npm run dev` and executes both `services/comfyUIService.test.ts` and `services/e2e.test.ts` via Vitest with the `vmThreads` pool.
  3. Captures queue details, frame inventories, and a computed `final_output.json` for analysis.
  4. Validates that a real frame sequence exists under `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs` and writes `frame-validation.json`.
  5. Stops the services, zips the log folder, and stores the artifact in both `logs/<timestamp>/comfyui-e2e-<timestamp>.zip` and `artifacts/comfyui-e2e-<timestamp>.zip`.

- Run the script from PowerShell with `-ExecutionPolicy Bypass` (the script already ensures Node 22.19.0 is first on `PATH`), then inspect the log directory and artifact ZIP for the generated JSON files and Vitest logs.
 6. Automatically queues a real SVD shot by resolving the SVD/CLIP checkpoints from `models/checkpoints/SVD` and `models/clip_vision`, uploads `sample_frame_start.png`, and logs the generated frames before the suites run.
 7. Copies any `gemdirect1_shot*.png` files from `ComfyUI/output` into the log directory so the zipped artifact includes the actual frames you just generated.

- If the helper still warns “Outputs directory not found” or `frameCount` remains 0, make sure your ComfyUI install contains an SVD checkpoint under `models/checkpoints/SVD` (e.g., `svd_xt.safetensors`), a ViT-L-14 CLIP vision checkpoint (any of the `ViT-L-14-*.safetensors` files), and place `sample_frame_start.png` at the repo root. Once those exist, rerun `scripts/run-comfyui-e2e.ps1`—the new `queue-real-shot.log` will show which files were used and list the generated frames for quick verification.
