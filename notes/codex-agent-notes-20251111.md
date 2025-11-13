# Codex Agent Notes (2025-11-11)

These notes aggregate the directives from the current meta-doc set so future agents can trace assumptions, lessons learned, and outstanding gaps. Sources include `README.md`, `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `STORY_TO_VIDEO_TEST_CHECKLIST.md`, `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `E2E_TEST_EXECUTION_*`, `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`, `QUICK_START_E2E_TODAY.md`, `DOCUMENTATION_INDEX_20251111.md`, `START_HERE_COMPLETE_DELIVERY.md`, `REFERENCE_CARD_QUICK.md`, and `E2E_TEST_EXECUTION_REPORT_20251111.md`.

## Next-Agent Playbook
1. Read the audit trail docs (README.md, `DOCUMENTATION_INDEX_20251111.md` especially the “Required Telemetry & Queue Policy Orientation” block, `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `STORY_TO_VIDEO_TEST_CHECKLIST.md`, `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `QUICK_START_E2E_TODAY.md`, `REFERENCE_CARD_QUICK.md`, `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`, and `notes/codex-agent-notes-20251111.md`) before touching code or scripts so the LM Studio health check, queue knobs, telemetry enforcement, fallback handling, and Artifact Snapshot/Timeline expectations are obvious.
2. Ensure every meta-doc now states the LM Studio `/v1/models` probe (overridable via `LOCAL_LLM_HEALTHCHECK_URL` or skip flag `LOCAL_LLM_SKIP_HEALTHCHECK=1` per [LM Studio API Health Checks](https://lmstudio.ai/docs/api#health-checks)), the five queue knobs (`SceneMaxWaitSeconds`, `SceneHistoryPollIntervalSeconds`, `SceneHistoryMaxAttempts`, `ScenePostExecutionTimeoutSeconds`, `SceneRetryBudget`), and that these values flow into `run-summary.txt`, `artifact-metadata.json`, `public/artifacts/latest-run.json`, and the Artifact Snapshot/Timeline UI.
3. Confirm telemetry enforcement (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, GPU name, VRAMBeforeMB, VRAMAfterMB, VRAMDeltaMB, `pollLimit`, fallback notes, exit reasons, execution success) is covered, and link the `/history` structure back to ComfyUI’s [`websockets_api_example.py`](https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py) for reference.
4. When editing `scripts/queue-real-workflow.ps1`, `scripts/run-comfyui-e2e.ps1`, `scripts/validate-run-summary.ps1`, the Vitest test suite, or the React components, add inline notes citing the LM Studio health-check doc, the ComfyUI websocket history example, or any other referenced resources to keep the rationale discoverable.
5. After implementing script/UI changes, run `scripts/validate-run-summary.ps1`, `scripts/run-vitests.ps1`, and `scripts/run-comfyui-e2e.ps1` sequentially, capture exit logs, telemetry, GPU stats (`nvidia-smi` fallback if `/system_stats` fails), and document artifacts before closing the loop.
6. Log the resolved queue policy knobs, the `SceneRetryBudget`, and the LM Studio `/v1/models` probe (including overrides/skips) inside `run-summary.txt`, artifact metadata, and the UI so the queue policy card, telemetry badges, GPU deltas, fallback warnings, and LLM metadata can always be audited; this reiterates why missing telemetry or mismatched `pollLimit` now fail validation before archiving.

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

## Progress (2025-11-11)

- Story generator + CLI now default to the local LLM when `LOCAL_STORY_PROVIDER_URL` is present, recording provider URL, seed, duration, and fallback warnings inside `story.json`, run summaries, metadata, and the React UI.
- Queue telemetry captures GPU/VRAM stats, poll cadence, and runtime per scene, adds `[Scene ...] Telemetry:` log lines, persists the data into `artifact-metadata.json`, and exposes it through the Artifact Snapshot + Timeline Editor (with a warnings-only filter).
- `scripts/run-vitests.ps1` writes suite duration telemetry into `vitest-results.json`, while the validator enforces telemetry lines so logs can't silently drop GPU data.

## Decisions (2025-11-12)

- Added an automatic LM Studio `/v1/models` health check to `run-comfyui-e2e.ps1` (configurable via `LOCAL_LLM_HEALTHCHECK_URL` / `LOCAL_LLM_SKIP_HEALTHCHECK`) so runs fail fast when the story provider is offline.
- Promoted queue/poll tuning to first-class flags/env vars (`-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, `-SceneHistoryPollIntervalSeconds`, and the matching `SCENE_*` variables). The helper now logs the resolved policy in `run-summary.txt`, `artifact-metadata.json`, and the React viewers for auditability.
- Hardened telemetry by extending `queue-real-workflow.ps1` (GPU + VRAM deltas, poll limits, system stats) and updating `scripts/validate-run-summary.ps1` plus a Vitest harness that shells the validator. Runs now fail immediately if metadata or `[Scene …] Telemetry` lines drop required fields.
- Refreshed the Artifact Snapshot + Timeline UI to render the new metadata (LLM provenance, queue policy, poll logs, warnings, archive info) so operators can triage without opening raw JSON.

## Decisions & Actions
- **Health-check guardrails**: `scripts/run-comfyui-e2e.ps1` now hits LM Studio’s `/v1/models` endpoint (override via `LOCAL_LLM_HEALTHCHECK_URL`, skip with `LOCAL_LLM_SKIP_HEALTHCHECK=1`) before launching ComfyUI so we can fail fast when the model is unreachable (per https://lmstudio.ai/docs/api#health-checks).
- **Queue knobs & metadata**: Track `SceneMaxWaitSeconds`, `SceneHistoryMaxAttempts`, `SceneHistoryPollIntervalSeconds`, and `ScenePostExecutionTimeoutSeconds` plus `SceneRetryBudget` so `QueueConfig`, per-scene `HistoryConfig`, and the Artifact Snapshot/Timeline cards capture the resolved poll limit, post-exec window, and retry budget.
- **Telemetry enforcement**: `scripts/validate-run-summary.ps1` with the Vitest harness now checks DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, GPU name, VRAM before/after, execution success, exit reasons, and fallback notes (the statuses track ComfyUI’s `/history` flow from `websockets_api_example.py`) before the run can archive.
- **UI/Artifact alignment**: Artifact metadata now publishes GPU telemetry, `System.FallbackNotes`, and queue knobs so the Artifact Snapshot/TI timeline can draw queue policy cards, telemetry badges, poll log counts, and archive links without QA opening raw JSON.
- **Outstanding gaps**: The timeline/history panels outside the Artifact Snapshot still need to render telemetry counts, and we should document how to re-run the health check fallback when LM Studio changes host (no additional automation yet).
- **Metadata handshake**: Keep the UI, logs/<ts>/artifact-metadata.json, and public/artifacts/latest-run.json aligned so the queue policy card, telemetry badges, GPU stats, fallback warnings, Vitest logs, and archive references all reflect the validator-approved run.
## Current Observations (2025-11-11)
- LM Studio is now the default story source, but there is still no Gemini/story-service bridge or shared creative brief ingestion.
- Timeline/history UI panels outside the Artifact Snapshot have not been updated to render the new metadata (moods, telemetry, archive info) yet.
- Helper still assumes a 600s poll window per scene; exposing per-scene MaxWaitSeconds/attempt limits would align with the Strategic Goals doc.
- LM Studio health checks are manual; consider adding an automatic `/v1/models` probe before spinning up ComfyUI so failures are caught earlier.



