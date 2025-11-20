# Implementation Plan: Local Integration v2 Telemetry & Queue Policy
**Date**: November 12, 2025  
**Status**: Ready for Implementation  
**Scope**: Complete telemetry/queue policy enforcement and UI integration

---

## Current State Assessment

### ✓ Already Implemented
1. **Queue scripts** capture telemetry (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, HistoryExitReason, ExecutionSuccessDetected, ExecutionSuccessAt, PostExecutionTimeoutSeconds, GPU VRAM deltas, fallback notes)
2. **LM Studio health checks** with `/v1/models` probe, LOCAL_LLM_HEALTHCHECK_URL override, and LOCAL_LLM_SKIP_HEALTHCHECK option
3. **Queue knobs** (SceneMaxWaitSeconds, SceneHistoryMaxAttempts, SceneHistoryPollIntervalSeconds, ScenePostExecutionTimeoutSeconds, SceneRetryBudget) passed via CLI and ENV vars
4. **Run summary** logs queue policy line and telemetry
5. **Artifact metadata** collected in JSON
6. **Validator** checks for telemetry fields
7. **Vitest runner** outputs vitest-results.json with exit codes/logs
8. **Producer sentinel handshake & FastIteration logging**: `scripts/generate-done-markers.ps1` plus the `write_done_marker.py` helper create atomic `<prefix>.done` sentinels, `queue-real-workflow.ps1` waits for them (logging `DoneMarker*` and forced-copy fields in telemetry plus `forced-copy-debug-<ts>.txt`), `scripts/install-sentinel-service.ps1` publishes an NSSM command, and `scripts/run-comfyui-e2e.ps1 -FastIteration` now notes the reduced poll/post-exec windows inside `run-summary.txt` so quick-turn runs are explicit in the logs.

### ⚠️ Gaps to Address
1. **Telemetry logging in run-summary** - pollLimit field present but needs verification it always matches metadata
2. **GPU VRAM fieldnames** - using VramBeforeMB/VramAfterMB/VramDeltaMB (need to verify consistent naming)
3. **Validator telemetry checks** - needs to verify all fields are present (especially GPU.VramDeltaMB might be checking VramDelta)
4. **UI/Hooks** - no hooks for fetching/displaying the new queue/telemetry metadata
5. **Documentation** - needs complete refresh on the telemetry contract and reading order

---

## Priority Implementation Phases

### Phase 1: Validator Enhancement (Quick Win)
**File**: `scripts/validate-run-summary.ps1`
- Fix VRAM field name checking (VramDeltaMB vs VramDelta)
- Add more detailed error messages for missing telemetry
- Check that all fallback notes from metadata appear in summary
- Verify SceneRetryBudget appears in telemetry line

**Expected Output**: validator catches 100% of missing telemetry fields

### Phase 2: Documentation Pass (Foundation)
**Files**:
- README.md - ensure telemetry section is clear, mention `run-summary` FastIteration/logging line, and document the producer `.done` sentinel plus forced-copy telemetry handling
- DOCUMENTATION_INDEX_20251111.md - refresh "Required Telemetry & Queue Policy Orientation" and describe the sentinel handshake plus forced-copy debug artifacts
- STORY_TO_VIDEO_PIPELINE_PLAN.md - add telemetry/queue details
- HANDOFF_SESSION_NOTES.md - ensure complete
- Add new `TELEMETRY_CONTRACT.md` - explicit spec document

**Expected Output**: All docs aligned on telemetry fields and reading order

### Phase 3: UI Hooks & Components (Value Add)
**Files**:
- `utils/hooks.ts` - add useArtifactMetadata hook to fetch and parse both JSON files
- Components need updating to display queue policy card with telemetry badges

**Expected Output**: UI can render queue policy, telemetry, GPU stats, fallback notes

### Phase 4: Testing & Validation (Closure)
**Files**:
- Run validator against an actual run
- Check UI renders correctly
- Document results in WINDOWS_PIPELINE_VALIDATION_20251112.md

---

## External References & Traceability

### LM Studio API Documentation
- **URL**: https://lmstudio.ai/docs/api#health-checks
- **Used for**: `/v1/models` endpoint resolution, override URL logic, skip flag handling
- **Comments**: Added to run-comfyui-e2e.ps1 lines 61-62, 283-299

### ComfyUI WebSocket History API
- **URL**: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
- **Used for**: History polling status codes, exit reason values (maxWait, attemptLimit, postExecution, success)
- **Comments**: Referenced in queue-real-workflow.ps1 line 106, run-comfyui-e2e.ps1 line 544

### Telemetry Field Definitions
| Field | Source | Purpose | Example |
|-------|--------|---------|---------|
| DurationSeconds | queue script timings | Total execution time | 45.2 |
| MaxWaitSeconds | CLI param | History polling budget | 600 |
| PollIntervalSeconds | CLI param | Sleep between polls | 2 |
| HistoryAttempts | count in poll loop | How many times we checked | 150 |
| HistoryAttemptLimit | CLI param (0=unlimited) | Max allowed attempts | 150 |
| pollLimit (text) | derived from HistoryAttemptLimit | Summary field for UI | "150" or "unbounded" |
| HistoryExitReason | logic in queue script | Why polling stopped | "success", "maxWait", "attemptLimit", "postExecution" |
| ExecutionSuccessDetected | $historyData ne $null | Did /history contain results? | true/false |
| ExecutionSuccessAt | ISO8601 timestamp | When success detected | 2025-11-12T10:23:45Z |
| PostExecutionTimeoutSeconds | CLI param | Post-exec timeout | 30 |
| HistoryPostExecutionTimeoutReached | boolean flag | Did we hit post-exec timeout? | false |
| SceneRetryBudget | CLI param | Auto-requeue allowance | 1 |
| GPU.Name | /system_stats or nvidia-smi | GPU model | "NVIDIA GeForce RTX 3090" |
| GPU.VramBeforeMB | /system_stats or nvidia-smi | Free VRAM before (MB) | 24000.0 |
| GPU.VramAfterMB | /system_stats or nvidia-smi | Free VRAM after (MB) | 22500.0 |
| GPU.VramDeltaMB | computed | VRAM change (MB) | -1500.0 |
| System.FallbackNotes | array | Warnings if /system_stats failed | "/system_stats unavailable; using nvidia-smi fallback" |

---

## Detailed Task Breakdown

### Task 1.1: Fix Validator VRAM Field Checks
**File**: `scripts/validate-run-summary.ps1` line 193

Current (possibly wrong):
```powershell
if ($null -eq $scene.Telemetry.GPU.VramDelta) {
    $errors += "Scene $sceneId telemetry missing GPU VRAM delta."
}
```

Should be:
```powershell
if ($null -eq $scene.Telemetry.GPU.VramDeltaMB) {
    $errors += "Scene $sceneId telemetry missing GPU VramDeltaMB."
}
```

**Impact**: Validator will now correctly detect missing GPU.VramDeltaMB field

### Task 1.2: Add Fallback Notes Validation
**File**: `scripts/validate-run-summary.ps1` after telemetry GPU checks

Add:
```powershell
if ($scene.Telemetry.System -and $scene.Telemetry.System.FallbackNotes -and $scene.Telemetry.System.FallbackNotes.Count -gt 0) {
    $fallbackPattern = "\[Scene\s+$escapedSceneId\].*fallback="
    if ($text -notmatch $fallbackPattern) {
        $errors += "Scene $sceneId has fallback notes in metadata but summary missing fallback entry."
    }
}
```

**Impact**: Validator ensures fallback warnings in metadata are reflected in run summary

### Task 1.3: Add Explicit SceneRetryBudget Check
**File**: `scripts/validate-run-summary.ps1` after pollLimit validation (around line 175)

Verify the telemetry line contains "SceneRetryBudget=" that matches metadata

**Impact**: Catch cases where telemetry line is incomplete

### Task 2.1: Create Telemetry Contract Documentation
**File**: Create `TELEMETRY_CONTRACT.md` at root

Content:
- Telemetry field definitions table (from above)
- Queue policy knobs mapping (CLI → metadata → UI)
- Health check contract (input/output)
- Artifact expectations
- External references with URLs

**Impact**: Single source of truth for telemetry requirements

### Task 2.2: Update README.md Section on Local Testing
**File**: `README.md` lines 31-36

Enhance with:
- Explicit list of which telemetry fields must appear in [Scene...] Telemetry: lines
- Reference to TELEMETRY_CONTRACT.md
- Note about external docs (LM Studio, ComfyUI)

**Impact**: Clearer expectations for new agents

### Task 2.3: Document sentinel/done marker & FastIteration heuristics
**Files**: `README.md`, `DOCUMENTATION_INDEX_20251111.md`

Add:
- A description of the producer-side `.done` sentinel generation (`scripts/generate-done-markers.ps1`, `write_done_marker.py`, `scripts/install-sentinel-service.ps1`) and how the queue consumer logs `DoneMarkerFound`, `DoneMarkerWaitSeconds`, and forced-copy telemetry fields
- A note that `run-comfyui-e2e.ps1 -FastIteration` shortens `PollIntervalSeconds`/`PostExecutionTimeoutSeconds` and explicitly logs the override inside `run-summary.txt`
- References to the forced-copy debugging dump files (`forced-copy-debug-*.txt`) so operators can inspect stale data.

**Impact**: Operators can trace sentinel failures in documentation and reproduce FastIteration logs reliably

### Task 3.1: Add useArtifactMetadata Hook
**File**: `utils/hooks.ts`

New function:
```typescript
export function useArtifactMetadata() {
  const [metadata, setMetadata] = useState<{
    queueConfig: QueueConfig | null;
    scenesTelemetry: Record<string, SceneTelemetryMetadata>;
    llmHealth: LLMHealthCheckMetadata | null;
    artifactIndex: ArtifactIndexData | null;
  }>(...);
  
  useEffect(() => {
    // Fetch both artifact-metadata.json and public/artifacts/latest-run.json
    // Merge and expose telemetry/queue data
  }, []);
  
  return metadata;
}
```

**Impact**: Components can consume queue policy and telemetry data

### Task 3.2: Update ArtifactViewer Component
**File**: `components/ArtifactViewer.tsx` (if exists) or create it

Display:
- Queue policy card (SceneRetryBudget, HistoryMaxAttempts, etc.)
- Telemetry badges (duration, VRAM delta, exit reason, etc.)
- Fallback notes as warnings
- Archive + Vitest log links

**Impact**: UI shows all critical metadata without opening JSON

---

## Testing Strategy

### Manual Test Checklist
1. **Run a test**: `pwsh scripts/run-comfyui-e2e.ps1 -SceneRetryBudget 1 -SceneMaxWaitSeconds 600`
2. **Check summary**: `Get-Content logs/<ts>/run-summary.txt | grep Telemetry`
   - Should show: DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, pollLimit, SceneRetryBudget, ExecutionSuccessAt, HistoryExitReason, GPU, VRAMBeforeMB, VRAMAfterMB, VRAMDeltaMB, and any fallback notes
3. **Check metadata**: `Get-Content logs/<ts>/artifact-metadata.json | ConvertFrom-Json | select -expand Scenes | select Telemetry`
   - Verify all fields present
4. **Run validator**: `pwsh scripts/validate-run-summary.ps1 -RunDir logs/<ts>`
   - Should pass with exit code 0
5. **Check UI**: Open http://localhost:3000, navigate to Artifact Snapshot
   - Should display queue policy card and telemetry badges matching the JSON

---

## Success Criteria

1. ✓ Validator checks all telemetry fields (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, HistoryAttemptLimit, GPU.Name, GPU.VramBeforeMB, GPU.VramAfterMB, GPU.VramDeltaMB, HistoryExitReason, ExecutionSuccessDetected, ExecutionSuccessAt, PostExecutionTimeoutSeconds, SceneRetryBudget, pollLimit text matching metadata, fallback notes)
2. ✓ Documentation clearly explains telemetry contract, reading order, and external references (LM Studio, ComfyUI)
3. ✓ UI hooks can fetch queue/telemetry metadata from both artifact files
4. ✓ Components display queue policy card + telemetry badges matching run summary values
5. ✓ Test run shows complete telemetry in all three places: run-summary.txt, artifact-metadata.json, and UI

---

## Timeline Estimate

- Phase 1 (Validator): 1-2 hours
- Phase 2 (Docs): 2-3 hours  
- Phase 3 (UI): 2-3 hours
- Phase 4 (Testing): 1-2 hours
\n+### Recent implementation note
The producer-side "done" marker sentinel was implemented and hardened to use an atomic write pattern (write `<prefix>.done.tmp` then rename to `<prefix>.done`). This reduces consumer requeues due to partially-written markers and is implemented in `scripts/generate-done-markers.ps1`. A new integration Vitest (`scripts/__tests__/done-marker.test.ts`) exercises the sentinel in `RunOnce` mode. Update the UI and validators to expect stable `.done` markers where available.
- **Total**: 6-10 hours

---

## Known Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| GPU stats fail for some systems | Telemetry incomplete | Fallback notes document the issue; validator allows null VRAM if fallback is present |
| LM Studio unavailable | Health check fails | Override via LOCAL_LLM_SKIP_HEALTHCHECK; documented in logs |
| ComfyUI history never populates | Validation false negatives | execution_success detection follows ComfyUI /history spec; queue waits full timeout |
| UI components not updated | Telemetry data invisible | Create default ArtifactViewer that displays raw metadata; document TODO for full UI work |

