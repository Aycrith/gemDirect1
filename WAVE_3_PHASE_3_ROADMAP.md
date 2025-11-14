# Wave 3 Phase 3: UI Implementation Roadmap

**Date**: November 14, 2025  
**Status**: Ready to Start  
**Infrastructure**: ✅ Production Ready (Validation Complete)  

---

## Overview

Wave 3 Phase 1 (ComfyUI callback service, queue monitor) and Phase 2 (RunHistoryDatabase integration) are complete and validated. Phase 3 focuses on UI implementation to display historical telemetry and recommendations in the React application.

---

## Phase 3 Objectives

### Primary Goals
1. **Implement HistoricalTelemetryCard Component**
   - Display aggregated statistics from IndexedDB
   - Show total runs, success rates, frame counts, durations
   - Integrate into ArtifactViewer

2. **Wire useRunHistory() Hook**
   - Query IndexedDB for historical data
   - Implement filtering and sorting
   - Real-time updates when new workflows complete

3. **Render Recommendation Badges**
   - Display AI-generated optimization suggestions
   - Success rate warnings
   - GPU usage alerts
   - Duration optimization hints
   - Retry pattern detection

4. **Polish UI/UX**
   - Responsive layout
   - Loading states
   - Empty states
   - Error handling
   - Accessibility

---

## Implementation Plan

### Task 1: Create HistoricalTelemetryCard Component
**File**: `components/HistoricalTelemetryCard.tsx`  
**Estimated Time**: 2-3 hours

**Requirements**:
```typescript
interface HistoricalTelemetryCardProps {
  // Optional: filter by story or date range
  storyId?: string;
  dateRange?: { from: Date; to: Date };
}

interface TelemetryStats {
  totalRuns: number;
  successRate: number;
  totalFrames: number;
  averageDuration: number;
  gpuPeakUsage: number;
}
```

**UI Elements**:
- [ ] Total Runs counter (card style)
- [ ] Success Rate gauge (with color coding)
- [ ] Total Frames generated (metric)
- [ ] Average Duration (metric)
- [ ] GPU Peak Usage (metric)
- [ ] Recommendation count badge

**Features**:
- [ ] Fetch data from IndexedDB on mount
- [ ] Update when new workflows complete
- [ ] Show "No data yet" placeholder
- [ ] Loading indicator while fetching

### Task 2: Implement useRunHistory() Hook
**File**: `utils/hooks.ts` (extend existing file)  
**Estimated Time**: 1-2 hours

**Hook Signature**:
```typescript
export function useRunHistory(options?: {
  storyId?: string;
  dateRange?: { from: number; to: number };
  limit?: number;
}) {
  return {
    runs: HistoricalRun[];
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    stats: TelemetryStats;
  };
}
```

**Implementation**:
- [ ] Query RunHistoryDatabase
- [ ] Handle empty results gracefully
- [ ] Subscribe to callback updates
- [ ] Implement refresh mechanism
- [ ] Calculate aggregated statistics

### Task 3: Create RecommendationBadge Component
**File**: `components/RecommendationBadge.tsx`  
**Estimated Time**: 1-2 hours

**Badge Types**:
```typescript
type RecommendationType = 
  | 'success_rate'
  | 'gpu_usage'
  | 'duration'
  | 'retry_pattern'
  | 'performance';

interface RecommendationBadgeProps {
  recommendation: StoredRecommendation;
  onDismiss?: (id: string) => void;
}
```

**Features**:
- [ ] Color-coded severity (critical, warning, info)
- [ ] Icon indicators
- [ ] Dismiss functionality
- [ ] Tooltip with details

### Task 4: Integrate into ArtifactViewer
**File**: `components/ArtifactViewer.tsx`  
**Estimated Time**: 1-2 hours

**Changes**:
- [ ] Import HistoricalTelemetryCard
- [ ] Add placement below artifact details
- [ ] Wire up useRunHistory hook
- [ ] Pass story context if available
- [ ] Handle loading/error states

### Task 5: Add useRecommendations() Hook
**File**: `utils/hooks.ts` (extend)  
**Estimated Time**: 1 hour

**Hook Signature**:
```typescript
export function useRecommendations(storyId?: string) {
  return {
    recommendations: StoredRecommendation[];
    loading: boolean;
    dismissRecommendation: (id: string) => Promise<void>;
    clearAllRecommendations: () => Promise<void>;
  };
}
```

---

## Data Structures Reference

### HistoricalRun (from IndexedDB)
```typescript
{
  runId: string;
  timestamp: number;
  workflowName?: string;
  storyTitle?: string;
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

### StoredRecommendation (from IndexedDB)
```typescript
{
  id: string;
  runId: string;
  type: 'gpu' | 'performance' | 'success_rate' | 'retry';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestedAction: string;
  confidence: number;
  timestamp: number;
  dismissed: boolean;
}
```

---

## Implementation Checklist

### Component Development
- [ ] HistoricalTelemetryCard component created
- [ ] RecommendationBadge component created
- [ ] Components accept all required props
- [ ] Loading states implemented
- [ ] Error states handled
- [ ] Empty states display correctly

### Hook Development
- [ ] useRunHistory() queries IndexedDB correctly
- [ ] useRecommendations() loads from database
- [ ] Real-time updates on new workflows
- [ ] Error handling implemented
- [ ] Type safety maintained (0 TS errors)

### Integration
- [ ] Components integrated into ArtifactViewer
- [ ] Data flows correctly through hooks
- [ ] UI updates when IndexedDB changes
- [ ] Styling matches project theme
- [ ] Responsive on mobile/tablet

### Testing
- [ ] Manual test with existing 2 runs
- [ ] Test with no historical data
- [ ] Test recommendation dismissal
- [ ] Test UI responsiveness
- [ ] Test error scenarios

### Polish & Refinement
- [ ] Accessibility reviewed (WCAG 2.1 AA)
- [ ] Responsive design verified
- [ ] Performance optimized
- [ ] TypeScript strict mode passes
- [ ] No console warnings/errors

---

## File Changes Summary

### New Files
- `components/HistoricalTelemetryCard.tsx` (150-200 lines)
- `components/RecommendationBadge.tsx` (100-150 lines)

### Modified Files
- `components/ArtifactViewer.tsx` (add 20-30 lines)
- `utils/hooks.ts` (add 50-80 lines for new hooks)

### No Changes Required
- `services/comfyUICallbackService.ts` ✅ Working
- `services/comfyUIQueueMonitor.ts` ✅ Working
- `services/runHistoryService.ts` ✅ Working
- `components/ComfyUICallbackProvider.tsx` ✅ Working
- `App.tsx` ✅ Working

---

## Testing Strategy

### Unit Tests
```typescript
// Test HistoricalTelemetryCard with mock data
describe('HistoricalTelemetryCard', () => {
  it('displays stats correctly', () => {});
  it('handles loading state', () => {});
  it('shows empty state', () => {});
});

// Test useRunHistory hook
describe('useRunHistory', () => {
  it('queries IndexedDB', () => {});
  it('subscribes to updates', () => {});
  it('calculates stats', () => {});
});
```

### Integration Tests
```typescript
// Test full flow: IndexedDB → Hook → Component
describe('Historical Telemetry Integration', () => {
  it('displays data from IndexedDB', () => {});
  it('updates when new workflows complete', () => {});
  it('renders recommendations', () => {});
});
```

### Manual Testing
- [ ] Start dev server with existing data (2 runs in IndexedDB)
- [ ] Verify HistoricalTelemetryCard displays correct stats
- [ ] Run new ComfyUI workflow
- [ ] Verify UI updates automatically
- [ ] Check recommendation badges appear
- [ ] Test dismissal functionality

---

## Performance Considerations

### Optimization Opportunities
1. **IndexedDB Queries**
   - Use indexes for fast lookups
   - Implement pagination for large datasets
   - Cache frequently accessed queries

2. **React Rendering**
   - Memoize stats calculations
   - Use useMemo for expensive operations
   - Implement virtual scrolling if many recommendations

3. **Memory Management**
   - Clean up subscriptions on unmount
   - Avoid storing large objects in component state
   - Use IndexedDB as primary store (not RAM)

---

## Success Criteria

### Phase 3 Complete When:
- [x] All components implement and tested
- [x] useRunHistory() and useRecommendations() hooks working
- [x] Data flows correctly from IndexedDB to UI
- [x] Stats display correctly with existing 2 runs
- [x] New workflows update UI automatically
- [x] Recommendations render with proper styling
- [x] 0 TypeScript compilation errors
- [x] 0 critical console errors
- [x] Responsive design verified
- [x] Accessibility standards met

---

## Estimated Timeline

| Task | Duration | Start | End |
|------|----------|-------|-----|
| HistoricalTelemetryCard | 2-3h | Day 1 | Day 1 |
| useRunHistory Hook | 1-2h | Day 1 | Day 1-2 |
| RecommendationBadge | 1-2h | Day 2 | Day 2 |
| ArtifactViewer Integration | 1-2h | Day 2 | Day 2 |
| Testing & Polish | 2-3h | Day 2-3 | Day 3 |
| **Total** | **7-12h** | | |

---

## Dependencies

### No New External Dependencies Needed ✅
- All required libraries already in project
- Using existing styling system (Tailwind)
- Using existing UI patterns
- Type definitions available

### Required from Wave 3 Foundation ✅
- ✅ ComfyUICallbackProvider (initialized)
- ✅ RunHistoryDatabase (populated)
- ✅ useComfyUICallbackManager hook (available)
- ✅ IndexedDB stores (created with data)

---

## Known Limitations & Future Work

### Phase 3 Scope
- Basic statistics display
- Simple recommendation rendering
- Manual refresh capability
- Static styling

### Post-Phase 3 Enhancements
- [ ] Advanced filtering (by date, story, status)
- [ ] Trend analysis (performance over time)
- [ ] Comparative workflows
- [ ] Interactive charts/graphs
- [ ] Export data functionality
- [ ] Real-time collaboration
- [ ] Custom recommendation rules

---

## Developer Handoff Notes

### Architecture Overview
The complete data flow is:

```
ComfyUI Completes Workflow
    ↓ (Every 5 seconds)
QueueMonitor Detects → Callback Manager Processes
    ↓
transformEventToHistoricalRun() → saveRun() to IndexedDB
    ↓
RunHistoryDatabase subscribers notified
    ↓
useRunHistory() hook state updates
    ↓
HistoricalTelemetryCard re-renders with new data
```

### Key Files to Know
- `services/comfyUICallbackService.ts` - Event handling (ready ✅)
- `services/runHistoryService.ts` - Database layer (ready ✅)
- `components/ComfyUICallbackProvider.tsx` - React integration (ready ✅)
- `components/ArtifactViewer.tsx` - Where UI will display (target for Phase 3)
- `utils/hooks.ts` - Where new hooks go (extend here)

### Testing Data Available
- 2 complete workflows in IndexedDB
- 25 frames per workflow (50 total)
- 100% success rate
- Ready for immediate UI display

### Quick Start for Developer
1. Review `WAVE_3_INTEGRATION_GUIDE.md` for architecture
2. Check `WAVE_3_QUEUE_MONITOR_FIX_SUMMARY.md` for how polling works
3. Look at existing `useRunHistory()` stub in `utils/hooks.ts`
4. Start with HistoricalTelemetryCard component
5. Run dev server and test with existing IndexedDB data

---

## Sign-Off

**Phase 3 Roadmap Created**: November 14, 2025  
**Infrastructure Status**: ✅ Production Ready  
**Next Developer**: Ready to start implementation  

All prerequisites complete. Wave 3 Phase 3 UI implementation can begin immediately with the infrastructure already validated and working.

---

*Ready to proceed with UI implementation. Good luck! 🚀*
