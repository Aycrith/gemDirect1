# Wave 3 Development: ComfyUI Integration Callback System

## Overview

Wave 3 introduces automatic ComfyUI integration callbacks for real-time historical data population. This foundation enables trend analysis, performance recommendations, and optimization insights.

**Status**: ✅ Infrastructure Complete | 🔄 Integration Testing Required

---

## Architecture

### Service Layer

```
ComfyUI Workflow Complete
    ↓
ComfyUIQueueMonitor.startPolling()
    ↓ (Every 5 seconds)
Fetch http://127.0.0.1:8188/history
    ↓
Transform to WorkflowEvent
    ↓
ComfyUICallbackManager.handleWorkflowCompletion()
    ↓
transformEventToHistoricalRun()
    ↓
RunHistoryDatabase.saveRun()
    ↓
IndexedDB gemDirect1_telemetry
    ↓
useRunHistory() Hook
    ↓
HistoricalTelemetryCard Display
```

### Files Created

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `services/comfyUICallbackService.ts` | Event transformation & recommendation generation | 400+ | ✅ Complete |
| `services/comfyUIQueueMonitor.ts` | ComfyUI history polling & event detection | 280+ | ✅ Complete |
| `services/comfyUIIntegrationTest.ts` | Integration testing utility | 220+ | ✅ Complete |
| `components/ComfyUICallbackProvider.tsx` | React provider component | 40+ | ✅ Complete |
| `utils/hooks.ts` | `useComfyUICallbackManager()` hook | +80 lines | ✅ Complete |

### Files Modified

| File | Change | Impact |
|------|--------|--------|
| `services/runHistoryService.ts` | Export `RunHistoryDatabase` class | Type safety | ✅ Complete |
| `App.tsx` | Add ComfyUICallbackProvider wrapper | Provider injection | ✅ Complete |

---

## Key Services

### 1. ComfyUICallbackManager

**Purpose**: Central orchestration of workflow events and historical data

**Key Methods**:
```typescript
// Initialize with database
async initialize(database: RunHistoryDatabase): Promise<void>

// Process workflow completion events
async handleWorkflowCompletion(event: ComfyUIWorkflowEvent): Promise<void>

// Transform ComfyUI format to database schema
private transformEventToHistoricalRun(event: ComfyUIWorkflowEvent): HistoricalRun

// Generate performance recommendations
private generateRecommendations(run: HistoricalRun): Recommendation[]

// Subscribe to completion events
subscribe(subscriptionId: string, callback: (run: HistoricalRun) => void): void

// Unsubscribe from events
unsubscribe(subscriptionId: string): void

// Get database statistics
async getStatistics(): Promise<Statistics>

// Manual event processing (testing)
async processWorkflowEvent(event: ComfyUIWorkflowEvent): Promise<void>
```

**Recommendation Types Generated**:
- ✅ Success Rate Warnings (< 80% triggers alert)
- ✅ GPU Usage Warnings (peak memory threshold)
- ✅ Duration Optimization (long-running scene hints)
- ✅ Retry Pattern Detection (fallback count alerts)

### 2. ComfyUIQueueMonitor

**Purpose**: Continuous polling of ComfyUI for workflow completions

**Key Methods**:
```typescript
// Start monitoring queue
startPolling(interval: number = 5000, onCompletion?: callback): void

// Stop monitoring
stopPolling(): void

// Manual workflow processing (testing)
processWorkflowById(runId: string): Promise<void>

// Get current queue status
async getQueueStatus(): Promise<{ running: number; pending: number }>

// Internal: Check for new completions
private async checkQueueCompletion(): Promise<void>

// Internal: Fetch history from ComfyUI
private async fetchComfyUIHistory(): Promise<Record<string, any>>

// Internal: Transform history entry to event
private transformHistoryEntryToEvent(id: string, entry: any): ComfyUIWorkflowEvent
```

**Polling Strategy**:
- 5-second intervals (configurable)
- Duplicate prevention via `Set<string>`
- Status detection (success/failed)
- Frame count extraction from various output formats

### 3. useComfyUICallbackManager Hook

**Purpose**: React integration point for callback management

**Return Value**:
```typescript
{
  isInitialized: boolean;        // Manager ready flag
  lastWorkflow: HistoricalRun;   // Latest completed workflow
  subscriptionId: string;        // Unique component ID
  callbackManager: ComfyUICallbackManager | null;
  
  processWorkflowEvent(event: ComfyUIWorkflowEvent): Promise<void>;
  getStatistics(): Promise<Statistics | null>;
}
```

**Usage**:
```typescript
const { isInitialized, lastWorkflow, getStatistics } = useComfyUICallbackManager();

// In component
useEffect(() => {
  if (isInitialized && lastWorkflow) {
    console.log('✓ Workflow saved:', lastWorkflow.runId);
  }
}, [lastWorkflow, isInitialized]);
```

---

## Integration Testing

### Prerequisites

1. ✅ Dev Server Running
   ```bash
   npm run dev
   # Running at http://localhost:3000
   ```

2. ✅ ComfyUI Server Running
   ```bash
   # Use VS Code task: "Start ComfyUI Server"
   # Running at http://127.0.0.1:8188
   ```

3. ✅ Browser DevTools Open
   - F12 → Application tab for IndexedDB inspection
   - Console for logging

### Phase 1: Service Initialization (5 minutes)

**Steps**:
1. Open http://localhost:3000 in browser
2. Open DevTools Console (F12 → Console)
3. Look for initialization messages:
   ```
   ✓ ComfyUI Callback Manager initialized
   ✓ Queue Monitor polling started (5s interval)
   ```
4. Check Application → IndexedDB → gemDirect1_telemetry
   - Should see: `runs`, `scenes`, `recommendations`, `filterPresets` object stores

**Success Criteria**:
- ✅ No console errors
- ✅ IndexedDB object stores exist
- ✅ Provider component logged initialization

### Phase 2: Event Processing (10 minutes)

**Steps**:
1. In ComfyUI, create and run a test workflow
2. Watch console for polling updates:
   ```
   [QueueMonitor] Polling... found X new completions
   [CallbackManager] Processing workflow event...
   ✓ Workflow completed and saved: run-id-xxx
   ```
3. Check IndexedDB `runs` object store for new entry
4. Verify scene data in `scenes` object store
5. Check `recommendations` object store for generated suggestions

**Success Criteria**:
- ✅ Console shows polling activity
- ✅ New run entry in IndexedDB
- ✅ Scene records created
- ✅ Recommendations generated

### Phase 3: UI Integration (10 minutes)

**Steps**:
1. Navigate to HistoricalTelemetryCard component (should be on artifact viewer)
2. Wait for data to populate (may take 5-10 seconds for first workflow)
3. Verify display shows:
   - Total runs count
   - Average success rate
   - Total frames generated
   - Average duration
4. Verify recommendation badges appear:
   - Success rate warnings
   - GPU usage warnings
   - Duration suggestions

**Success Criteria**:
- ✅ Card displays historical data
- ✅ Recommendations visible
- ✅ Data updates after new workflow completes

---

## Testing Utilities

### Integration Test Suite

**Usage**:
```typescript
import { ComfyUIIntegrationTest } from './services/comfyUIIntegrationTest';

// Run all tests
const tester = new ComfyUIIntegrationTest('http://127.0.0.1:8188');
const results = await tester.runAllTests();

console.log(`Tests: ${results.passed} passed, ${results.failed} failed`);
```

**Test Coverage**:
- ✅ Callback Manager Initialization
- ✅ Workflow Event Processing
- ✅ Queue Monitor Connection
- ✅ Data Persistence
- ✅ Recommendation Generation

### Manual Event Processing

**For Testing**:
```typescript
import { getCallbackManager } from './services/comfyUICallbackService';

const manager = getCallbackManager();

// Create test event
const testEvent = {
  runId: 'test-' + Date.now(),
  timestamp: Date.now(),
  // ... full event data
};

// Process manually
await manager.processWorkflowEvent(testEvent);
```

---

## Configuration

### ComfyUI Polling

**File**: `services/comfyUIQueueMonitor.ts`

**Configurable**:
```typescript
const POLL_INTERVAL = 5000; // milliseconds

// Change polling interval
queueMonitor.startPolling(3000); // Poll every 3 seconds
```

### Recommendation Thresholds

**File**: `services/comfyUICallbackService.ts`

**Configurable**:
```typescript
const SUCCESS_RATE_THRESHOLD = 0.8;        // 80%
const GPU_MEMORY_WARNING_MB = 20000;       // 20GB
const RETRY_COUNT_THRESHOLD = 3;           // 3+ retries
const DURATION_WARNING_MS = 60000;         // 60 seconds
```

---

## Data Schema

### HistoricalRun

```typescript
interface HistoricalRun {
  runId: string;
  workflowName: string;
  storyTitle: string;
  timestamp: number;
  status: 'success' | 'failed' | 'partial';
  scenes: SceneData[];
  metadata: {
    totalDuration: number;
    frameCount: number;
    successRate: number;
    gpuMemoryPeak: number;
    gpuModel: string;
  };
}
```

### ComfyUIWorkflowEvent

```typescript
interface ComfyUIWorkflowEvent {
  runId: string;
  timestamp: number;
  workflowName: string;
  storyTitle: string;
  status: 'success' | 'failed';
  totalDurationMs: number;
  startTime: number;
  endTime: number;
  scenes: ComfyUISceneData[];
  gpuModel: string;
  gpuMemoryBefore: number;
  gpuMemoryAfter: number;
  gpuMemoryPeak: number;
}
```

---

## Error Handling

### Common Issues

**Issue**: Queue Monitor shows no completions
- **Check**: ComfyUI server running at http://127.0.0.1:8188
- **Fix**: Restart ComfyUI using VS Code task "Restart ComfyUI Server"
- **Fallback**: Manually test with `processWorkflowById()` method

**Issue**: Recommendations not appearing
- **Check**: Verify recommendation data in IndexedDB `recommendations` store
- **Fix**: Increase polling interval or check ComfyUI history endpoint
- **Debug**: Enable verbose logging in `comfyUICallbackService.ts`

**Issue**: IndexedDB entries not persisting
- **Check**: DevTools Application → IndexedDB → Clear all and retry
- **Fix**: Verify database initialization via console logs
- **Debug**: Check browser storage quota

### Logging

Enable debug logging:
```typescript
// In browser console
localStorage.setItem('DEBUG_COMFYUI', 'true');

// Watch console for detailed output
// [QueueMonitor] ...
// [CallbackManager] ...
// [DatabaseWriter] ...
```

---

## Performance Considerations

### Database Optimization

- ✅ Indexes on `runId` and `timestamp` for fast queries
- ✅ Automatic old run cleanup (configurable via `maxAgeDays`)
- ✅ Scene data stored separately for quick lookups

### Polling Optimization

- ✅ 5-second polling interval balances responsiveness and server load
- ✅ Duplicate prevention via `lastProcessedIds` Set
- ✅ Stateless polling (restart-safe)

### Memory Usage

- ✅ Queue monitor keeps minimal state
- ✅ Callback manager uses weak references where possible
- ✅ IndexedDB offloads data from application memory

---

## Next Steps (Future Work)

### Wave 3 Phase 2: Trend Analysis

- [ ] Implement performance trend detection
- [ ] Add regression analysis for success rates
- [ ] Create frame-rate prediction model
- [ ] Add GPU usage forecasting

### Wave 3 Phase 3: Optimization Engine

- [ ] Auto-generate optimization suggestions
- [ ] Recommend scene splitting strategies
- [ ] Suggest parameter adjustments
- [ ] Create performance improvement workflows

### Wave 3 Phase 4: UI Enhancements

- [ ] Historical data visualization (charts/graphs)
- [ ] Comparative analysis dashboard
- [ ] Performance trend timeline
- [ ] Recommendation action buttons

---

## Rollback Plan

If critical issues discovered:

1. **Stop Polling**:
   ```typescript
   getQueueMonitor().stopPolling();
   ```

2. **Disable Provider**:
   ```typescript
   // Temporary: Comment out ComfyUICallbackProvider wrapper in App.tsx
   ```

3. **Clear Database**:
   ```typescript
   import { resetRunHistoryDB } from './services/runHistoryService';
   await resetRunHistoryDB();
   ```

4. **Revert Changes**:
   ```bash
   git revert HEAD~1  // Revert callback integration commits
   ```

---

## Verification Checklist

- [ ] Dev server running (http://localhost:3000)
- [ ] ComfyUI running (http://127.0.0.1:8188)
- [ ] No TypeScript compilation errors
- [ ] Provider component initializes
- [ ] Queue monitor polling active
- [ ] At least one workflow completed
- [ ] IndexedDB contains run data
- [ ] Recommendations generated
- [ ] UI displays historical telemetry
- [ ] No console errors during workflow

---

## Support

**For Issues**:
1. Check console logs for error messages
2. Verify ComfyUI connectivity: http://127.0.0.1:8188/system_stats
3. Run integration test suite: `tester.runAllTests()`
4. Check IndexedDB data via DevTools

**For Questions**:
- See `WAVE_3_DEVELOPMENT_PLAN.md` for architecture decisions
- Check service file comments for implementation details
- Review integration test suite for usage examples
