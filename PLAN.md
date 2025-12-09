# gemDirect1 Integrated Enhancement Plan

## 1. Critical Review & Integration Notes

- The repo already highlights that the Timeline editor’s **Generate Video** button is disabled and that telemetry (Artifact Snapshot + timeline badges) must stay in sync with `logs/<ts>/artifact-metadata.json` and `public/artifacts/latest-run.json` (`README.md:165`, `README.md:872`). Any “Generate” wiring must honor the established contract.
- `scripts/generate-scene-videos-wan2.ps1` is the existing orchestration point, so we either need to drive it from the backend (keeping its `run-summary.txt`/telemetry shapes) or replace it with a cross-platform orchestrator that preserves those logs.
- `services/generationQueue.ts` is already responsible for serializing VRAM-intensive work and gating by headroom. Additions such as FLF2V, interpolation, and SVI must still respect that queue (preferring upgrades over bypasses).
- Documentation is the “source of truth” (see `Documentation/`, `docs/`, and root `PLAN.md`), so every new script, workflow, or UI control must ship with a guide before merging.
- Advanced features (per-frame ControlNet sequences, SVI, VACE) impose meaningful VRAM and UX costs, so they should be opt-in presets with explicit warnings and fallback behaviors.

### Original Category Coverage
- **UI Integration & Orchestration**: Phase 1 wires the Timeline Generate button to a queue-backed API that streams ComfyUI/telemetry progress, preserving the existing Artifact Snapshot contract.
- **VRAM Optimization & Quantisation**: Phase 1 mandates `--lowvram`, GGUF WAN models, CFG/step caps, and queue preflight improvements (`services/generationQueue.ts`).
- **Formalising LoRA & ControlNet Workflows**: Phase 1 includes LoRA/ControlNet-ready workflow templates plus UI fields and backend injection logic.
- **CFG/Steps Tuning**: Safe defaults in `localGenSettings.json` + warnings for CFG ≥ 6 are spelled out in Phase 1.
- **FLF2V**: Phase 2 orchestrator extensions capture scene-last frames and feed them into the next scene with toggles and bookend similarity checks.
- **Post-Processing (Frame Interpolation & Upscaling)**: Phase 2 layers in RIFE and Real-ESRGAN steps, optional toggles, telemetry fields, and UI metadata updates.
- **Stable Video Infinity (SVI)**: Phase 3 introduces an SVI workflow, dedicated LoRAs, GPU warnings, and gating toggles.
- **Dynamic Character Control (3D/ControlNet)**: Phase 3 accepts pose/depth uploads, validates sequences, and feeds AnimationControlNet inputs per frame.
- **Alternative Models & Orchestration**: Phase 3 adds FastVideo/SVD provider options, while Phase 6 introduces a Python orchestrator to simplify cross-platform runs.
- **High-Quality Keyframes & VACE Clip Joiner**: Phase 4 replaces keyframes with Z-Image Turbo outputs and stitches scenes via a WAN VACE joiner workflow.
- **Timeline UI & Editor**: Phase 5 designs a horizontal storyboard/timeline with drag/drop, thumbnails, status badges, and artifact previews.
- **LLM-Assisted Story/Shot Planning**: Phase 5 embeds a story assistant panel powered by `services/localStoryService.ts`, logging selections into project metadata.

## 2. Phase 1 – UI → Stable Generation Pipeline

### Objectives
- Wire the React Timeline Generate button to the existing ComfyUI-based pipeline while keeping the GenerationQueue, telemetry, and VRAM guardrails in place.
- Hardcode safe defaults (low-VRAM mode, GGUF WAN 2.2 models, CFG/step caps) so this first end-to-end run is reliable on the documented hardware envelope.

### Tasks
1. Add a `POST /api/generate-video` endpoint (or similar) that enqueues the job via `services/generationQueue.ts`, spawns `scripts/generate-scene-videos-wan2.ps1`/orchestrator, and publishes the script’s telemetry to the Artifact Snapshot UI.
2. Update the React Timeline editor to call the endpoint, poll job status, render per-scene progress badges, and disable Generate when `/system_stats` reports insufficient VRAM (leverage the same telemetry lines that drive the existing UI warnings).
3. Make `npm run check:health-helper` and startup scripts launch ComfyUI with `--lowvram` and the GGUF WAN 2.2 models by default. Introduce env vars like `LOCAL_COMFY_LOWVRAM`/`WAN2_MODEL_FORMAT` and document how to put GGUF models under `models/`.
4. Set CFG defaults around 5.2 and steps in the 12–20 range inside `localGenSettings.json` plus `workflows/video_wan2_2_5B_ti2v.json`, and add warning logic when users override to CFG ≥ 6 (the “black frame” issue noted in the README). The prompt injector already logs CFG/seed, so reuse those lines for alerts.
5. Provide LoRA/ControlNet-ready workflow templates (`workflows/wan2_i2v_with_lora_control.json`) plus UI fields and backend logic so users can supply LoRAs (`models/loras/<name>.safetensors`) and ControlNet anchors without manually editing workflows.
6. Strengthen the queue preflight (min VRAM, circuit breaker) in `services/generationQueue.ts` and expose its unhealthy state via the new API so the front end can explain why Generate is disabled.

### Testing & Documentation
- Add Vitest/Playwright coverage for the new endpoint, including VRAM gate blocking, telemetry emission, and queue progress indicators (`README.md:117-155` testing guidance).
- Document GGUF model placement, LoRA/ControlNet usage, and the Generate workflow in a new guide under `docs/` or `Documentation/`.

## 3. Phase 2 – FLF2V & Post-Processing

### Objectives
- Chain scene outputs (First-Last-Frame-to-Video) and improve quality with interpolation/upscaling while keeping QA telemetry consistent.

### Tasks
1. Modify the orchestrator/script so each scene writes its final frame (e.g., `scene-001_last.png`), then feeds it as the `init_image` for the next scene when `--flf2v` is enabled. Use the existing “producer done marker” logic and verify continuity via `scripts/bookend-frame-similarity.ts`.
2. Introduce an interpolation step (RIFE via Python wrapper or ComfyUI node) that creates a higher-FPS version of each scene MP4. Make it optional, document GPU/CPU cost, and log warnings when interpolation runs out of memory.
3. Add an upscaling phase (Real-ESRGAN via script or ComfyUI extension) post-interpolation with scale/resolution options. Preserve audio tracks or clearly document when audio is dropped.
4. Expand `artifact-metadata.json` and the Artifact Snapshot UI to surface interpolation/upscale metadata (`InterpolationElapsed`, `UpscaleMethod`, `FinalFPS`, `FinalResolution`) so QA and the UI agree with the helper log lines in `README.md:872`.

### Testing & Documentation
- Validate FLF2V continuity with the bookend similarity script, check interpolated FPS with `ffprobe`, and assert output resolution via automated tests.
- Update `docs/STORY_TO_VIDEO_PIPELINE_PHASE_*.md` to cover FLF2V toggles, RIFE/Real-ESRGAN presets, and failure modes.

## 4. Phase 3 – Infinite Video & Dynamic Control

### Objectives
- Enable Stable Video Infinity (SVI) mode and per-frame ControlNet guidance without compromising stability.

### Tasks
1. Add an SVI workflow (`workflows/video_wan2_svi.json`) plus LoRAs under `models/loras/svi/`, expose an SVI toggle, and ensure the orchestrator loads the heavier LoRAs only when requested. Warn about the ~1.2 GB weights and optionally offer quantized versions.
2. Accept zipped pose/depth sequences per scene in the Timeline UI, validate them via a new `services/controlNetUploader.ts`, and post them to ComfyUI’s `ControlNet`/AnimationControlNet nodes so each frame receives the correct conditioning.
3. Add FastVideo/SVD providers to the Video Provider dropdown, reuse FastVideo scripts/tests (`scripts/run-fastvideo-server.ps1`, `tests/integration/fastvideo.test.ts`), and document when to fall back to each provider (`README.md:309-368`).

### Testing & Documentation
- Run pose-control tests to ensure ControlNet input changes the output enough to be measurable and reuse frame similarity metrics to confirm SVI identity stability over ≥3 scenes.
- Update `README.md` (FastVideo/SVD sections) and `Documentation/` to explain provider trade-offs, expected VRAM, and ControlNet sequence formatting.

## 5. Phase 4 – Premium Keyframes & Transitions

### Objectives
- Replace vanilla keyframes with Z-Image Turbo outputs and glue scenes together with VACE transitions plus reorder support.

### Tasks
1. Build `scripts/generate-keyframe-zimage.ts` (with WAN T2I fallback) to create Z-Image Turbo keyframes, store them in `scene/keyframe.png`, and feed them into WAN I2V (including FLF2V’s first/last frame).
2. Add a WAN VACE Clip Joiner workflow (`workflows/vace_joiner.json`) and script (`scripts/join-clips-vace.ps1` or Python) that stitches scene MP4s into a single output, offering transition/context frame knobs in the UI.
3. Make the timeline reorderable (drag/drop) and persist the new order in `story.json` so FLF2V chaining and VACE transitions follow the user-directed sequence.

### Testing & Documentation
- Compare Z-Image keyframes vs WAN T2I via QA cards, verify VACE transitions avoid color drift (add histogram-normalization fallback if needed), and ensure reordered timelines produce the expected `story.json`.
- Document Z-Image/VACE requirements and failure cases in `README.md` and the documentation inventory.

## 6. Phase 5 – Timeline UX & Persistence

### Objectives
- Surface a polished storyboard editor, orchestrator health data, project export/import, and LLM assistance within the UI.

### Tasks
1. Implement a horizontal timeline component with thumbnails, duration markers, status badges, drag/drop reordering, and artifact previews, persisting project state in IndexedDB/local files (inspired by Gausian).
2. Expose ComfyUI/GenerationQueue health (VRAM, running tasks, warnings from `scripts/comfyui-status.ts`) and offer a toggle between the legacy PowerShell workflow and the new Python orchestrator.
3. Add Export/Import buttons that read/write schema-aligned JSON/EDL (respect `docs/STORY_TO_VIDEO_PIPELINE_PHASE_1.md`) and cover them with Vitest/Playwright tests.
4. Embed an LLM-assisted story assistant panel that reuses `services/localStoryService.ts` heuristics to suggest prompts and records the selected output in project metadata.

### Testing & Documentation
- Test timeline rendering, drag/drop persistence, and preview navigation, plus add docs for export/import schema and assistant usage.

## 7. Phase 6 – Python Orchestrator & Performance Monitoring

### Objectives
- Replace the PowerShell pipeline with a maintainable Python orchestrator while keeping multi-GPU/performance telemetry intact.

### Tasks
1. Build `scripts/orchestrator.py` that reads `story.json`/`localGenSettings.json`, triggers keyframes (Z-Image or WAN), runs WAN I2V (with FLF2V/SVI options), applies interpolation/upscaling, runs VACE if requested, writes manifests/`run-summary.txt`, and surfaces structured logs/telemetry.
2. Allow stage-to-GPU mapping via env vars, record VRAM usage with `nvidia-smi`/`py3nvml`, and fallback to CPU when needed. Surface recommended headroom guidelines (8–24 GB) in both the README and the orchestrator docs.
3. Instrument each stage with timings/metrics (using `psutil`) and store them in telemetry so the UI can display stage durations and VRAM deltas.
4. Extend CI (pytest + Vitest + Playwright) to run the orchestrator on a short project, asserting telemetry, FLF2V continuity, and post-processing outcomes that match the QA contract described in `README.md:117-155`.

### Testing & Documentation
- Update `README.md`, `README_TESTING_STARTS_HERE.md`, and the documentation inventory with orchestrator CLI flags and fallback instructions, plus add pytest coverage for every orchestrator stage and telemetry path.

## 8. Cross-Phase Governance

- **Documentation:** No new script or workflow merges without a matching doc in `Documentation/`/`docs/` plus an entry in `DOCUMENTATION_INVENTORY.md`.
- **Telemetry & QA:** Reuse `scripts/validate-run-summary.ps1`, `scripts/bookend-frame-similarity.ts`, and the Artifact Snapshot validator to gate releases; mismatched telemetry must fail CI.
- **User Experience:** Bundle advanced features (SVI, interpolation, VACE, ControlNet) behind presets (Fast, Standard, Cinematic) and surface fallback hints (e.g., “low VRAM → use Standard preset”).
- **Next Steps:** After every phase, collect QA/telemetry reports (`test-results/...`), adjust presets, and then unlock the next phase for broader testing.
