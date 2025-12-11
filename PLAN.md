# gemDirect1: Consolidated Plan (2025-12-11)

## Guardrails and context
- Artifact Snapshot contract stays canonical: logs/<ts>/artifact-metadata.json and public/artifacts/latest-run.json must remain in sync with run-summary.txt and telemetry the UI reads (README references ~165/872). Any new Generate wiring must preserve these shapes.
- GenerationQueue is the single entry for GPU-heavy work. All new orchestration must route through services/generationQueue.ts, respect VRAM gating/circuit breaker, and avoid bypassing queueComfyUIPromptSafe.
- scripts/generate-scene-videos-wan2.ps1 is the current orchestrator. Any alternative (Python or Node) must emit the same telemetry/manifests and keep bookend/queue semantics intact.
- Documentation is the source of truth. Every new workflow, flag, or script ships with a doc under Documentation/ or docs/ plus a DOCUMENTATION_INVENTORY.md entry. Presets and feature flags keep advanced items (SVI, VACE, interpolation, ControlNet) opt-in.
- Default to low VRAM + GGUF WAN2.2 + safe CFG/step ranges; keep queue health and /system_stats gating exposed to the UI.

## Baseline status (2025-12-11)
- Phase 1-3 remediation complete: queue wrapper + UI panel, AbortController in queue, LLMTransport adapter (flagged), WebSocket pooling, E2E hydration fixes, Guardian rules (no direct ComfyUI/LLM), ~4 explicit any remaining, tsc clean, ~2545 tests passing.
- Pipeline orchestration P4.4 infra exists (pipelineEngine.ts, pipelineStore.ts, pipelineTaskRegistry.ts, pipelineFactory.ts, ContinuityDirector). Step 4 integration tests/hardening are not finished.
- FLF2V scaffolding + enableFLF2V flag exist; not defaulted, lacking telemetry/UI surfacing and bookend QA wiring.
- Performance targets (React mount <900ms, cache/prefetch tuning) and GenerationQueue UX polish are outstanding.
- CI (pr-validation) runs typecheck/build; Playwright parallelism and physics/audio QA metrics are not yet enforced. README still assumes PowerShell-first flow.

## Execution tracks
### Track A: Finish foundations (0-3 days)
- Close P4.4 pipeline orchestration: add integration tests driving pipelineEngine via pipelineFactory with mocked ComfyUI; assert stage retries/progress/export-all; guard with Guardian rules.
- TypeScript strict close-out: remove remaining any in comfyUIService.ts, planExpansionService.ts, migrations.ts; add ESLint warn-on-new-any; add noImplicitAny trial job; keep coverage green.
- Performance/UX: profile React mount (goal <=900ms) and API chatter; lazy load heavy panes (Timeline/Pipeline panels), memoize hydration; ensure queue/pipeline panels do not block first paint; log baseline numbers in README status.
- CI hygiene: enable Playwright subset in PR workflow (RUN_MANUAL_E2E=0), parallelize; wire Guardian scan + telemetry validator; keep health-helper + typecheck as gates.

### Track B: Pipeline quality, FLF2V, and post-processing (1-3 days)
- Promote FLF2V: persist last-frame per scene to logs/<ts>/<sceneId>/frame-last.png; route through generationQueue/orchestrator; add API/UI toggle (default on for multi-shot presets); update artifact-metadata/manifests with FLF2V fields.
- Post-processing toggles: add RIFE interpolation and Real-ESRGAN upscaling as queued tasks with VRAM guards; preserve/annotate audio; surface UI warnings and timings.
- Manifest/telemetry alignment: extend Artifact Snapshot with InterpolationElapsed, UpscaleMethod, FinalFPS, FinalResolution, FLF2VEnabled; validate with scripts/validate-run-summary.ps1 and bookend-frame-similarity.ts.
- Tests: Vitest/Playwright for FLF2V chaining, ffprobe FPS assertions, Real-ESRGAN resolution check, UI toggle/progress badges.

### Track C: Cross-platform orchestrator (Python) (3-5 days, staged)
- Build scripts/orchestrator.py mirroring generate-scene-videos-wan2.ps1 (keyframes -> WAN I2V -> FLF2V -> interpolation -> upscaling -> VACE joiner) with manifest/run-summary compatibility.
- GPU mapping: env-driven stage-to-GPU assignment, nvidia-smi/py3nvml sampling, CPU fallback logging.
- Telemetry: per-stage timings and VRAM deltas persisted to artifact-metadata and shown in UI health cards.
- Tests: pytest smoke project; Vitest bridge to ensure Node side parses Python telemetry; Playwright toggle between PowerShell and Python orchestrators.

### Track D: Sora-level capabilities (parallel workstreams)
1) Physics and temporal coherence
   - Evaluate provider additions (licensed Sora when available, Google Veo, Runway Gen-3; FastVideo/SVD already scaffolded). Add provider adapter in services/videoProviderRegistry.ts with capability flags (physicsAware, audioSync).
   - Add physics-aware post step: optical flow + bounding-box tracking for velocity continuity and collision checks; optional rigid-body correction. Surface metrics in QA dashboards; BookendQA fails when thresholds exceeded; Guardian rule to require metrics.
2) Face/voice capture and safety
   - UI face-scan widget (short video) with consent storage; embeddings via FaceNet/FRAN stored locally with delete controls.
   - DreamBooth/LoRA personalization path for WAN2/SVD/new providers; cache embeddings; feature flag likeness use; record in manifests.
   - Voice cloning (ElevenLabs/VALL-E style) with phoneme alignment and lip-sync; watermark outputs; Guardian rule blocking unauthorized likeness use.
3) Multi-shot control and storyboard
   - Extend pipeline config to multi-shot schema with SceneGraph (characters, props, camera moves, transitions); scheduler passes latent/key state forward and supports camera pan/zoom params.
   - Timeline UI: drag/drop reorder persisted to story.json, shot-level prompts/duration/provider controls, preview thumbnails/status badges.
   - Tests: BookendQA identity continuity across shots; Playwright verifying reorder updates exports and FLF2V chain.
4) Audio pipeline
   - Soundscape generator (MusicGen/Stable Audio) driven by scene metadata with event-aligned SFX.
   - Dialogue sync: phoneme alignment using voice clone output; lip-sync adjustment; mixdown stage with volume automation.
   - QA metrics: SNR, speech intelligibility, audio-video sync offset; Guardian checks enforce bounds.
5) Determinism and history
   - Expose seeds and sampling controls; reproducibility mode that locks seeds/providers/settings.
   - Result caching/history view with manifests, seeds, and notes; rerun with identical params; Guardian checks manifest completeness.

### Track E: Documentation and enablement
- Update README.md, README_TESTING_STARTS_HERE.md, Documentation/PROJECT_STATUS_CONSOLIDATED.md with FLF2V default, post-processing toggles, Python orchestrator, and preset impacts.
- Add guides: physics QA, face/voice onboarding, multi-shot storyboard editor, audio pipeline, reproducibility. Register each in DOCUMENTATION_INVENTORY.md.
- Keep START_HERE.md and quality gap docs aligned; add screenshots for new UI panels.

### Track F: Multi-agent execution
- QualityDirector: own this plan, file issues per track with metrics (physics error <5%, face SSIM >0.9, audio sync offset <80ms).
- Implementer: execute Track A/B/C coding; use feature branches; satisfy Guardian rules.
- BookendQA: add/maintain suites for physics/audio/FLF2V/provider regressions; store benchmarks in test-results/.
- Guardian: enforce queue usage, adapter usage, telemetry schema, likeness consent, and coverage >90% before merge.
- Scribe: sync docs per track and maintain changelog entries.

## Near-term priorities (next 72 hours)
- Finish P4.4 integration tests and Guardian rules for pipeline orchestration; rerun unit/E2E smoke.
- Wire FLF2V flag through queue/orchestrator and emit metadata; add ffprobe-based test.
- Enable ESLint warn-on-any and start noImplicitAny trial; fix remaining any instances.
- Add Playwright subset to CI and wire telemetry validator into PR workflow.
- Draft documentation updates for FLF2V + queue UX and record in DOCUMENTATION_INVENTORY.md.
