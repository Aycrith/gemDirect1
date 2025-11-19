# Implementation Status – 20251118

## Confirmed Truths
- Dual WAN strategy canonical: WAN T2I for keyframes; WAN 2.2 5B ti2v for video.
- Guardrails: SINGLE_FRAME_PROMPT prepended; NEGATIVE_GUIDANCE appended to negatives for images and video (services/comfyUIService.ts:1058+).
- Narrative: localStoryService integrates LM Studio-like chat; outputs normalized 12 hero arcs with deterministic fallback.
- Arc propagation: storyToVideoPipeline distributes arcs; shots include arcId/arcName and heroMoment.
- Workflows present: workflows/image_netayume_lumina_t2i.json, workflows/video_wan2_2_5B_ti2v.json.
- Tests exist for guardrails and mappings; validateWorkflowAndMappings enforces WAN t2i vs WAN i2v differences.

## Stale/At-Risk References
- STORY_TO_VIDEO_PIPELINE_PLAN.md mentions SVD as canonical. Update to WAN-first, SVD optional.
- WORKFLOW_ARCHITECTURE_REFERENCE.md includes SVD-heavy sections; keep but clearly mark as optional/regression.

## Planned Fixes (Docs + Code + Tests)
- Docs sweep to emphasize WAN 5B canonical: README.md, COMFYUI_WORKFLOW_INDEX.md, COMFYUI_INTEGRATION*.md, COMFYUI_TEST_GUIDE.md, WORKFLOW_ARCHITECTURE_REFERENCE.md.
- Validate and document mapping rules: wan-t2i (no keyframe_image), wan-i2v (requires keyframe_image + LoadImage).
- Tighten localStoryService prompts and tests (malformed JSON → normalized arcs; fallback resilience).
- Ensure scripts write consistent telemetry: comfyui-status summary path, run-comfyui-e2e Step 11b/11c order.

## Files to Update (Definitive List)
- services/localStoryService.ts (minor prompt/telemetry notes if needed)
- services/__tests__/localStoryService.test.ts (expand malformed/fallback cases)
- services/__tests__/storyToVideoPipeline.test.ts (assert shot-level arc propagation)
- services/__tests__/validateWorkflowAndMappings.test.ts (explicit wan-t2i vs wan-i2v)
- README.md, COMFYUI_WORKFLOW_INDEX.md, COMFYUI_INTEGRATION_COMPLETE.md, COMFYUI_TEST_GUIDE.md, WORKFLOW_ARCHITECTURE_REFERENCE.md, STORY_TO_VIDEO_PIPELINE_PLAN.md
- scripts/comfyui-status.ts, scripts/run-comfyui-e2e.ps1 (verify outputs + warnings), scripts/generate-scene-videos-wan2.ps1, scripts/update-scene-video-metadata.ps1

## Expected Impact
- Vitest: guardrail + mapping tests pass; new narrative tests added.
- E2E: run-comfyui-e2e.ps1 stable on RTX 3090 with WAN-first.
- Telemetry: run-summary.txt and artifact-metadata.json remain consistent.

## Notes
- Node.js >= 22.19.0 enforced by scripts.
- SSRF-safe defaults retained (127.0.0.1 / localhost). No secrets or full prompts logged.
