# AI Agent Tasking Prompt: React Frontend with Local LM + ComfyUI

Use this prompt verbatim to brief an AI agent that will continue development and thorough testing of a React-based frontend wired to a local Language Model (LM) for text generation and ComfyUI for image/video generation. Emphasize strict context management to avoid overruns in browser-based testing sessions.

---

## System Overview
- **Application**: React SPA frontend that drives two local backends: (1) a local LM (e.g., Llama, GPT-J) exposed via HTTP API or direct model call for text generation, and (2) ComfyUI (node-based Stable Diffusion workflow runner) for image/video generation. State is managed via Redux or React Context.
- **Data Flow**:
  - User submits prompts/settings in the React UI.
  - Frontend calls LM endpoint for text; receives streaming or buffered responses.
  - Frontend triggers ComfyUI workflows (image/video) using user prompt or LM-generated text; monitors job status and retrieves resulting media.
  - UI renders text, images, and videos with progress indicators and export/download options; handles retries/errors gracefully.
- **Performance Targets**: Text responses <5s median, images <30s, videos <2m; handle concurrent requests without UI lock; responsive across desktop/mobile.
- **Context/IO Constraints**: Assume finite context. Keep messages short, structured, and stateful; avoid dumping large logs or payloads. Persist artifacts to files and refer by path. Summarize aggressively after each major action.
- **Interop Targets**: Primary comms between gemdirect frontend, LM Studio (LLM), and ComfyUI must stay in sync. Define/confirm API contracts, ports, auth, and content-type expectations upfront; detect and log any divergence early.

## Development Continuation Plan
1) **Recon & Setup**
   - Start in a fresh session; do not assume prior state. Install dependencies: Node.js for React app; Python/Conda environment with ComfyUI and required Stable Diffusion models/checkpoints; local LM runtime (e.g., llama.cpp, GPT-J server) reachable via HTTP or direct bindings. Confirm API base URLs, ports, and auth (if any). Document assumptions in a short scratchpad.
   - Record baseline endpoints/configs (e.g., LM Studio defaults: `http://127.0.0.1:1234/v1`, ComfyUI API/WS defaults: `http://127.0.0.1:8188`, `ws://127.0.0.1:8188/ws`). Note if overridden.
2) **Code Review & Hardening**
   - Inspect current React code (components, hooks, Redux/Context store, services). Improve error handling, type safety, and async flow (loading, success, failure states). Ensure clean separation of concerns for LM and ComfyUI clients.
   - Verify API client modules for LM and ComfyUI: timeouts, cancellation, retries with backoff, and structured errors.
   - Enforce accessibility (ARIA), responsive layout, and mobile readiness.
3) **Feature Implementation/Refinement**
   - **Inputs**: Prompt fields, generation parameters (temperature, max tokens, CFG, steps, seed), media type toggles, file upload (optional refs), presets.
   - **Outputs**: Text response viewer (streaming if available), image/video gallery with metadata, download/export (PNG/MP4/JSON for workflow), copy-to-clipboard, and shareable prompt payloads.
   - **Progress & Status**: Spinners/bars for LM/ComfyUI jobs, queue status, cancellation controls, and retry paths.
   - **Pipelines**: End-to-end flow: User prompt -> LM text -> feed text into ComfyUI image/video workflow -> display results. Support manual override of prompts for media.
   - **State Management**: Centralize request state; avoid race conditions; debounce inputs; persist recent prompts/results locally (e.g., localStorage) with opt-in.
4) **Integration**
   - Wire LM client to local model endpoint (HTTP/WS/CLI wrapper). Support streaming tokens when available.
   - Wire ComfyUI client to trigger workflows, poll/subscribe to job status, and fetch assets. Handle workflow IDs, output paths, and intermediates.
   - Provide configuration layer (env vars or config file) for endpoints, model names, timeouts, and paths; include sensible defaults for local setups.
   - Add observability: structured logs with correlation IDs, per-request timing, and explicit error codes for LM vs ComfyUI. Include a lightweight health/handshake check.
   - Add a "traffic light" readiness gate in UI/testing: green when both LM Studio + ComfyUI are reachable and contracts validated; yellow when degraded; red blocks tests.
   - Normalize timeouts and payload limits across LM and ComfyUI clients; surface mismatches as warnings before running full flows.
5) **Documentation**
   - Update setup/run guides for React app, LM server, and ComfyUI (Python/Conda). Include environment variables, commands, and expected ports.
   - Document workflows/presets and how to add new ones. Include troubleshooting (model not loaded, CUDA issues, missing checkpoints).

## Context Management & Token Discipline (Critical)
- Keep a rolling scratchpad of essential state only: API base URLs, ports, model names, workflow IDs, current branch/commands used, pending tasks, and latest test outcomes. Refresh it whenever state changes.
- Chunk-reading policy: For large files/logs, read in sections, summarize each chunk, and store summaries with file paths. Retain only key identifiers (function names, endpoints, selectors).
- Do not paste large JSON, traces, screenshots, or binary data. Save artifacts to disk and refer to them by path and key findings.
- In Playwright/browser runs, disable verbose logging unless needed. Capture traces and screenshots, then summarize. Avoid copying entire trace text into the conversation.
- After any significant action (code change, test run), emit a compact summary and next steps; avoid recounting history.
- If nearing context limits, prune aggressively: keep current goal, open blockers, assumptions, and the next 2-3 actions. Drop past details that are already captured in files.
- Prefer short, structured responses (bullets, key-value) over narrative; avoid repetition.
- For long sessions, checkpoint with a single-page status file (what changed, test results, open issues) and rely on that instead of history replay.
- When browser testing, prefer DOM/query-only outputs and summarized console errors; avoid streaming console logs into context.
- Use a strict response budget: default to <=120 tokens per message unless delivering a recap; compress older summaries into a single "state-of-play" note every few turns.
- Keep a "known-good constants" block (ports, routes, auth headers, model names, workflow IDs) and reference it instead of restating details.
- Keep an external scratchpad file for the session (paths, endpoints, current branch, active feature) and overwrite, not append, to limit size.
- In Playwright, disable verbose console/network capture by default; enable trace/video only on failure. When enabled, store artifacts and cite the paths instead of inlining.

## Testing Strategy (User-Centric + Automated)
- **Shift from prior NPM/Playwright assumptions**: Rebuild tests around real-user flows rather than generic E2E scripts.
- **End-to-End User Flows**:
  - Text: Prompt -> LM response rendered (stream/buffer) under 5s.
  - Media: Prompt (or LM-generated text) -> ComfyUI workflow -> image (<30s) or video (<2m) returned and displayed.
  - Chained: Prompt -> LM text -> feed into ComfyUI -> media displayed with metadata and download.
- **Edge/Resilience Cases**: Invalid inputs, empty prompts, oversized payloads, network drops, slow model load, model/ComfyUI failures, cancellation mid-flight, concurrent requests, offline/timeout paths, mobile viewport.
- **Performance**: Measure latency vs targets; concurrent run handling; resource usage in UI; ensure UI remains interactive.
- **Cross-System Sync & Redundancy**:
  - Contract checks: Validate request/response shapes to LM Studio and ComfyUI on startup and before tests. Fail fast on mismatched schemas/status codes/content-types.
  - Health gates: Add lightweight health pings for gemdirect -> LM Studio and gemdirect -> ComfyUI before each suite; retry with backoff; log deltas.
  - Correlation IDs: Propagate IDs across LM->ComfyUI pipeline; assert they appear in both logs/responses to detect desync.
  - Dual-path tests: Run with both real services and contract-preserving mocks to isolate frontend logic vs backend integration.
  - Redundant runs: Re-run flaky or long-path scenarios twice; flag divergent outputs or timings.
  - Desync probes: Inject slight delays/failures in LM responses and ensure ComfyUI path handles them (timeouts, retries). Verify UI surfaces the correct source of failure.
  - Data integrity: Assert prompt text/hash used for LM matches what ComfyUI receives when chaining to media generation.
  - Cross-system timelines: capture timestamps for LM request/response and ComfyUI job start/finish; verify ordering and gaps.
  - Browser network tap: log request/response metadata (URL, status, duration, corr-id) in a capped ring buffer; assert presence of expected calls.
  - Port/protocol drift checks: verify expected ports/protocols (HTTP/WS) before suite; fail fast on mismatches.
  - Out-of-order/duplication checks: simulate concurrent prompts to ensure LM and ComfyUI handle ordering; UI must show correct pairing via correlation IDs.
- **Automated Tests (Playwright)**:
  - Spin up local LM/ComfyUI (or mock APIs with the same contract if real services unavailable, but prefer real services).
  - Cover core flows, edge cases, cancellations, retries, and regressions in UI state.
  - Add assertions on timings where practical; surface metrics in the test report; keep logs to summaries.
- **Manual Verification**: Assess subjective media quality (coherence/artifacts), UI responsiveness, accessibility (keyboard nav, focus states), and cross-browser/device checks.
- **Outputs**: Produce test scripts, run results (pass/fail, timings, issues), and a concise test report. Summaries must be context-efficient.

## Requirements & Constraints
- Operate as if starting fresh: no prior context/state assumed.
- Dependencies: Node.js (React build/test), Python/Conda with ComfyUI + Stable Diffusion assets, local LM runtime (Llama, GPT-J, etc.), Playwright for UI tests.
- Integration contracts must be documented (request/response shapes, endpoints, expected status codes, error formats, timeouts).
- Favor local/offline operation; avoid external services unless explicitly documented.
- Ensure final app is fully functional, tested, and ready for deployment with clear setup/usage docs.
- Apply context discipline throughout: short messages, chunked reading, artifact references by path, and recurring summaries rather than full logs.
- When testing in browser/Playwright, minimize token-heavy chatter: short asserts, summarized console captures, and pointer to artifacts only.
- Build redundancy into tests: preflight contracts, health gates, dual-path runs, and desync probes between gemdirect, LM Studio, and ComfyUI.
- Maintain a capped artifact index (paths, purpose, timestamp) to avoid repeating descriptions of saved logs/traces.
- Default to "quiet" test mode: minimal console, no trace/video unless failure. For exploratory debugging, enable verbose but reset to quiet immediately after.

## Step-by-Step Instructions for the Agent
1) Install/validate toolchain (Node/PNPM/NPM, Python/Conda, Playwright browsers, LM server, ComfyUI). Note versions and endpoints in the scratchpad.
2) Inspect existing repo: identify LM/ComfyUI client code, UI components, and state management. Summarize key gaps instead of quoting files verbatim.
3) Harden API clients (timeouts, retries, cancellation, structured errors) and wire configuration options.
4) Implement/refine UI features: input forms, status indicators, result viewers, downloads/exports, prompt chaining.
5) Ensure responsive design, accessibility, and concurrency-safe state updates.
6) Create/update Playwright tests for text, image, video, chained flows, edge cases, cancellations, and latency budgets. Keep test logs summarized; store artifacts.
7) Run tests against local LM/ComfyUI; capture pass/fail, timings, and issues. Summarize results; keep detailed traces in files.
8) Update documentation (setup, configuration, testing instructions, troubleshooting) succinctly; link to artifacts instead of embedding long content.
9) Deliver updated code, test scripts, test report, and recommendations for next improvements.
10) Produce a sync report: confirmed contracts, endpoint configs, observed latencies, any divergence between gemdirect, LM Studio, and ComfyUI, plus remediation steps.
11) Produce a context hygiene note: current scratchpad, constants block, artifact index path, and the latest compressed "state-of-play" summary.
12) Add a drift matrix: LM vs ComfyUI vs gemdirect endpoints, auth, ports, timeouts, content-types, and last-seen schema version; flag any deviation.

## Expected Deliverables
- Updated React code and integration clients for LM and ComfyUI.
- Playwright automated test suite covering text/media/chained flows and resilience cases.
- Test report (pass/fail summary, latency notes, issues found) and a short recommendations list.
- Up-to-date docs for setup, configuration, running, and testing on a local machine.
- Context-light status summaries suitable for limited context windows.
- Sync report across gemdirect, LM Studio, and ComfyUI, plus a context hygiene note for future agents.
