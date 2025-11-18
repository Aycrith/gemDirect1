# Testing Guide — ComfyUI Integration Harness

Use this guide whenever you add coverage for the ComfyUI bridge, so the next agent can reuse the same patterns reliably.

## 1. Service-Level Harness (`services/__tests__/generateVideoFlow.integration.test.ts`)

1. **Reuse the shared harness** in `services/__tests__/mocks/comfyUIHarness.ts`.
   - It mocks `/system_stats`, `/upload/image`, `/prompt`, `/queue`, and injects WebSocket progress via `trackExecution`.
   - Pass `lowVram`, `promptFailure`, `queueError`, or the new `queueStatusError` flag to replay system warnings, queue rejections, and HTTP `/queue` failures without rewriting fetch mocks.
   - Supply `queueResponses` sequences along with `queueDelayMs`/`progressDelayMs` so you can simulate queue timeouts and keep `local-status-queued` visible until the harness emits running updates.
   - Inspect `harness.recordedPrompts` to assert payload contents (positive prompt, negative prompt, timeline JSON, metadata node, keyframe filename, and client id).
2. **Advance timers** (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`) to flush the 2 000 ms poller and the 1 000 ms inter-shot delay.
3. **Assert resource warnings**: `queueComfyUIPrompt` now returns `systemResources`; ensure tests verify low-VRAM warnings trigger progress updates before queueing completes.
4. **Drive metadata coverage** using `createWorkflowWithTransitionMetadataSettings()`—the harness checks that `metadata_writer` inputs receive the serialized timeline JSON (including `transitions` and `audio`).
5. Use `generateTimelineVideos` with the same harness by passing a `shotGenerator` that calls `generateVideoFromShot` with the mocked dependencies, and keep the UI tests aligned with the harness lifecycle: the component now pauses on `local-status-queued` before showing running/progress updates (`data-testid="local-status-queued"` → `local-status-running` → `local-generation-final-output`). If you change that order, update this guide and `COMFYUI_LOCAL_RUNBOOK.md` Section 7, rerun `npm run test -- --run components/__tests__/GenerationControls.test.tsx`, and note the new expectation so future agents know which lifecycle to document.

## 2. UI Lifecycle Testing (`components/__tests__/GenerationControls.test.tsx`)

1. The UI suite now relies on a controlled generator stub (createControlledGenerator) instead of the shared harness. The stub exposes an emit(index) helper so tests can deterministically release queued -> running -> complete updates without juggling fake timers or WebSocket delays.
2. Every call to emit() is wrapped in await act(async () => emit(n)) to keep React state updates scoped correctly. Follow that pattern whenever you add new lifecycle assertions so the tests stay warning-free.
3. Use the data-testid hooks in LocalGenerationStatus.tsx (local-status-queued, local-status-running, local-status-complete, local-generation-progress, local-status-message, local-generation-final-output) to assert rendered state after each emission.
4. Guard regressions are caught by emitting the execution_start update before the queued event; the stub mirrors the ordering described in ComfyUI's [websockets_api_example.py](https://github.com/comfyanonymous/ComfyUI/blob/master/scripts/websockets_api_example.py). handleShotProgress must ignore those premature running messages until a queued payload with queue_position (or a queue-themed message) arrives, and low-VRAM warnings should keep the card in the queued state until the explicit queued event follows.
5. Extend the stub and the service harness together whenever you simulate warnings, queue rejections, prompt failures, WebSocket stalls, or queue polling failures. Capture the sequence of knobs (queueResponses, queueDelayMs, progressDelayMs, queueError, queueStatusError, promptFailure, lowVram, websocketEvents) in the test description so the UI/service expectations remain aligned; the new queue polling failure scenario exercises `queueError` and follows the status -> execution_start -> queued -> running -> executed order referenced in ComfyUI's `websockets_api_example.py`.
6. When you add a new stub scenario, document it here and in COMFYUI_LOCAL_RUNBOOK.md Section 7, NEXT_SESSION_START_HERE.md, and DOCUMENTATION_INDEX.md (include the shared knob list and the command used to run the regression). That keeps every agent aware of which fixture (stub vs. harness) drives the guarded lifecycle.
7. After touching either suite, rerun these regression commands so the queue guard stays synchronized:
   1. npx vitest run components/__tests__/GenerationControls.test.tsx
   2. npx vitest run services/__tests__/generateVideoFlow.integration.test.ts components/__tests__/GenerationControls.test.tsx
   3. (Optional) npx vitest run for the entire matrix once the core suites are stable.

> Research tip: Use MCP/web tooling to inspect ComfyUI queue/poll ordering and cite the precise example you referenced so future agents can reproduce the payload sequence.

### Scene Generation Pipeline
- `npx vitest run services/__tests__/sceneGenerationPipeline.test.ts`
- Covers the shot-planning helper (prompt synthesis + negative prompt inheritance), keyframe synthesis via the selected media provider, and the orchestration that feeds those assets directly into `generateTimelineVideos`. Keep this suite green whenever you change the media-generation bridge so TimelineEditor’s auto-prep flow stays reliable.

## Helper artifacts & diagnostics (how tests capture evidence)

The ComfyUI bridge emits small, deterministic diagnostics so Playwright and unit tests can assert the presence of key artifacts without transferring large binaries. Use these hooks in tests and E2E runs:

- Console anchor: `GEMDIRECT-KEYFRAME:` — printed by `fetchAssetAsDataURL` with the first ~200 characters of the fetched data URL. Playwright tests can capture this via a `page.on('console', ...)` handler or by enabling trace/logging.
- Global in-page diagnostics:
   - `window.__gemDirectComfyDiagnostics` — short diagnostic entries recorded by `queueComfyUIPrompt` (attempts, prompt posting, results, queue snapshot notices).
   - `window.__gemDirectClientDiagnostics` — keyframe-prefixed diagnostics recorded by `fetchAssetAsDataURL` (keyframe-fetched events and compact prefixes).

Examples (Playwright):

```ts
// capture console lines
const consoleMessages: string[] = [];
page.on('console', msg => consoleMessages.push(msg.text()));

// later assert the GEMDIRECT anchor was logged
expect(consoleMessages.some(m => m.includes('GEMDIRECT-KEYFRAME:'))).toBeTruthy();

// or read the in-page diagnostics directly
const diag = await page.evaluate(() => (window as any).__gemDirectComfyDiagnostics || []);
expect(diag.length).toBeGreaterThan(0);
```

Record that the test harness and the UI suite both push small diagnostics to these globals; include checks for them in WAN E2E tests to strengthen traceability for keyframes, helper logs, and queue lifecycle events.

## 3. Running the Suite

```bash
npm run test -- --run services/__tests__/generateVideoFlow.integration.test.ts
npm run test -- --run components/__tests__/GenerationControls.test.tsx
npm run test -- --run
```

## 4. Reporting & Next Steps

- Document any new harness options you add here (and link them from `DOCUMENTATION_INDEX.md`).
- When extending fixtures (metadata nodes, optional transitions, audio descriptors), update `services/__tests__/fixtures.ts` and reference the new helpers.
- Use the shared harness in both service and UI suites so `/prompt` failures, queue timeouts, and low-VRAM warnings remain consistent.
- Add a regression that uses the harness' `queueResponses` sequence so a busy queue is simulated until the next poll shows zero pending work, keeping the new `services/__tests__/generateVideoFlow.integration.test.ts` queue-wait scenario aligned.
- Add tests for new output types (e.g., MP4 vs. PNG) and ensure payload assertions cover every mapped node, including `metadata_writer` and optional `audio_descriptor` entries.
- When mocking `/queue`, include rejection scenarios (timeouts, low VRAM) so `generateVideoFromShot` continues surfacing actionable diagnostics.
- After changing `handleShotProgress` or the harness sequencing, immediately update this guide, `COMFYUI_LOCAL_RUNBOOK.md` Section 7, `NEXT_SESSION_START_HERE.md`, and `DOCUMENTATION_INDEX.md`, then rerun `npx vitest run components/__tests__/GenerationControls.test.tsx` and `npx vitest run services/__tests__/generateVideoFlow.integration.test.ts` to confirm the documented lifecycle still matches observed behaviour.
