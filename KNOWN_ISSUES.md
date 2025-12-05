# Known Issues & Deferred Improvements

**Last Updated**: 2025-11-29  
**Status**: Active tracking document

This document tracks known architectural limitations and deferred improvements that should be addressed in future development cycles.

---

## 🔴 High Priority - Deferred Features

### 1. AbortController Cancellation Pattern

**Issue**: Long-running operations (ComfyUI generation, LLM calls) cannot be cancelled once started.

**Current Behavior**:
- Users can cancel pending queue items (via GenerationQueue.cancel())
- Running operations continue until completion or timeout
- No way to abort in-flight HTTP/WebSocket requests

**Impact**:
- GPU resources stay occupied even when user navigates away
- Wasted compute on abandoned generations
- Poor UX when user wants to retry with different parameters

**Proposed Solution**:
```typescript
// Add to GenerationTask interface
abortSignal?: AbortSignal;

// In GenerationQueue.processQueue()
const controller = new AbortController();
task.abortSignal = controller.signal;
this.abortControllers.set(task.id, controller);

// Cancel method enhancement
cancel(taskId: string, abortRunning: boolean = false): boolean {
    if (abortRunning && task.status === 'running') {
        this.abortControllers.get(taskId)?.abort();
    }
    // ... existing cancel logic
}
```

**Why Deferred**: 
- Requires threading AbortSignal through entire call chain
- ComfyUI doesn't support mid-generation cancellation
- WebSocket cleanup complexity
- Time estimate: 4-8 hours

**Timeline & Priority**:
- **Target**: Next major feature cycle (post-1.0 stabilization)
- **Priority Score**: HIGH - This will become critical as generation times increase with higher quality models
- **Prerequisite**: GenerationQueue integration must be complete first
- **Warning**: Do NOT defer indefinitely - poor cancellation UX is a significant user experience issue

**Tracking**: Created 2025-11-22, timeline documented 2025-11-29

---

### 2. GenerationQueue ComfyUI Integration

**Issue**: GenerationQueue infrastructure exists but is not wired into actual ComfyUI generation paths.

**Current Behavior**:
- `services/generationQueue.ts` provides complete queue implementation with:
  - FIFO queue with priority support
  - VRAM gating (optional)
  - Circuit breaker for repeated failures
  - Progress callbacks and cancellation
- Direct calls to `queueComfyUIPrompt()` and `generateTimelineVideos()` bypass the queue
- Concurrent generations can exhaust VRAM

**Impact**:
- GPU memory exhaustion when multiple generations run concurrently
- No coordinated retry on failure
- Circuit breaker not triggered on repeated ComfyUI failures

**Integration Points** (services/videoGenerationService.ts):
1. `queueComfyUIPrompt()` (line ~112) - Direct ComfyUI queue call
2. `generateSingleVideo()` (internal) - Uses `queueComfyUIPrompt` directly
3. `generateTimelineVideos()` - Orchestrates multiple video generations

**Proposed Solution**:
```typescript
// In videoGenerationService.ts
import { getGenerationQueue, createVideoTask } from './generationQueue';

export const queueComfyUIPromptWithQueue = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string },
    base64Image: string,
    options?: { sceneId?: string; shotId?: string; priority?: GenerationPriority }
): Promise<any> => {
    const queue = getGenerationQueue();
    
    const task = createVideoTask(
        () => queueComfyUIPrompt(settings, payloads, base64Image),
        {
            sceneId: options?.sceneId || 'unknown',
            shotId: options?.shotId,
            priority: options?.priority ?? 'normal',
        }
    );
    
    return queue.enqueue(task);
};
```

**Migration Strategy**:
1. Create `queueComfyUIPromptWithQueue` wrapper (non-breaking)
2. Update `generateTimelineVideos` to use wrapper
3. Add queue status to UI (GenerationQueuePanel component)
4. Gradually migrate other callers
5. Deprecate direct `queueComfyUIPrompt` calls

**Time Estimate**: 4-6 hours

**Timeline & Priority**:
- **Target**: Before production release (VRAM safety is critical)
- **Priority Score**: HIGH - Prevents GPU OOM in multi-scene projects
- **Prerequisite**: None (queue infrastructure is complete)
- **Dependency**: AbortController pattern should be added to queue after integration

**Tracking**: Infrastructure created 2025-11-22, integration analysis 2025-11-29

---

### 3. Unified Loading State Context

**Issue**: Multiple independent loading states across components cause inconsistent UI.

**Current Behavior**:
- `useProjectData.isLoading` for story/scene generation
- `sceneImageStatuses` for image generation
- `localGenStatus` for video generation
- ApiStatusContext for API calls

**Impact**:
- Components can show conflicting loading states
- No single place to check "is anything generating?"
- Difficult to implement global loading indicators

**Proposed Solution**:
```typescript
// contexts/LoadingStateContext.tsx
interface LoadingState {
    operations: Map<string, LoadingOperation>;
    isAnyLoading: boolean;
    blockingOperation?: LoadingOperation;
}

interface LoadingOperation {
    id: string;
    type: 'story' | 'scene' | 'keyframe' | 'video' | 'api';
    status: 'pending' | 'running' | 'complete' | 'error';
    progress?: number;
    message?: string;
    startedAt: number;
}
```

**Why Deferred**:
- Requires refactoring all generation flows
- May introduce new timing issues
- Low impact on current E2E test failures
- Time estimate: 6-10 hours

**Timeline & Priority**:
- **Target**: Should be tackled when adding multi-generation features (e.g., batch keyframe generation)
- **Priority Score**: MEDIUM-HIGH - Current approach works but becomes unwieldy as features grow
- **Prerequisite**: HydrationContext work provides foundation; build on that pattern
- **Warning**: Deferring too long will make integration exponentially harder as more loading states are added

**Tracking**: Created 2025-11-22, timeline documented 2025-11-29

---

## 🟡 Medium Priority - Technical Debt

### 3. Test Fixture Hydration Race Conditions

**Issue**: E2E tests using `test-bookend-project.json` occasionally fail due to state hydration timing.

**Current Workarounds**:
- HydrationContext created (2025-11-22) to coordinate state loading
- HydrationGate component prevents content render until ready
- Tests should use `waitForHydration()` utility

**Remaining Work**:
- Update all E2E tests to properly wait for hydration
- Add hydration metrics to test reports
- Consider retry logic for hydration failures in CI

**Tracking**: Partially addressed in architectural work 2025-11-22

---

### 4. ComfyUI WebSocket Connection Pooling

**Issue**: Multiple components create separate WebSocket connections to ComfyUI.

**Current Behavior**:
- `comfyEventManager` provides global connection
- `trackPromptExecution` creates per-prompt tracking
- Potential for event routing issues

**Impact**:
- Connection overhead
- Event delivery may go to wrong handler
- Difficult to track connection state globally

**Proposed Solution**:
Consolidate all WebSocket usage through `comfyEventManager` and add connection state to UI.

**Why Deferred**:
- Current polling fallback handles most cases
- Low frequency of actual failures
- Time estimate: 3-5 hours

---

### 5. LLM Transport Integration

**Issue**: LLMTransportAdapter created but not yet integrated with existing geminiService.

**Current Behavior**:
- `geminiService.ts` uses GoogleGenAI SDK directly (1700+ lines, deeply coupled)
- `llmTransportAdapter.ts` provides clean abstraction but remains unused
- Tests still cannot mock LLM responses at transport level

**Infrastructure Available** (services/llmTransportAdapter.ts):
- `MockLLMTransport`: Pattern matching, request logging, configurable responses
- `GeminiTransport`: Wraps GoogleGenAI SDK with error mapping
- `OpenAICompatibleTransport`: For LM Studio and similar APIs
- `getActiveTransport()` / `setActiveTransport()`: Registry pattern for DI

**Why Integration Is Complex**:
- `geminiService.ts` uses Gemini-specific features (`Type.OBJECT`, structured schemas)
- 50+ functions with direct SDK usage patterns
- Would require converting all schema definitions to transport-agnostic format
- Time estimate: 8-16 hours for full integration

**Recommended Approach**:
1. Start with NEW functions using transport adapter (greenfield)
2. Gradually migrate existing functions as they are refactored
3. Use adapter for test-critical paths first (shot generation, validation)
4. Keep SDK-direct calls for rarely-tested utilities

**Next Steps**:
1. Create `geminiService.adapter.ts` with transport-backed implementations
2. Add feature flag to switch between direct SDK and adapter
3. Update critical test paths to use MockLLMTransport
4. Document which functions are adapter-compatible

**Tracking**: Infrastructure created 2025-11-22, integration analysis 2025-11-29

---

### 6. Vision LLM CORS Workaround (Interim Solution)

**Issue**: Browser-based Vision LLM calls fail due to CORS when using LM Studio or local LLM endpoints.

**Current Behavior**:
- `keyframePairAnalysisService.ts` uses 15s timeout (reduced from 120s) for fail-fast
- CORS/network errors are detected with clear user-facing messages
- Analysis is non-blocking: graceful fallback continues video generation
- Feature flag `keyframePairAnalysis` defaults to `true`

**Impact**:
- Keyframe pair analysis may be skipped when using browser-based vision LLM
- Video generation continues without pre-flight quality gate
- No visual continuity validation between START and END frames

**Root Cause**:
LM Studio and similar local LLM servers don't return CORS headers (`Access-Control-Allow-Origin`) by default. Browser fetch requests are blocked at the preflight stage.

**Current Workaround** (Implemented 2025-12-04):
```typescript
// keyframePairAnalysisService.ts
const VISION_LLM_TIMEOUT_MS = 15_000; // Fail-fast for optional preflight

// Detect CORS/network errors
if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
    return { passed: true, reason: 'Vision LLM unavailable - skipping analysis' };
}
```

**Long-term Solutions** (Choose One):
1. **Reverse Proxy**: Add nginx or caddy reverse proxy with CORS headers
   - Pros: No LM Studio changes needed
   - Cons: Additional infrastructure
2. **Server-side LLM calls**: Route vision analysis through backend/serverless function
   - Pros: Clean architecture, no browser limitations
   - Cons: Requires backend infrastructure
3. **LM Studio CORS config**: Configure LM Studio to return CORS headers (if supported)
   - Pros: Simple if supported
   - Cons: May not be configurable

**Timeline & Priority**:
- **Target**: Post-1.0 (current workaround is acceptable for MVP)
- **Priority Score**: MEDIUM - Feature works with graceful degradation
- **Prerequisite**: Decide on LLM infrastructure strategy (local vs cloud)

**Tracking**: Workaround implemented 2025-12-04, timeout reduced to 15s

---

### 7. Deflicker Node Graceful Degradation (Implemented)

**Issue**: Video deflicker feature requires optional ComfyUI custom node.

**Current Behavior** (Implemented 2025-12-04):
- `deflickerService.ts` queries ComfyUI `/object_info` before node injection
- If no compatible node found, deflicker is silently skipped (graceful degradation)
- Supported nodes checked in order: `TemporalSmoothing`, `VHS_VideoDeflicker`, `VideoDeflicker`
- Feature flag `videoDeflicker` controls whether injection is attempted

**Impact**:
- Videos generate successfully even without deflicker nodes installed
- No more 400 Bad Request errors from missing nodes
- Deflicker is optional enhancement, not a blocker

**Implementation**:
```typescript
// deflickerService.ts - getAvailableDeflickerNode()
const installedNodes = await getInstalledNodes(comfyUIUrl);
for (const nodeType of KNOWN_DEFLICKER_NODES) {
    if (installedNodes.has(nodeType)) return nodeType;
}
return null; // Graceful degradation - skip injection
```

**To Enable Deflicker**:
1. Install a ComfyUI custom node that provides temporal smoothing:
   - `TemporalSmoothing` (recommended)
   - `VideoHelperSuite` (provides `VHS_VideoDeflicker`)
   - `VideoDeflicker` (generic)
2. Set `featureFlags.videoDeflicker: true` in settings

**Status**: ✅ RESOLVED - Graceful degradation implemented 2025-12-04

---

## 🟢 Low Priority - Nice to Have

### 6. Parallel Validation Mode

**Issue**: Store consistency validation runs on every state change.

**Current Behavior**:
- `sceneStoreParallelValidation` flag controls validation
- Runs synchronously, may impact performance

**Proposed Solution**:
- Move validation to Web Worker
- Only validate on significant state changes
- Add validation report to developer tools

---

### 7. Error Boundary Granularity

**Issue**: Error boundaries too coarse-grained.

**Current Behavior**:
- `ErrorBoundary` wraps major sections
- Single error can crash entire workflow stage

**Proposed Solution**:
- Add per-component error boundaries for critical paths
- Implement recovery strategies beyond "go back"
- Log errors to remote service for analysis

---

## ✅ Resolved Issues

### Performance Metrics Collection (FIXED 2025-11-29)
- **Issue**: No systematic collection of performance timing data; `durationMs` field existed but was not populated
- **Fix**: 
  - Updated `withRetry` in `geminiService.ts` to populate `durationMs` in all `logApiCall` invocations
  - Created `PerformanceMetricsPanel` component in `UsageDashboard.tsx` showing P50/P95/avg latencies
  - Added Duration column to API Call Log table
  - Users can now see real-time performance diagnostics in the Usage Dashboard
- **Commit**: LLM + Validation pipeline stabilization session 2025-11-29

### Promise Resolution Race Condition (FIXED 2025-11-22)
- **Issue**: WebSocket and polling could both resolve same Promise
- **Fix**: Added `resolutionState` mutex pattern in `waitForComfyCompletion`
- **Commit**: Architectural improvements session

### Inconsistent Timeout Configuration (FIXED 2025-11-22)
- **Issue**: Hardcoded timeouts scattered across codebase
- **Fix**: Created `COMFYUI_TIMEOUTS` constant with `getTimeout()` and test overrides
- **Commit**: Architectural improvements session

---

## How to Use This Document

1. **Adding new issues**: Copy a template section, fill in details, set appropriate priority
2. **Updating status**: Move between priority sections as work progresses
3. **Resolving**: Move to "Resolved Issues" with date and brief description
4. **Linking**: Reference from PRs and commit messages

## Priority Definitions

- 🔴 **High**: Blocks testing, causes data loss, or significantly impacts UX
- 🟡 **Medium**: Technical debt that should be addressed in next major release
- 🟢 **Low**: Nice to have, can be addressed opportunistically
- ✅ **Resolved**: Fixed, kept for historical reference
