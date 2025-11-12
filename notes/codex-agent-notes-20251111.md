# Codex Agent Notes (2025-11-11)

These notes aggregate the directives from the current meta-doc set so future agents can trace assumptions, lessons learned, and outstanding gaps. Sources include `README.md`, `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `STORY_TO_VIDEO_TEST_CHECKLIST.md`, `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `E2E_TEST_EXECUTION_*`, `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`, `QUICK_START_E2E_TODAY.md`, `DOCUMENTATION_INDEX_20251111.md`, `START_HERE_COMPLETE_DELIVERY.md`, `REFERENCE_CARD_QUICK.md`, and `E2E_TEST_EXECUTION_REPORT_20251111.md`.

## Key Assumptions

- **Runtime guardrails**: All helper scripts enforce Node.js ≥ `22.19.0` and must be run via PowerShell 7 (`pwsh`) to avoid PS5 parsing failures and npm shim bugs (README, Execution Checklist).
- **Workflow contract**: ComfyUI must run the simplified SVD image-to-video workflow (`workflows/text-to-video.json`) with placeholders `__KEYFRAME_IMAGE__`, `__SCENE_PREFIX__`, and `_meta.scene_prompt/negative_prompt` patched at queue time (Pipeline Plan, Workflow Fix Guide).
- **Scene targets**: Each automated run generates 3 scenes with a 25-frame floor (75 frames total). Telemetry, warnings, and artifact metadata must treat 25 frames as the minimum acceptable count (README, Checklist, E2E reports).
- **Storyline quality**: LOCAL_STORY_PROVIDER_URL + `--useLocalLLM` are the preferred paths; deterministic fallback data is acceptable only when the local LLM is unavailable. Artifact metadata and UI must surface LLM-derived prompts/loglines verbatim (README, Handoff Notes).
- **Traceability**: `run-summary.txt`, `artifact-metadata.json`, and `public/artifacts/latest-run.json` are the canonical audit trail. Every warning/error recorded in metadata must have matching `[Scene …] HISTORY WARNING/ERROR` or `WARNING: Frame count below floor` log lines validated by `scripts/validate-run-summary.ps1` (Checklist, Execution Reports).

## Lessons Learned

- **Placeholder patching works well**: Keeping the workflow JSON static while injecting prompts/keyframes per scene is reliable and reduces manual editing risk (Pipeline Plan, Workflow Fix Guide).
- **Vitest invocation**: Running via `node ./node_modules/vitest/vitest.mjs` avoids npm shim issues on Windows; logs must be persisted (`vitest-comfyui.log`, `vitest-e2e.log`, `vitest-scripts.log`, `vitest-results.json`) for later review (README, Handoff Notes).
- **Structured logging**: The standardized `run-summary.txt` layout (`## Story`, `[Scene …][Attempt …]`, `[Scene …] HISTORY …`, `## Artifact Index`) plus zipped `logs/<ts>` artifacts keeps runs independently reviewable (Pipeline Plan, Checklist).
- **Auto retries matter**: Allowing one automatic requeue when history polling fails, no frames are copied, or the frame floor is missed reduces manual babysitting and must be preserved in queue automation (Handoff Notes, Execution Reports).
- **Telemetry-first mindset**: Capturing `HistoryPollLog`, `HistoryErrors`, Vitest timings, archive locations, and later GPU/memory stats ensures UI components can reflect backend state without digging into files (README, Execution Reports).

## Known Gaps & Status

| Gap | Status | Notes / Owning Doc |
| --- | --- | --- |
| Story generator still deterministic; needs fully integrated local LLM prompts/moods plus fallback tracing | **Open** | README, Pipeline Plan, Execution Reports |
| UI timelines/history panels not yet consuming enriched artifact metadata (beyond Artifact Snapshot) | **Open** | README, Pipeline Plan |
| Need smarter queue telemetry: retries, history poll ceilings, GPU/memory timing exported in metadata and run summary | **In progress / partially implemented** | Strategic Goals, Execution Reports |
| `scripts/run-vitests.ps1` logging alignment + potential lint/static checks | **Open** | README, Strategic Goals |
| Artifact metadata requires new telemetry fields (GPU stats, memory usage, archive info) whenever code changes occur | **Open** | Strategic Goals |
| Self-test scripts must fail fast with machine-readable summaries; gaps remain for history warnings and frame validation robustness | **Open** | Strategic Goals, Checklist |
| Comprehensive documentation sync: every code change must update README, Pipeline Plan, Checklist, Workflow Guide, Execution Reports, Quick Start, etc. | **Ongoing requirement** | Documentation Index, Start Here |

## Current Observations (Code Audit 2025-11-11)

- `scripts/run-comfyui-e2e.ps1` logs `[Scene …] Duration=s` because the summary string uses `${($result.DurationSeconds)}` instead of `$($result.DurationSeconds)` (line ~246); fix required so run summaries include actual durations.
- Same script hard-codes `$sceneMaxWait = 600` and `$MaxAttemptCount = 0`, but telemetry/metadata (Strategic Goals) expect MaxWaitSeconds-driven polling + recorded retry decisions; need to propagate configuration and log.
- Artifact metadata currently mirrors story prompts but lacks mood/logline per scene and telemetry such as GPU stats, memory, Vitest timings, and archive size requested in Strategic Goals.
- `components/ArtifactViewer.tsx` renders prompts/history but does not surface new metadata targets (mood, per-attempt frame floors, telemetry, archive info) across other UI panels (timeline/history) mentioned in README.
- `scripts/storyGenerator.ts` already supports `--useLocalLLM`, but fallback behavior silently swallows provider errors without logging provenance; need richer metadata linking generator + seeds for traceability.

## Progress (2025-11-11)

- Story generator + CLI now default to the local LLM when `LOCAL_STORY_PROVIDER_URL` is present, recording provider URL, seed, duration, and fallback warnings inside `story.json`, run summaries, metadata, and the React UI.
- Queue telemetry captures GPU/VRAM stats, poll cadence, and runtime per scene, adds `[Scene ...] Telemetry:` log lines, persists the data into `artifact-metadata.json`, and exposes it through the Artifact Snapshot + Timeline Editor (with a warnings-only filter).
- `scripts/run-vitests.ps1` writes suite duration telemetry into `vitest-results.json`, while the validator enforces telemetry lines so logs can’t silently drop GPU data.
