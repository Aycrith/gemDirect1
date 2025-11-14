# Wave 3 Quick Reference Card

**Print this for easy reference during integration testing**

---

## Architecture at a Glance

```
ComfyUI → QueueMonitor → CallbackManager → IndexedDB → useRunHistory → UI
        polls /history    transforms        saveRun()     hook        displays
        every 5s          event to run      persists      queries     telemetry
```

---

## New Files

| File | Purpose | Key Class/Hook |
|------|---------|---|
| `comfyUICallbackService.ts` | Transform events, generate recommendations | `ComfyUICallbackManager` |
| `comfyUIQueueMonitor.ts` | Poll ComfyUI for completions | `ComfyUIQueueMonitor` |
| `comfyUIIntegrationTest.ts` | Run integration tests | `ComfyUIIntegrationTest` |
| `ComfyUICallbackProvider.tsx` | Inject callbacks into React | `ComfyUICallbackProvider` |

---

## Service Usage

### In Components

```typescript
import { useComfyUICallbackManager } from '../utils/hooks';

export function MyComponent() {
  const { isInitialized, lastWorkflow } = useComfyUICallbackManager();
  
  return (
    <div>
      {isInitialized && <p>✓ Ready</p>}
      {lastWorkflow && <p>Last run: {lastWorkflow.runId}</p>}
    </div>
  );
}
```

### Manual Testing

```typescript
import { ComfyUIIntegrationTest } from './services/comfyUIIntegrationTest';

const tester = new ComfyUIIntegrationTest();
const results = await tester.runAllTests();
```

### Manual Event Processing

```typescript
import { getCallbackManager } from './services/comfyUICallbackService';

const manager = getCallbackManager();
await manager.processWorkflowEvent(testEvent);
```

---

## Console Messages to Watch For

| Message | Meaning |
|---------|---------|
| `✓ ComfyUI Callback Manager initialized` | Manager ready |
| `✓ Queue Monitor polling started (5s interval)` | Polling active |
| `[QueueMonitor] Polling... found X new completions` | New workflows detected |
| `✓ Workflow completed and saved: run-id-xxx` | Event processed |
| `Generated recommendations: ...` | Suggestions created |

---

## Debugging Checklist

- [ ] Dev server running? `npm run dev` 
- [ ] ComfyUI running? Check http://127.0.0.1:8188
- [ ] Console clean? Press F12 → Console
- [ ] IndexedDB exists? DevTools → Application → IndexedDB
- [ ] First workflow started? Check ComfyUI UI
- [ ] Data in IndexedDB? Check `runs` object store
- [ ] UI updated? Check HistoricalTelemetryCard

---

## IndexedDB Structure

```
gemDirect1_telemetry (database)
├── runs (object store)
│   ├── runId (primary key)
│   ├── timestamp (index)
│   └── {workflowName, status, scenes[], metadata}
├── scenes (object store)
│   ├── sceneId (primary key)
│   └── {frameCount, duration, attempts, status}
├── recommendations (object store)
│   ├── recId (primary key)
│   └── {type, severity, message, actionable}
└── filterPresets (object store)
    ├── presetId (primary key)
    └── {name, criteria}
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Cannot connect to ComfyUI" | Check http://127.0.0.1:8188/system_stats |
| "No polling messages in console" | Restart QueueMonitor in DevTools |
| "IndexedDB empty after workflow" | Refresh page, wait 5-10 seconds |
| "Recommendations not appearing" | Check `recommendations` object store in DevTools |
| "React hook error" | Verify ComfyUICallbackProvider wraps app in App.tsx |

---

## Performance Baseline

- Polling: Every 5 seconds
- Event Processing: < 100ms
- Database Write: < 50ms
- UI Update: < 200ms
- Memory: < 5MB overhead

---

## Testing Timeline

| Phase | Time | What | Success Criteria |
|-------|------|------|---|
| Init | 5 min | Start services | "Initialized" message in console |
| Flow | 10 min | Run workflow | New data in IndexedDB |
| Display | 10 min | Check UI | Telemetry card shows data |

**Total**: ~25 minutes

---

## Key Files to Know

```
App.tsx                          ← ComfyUICallbackProvider wrapper
utils/hooks.ts                   ← useComfyUICallbackManager hook
services/comfyUICallbackService.ts    ← Event transformation
services/comfyUIQueueMonitor.ts       ← Polling logic
services/runHistoryService.ts    ← Database persistence
```

---

## Environment Variables (If Needed)

```
DEBUG_COMFYUI=true              Enable verbose logging
COMFYUI_URL=http://127.0.0.1:8188   (default)
POLL_INTERVAL=5000              milliseconds (default)
```

---

## Rollback in 30 Seconds

```typescript
// 1. Stop polling
getQueueMonitor().stopPolling();

// 2. Disable provider (comment out in App.tsx)
// <ComfyUICallbackProvider>

// 3. Clear database
import { resetRunHistoryDB } from './services/runHistoryService';
await resetRunHistoryDB();
```

---

## Key Contacts (For Code Questions)

- Architecture: See `WAVE_3_INTEGRATION_GUIDE.md`
- Services: Check inline comments in `comfyUICallbackService.ts`
- React Integration: See `ComfyUICallbackProvider.tsx`
- Testing: Check `comfyUIIntegrationTest.ts`

---

## Success Looks Like ✅

1. Console: "✓ ComfyUI Callback Manager initialized"
2. Console: Polling messages appear after workflow starts
3. DevTools: New entries in IndexedDB `runs` object store
4. Browser: HistoricalTelemetryCard shows data
5. Console: No errors anywhere

---

**Print Date**: November 13, 2025
**Status**: WAVE 3 INFRASTRUCTURE COMPLETE
**Next Step**: Begin Integration Testing
