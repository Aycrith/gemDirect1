# Wave 3 Integration Fix - Queue Monitor Connection

## Issue Summary

Wave 3 infrastructure was deployed but the queue monitor polling mechanism wasn't activated during initialization. The `processPendingWorkflows()` method in `ComfyUICallbackManager` was a placeholder.

## Root Cause

The batch processor setup in `setupComfyUIWebhooks()` was starting a polling interval but calling an empty `processPendingWorkflows()` method that had no implementation to actually fetch and process ComfyUI history.

```typescript
// BEFORE (Broken)
private startBatchProcessor(): void {
  setInterval(() => {
    this.processPendingWorkflows().catch(error => {
      console.error('Error in batch processor:', error);
    });
  }, 5000);
}

private async processPendingWorkflows(): Promise<void> {
  // This would query ComfyUI for completed workflows
  // Implementation depends on how ComfyUI exposes completion history
  // For now, this is a placeholder for the batch processing logic
}
```

## Solution Implemented

Connected the `ComfyUIQueueMonitor` to the batch processor to handle actual polling and event detection.

### Changes Made to `services/comfyUICallbackService.ts`

**1. Import Added**
```typescript
import { ComfyUIQueueMonitor } from './comfyUIQueueMonitor';
```

**2. Class Property Added**
```typescript
export class ComfyUICallbackManager {
  private db: RunHistoryDatabase | null = null;
  private webhookCallbacks: Map<string, (event: ComfyUIWorkflowEvent) => void> = new Map();
  private queueMonitor: ComfyUIQueueMonitor | null = null;  // ← NEW
  
  // ... rest of class
}
```

**3. Method Implementation Updated**
```typescript
private startBatchProcessor(): void {
  // Initialize queue monitor
  this.queueMonitor = new ComfyUIQueueMonitor('http://127.0.0.1:8188');
  
  // Start polling with 5-second interval
  this.queueMonitor.startPolling(5000, (event) => {
    this.handleWorkflowCompletion(event).catch(error => {
      console.error('Error handling workflow completion from queue monitor:', error);
    });
  });
  
  console.log('✓ Queue Monitor polling started (5s interval)');
}

private async processPendingWorkflows(): Promise<void> {
  // This method is now handled by the queue monitor's polling mechanism
  // It's kept for backward compatibility but the polling is done in startBatchProcessor
}
```

## How It Works

1. When `ComfyUICallbackManager.initialize()` is called, it calls `setupComfyUIWebhooks()`
2. `setupComfyUIWebhooks()` calls `startBatchProcessor()`
3. `startBatchProcessor()` now:
   - Creates a `ComfyUIQueueMonitor` instance pointing to `http://127.0.0.1:8188`
   - Calls `startPolling(5000, callback)` which:
     - Fetches `/history` endpoint every 5 seconds
     - Detects new completed workflows
     - Transforms them to `ComfyUIWorkflowEvent` objects
     - Calls the provided callback for each new event
4. The callback (arrow function) calls `handleWorkflowCompletion()` to:
   - Transform event to `HistoricalRun` format
   - Save to IndexedDB
   - Generate recommendations
   - Notify subscribers

## Verification

After applying this fix:

✅ Console shows: `✓ ComfyUI Queue Monitor started (interval: 5000ms)`  
✅ Console shows: `✓ Queue Monitor polling started (5s interval)`  
✅ When workflows complete in ComfyUI:  
```
✓ Workflow completed and saved to historical data: [runId]
✓ Workflow [runId] saved to historical data
```
✅ IndexedDB contains persisted workflow data (verified with browser DevTools)

## Testing Performed

- ✅ Ran 2 test workflows in ComfyUI
- ✅ Verified both detected by queue monitor
- ✅ Confirmed data persisted to IndexedDB
- ✅ Validated type safety (0 TypeScript errors)
- ✅ Verified no console errors during operation
- ✅ Checked polling continues reliably

## Backward Compatibility

✅ This change is **100% backward compatible**:
- No breaking changes to public APIs
- No changes to component interfaces
- No changes to database schema
- Simply enables functionality that should have been working

## Future Improvements

The queue monitor could be enhanced to:
- Make the ComfyUI URL configurable via environment variable
- Support multiple ComfyUI instances
- Add reconnection logic for server restarts
- Implement exponential backoff for failed polling attempts
- Add metrics for polling health monitoring

---

**Applied**: November 14, 2025  
**Impact**: Critical fix enabling Wave 3 core functionality  
**Status**: ✅ Verified and working
