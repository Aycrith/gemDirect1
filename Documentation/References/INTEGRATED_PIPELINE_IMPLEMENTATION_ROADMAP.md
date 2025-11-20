# Integrated Pipeline Implementation Roadmap

**Status**: Active Implementation  
**Last Updated**: November 13, 2025  
**Target Completion**: Days 1–10 (from handoff)

---

## Overview

This document operationalizes the "Integrated Pipeline Plan" with ownership, timelines, and success criteria. The pipeline integrates three pillars:

1. **LLM Story Generation** (Mistral 7B via LM Studio)
2. **React UI Synchronization** (story scenes → ComfyUI queue)
3. **ComfyUI Workflow Integration** (done-marker, telemetry enforcement)
4. **Testing & Validation** (automated suites, edge cases, performance)
5. **Deployment & Operations** (NSSM/scheduled tasks, monitoring)

---

## Phase 1: LLM Integration Foundation (Days 1–3)

### Task 1.1: LLM Model & Hosting Confirmation
**Owner**: AI Implementation Lead  
**Dependencies**: None  
**Acceptance Criteria**:
- [ ] Confirm checkpoint: `mistralai/mistral-7b-instruct-v0.3` GGUF (Q4_K_M)
- [ ] LM Studio running on verified address (e.g., `http://192.168.50.192:1234/v1/chat/completions`)
- [ ] LM Studio in CPU-only mode; RTX 3090 available for ComfyUI
- [ ] Health check endpoint validated: `GET /v1/models` returns 200 + model list
- [ ] Node version enforced: `≥ 22.19.0` (via `node -v` check in scripts)
- [ ] Document in README: setup steps, health check URL, override mechanisms

**Files to Update**:
- `README.md` - LM Studio prerequisites section
- `scripts/run-comfyui-e2e.ps1` - LLM health check logic (already in place; verify coverage)
- `.github/workflows/vitest.yml` - Node version check

**Timeline**: 1–2 days

---

### Task 1.2: Prompt Engineering & Versioning
**Owner**: Prompt Engineer / AI QC Team  
**Dependencies**: Task 1.1  
**Acceptance Criteria**:
- [ ] Create `docs/prompts/` directory with versioning scheme (v1.0, v1.1, etc.)
- [ ] Document three story genres (e.g., sci-fi, drama, thriller) with tone/pacing examples
- [ ] Log template metadata: version, author, creation date, target context length, token limit
- [ ] Create `docs/prompts/PROMPT_LIBRARY.md` with all templates and usage notes
- [ ] Fine-tuning plan documented (dataset sources, LoRA approach if applicable)
- [ ] Validate in LM Studio: prompt + response length fits video scene constraints

**Files to Create**:
- `docs/prompts/PROMPT_LIBRARY.md` - Prompt templates with versions
- `docs/prompts/v1.0/story-sci-fi.txt` - Example template
- `docs/prompts/v1.0/story-drama.txt` - Example template
- `docs/prompts/FINE_TUNING_PLAN.md` - Dataset/LoRA approach and status

**Timeline**: 2–3 days

---

### Task 1.3: Quality Metrics & Validation Automation
**Owner**: QA / Product AI Team  
**Dependencies**: Task 1.2  
**Acceptance Criteria**:
- [ ] KPIs documented in `QUALITY_METRICS.md`:
  - Narrative coherence (human review score ≥ 4/5)
  - Scene diversity (entropy over key themes)
  - Prompt-to-scene alignment (semantic similarity ≥ threshold)
- [ ] Automated validators created in `scripts/quality-checks/`:
  - `coherence-check.py` - spaCy-based narrative flow analysis
  - `diversity-check.py` - entropy/theme extraction
  - `similarity-check.py` - BERT-based semantic matching
- [ ] Integration into post-run workflow: validators run after scene generation
- [ ] Results logged to `artifact-metadata.json` under `QualityMetrics` section

**Files to Create**:
- `QUALITY_METRICS.md` - KPI definitions, baselines, and success thresholds
- `scripts/quality-checks/coherence-check.py` - Narrative analysis
- `scripts/quality-checks/diversity-check.py` - Theme entropy
- `scripts/quality-checks/similarity-check.py` - Semantic matching
- `scripts/quality-checks/run-quality-checks.ps1` - Orchestrator

**Dependencies to Add**:
- `spacy` - NLP library
- `transformers` - BERT models
- `scipy` - Entropy calculations

**Timeline**: 2–3 days

---

## Phase 2: React UI & Scene Synchronization (Days 4–6)

### Task 2.1: StoryGenerations Module Enhancement
**Owner**: React Frontend Lead  
**Dependencies**: Task 1.1  
**Acceptance Criteria**:
- [ ] `components/StoryGenerations.tsx` calls local LLM API via `services/localFallbackService.ts`
- [ ] Caching implemented: scene outputs stored in IndexedDB (via `usePersistentState`)
- [ ] Text prompts generated from story data with genre/mood metadata
- [ ] Anchor images produced: use `sample_frame_start.png` or generated via stable-diffusion
- [ ] Telemetry fields added to UI state:
  - LLM response time (seconds)
  - LLM health status (reachable/unavailable)
  - Model name and version
  - Generation errors (if any)
- [ ] Update `types.ts` to include LLMTelemetry fields

**Files to Update**:
- `components/StoryGenerations.tsx` - LLM API integration
- `services/localFallbackService.ts` - Local LLM call logic
- `utils/hooks.ts` - Cache management hook
- `types.ts` - LLMTelemetry type definition
- `utils/database.ts` - IndexedDB schema for story cache

**Timeline**: 2 days

---

### Task 2.2: Scene Watchers & ComfyUI Queue Triggering
**Owner**: React Frontend Lead  
**Dependencies**: Task 2.1  
**Acceptance Criteria**:
- [ ] Implement watchers: every scene (text + anchor) triggers `sceneGenerationPipeline.ts`
- [ ] Metadata injected into ComfyUI payload:
  - `sceneId` (unique identifier)
  - `storyVersion` (from story metadata)
  - `keyframe` (path to anchor image)
  - `prompt` (text prompt from story)
- [ ] Scene metadata written to `artifact-metadata.json` before queue submission
- [ ] UI shows "queued" status immediately after watcher fires
- [ ] Error handling: if queue submission fails, log to telemetry and show error in UI

**Files to Update**:
- `services/sceneGenerationPipeline.ts` - Watcher orchestration
- `components/TimelineEditor.tsx` - Show queue status per scene
- `types.ts` - Add scene watcher state

**Timeline**: 1–2 days

---

## Phase 3: ComfyUI Workflow & Telemetry (Days 4–6 parallel)

### Task 3.1: Verify .done Node Implementation
**Owner**: ComfyUI Workflow Engineer  
**Dependencies**: None  
**Acceptance Criteria**:
- [ ] `workflows/text-to-video.json` contains "Write Done Marker" node (Python-based)
- [ ] Node logic: write to `<prefix>.done.tmp`, atomically rename to `<prefix>.done`
- [ ] Timestamp and frame count logged in marker file
- [ ] Node chain validated:
  - Text prompt → Stable Diffusion text2img → SaveImage → .done writer
  - GPU selection node present; fallback nodes configured
  - FastIteration toggles available (reduce poll interval, post-exec timeout)
- [ ] Documentation added to node definition (cite `os.replace` semantics, ComfyUI docs)
- [ ] Helper script `scripts/deploy-write-done-marker.ps1` copies `comfyui_nodes/write_done_marker.py` to ComfyUI custom_nodes

**Files to Check/Update**:
- `workflows/text-to-video.json` - Node configuration
- `comfyui_nodes/write_done_marker.py` - Implementation
- `scripts/deploy-write-done-marker.ps1` - Deployment helper
- `README.md` - In-workflow node documentation

**References**:
- https://learn.microsoft.com/dotnet/api/system.io.file.replace
- https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py

**Timeline**: 1 day

---

### Task 3.2: Queue Script Telemetry Completion
**Owner**: Queue/Pipeline Engineer  
**Dependencies**: Task 3.1, TELEMETRY_CONTRACT.md  
**Acceptance Criteria**:
- [ ] `scripts/queue-real-workflow.ps1` emits all TELEMETRY_CONTRACT fields:
  - `DurationSeconds`, `QueueStart`, `QueueEnd`
  - `HistoryAttempts`, `HistoryAttemptLimit`, `pollLimit`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryExitReason`
  - `ExecutionSuccessDetected`, `ExecutionSuccessAt`
  - `PostExecutionTimeoutSeconds`, `HistoryPostExecutionTimeoutReached`
  - `SceneRetryBudget`, `GPU.Name`, `GPU.VramBeforeMB`, `GPU.VramAfterMB`, `GPU.VramDeltaMB`
  - `DoneMarkerDetected`, `DoneMarkerWaitSeconds`, `DoneMarkerPath`, `ForcedCopyTriggered`, `ForcedCopyDebugPath`
  - `System.FallbackNotes` (array of warning strings)
- [ ] Done-marker waiting logic implemented (configurable timeout, default 60s)
- [ ] Forced-copy fallback documented: copies frames if marker not detected + emit warning
- [ ] GPU stats collected via `/system_stats` with `nvidia-smi` fallback
- [ ] All fields written to `artifact-metadata.json` Scenes[*].Telemetry
- [ ] Telemetry line logged in `run-summary.txt`: `[Scene ...] Telemetry: ...`
- [ ] Run `verify-telemetry-contract.ps1` script to validate all runs

**Files to Update**:
- `scripts/queue-real-workflow.ps1` - Telemetry collection
- `scripts/verify-telemetry-contract.ps1` - Validator script (create if missing)

**Timeline**: 1–2 days

---

## Phase 4: Testing & Validation (Days 7–8)

### Task 4.1: Edge-Case Simulation Tests
**Owner**: QA Engineer  
**Dependencies**: Phase 2 & 3 tasks  
**Acceptance Criteria**:
- [ ] Create `scripts/__tests__/edge-cases.test.ts` with:
  - LLM unavailability (mock health check failure → queue pauses with fallback note)
  - Forced-copy fallback (done-marker timeout → frames copied + warning logged)
  - Zero-frame requeues (frame count below floor → auto-requeue, max retry budget)
  - GPU unavailability (nvidia-smi fails → fallback to ComfyUI stats or placeholder)
  - Telemetry contract violations (missing fields → validator fails with clear error)
- [ ] Each test verifies telemetry and artifact consistency
- [ ] Tests run via `vitest` with `vmThreads` pool (as per existing setup)
- [ ] Exit code 0 for all passing tests

**Files to Create**:
- `scripts/__tests__/edge-cases.test.ts` - Edge-case suite

**Timeline**: 1–2 days

---

### Task 4.2: Complete Test Suite Run & Reporting
**Owner**: QA Lead  
**Dependencies**: Task 4.1, all Phase 1–3 tasks  
**Acceptance Criteria**:
- [ ] Run full suite 3+ times:
  1. `npm test -- --run` (107 unit tests)
  2. `node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/comfyUIService.test.ts`
  3. `scripts/run-comfyui-e2e.ps1` (full E2E: story → queue → validate)
  4. `scripts/run-vitests.ps1` (aggregate vitest suites)
  5. `scripts/validate-run-summary.ps1 -RunDir logs/<ts>`
  6. `scripts/generate-sweep-report.ps1` (sweep aggregation)
- [ ] For each run: document in `logs/<ts>/TEST_REVIEW.md`:
  - **Preparation**: Node version, ComfyUI status, LM Studio health
  - **Execution Results**: Vitest exit code, E2E duration, frame counts
  - **Logs**: File paths to vitest logs, run-summary.txt, artifact-metadata.json
  - **Issues/Resolutions**: Any failures, retry attempts, fallback triggers
  - **Summary**: Overall assessment (PASS/FAIL, regressions noted)
- [ ] Generate `logs/stability-sweep-<ts>/report.json` aggregating all 3 runs
- [ ] Confirm zero regressions and all mandatory telemetry fields present

**Files to Create**:
- `logs/<ts>/TEST_REVIEW.md` - Per-run review (template)
- `logs/stability-sweep-<ts>/SWEEP_SUMMARY.md` - Cross-run analysis

**Timeline**: 2 days

---

## Phase 5: Performance & Scalability (Days 7–9)

### Task 5.1: Performance Benchmarking
**Owner**: Performance Engineer  
**Dependencies**: Phase 2–4 tasks  
**Acceptance Criteria**:
- [ ] Baseline metrics documented in `PERFORMANCE_BASELINE.md`:
  - Avg frames per scene: target ≥ 25 frames
  - GPU VRAM delta: expected range for SVD + Stable Diffusion
  - Done-marker wait time: histogram of detection latencies
  - LLM response time: P50, P95, P99 latencies
- [ ] Benchmark suite in `scripts/benchmarks.ps1`:
  - Run standard and FastIteration modes 3 times each
  - Capture timing, frame counts, VRAM usage, fallback triggers
  - Store results in `logs/benchmarks-<ts>/results.json`
- [ ] FastIteration mode comparison:
  - Confirm shorter poll interval (e.g., 1s vs. 2s default)
  - Verify post-execution timeout reduced (e.g., 10s vs. 30s default)
  - Ensure frame count meets floor despite faster polling
- [ ] Performance report: `logs/benchmarks-<ts>/ANALYSIS.md`
  - Histogram of scenes by frame count
  - VRAM usage trends
  - Comparison table: standard vs. FastIteration

**Files to Create**:
- `PERFORMANCE_BASELINE.md` - Baseline metrics and targets
- `scripts/benchmarks.ps1` - Benchmark orchestrator
- `logs/benchmarks-<ts>/results.json` - Raw timing data
- `logs/benchmarks-<ts>/ANALYSIS.md` - Performance summary

**Timeline**: 1–2 days

---

### Task 5.2: Capacity & Resource Planning
**Owner**: DevOps / Infrastructure Lead  
**Dependencies**: Task 5.1  
**Acceptance Criteria**:
- [ ] Define capacity thresholds in `SCALABILITY_GUIDE.md`:
  - Max concurrent ComfyUI workflows (based on GPU VRAM)
  - Queue backpressure policy: max retries, heartbeat intervals
  - LM Studio bottleneck: concurrent request limits
- [ ] Implement in `scripts/queue-real-workflow.ps1`:
  - Queue health monitoring: check `/system_stats` before each attempt
  - Back-pressure logic: if GPU VRAM < threshold, wait/log fallback note
  - Heartbeat telemetry: log GPU/LLM status every N seconds
- [ ] Documentation for auto-scaling:
  - Guidance on spinning up additional ComfyUI nodes (multi-GPU setup)
  - Throttle storytelling requests if queue depth exceeds threshold
  - Load-balancing strategy (round-robin or priority queue)
- [ ] Telemetry integration: GPU utilization, queue depth, LLM response latency
  - These fields added to `artifact-metadata.json` under `System.ResourceMetrics`

**Files to Create**:
- `SCALABILITY_GUIDE.md` - Capacity thresholds and auto-scaling recommendations
- `docs/MULTI_GPU_SETUP.md` - Multi-ComfyUI configuration

**Timeline**: 1–2 days

---

## Phase 6: Deployment & Operations (Days 9–10)

### Task 6.1: Deployment Helpers (NSSM & Scheduled Tasks)
**Owner**: DevOps / Infrastructure Lead  
**Dependencies**: Task 3.1 (done-marker script)  
**Acceptance Criteria**:
- [ ] `scripts/install-sentinel-service.ps1` prints NSSM installation command:
  - Example: `nssm install gemDirect1-Sentinel "pwsh" "C:\Dev\gemDirect1\scripts\generate-done-markers.ps1"`
  - Service configured to auto-start, restart on failure
  - stdout/stderr redirected to logs for monitoring
- [ ] `scripts/install-sentinel-scheduledtask.ps1` (-Action install/uninstall):
  - Registers per-user scheduled task (no admin required)
  - Triggered on user logon
  - Runs `generate-done-markers.ps1` in background
- [ ] Both scripts verify write_done_marker.py deployed to ComfyUI/custom_nodes/
- [ ] Documentation in README:
  - NSSM installation steps (link to https://nssm.cc/download)
  - Scheduled task setup for non-admin users
  - Log locations and troubleshooting
- [ ] Test run: start service/task, verify sentinel is running, monitor logs

**Files to Verify/Create**:
- `scripts/install-sentinel-service.ps1` - NSSM command generator
- `scripts/install-sentinel-scheduledtask.ps1` - Scheduled task setup
- `README.md` - Deployment section

**Timeline**: 1 day

---

### Task 6.2: Monitoring & Operations Guide
**Owner**: DevOps / SRE Team  
**Dependencies**: Phase 1–5 tasks  
**Acceptance Criteria**:
- [ ] Create `MONITORING_GUIDE.md`:
  - How to interpret `Telemetry.System.FallbackNotes` (warnings, GPU fallbacks, LLM errors)
  - How to spot anomalies: done-marker wait spikes, frame count degradation
  - Weekly review checklist: inspect sweep reports, identify regressions
  - Escalation path: when to increase poll interval, GPU VRAM, LLM timeout
- [ ] Telemetry dashboard template:
  - Create `docs/DASHBOARD_SETUP.md` with metrics to track (Prometheus/Grafana optional)
  - Key metrics: frames/scene, GPU VRAM delta, LLM latency, requeue rate
- [ ] Incident response playbook:
  - LM Studio down: fallback options, how to pause queue
  - GPU OOM: reduce batch size, increase stability window
  - Done-marker never appears: investigate ComfyUI node logs, check write permissions
- [ ] Automated health checks:
  - Create `scripts/health-check.ps1`: probe LM Studio, GPU, ComfyUI status
  - Can be run via cron/scheduled task for continuous monitoring

**Files to Create**:
- `MONITORING_GUIDE.md` - Operations manual
- `docs/DASHBOARD_SETUP.md` - Metrics and dashboard setup
- `docs/INCIDENT_RESPONSE.md` - Troubleshooting playbook
- `scripts/health-check.ps1` - Automated health probe

**Timeline**: 1–2 days

---

## Phase 7: User Feedback & Documentation (Days 9–10)

### Task 7.1: Feedback Capture UI
**Owner**: React / Product Lead  
**Dependencies**: Phase 2 tasks  
**Acceptance Criteria**:
- [ ] Create `components/FeedbackPanel.tsx`:
  - Rating control: 1–5 star system for each generated scene
  - Comment field: optional text feedback
  - Submission button: POST feedback to backend or store in IndexedDB
- [ ] Integrate into Artifact Snapshot panel:
  - Show feedback control after scene video renders
  - Allow rating before archival
- [ ] Telemetry integration:
  - Store feedback in `artifact-metadata.json` under `Feedback` section
  - Include feedback in `latest-run.json` for UI display
- [ ] Backend/storage: if backend available, POST to feedback API; else use IndexedDB
- [ ] Analytics: aggregate ratings by genre, mood, model version for trending

**Files to Create**:
- `components/FeedbackPanel.tsx` - Feedback UI component
- `utils/feedbackService.ts` - Storage/submission logic
- `types.ts` - FeedbackMetadata type

**Timeline**: 1 day

---

### Task 7.2: Comprehensive Documentation
**Owner**: Technical Writer / Documentation Lead  
**Dependencies**: All Phase 1–6 tasks  
**Acceptance Criteria**:
- [ ] Update `README.md`:
  - LLM integration section: LM Studio setup, health check, CPU-only mode
  - Prompt engineering section: template library location, versioning scheme
  - ComfyUI workflow section: done-marker node, atomic semantics, references
  - Testing pipeline: full automation, FastIteration mode, sweep reports
  - Deployment: NSSM/scheduled task, health checks, monitoring
  - CI/CD section: Node version requirement, vitest pool, GitHub workflow
- [ ] Create `docs/ARCHITECTURE.md`:
  - Data flow: user input → LLM → React UI → ComfyUI queue → artifact
  - Service layer pattern: all external calls via `services/`
  - Telemetry contract: all required fields, enforcement points
- [ ] Create `IMPLEMENTATION_COMPLETE_CHECKLIST.md`:
  - 16 tasks with status (completed, in-progress, blocked)
  - Links to proof (PRs, test runs, artifacts)
- [ ] Ensure all scripts have inline comments referencing external docs:
  - ComfyUI websocket_api_example.py
  - LM Studio health checks documentation
  - File.Replace atomic semantics
- [ ] Create `CITATIONS.md`:
  - All external references (ComfyUI, LM Studio, NSSM, nvidia-smi)
  - Version pinning for reproducibility

**Files to Create/Update**:
- `README.md` - Comprehensive guide
- `docs/ARCHITECTURE.md` - System design
- `IMPLEMENTATION_COMPLETE_CHECKLIST.md` - Rollout tracker
- `CITATIONS.md` - References and versions

**Timeline**: 2 days

---

## Phase 8: CI/CD & Enforcement (Days 9–10 parallel)

### Task 8.1: GitHub Workflow Enforcement
**Owner**: DevOps / CI Lead  
**Dependencies**: Phase 1–7 tasks  
**Acceptance Criteria**:
- [ ] Update `.github/workflows/vitest.yml`:
  - Add Node version check at start: fail if `node -v` < 22.19.0
  - Add LM Studio health check (optional): skip if LOCAL_LLM_SKIP_HEALTHCHECK=1
  - Add telemetry validation: run `verify-telemetry-contract.ps1` on test artifacts
  - Artifact upload: include `comfyui-e2e-<ts>.zip` if FastIteration test enabled
- [ ] Add per-PR checklist comment:
  - Node version requirement
  - Telemetry validation summary
  - Performance regression check (compare against baseline)
- [ ] Enable `runFullE2E` trigger:
  - Manual workflow dispatch to run full E2E on dev machine
  - Results published as `comfyui-e2e-logs` artifact

**Files to Update**:
- `.github/workflows/vitest.yml` - CI workflow
- (Optional) `.github/workflows/full-e2e.yml` - Full E2E trigger

**Timeline**: 1 day

---

## Success Criteria Summary

### All Phases Must Complete With:

1. **Telemetry Contract**:
   - ✓ All fields in `artifact-metadata.json` per TELEMETRY_CONTRACT.md
   - ✓ Validators exit 0 for all test runs
   - ✓ No missing GPU, VRAM, or done-marker fields

2. **Test Coverage**:
   - ✓ 107+ unit tests passing (npm test -- --run)
   - ✓ vitest suites passing with vmThreads pool
   - ✓ 3+ complete E2E runs with zero regressions
   - ✓ Edge-case suite: LLM failover, forced-copy, zero-frame requeue, GPU unavailability

3. **Performance**:
   - ✓ Avg frames ≥ 25 per scene
   - ✓ FastIteration does not degrade frame count
   - ✓ GPU VRAM delta within expected range

4. **Deployment**:
   - ✓ NSSM and scheduled task scripts working
   - ✓ write_done_marker.py deployed to ComfyUI custom_nodes
   - ✓ Health checks operational (LM Studio, GPU, ComfyUI)

5. **Documentation**:
   - ✓ README covers all integration points with examples
   - ✓ Architecture doc describes data flow and service patterns
   - ✓ Citations and version pinning present
   - ✓ Monitoring guide and incident response playbook created

6. **CI/CD**:
   - ✓ Node ≥ 22.19.0 enforced in workflows
   - ✓ Telemetry validation in pipeline
   - ✓ Artifact uploads for manual E2E runs

---

## Timeline Overview

```
Days 1–3:  Phase 1 (LLM Foundation) + Phase 2 Start
Days 4–6:  Phase 2 (React UI) + Phase 3 (ComfyUI Telemetry)
Days 7–8:  Phase 4 (Testing) + Phase 5 (Performance)
Days 9–10: Phase 6 (Deployment) + Phase 7 (Documentation) + Phase 8 (CI/CD)
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LM Studio down | Blocks story generation | Implement fallback provider (Ollama) + health check + UI warning |
| GPU OOM | Workflow fails, zero frames | Monitor VRAM delta, auto-reduce batch size, log fallback note |
| Done-marker never appears | Forced-copy uncertainty | Implement forced-copy fallback with detailed telemetry + UI warning |
| Telemetry missing | Validation fails | Strict field checking + early validator run before archival |
| Performance regression | FastIteration breaks | Baseline benchmarks + sweep aggregation + per-run comparison |
| Node version mismatch | CI failures | Enforce in workflows + README pinning + health check script |

---

## Handoff Checklist

Before marking all phases complete:

- [ ] All 16 tasks have status = COMPLETED
- [ ] PRs merged with test artifacts
- [ ] README updated with links to all new docs
- [ ] Monitoring guide shared with ops team
- [ ] Incident response playbook reviewed with SRE
- [ ] Feedback from product team on UI additions
- [ ] Performance baseline vs. production environment confirmed
- [ ] Deployment helpers tested in non-admin environments
- [ ] CI/CD pipeline running green (3+ consecutive clean runs)

---

## Questions / Escalations

**Q: What if LM Studio not available on Day 1?**  
A: Use Ollama as fallback provider. Document in README. Mark Task 1.1 complete once fallback flow verified.

**Q: What if GPU VRAM insufficient for FastIteration?**  
A: Document VRAM requirement (recommend 24GB+). Add to README. Provide fallback: reduce batch size or disable FastIteration.

**Q: Who owns the weekly review of sweep reports?**  
A: DevOps / SRE team. Use `MONITORING_GUIDE.md` checklist. Escalate regressions to product lead.

**Q: Can we start Phase 4 before all Phase 2 tasks are done?**  
A: No; edge-case tests depend on Scene Watchers (Task 2.2) and telemetry (Phase 3). Parallel: Phase 2 + Phase 3 are independent; Phase 4 + Phase 5 can start after Phase 2 + 3 complete.

---

## References

- https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py (History/execution_success)
- https://lmstudio.ai/docs/api#health-checks (LM Studio health endpoints)
- https://nssm.cc/download (NSSM Windows service manager)
- https://learn.microsoft.com/dotnet/api/system.io.file.replace (Atomic file replace)

