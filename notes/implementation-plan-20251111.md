# Story-to-Video Iteration Plan (2025-11-11)

This plan translates the Strategic Goals into actionable tasks for this session. Each phase tracks prerequisites, code/doc touch points, and success checks so subsequent agents can continue seamlessly.

## Phase 0 ─ Baseline & Evidence (✅ in progress)

- **Purpose**: Prove the workstation meets guardrails before modifying code.
- **Tasks**:
  - Run `node -v` (expect `v22.19.0+`) and `pwsh -Version` (expect `7.x`).
  - Execute `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-vitests.ps1 -RunDir logs/precheck`.
  - Inspect `logs/<latest>/run-summary.txt` + `public/artifacts/latest-run.json` for anomalies (e.g., missing duration text, telemetry gaps).
- **Exit criteria**: Vitest suites green, anomalies noted in `notes/codex-agent-notes-20251111.md`.

## Phase 1 ─ Audit & Gap Analysis (✅)

- **Scope**: `scripts/storyGenerator.ts`, `scripts/localStoryProvider.ts`, `scripts/run-comfyui-e2e.ps1`, `scripts/queue-real-workflow.ps1`, `components/ArtifactViewer.tsx`, `public/artifacts/latest-run.json`, `scripts/validate-run-summary.ps1`.
- **Findings**:
  - Run summary logs drop actual durations because `${($result.DurationSeconds)}` is invalid syntax (PS requires `$()`), producing `[Scene …] Duration=s`.
  - Artifact metadata lacks mood/logline per scene and telemetry (GPU stats, archive info) mandated by Strategic Goals.
  - LLM integration swallows provider errors silently; no provenance (URL, seed, timings) is exposed in metadata/UI.
  - UI (ArtifactViewer, timeline panels) only shows prompts/history from metadata; timeline/history components ignore warnings, vitest status, telemetry.
- **Deliverable**: Observations recorded under “Current Observations” in `notes/codex-agent-notes-20251111.md`.

## Phase 2 ─ Story Generator & LLM Enhancements

- **Goals**: Ensure local LLM pathway generates authoritative prompts/moods/loglines and that metadata captures provenance + fallback.
- **Tasks**:
  1. Extend `scripts/storyGenerator.ts` CLI to accept `--useLocalLLM`, `--localLLMSeed`, `--providerUrl` via env/flags consistently with `run-comfyui-e2e.ps1`.
  2. When `fetchLocalStory` fails, capture the exception + provider URL in a structured warning inside story JSON + run summary to maintain traceability.
  3. Persist per-scene moods, expected frame floors, and seeds into generated scene JSON so downstream pipeline can surface them.
  4. Update `scripts/run-comfyui-e2e.ps1` to thread story metadata (generator id, seeds, moods) into `artifact-metadata.json`.
  5. Expand `scripts/__tests__/storyGenerator.test.ts` with cases for: LLM response overriding defaults, fallback warning emission, sample mood propagation.
- **Dependencies**: None beyond existing scripts.
- **Definition of done**: Scenes carry mood/frame floor metadata end-to-end; artifact metadata + UI display them; tests updated.

## Phase 3 ─ Queue Workflow & Telemetry Improvements

- **Goals**: Make `scripts/queue-real-workflow.ps1` and orchestrator emit richer telemetry and smarter retries.
- **Tasks**:
  1. Fix duration formatting in run summary (PowerShell interpolation bug).
  2. Allow `run-comfyui-e2e.ps1` to configure `MaxWaitSeconds`, `HistoryPollIntervalSeconds`, and `MaxAttemptCount`; log these values per attempt.
  3. In `queue-real-workflow.ps1`, record `MaxWaitSeconds`, poll interval, and scene start/end timestamps inside the result object.
  4. Capture ComfyUI `/system_stats` before/after each scene to derive GPU memory + execution duration, and stamp them into metadata + run summary.
  5. Expand `scripts/validate-run-summary.ps1` to assert `[Scene …] HISTORY WARNING/ERROR` lines include attempt counts and that run summary lists telemetry entries when metadata does.
- **Dependencies**: Phase 2 story metadata (frame floors, moods) for improved warnings.
- **Definition of done**: Run summary includes actual durations + telemetry; metadata contains GPU/memory/time stats; validator enforces new fields.

## Phase 4 ─ UI & Metadata Consumption

- **Goals**: Ensure React UI panels show enriched metadata (LLM context, telemetry, warnings) and degrade gracefully.
- **Targets**:
  - `components/ArtifactViewer.tsx`
  - Potentially `TimelineEditor.tsx` / history components (add metadata badges, filters)
  - `App.tsx` wiring if new panels introduced
- **Tasks**:
  1. Extend `ArtifactViewer` props to render per-scene mood, expected frames, requeue reasons, telemetry (duration, GPU stats, poll attempts), Vitest summary.
  2. Highlight warnings/errors in tabular form and provide quick filters (e.g., show only degraded scenes).
  3. Surface run-level telemetry (total frames, GPU usage, archive path) at the top of the panel.
  4. Wire metadata into timeline/history components (if they exist) or document why deferred.
  5. Add lightweight React/Vitest tests (or Storybook snapshots) for the new UI states if infrastructure exists; otherwise document manual QA steps.
- **Definition of done**: UI surfaces LLM storyline context + telemetry, warnings are obvious, and missing data is handled gracefully.

## Phase 5 ─ Testing & Tooling

- **Goals**: Guarantee helper scripts + UI changes are covered.
- **Tasks**:
  1. Extend `scripts/run-vitests.ps1` to optionally run lint/static analysis (if configured) and to summarize suite durations in `vitest-results.json`.
  2. Add targeted tests for new metadata transformations (e.g., Node scripts via `vitest` + `mock-fs`).
  3. Document commands for integration/e2e verification (`scripts/run-comfyui-e2e.ps1`, `scripts/run-vitests.ps1`, optional smoke tests).
- **Definition of done**: Tests cover new logic; `logs/precheck` run remains green; instructions for rerunning tests recorded in execution report.

## Phase 6 ─ Documentation & Reporting

- **Goals**: Keep all mandatory docs consistent with code updates.
- **Docs to update**: `README.md`, `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `STORY_TO_VIDEO_TEST_CHECKLIST.md`, `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, every `E2E_TEST_EXECUTION_*`, `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`, `QUICK_START_E2E_TODAY.md`, `DOCUMENTATION_INDEX_20251111.md`, `START_HERE_COMPLETE_DELIVERY.md`, `REFERENCE_CARD_QUICK.md`.
- **Tasks**:
  1. For each change, cite new behavior, telemetry fields, CLI flags, and validation steps.
  2. Add “Assumptions / Known Issues” sections referencing open items (UI timelines, GPU metrics availability, LLM fallback behavior).
  3. Update execution reports with latest run timestamp, tests executed, and outcomes.
  4. Capture new guidance for troubleshooting (e.g., telemetry mismatches, LLM provider timeouts).
- **Definition of done**: All listed docs mention the new workflow behavior and test expectations; `notes/codex-agent-notes-20251111.md` references doc sync status.

## Riskiest Areas & Mitigations

- **LLM provider availability**: Guard with timeouts and fallback logs; document configuration env vars.
- **Telemetry accuracy**: Cross-check GPU stats/time stamps with ComfyUI `/system_stats`; fallback to “unknown” with explicit warnings if unavailable.
- **UI regressions**: Add screenshot references or manual test steps; ensure TypeScript types cover optional fields so build fails if metadata mismatches occur.
- **Documentation drift**: Track changes in a checklist; block completion until every required doc is updated.

## Next Checkpoint

- After Phase 3 (queue + telemetry) run a full `scripts/run-comfyui-e2e.ps1` cycle to validate 75-frame production, update execution report, and feed data into the UI changes planned in Phase 4.
