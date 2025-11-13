# Local End-to-End Runbook for gemDirect1 + ComfyUI# Local End-to-End Runbook for gemDirect1 + ComfyUI

This document captures the manual verification steps required to take a completed storyline all the way through the UI, into ComfyUI, and back to the browser.This document captures the manual verification steps required to take a completed storyline all the way through the UI, into ComfyUI, and back to the browser.

## 1. Prepare ComfyUI## 1. Prepare ComfyUI

1. Start the ComfyUI service (Desktop or standalone) and confirm it is responding on `http://127.0.0.1:8000` or `http://127.0.0.1:8188`.1. Start the ComfyUI service (Desktop or standalone) and confirm it is responding on `http://127.0.0.1:8000` or `http://127.0.0.1:8188`.

2. Open the workflows folder inside ComfyUI and load `workflows/text-to-video.json` (or another workflow that matches your prompt schema).2. Open the workflows folder inside ComfyUI and load `workflows/text-to-video.json` (or another workflow that matches your prompt schema).

3. For each imported node, confirm:3. For each imported node, confirm:
   - The positive prompt node (e.g., `CLIPTextEncode`) exposes a `text` input. - The positive prompt node (e.g., `CLIPTextEncode`) exposes a `text` input.

   - The negative prompt node exposes a `text` input. - The negative prompt node exposes a `text` input.

   - The keyframe node is a `LoadImage` with an `image` input. - The keyframe node is a `LoadImage` with an `image` input.

   - Any timeline or JSON node used for `full_timeline_json` has a `json` or equivalent input. - Any timeline/JSON node used for `full_timeline_json` has a `json` or equivalent input.

4. Record or copy each node ID plus input name (`nodeId:inputName`). Later this will become the `mapping` entries inside `LocalGenerationSettings`.4. Record or copy each node ID + input name (`nodeId:inputName`). Later this will become the `mapping` entries inside `LocalGenerationSettings`.

## 2. Align gemDirect1 Settings## 2. Align gemDirect1 Settings

1. Launch the app (`npm run dev`).1. Launch the app (`npm run dev`).

2. In the Local Generation Settings modal:2. In the Local Generation Settings modal:
   - Point `ComfyUI URL` at `http://127.0.0.1:8000` (or the port you use). - Point `ComfyUI URL` at `http://127.0.0.1:8000` (or the port you use).

   - Paste each node mapping (e.g., `positive_clip:text`) and assign the correct data type (`human_readable_prompt`, `negative_prompt`, `keyframe_image`, `full_timeline_json`). - Paste each node mapping (e.g., `positive_clip:text`) and assign the correct data type (`human_readable_prompt`, `negative_prompt`, `keyframe_image`, `full_timeline_json`).

   - Save the workflow. The app will fetch and persist the JSON under `workflowJson`. - Save the workflow. The app will fetch and persist the JSON under `workflowJson`.

3. Confirm the mapping preview matches what the workflow currently exposes (no missing inputs, no renamed nodes).3. Confirm the mapping preview matches what the workflow currently exposes (no missing inputs, no renamed nodes).

## 3. Generate Through the UI## 3. Generate Through the UI

1. Create or select a timeline with at least one shot inside the editor (timeline data must include shot description, enhancers, transitions, and any metadata you expect downstream).1. Create or select a timeline with at least one shot inside the editor (timeline data must include shot description, enhancers, transitions, etc.).

2. Open the **Video Generation** controls and click **Generate All**.2. Open the **Video Generation** controls and click **Generate All**.

3. Watch the status cards for `Local Generation Status` entries; they should show `In queue`, then `Running`, then `Generation complete!`.3. Watch the status cards for `'Local Generation Status'` entries; they should show `'In queue'`, `'Running'`, then `'Generation complete!'`.

4. After completion, check the generated `final_output` data:4. After completion, check the generated `final_output` data:
   - If it is an image, it should render in the status card. - If it is an image, it should render in the status card.

   - If it is video, the sample playback (HTML `<video>`) will appear. - If it is video, the sample playback (HTML `<video>`) will appear.

5. Use the results to populate any downstream continuity or timeline steps.5. Use the results to populate any downstream continuity or timeline steps.

## 4. Troubleshooting## 4. Troubleshooting

- If validation fails with missing mapping errors, re-open the settings modal and ensure each required node or input is paired with `human_readable_prompt`, `negative_prompt`, or `keyframe_image` (see the `validateWorkflowAndMappings` errors).- If validation fails with missing mapping errors, re-open the settings modal and ensure each required node/input is paired with `human_readable_prompt`/`negative_prompt`/`keyframe_image` (see the `validateWorkflowAndMappings` errors).

- Confirm ComfyUI has write access to `ComfyUI/input` if loading keyframes fails.- Confirm ComfyUI has write access to `ComfyUI/input` if loading keyframes fails.

- If the queue never returns a `prompt_id`, check ComfyUI logs for syntax errors inside the workflow JSON.- If the queue never returns a prompt_id, check ComfyUI logs for syntax errors inside the workflow JSON.

- Use the browser console output from `queueComfyUIPrompt` to see the exact payload (`prompt`, `mapping`, `keyframe` name).- Use the browser console output from `queueComfyUIPrompt` to see the exact payload (`prompt`, `mapping`, `keyframe` name).

- Watch for `Resource check` messages in the UI; they surface VRAM status returned from `checkSystemResources`. A `Warning: Low VRAM` string means the server reported less than 2 GB free and you should downscale generation parameters before retrying.- Watch for **Resource check** messages in the UI; they surface VRAM status returned from `checkSystemResources`. A `Warning: Low VRAM` string means the server reported <2 GB free and you should downscale generation parameters before retrying.

## 5. Automation Tips## 5. Automation Tips

- Reuse `services/__tests__/fixtures.ts` to craft `LocalGenerationSettings` for new unit or integration suites.- Reuse `services/__tests__/fixtures.ts` to craft `LocalGenerationSettings` for new unit/integration suites.

- Inject mock functions into `GenerationControls` (via `generateShotVideo` or `generateTimelineVideo`) whenever you want to evaluate the UI without a running ComfyUI server (see `components/__tests__/GenerationControls.test.tsx`).- Inject mock functions into `GenerationControls` (via `generateShotVideo` / `generateTimelineVideo`) whenever you want to evaluate the UI without a running ComfyUI server (see `components/__tests__/GenerationControls.test.tsx`).

- Run `npm run test -- --run` after any change; the combined suites now cover validation, preflight, WebSocket tracking, queueing, and UI progression.- Run `npm run test -- --run` after any change; the combined suites now cover validation, preflight, WebSocket tracking, queueing, and UI progression.

- Use `createWorkflowWithTransitionMetadataSettings()` when you need a timeline JSON payload that includes optional transitions or metadata so the mock queue data mirrors what the real workflow expects.- Use `createWorkflowWithTransitionMetadataSettings()` when you need a timeline JSON payload that includes optional transitions/metadata so the mock queue data mirrors what the real workflow expects.

- Consult `TESTING_GUIDE.md` before adding new coverage so you reuse the same `/upload/image`, `/prompt`, `/queue`, and WebSocket mocking strategies.- Consult `TESTING_GUIDE.md` before adding new coverage so you reuse the same `/upload/image`, `/prompt`, `/queue`, and WebSocket mocking strategies.

## 6. Inspecting Prompt Payloads## 6. Inspecting Prompt Payloads

- Open the browser dev tools network tab before starting a generation run.- Open the browser dev tools network tab before starting a generation run.

- Trigger a new generation and filter requests by `/prompt`.- Trigger a new generation and filter requests by `/prompt`.

- Expand the request payload and verify the injected fields:- Expand the request payload and verify the injected fields:
  - `prompt.positive_clip.inputs.text` contains the combined shot prompt. - `prompt.positive_clip.inputs.text` contains the combined shot prompt.

  - `prompt.timeline_json.inputs.text` matches the serialized timeline JSON. - `prompt.timeline_json.inputs.text` matches the serialized timeline JSON.

  - `prompt.negative_clip.inputs.text` reflects the negative prompt (defaults include blur and artifact guards). - `prompt.negative_clip.inputs.text` reflects the negative prompt (defaults include blur and artifact guards).

  - `prompt.keyframe_loader.inputs.image` shows the uploaded keyframe filename when present. - `prompt.keyframe_loader.inputs.image` shows the uploaded keyframe filename when present.

- Check the `/prompt` response payload; it now includes `systemResources` so you can confirm the GPU or VRAM stats captured during the pre-flight check (handy for debugging low-VRAM runs).- Check the `/prompt` response payload; it now includes `systemResources` so you can confirm the GPU/VRAM stats captured during the pre-flight check (handy for debugging low-VRAM runs).

- If any value is missing, re-open Local Generation Settings and re-sync the workflow so that node IDs stay aligned.

# 7. What to Do Next

- Re-sync your ComfyUI workflow whenever nodes are renamed or replaced; outdated IDs will surface as mapping errors or missing payload data.
- After syncing, re-run the guiding regression command combo (`npx vitest run services/__tests__/generateVideoFlow.integration.test.ts components/__tests__/GenerationControls.test.tsx`) so the busy queue scenario and the UI lifecycle stay green before touching the harness again.
- Keep the fixture mappings in `services/__tests__/fixtures.ts` up to date with any new required inputs (e.g., timeline JSON, optional metadata nodes) so tests mirror live workflows.
- Use `queueResponses` with `queueDelayMs`/`progressDelayMs` to simulate a busy queue across several polls so `local-status-queued` remains visible until the queue drains, just like the new integration queue guard test.
- The UI test suite now uses a controlled generator stub instead of the harness. When you reproduce scenarios manually, emit events in the same order (execution_start before queued before running) and document any new stub sequences here plus `TESTING_GUIDE.md` so the lifecycle remains transparent.
- During manual runs, watch the Local Generation Status card (`data-testid="local-status-queued"`, `local-status-running`, `local-status-progress`, `local-generation-final-output`) to verify the queue guard holds before progress bars and final outputs appear, and confirm that handing `execution_start` before the queued event never unblocks the running state.
- Confirm the `systemResources` warning text (e.g., low VRAM or GPU readiness) appears alongside the initial `local-status-running` update so users see the advisory before heavy execution begins.
- Re-run the service harness with `queueError`, `promptFailure`, `queueStatusError`, `lowVram`, or tailored `queueResponses`/`websocketEvents` sequences when validating warning paths so the simulated `local-status-error`/`local-status-running` messages and the `systemResources` warning text stay aligned with the UI behavior.
- When manually verifying the guarded lifecycle, replay the queue polling failure scenario (exercise the `queueError` knob) and follow the status -> execution_start -> queued -> running -> executed ordering described in ComfyUI's `websockets_api_example.py` so the UI guard keeps the card queued until explicit queue information arrives.
- If the UI flips to running without showing `local-status-queued`, align the controlled generator sequence (and this runbook) with the observed behaviour, then update `components/__tests__/GenerationControls.test.tsx`, `TESTING_GUIDE.md`, and this file to reflect the new ordering they've seen.
- Current gaps (Nov 10, 2025): the queue wait regression still shows a premature transition when `/queue` replies immediately; run a manual script with `queueResponses` holding `queue_pending` > 0 and verify `local-status-queued` stays pinned until the harness publishes the queued event. If the guard fails, update `handleShotProgress`, record the exact knobs used, and cite the ComfyUI [`websockets_api_example.py`](https://github.com/comfyanonymous/ComfyUI/blob/master/scripts/websockets_api_example.py) ordering in this file and the related test.
- Whenever you touch the lifecycle or harness knobs, append the change log here, mirror it in `TESTING_GUIDE.md` Section 2, `NEXT_SESSION_START_HERE.md`, `COMPREHENSIVE_ANALYSIS_AND_PLAN.md`, and `DOCUMENTATION_INDEX.md`, and rerun `npx vitest run components/__tests__/GenerationControls.test.tsx` plus `npx vitest run services/__tests__/generateVideoFlow.integration.test.ts components/__tests__/GenerationControls.test.tsx` before committing.
