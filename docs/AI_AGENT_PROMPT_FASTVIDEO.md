# Windows Agent Tasking Prompt: FastVideo Local Video Generation (Alternate to ComfyUI)

Use this prompt verbatim to brief a Windows agent to add **FastVideo** (FastWan2.2-TI2V-5B) as an optional local video generation path alongside the existing ComfyUI pipeline for gemDirect1. Keep ComfyUI fully working; this is an alternate selectable provider, not a replacement.

---

## Objective
- Add a **local FastVideo path** for TI2V generation using `FastVideo/FastWan2.2-TI2V-5B-Diffusers` so scenes can render without ComfyUI.
- Make the provider **toggle-able** (ComfyUI remains default) via settings/config, with clear health/status indicators in UI and scripts.
- Provide **Windows-friendly setup** (PowerShell) plus smoke tests, telemetry, and documentation updates.

## System Context (gemDirect1)
- React SPA that currently talks to LM Studio for story text and ComfyUI for keyframes/videos. Local generation settings live in `localGenSettings.json` and are surfaced through the Settings modal.
- Video path today: timeline -> `videoGenerationService.ts` -> ComfyUI workflow + mappings. Helper scripts live under `scripts/` (e.g., `run-comfyui-e2e.ps1`, `generate-scene-videos-wan2.ps1`).
- Preserve existing ComfyUI workflows and tests; add a **parallel provider** `fastvideo-local` with matching telemetry and UX affordances.

## Target Deliverables
1) New **FastVideo runtime** on Windows (Python) with the FastWan2.2-TI2V-5B model downloaded, cached, and smoke-tested.  
2) A **local FastVideo service/adapter** (HTTP) that accepts the same payload shape the UI builds (human-readable prompt + base64 keyframe + generation params) and returns MP4 + metadata.  
3) Frontend wiring to **select providers** (`comfyui-local` vs `fastvideo-local`), including health checks, status chips, and error handling.  
4) **Docs**: setup/run guide, config knobs, troubleshooting.  
5) **Tests**: at least one automated smoke/integration path for FastVideo (unit harness + script or Playwright hook that exercises the HTTP adapter with a tiny frame count).  

## Prereqs (Windows)
- Windows 10/11, NVIDIA GPU with >=16 GB VRAM (4090/3090 class recommended). CUDA 12.x drivers installed.
- Node 22.19.x already required for gemDirect1. Python 3.12 recommended for FastVideo.

### FastVideo Environment Setup (PowerShell)
```powershell
# 1) Create env
conda create -n fastvideo python=3.12 -y
conda activate fastvideo

# 2) Install CUDA-enabled PyTorch (adjust cu121 if drivers differ)
pip install torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121

# 3) Install FastVideo and helpers
pip install fastvideo fastapi uvicorn[standard] huggingface_hub

# 4) Optional: xFormers / VSA kernels if required by GPU
# pip install xformers==0.0.27.post2

# 5) Login and pull model + synthetic dataset (cache locally)
huggingface-cli login                          # need a token with access to the FastVideo org if required
$env:FASTVIDEO_HOME = "$env:USERPROFILE\\fastvideo"   # set a cache root
mkdir -Force $env:FASTVIDEO_HOME\\models | Out-Null
mkdir -Force $env:FASTVIDEO_HOME\\datasets | Out-Null

huggingface-cli download FastVideo/FastWan2.2-TI2V-5B-Diffusers `
  --local-dir $env:FASTVIDEO_HOME\\models\\FastWan2.2-TI2V-5B-Diffusers `
  --cache-dir $env:FASTVIDEO_HOME\\hf-cache `
  --resume-download

# Optional (for data-free recipe parity; not needed for inference but keep handy)
huggingface-cli download FastVideo/Wan2.2-Syn-121x704x1280_32k `
  --local-dir $env:FASTVIDEO_HOME\\datasets\\Wan2.2-Syn-121x704x1280_32k `
  --resume-download

# 6) Sanity smoke test (tiny clip)
python - <<'PY'
import os
from fastvideo import VideoGenerator
os.environ["FASTVIDEO_ATTENTION_BACKEND"] = "VIDEO_SPARSE_ATTN"
model_path = os.environ.get("FASTVIDEO_MODEL_ID", "FastVideo/FastWan2.2-TI2V-5B-Diffusers")
gen = VideoGenerator.from_pretrained(model_path, num_gpus=1)
result = gen.generate_video(
    "Test: a single astronaut turns toward camera.",
    num_frames=8,
    fps=12,
    save_video=True,
    output_path="artifacts/fastvideo-smoketest"
)
print("Generated:", result)
PY
```

## Implementation Plan (give to the agent)
1) **Recon & Contracts**
   - Map current video flow and settings: `services/videoGenerationService.ts`, `localGenSettings.json`, Settings UI. Identify where provider IDs are chosen (media/video pipelines, provider health service).
   - Decide on the provider key `fastvideo-local`; ensure human-readable prompt + base64 keyframe + timeline JSON can pass through the new adapter.

2) **Config Layer**
   - Extend `LocalGenerationSettings` to add a `videoProvider` discriminator and a `fastVideo` block (e.g., `modelId`, `fps`, `numFrames`, `height`, `width`, `seed`, `outputDir`, `attentionBackend`, `endpointUrl`).
   - Surface new inputs in the Settings modal and save/export with `localGenSettings.json`. Keep ComfyUI keys intact.

3) **Local FastVideo Adapter (HTTP)**
   - Add a small FastAPI (or lightweight Flask) server under `scripts/fastvideo/fastvideo_server.py` that wraps FastVideo:
     - POST `/generate` accepts `{ prompt, negativePrompt?, keyframeBase64?, fps, numFrames, width, height, seed, outputDir }`.
     - Converts base64 keyframe into an image tensor when provided (TI2V), sets `FASTVIDEO_ATTENTION_BACKEND=VIDEO_SPARSE_ATTN`, and calls `VideoGenerator.generate_video(...)`.
     - Returns `{ status, outputVideoPath, frames?, durationMs, seed, warnings }` with clear errors.
   - Add a PowerShell runner `scripts/run-fastvideo-server.ps1` that activates the env, exports env vars (model dir, cache dir, backend), and starts Uvicorn on a configurable port (e.g., 8055). Include a `--dry-run` flag to validate model availability without loading.

4) **Frontend Integration**
   - Create `services/fastVideoService.ts` (browser-side fetch to the local adapter). Mirror the ComfyUI request helpers so the UI can call `queueFastVideoPrompt` with the generated payloads and keyframe.
   - Update `videoGenerationService.ts` (or the orchestration layer) to branch on provider: `comfyui-local` -> existing path; `fastvideo-local` -> new service.
   - Add provider health to `providerHealthService.ts`: probe the adapter `/health` and show status chips in the UI (similar to ComfyUI).
   - Ensure `localGenSettings.json` export/import supports the new provider block and default values.

5) **Telemetry & Artifacts**
   - Log request/response times, FPS/frames, output path, and seed. Write a short summary JSON under `artifacts/fastvideo/` or `test-results/fastvideo/` per run (similar to ComfyUI helper logs).
   - Keep error messaging user-friendly (missing model, CUDA OOM, bad prompt).

6) **Testing**
   - Add a **unit/integration harness** (Node) that posts a minimal payload to the FastVideo adapter with `num_frames=8`, `fps=8`, small resolution, and asserts an MP4 exists.
   - (Optional) Add a Playwright toggle test that switches provider to FastVideo, triggers a single-scene render with a stub keyframe, and verifies the job completed + artifact path surfaced.
   - Include a `scripts/test-fastvideo-smoke.ps1` that runs the adapter end-to-end after installation.

7) **Docs & UX**
   - Update `README.md` / `START_HERE.md` / `Documentation/PROJECT_STATUS_CONSOLIDATED.md` with: setup steps, env vars, adapter port, switching providers, and resource profile (VRAM expectations).
   - Add troubleshooting: HF token missing, torch CUDA mismatch, adapter port blocked, OOM, model cache path.
   - Note runtime tips: prefer sequential runs with LM Studio stopped if VRAM is tight; start with 8-12 frames, 720p, `fps=12-16`.

## Acceptance Checklist
- FastVideo adapter runs on Windows, loads FastWan2.2-TI2V-5B, and returns an MP4 for a short prompt/keyframe.
- UI can select FastVideo vs ComfyUI; default remains ComfyUI if unset.
- Health status for FastVideo is visible and errors are actionable.
- Docs and scripts exist for install/run/test on Windows; smoke test documented and runnable.
- No regressions to ComfyUI flows; existing tests still pass.
