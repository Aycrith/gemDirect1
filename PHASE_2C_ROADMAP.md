# Phase 2C Roadmap: Real-Time Telemetry & Advanced Diagnostics

**Status**: Planning  
**Start Date**: November 13, 2025  
**Estimated Duration**: 4-6 hours  
**Phase Complexity**: Medium-High  

---

## Overview

Phase 2C extends Phase 2B telemetry components with **real-time telemetry streaming**, **historical telemetry tracking**, and **advanced diagnostic dashboards**. This phase transforms static telemetry display into a dynamic monitoring and analytics system.

### Phase 2B → Phase 2C Evolution

**Phase 2B (Complete ✅)**:
- Static telemetry display from artifact metadata
- Queue policy configuration cards
- Fallback warning indicators
- Per-scene and run-level telemetry cards

**Phase 2C (Planned)** ← YOU ARE HERE
- Real-time telemetry streaming during generation
- Historical run tracking and comparison
- Performance metrics aggregation
- Advanced filtering and search
- Telemetry export capabilities
- Automated optimization recommendations

---

## Phase 2C Feature Set

### Feature 1: Real-Time Telemetry WebSocket Integration 🔴 HIGH PRIORITY
**Estimated Time**: 2-2.5 hours  
**Complexity**: High  
**Value**: Critical for monitoring active generations

#### What It Does
- Streams telemetry data via WebSocket during scene generation
- Updates TelemetryBadges component in real-time
- Tracks GPU VRAM changes live
- Monitors attempt counts and timing

#### Implementation Tasks
1. **Create `useRealtimeTelemetry` hook** (`utils/hooks.ts`)
   - Connects to WebSocket `/telemetry` endpoint
   - Manages connection lifecycle (reconnect, backoff)
   - Buffers updates for performance
   - Type-safe telemetry stream

2. **Extend WebSocket Service** (`services/comfyUIService.ts`)
   - Add `/telemetry` endpoint listener
   - Parse streamed telemetry events
   - Provide update callbacks to React components
   - Handle connection errors gracefully

3. **Update TelemetryBadges Component** (`components/TelemetryBadges.tsx`)
   - Accept real-time telemetry prop
   - Animate value changes (fade/pulse effects)
   - Display update timestamps
   - Show live vs. static indicator

4. **Add Loading States**
   - "Streaming..." badge during active generation
   - "Last update: X seconds ago" for stale data
   - Reconnection indicators for dropped connections

#### Success Criteria
- [ ] WebSocket connection established without errors
- [ ] Telemetry updates received every 100-500ms during generation
- [ ] Component re-renders smoothly without flicker
- [ ] GPU VRAM changes tracked accurately
- [ ] Graceful fallback to static data if stream unavailable
- [ ] Zero TypeScript errors

#### Type Definitions Needed
```typescript
interface RealtimeTelemetryUpdate {
  sceneId: string;
  timestamp: number;
  duration?: number;
  attempts?: number;
  gpuVramFree?: number;
  gpuUtilization?: number;
  status: 'queued' | 'executing' | 'completed' | 'failed';
}

interface UseRealtimeTelemetryOptions {
  enabled?: boolean;
  bufferMs?: number;
  reconnectAttempts?: number;
}
```

---

### Feature 2: Historical Run Tracking & Comparison 🟡 MEDIUM PRIORITY
**Estimated Time**: 2-2.5 hours  
**Complexity**: Medium  
**Value**: Enables performance trend analysis and optimization

#### What It Does
- Stores telemetry from each run in local IndexedDB
- Compares current run against historical baseline
- Highlights performance improvements/regressions
- Tracks metrics over time

#### Implementation Tasks
1. **Create `RunHistoryService`** (`services/runHistoryService.ts`)
   - Index historical runs in IndexedDB by timestamp
   - Query by date range, scene ID, status
   - Calculate aggregated metrics
   - Compute trends and baselines

2. **Create `useRunHistory` Hook** (`utils/hooks.ts`)
   - Fetch historical runs for comparison
   - Calculate statistics (avg, min, max, stdDev)
   - Filter by criteria (date, status, GPU, etc.)
   - Provide trend data for charts

3. **Create `HistoricalTelemetryCard` Component** (`components/HistoricalTelemetryCard.tsx`)
   - Show current vs. historical comparison
   - Display trend indicators (↑ worse, ↓ better, → same)
   - Timeline view of past runs
   - Performance delta highlighting

4. **Create `TelemetryComparisonChart` Component** (`components/TelemetryComparisonChart.tsx`)
   - Line chart of duration over time
   - Bar chart of success rates
   - Scatter plot of GPU performance
   - Hover tooltips with detailed metrics

#### Success Criteria
- [ ] Historical runs stored in IndexedDB without duplicate errors
- [ ] Comparison calculations accurate (verified with known baselines)
- [ ] Charts render smoothly with 50+ runs in history
- [ ] Trend analysis detects performance changes correctly
- [ ] Filter UI works for date range, scene, status
- [ ] Export data to CSV/JSON

#### Type Definitions Needed
```typescript
interface HistoricalRun {
  runId: string;
  timestamp: number;
  scenes: HistoricalSceneMetrics[];
  averageDuration: number;
  successRate: number;
  gpuAverageFree: number;
  fallbackCount: number;
}

interface HistoricalSceneMetrics {
  sceneId: string;
  duration: number;
  attempts: number;
  gpuVramFree: number;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  exitReason?: string;
}

interface RunComparison {
  current: HistoricalRun;
  historical: HistoricalRun[];
  deltas: DeltaMetrics;
}

interface DeltaMetrics {
  durationDelta: number; // ms, negative = faster
  successRateDelta: number; // %, positive = better
  gpuPerformanceDelta: number; // %, positive = better
  trend: 'improving' | 'degrading' | 'stable';
}
```

---

### Feature 3: Advanced Telemetry Filtering & Search 🟡 MEDIUM PRIORITY
**Estimated Time**: 1.5-2 hours  
**Complexity**: Medium  
**Value**: Makes data exploration efficient

#### What It Does
- Filter telemetry by multiple criteria simultaneously
- Search for specific error patterns
- Tag and organize runs for easy recall
- Saved filter presets

#### Implementation Tasks
1. **Create `TelemetryFilterPanel` Component** (`components/TelemetryFilterPanel.tsx`)
   - Date range picker
   - Status filter (success, failed, timeout, etc.)
   - Exit reason filter
   - GPU model filter
   - Duration range slider
   - Attempt count range

2. **Create `useTelemetryFilter` Hook** (`utils/hooks.ts`)
   - Apply multiple filters sequentially
   - Cache filter results for performance
   - Persist filter presets to localStorage
   - Export filter as shareable config

3. **Create Search Functionality**
   - Full-text search in telemetry notes
   - Regex pattern matching for error messages
   - Scene ID and story ID search
   - Saved searches

#### Success Criteria
- [ ] All filter criteria work independently and in combination
- [ ] Performance acceptable with 100+ runs to search
- [ ] Filter state persists across sessions
- [ ] Search finds correct results within 500ms
- [ ] Presets save/load correctly

---

### Feature 4: Automated Optimization Recommendations 🟠 LOW PRIORITY
**Estimated Time**: 1.5-2 hours  
**Complexity**: Medium-High  
**Value**: Helps users optimize settings

#### What It Does
- Analyzes historical telemetry patterns
- Identifies common failure modes
- Suggests parameter adjustments
- Explains reasoning behind recommendations

#### Implementation Tasks
1. **Create `TelemetryAnalyzer` Service** (`services/telemetryAnalyzer.ts`)
   - Detect failure patterns (timeout, memory, etc.)
   - Calculate optimal queue parameters
   - Identify GPU bottlenecks
   - Suggest model/workflow changes

2. **Create `RecommendationCard` Component** (`components/RecommendationCard.tsx`)
   - Display AI-generated recommendations
   - Show confidence level (high/medium/low)
   - Link to specific failing runs
   - "Apply" button to implement suggestion

3. **Recommendation Engine Logic**
   - If timeout rate > 20%: suggest higher MaxWaitSeconds
   - If memory errors > 10%: suggest reduced batch size
   - If GPU util > 95%: suggest adding delays between shots
   - If retry rate high: suggest better error recovery

#### Success Criteria
- [ ] Recommendations generated in < 1 second
- [ ] Confidence levels accurately reflect pattern strength
- [ ] Recommendations actionable and testable
- [ ] User can reject/defer recommendations

---

### Feature 5: Telemetry Export & Reporting 🟠 LOW PRIORITY
**Estimated Time**: 1-1.5 hours  
**Complexity**: Low-Medium  
**Value**: Enables external analysis and sharing

#### What It Does
- Export telemetry to CSV, JSON, or PDF
- Generate performance reports
- Share telemetry snapshots with team
- Archive historical data

#### Implementation Tasks
1. **Create `ExportService`** (`services/exportService.ts`)
   - Export to CSV (spreadsheet-ready format)
   - Export to JSON (programmatic access)
   - Export to PDF (formatted report)
   - Batch export multiple runs

2. **Create `ExportDialog` Component** (`components/ExportDialog.tsx`)
   - Format selection (CSV, JSON, PDF)
   - Date range picker
   - Field selection (which columns to include)
   - Preview before export

3. **Create Report Generator**
   - Executive summary page
   - Performance metrics table
   - Trend charts
   - Failure analysis
   - Recommendations section

#### Success Criteria
- [ ] CSV export opens correctly in Excel/Sheets
- [ ] JSON export parses correctly
- [ ] PDF looks professional and readable
- [ ] Export completes in < 2 seconds
- [ ] Large datasets (100+ runs) export without memory issues

---

## Implementation Priority & Sequencing

### Phase 2C - Wave 1 (Recommended First)
**Time**: ~2.5 hours  
**Must Haves**:
1. Real-Time Telemetry WebSocket (Feature 1) - Core capability
2. Historical Run Tracking (Feature 2) - Enables all future features

**Outcome**: Live monitoring + historical tracking foundation

### Phase 2C - Wave 2 (Recommended Second)
**Time**: ~2 hours  
**Should Haves**:
3. Advanced Filtering (Feature 3) - Data exploration
4. Recommendations (Feature 4) - Value-add

**Outcome**: Monitoring + analytics + insights

### Phase 2C - Wave 3 (Optional Enhancement)
**Time**: ~1.5 hours  
**Nice to Haves**:
5. Export & Reporting (Feature 5) - External integration

**Outcome**: Complete telemetry ecosystem

---

## Architecture Overview

### New Service Layer

```
services/
├── realtimeTelemetryService.ts      (Feature 1)
├── runHistoryService.ts               (Feature 2)
├── telemetryFilterService.ts          (Feature 3)
├── telemetryAnalyzer.ts               (Feature 4)
└── exportService.ts                   (Feature 5)
```

### New Components

```
components/
├── TelemetryBadges.tsx                (ENHANCED)
├── HistoricalTelemetryCard.tsx        (Feature 2)
├── TelemetryComparisonChart.tsx       (Feature 2)
├── TelemetryFilterPanel.tsx           (Feature 3)
├── RecommendationCard.tsx             (Feature 4)
└── ExportDialog.tsx                   (Feature 5)
```

### New Hooks

```
utils/hooks.ts
├── useRealtimeTelemetry()             (Feature 1)
├── useRunHistory()                    (Feature 2)
├── useTelemetryFilter()               (Feature 3)
└── useRecommendations()               (Feature 4)
```

### Database Schema (IndexedDB)

```typescript
// Stores
"runs"           - Aggregated run telemetry
"scenes"         - Per-scene metrics
"recommendations" - Generated suggestions
"filterPresets"  - Saved filter configurations
```

---

## Data Flow Diagram

```
Real-Time Generation
    ↓
WebSocket /telemetry Stream
    ↓
useRealtimeTelemetry Hook
    ↓
TelemetryBadges (Live Update)
    ↓
Store in IndexedDB (Persistence)
    ↓
useRunHistory Hook
    ↓
HistoricalTelemetryCard (Comparison)
    ↓
TelemetryAnalyzer (Pattern Detection)
    ↓
RecommendationCard (Insights)
    ↓
ExportService (Reporting)
```

---

## Integration Points

### With Existing Components
- **TelemetryBadges**: Enhanced with real-time streaming
- **QueuePolicyCard**: Show impact of policy on historical performance
- **FallbackWarningsCard**: Link to historical occurrences
- **ArtifactViewer**: Show comparison with previous runs
- **TimelineEditor**: Display trend indicators per scene

### With Existing Services
- **comfyUIService**: Real-time telemetry endpoint
- **geminiService**: Analyze patterns with LLM
- **payloadService**: Generate export payloads

---

## Dependencies & Prerequisites

### Phase 2C Wave 1
- ✅ Phase 2B components complete
- ✅ ComfyUI server with WebSocket support
- ✅ IndexedDB support (browser storage)
- ✅ React hooks foundation

### Phase 2C Wave 2
- ✅ Wave 1 complete
- ✅ Chart library (recommend Recharts or Chart.js)
- ✅ Date picker library (recommend React Date Range)

### Phase 2C Wave 3
- ✅ Wave 2 complete
- ✅ PDF library (recommend jsPDF)
- ✅ CSV library (recommend papaparse)

---

## Success Criteria for Phase 2C

### Build & Compilation
- [ ] Zero TypeScript compilation errors
- [ ] All new types properly exported
- [ ] No breaking changes to Phase 2B components

### Feature Completeness
- [ ] Real-time telemetry streams without lag
- [ ] Historical comparison shows accurate deltas
- [ ] Advanced filters work on 100+ runs
- [ ] Recommendations generated accurately
- [ ] Export formats are valid and usable

### Performance
- [ ] Real-time updates: < 100ms latency
- [ ] Historical queries: < 500ms response
- [ ] Filter operations: < 200ms
- [ ] Chart rendering: < 1 second
- [ ] Export generation: < 2 seconds

### User Experience
- [ ] Responsive design on mobile/desktop
- [ ] Intuitive filter and search UI
- [ ] Clear recommendation explanations
- [ ] Smooth animations and transitions
- [ ] Accessible color schemes and labels

### Documentation
- [ ] Component props documented
- [ ] Service API documented
- [ ] Hook usage examples provided
- [ ] Type definitions clearly explained
- [ ] Integration guide for next phase

---

## Testing Strategy

### Unit Tests
- Telemetry data transformation logic
- Recommendation engine algorithms
- Export format validation
- Filter expression evaluation

### Integration Tests
- WebSocket connection and message handling
- IndexedDB read/write operations
- Component state updates with real data
- Service layer interactions

### E2E Tests
- Full real-time telemetry flow
- Complete filtering and search workflow
- Export and reimport cycle
- Recommendation accuracy

---

## Risk Mitigation

### Potential Issues & Solutions

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| WebSocket connection unstable | Medium | High | Implement robust reconnection with exponential backoff |
| IndexedDB quota exceeded | Low | High | Implement data archiving and cleanup policies |
| Real-time updates cause lag | Medium | Medium | Implement throttling and batching of updates |
| Chart rendering with large datasets | Medium | Medium | Implement virtualization and data sampling |
| Recommendation engine false positives | Medium | Medium | Require high confidence threshold (> 80%) |

---

## Handoff Notes for Phase 2D

### What Phase 2C Enables
1. Live monitoring dashboard for active generation runs
2. Performance analytics across historical runs
3. Automated insights and optimization recommendations
4. Data-driven decision making for parameter tuning

### Phase 2D Possibilities
1. **AI-Assisted Prompt Optimization**: Use patterns to improve prompts
2. **Predictive Performance**: ML model to predict run success
3. **Cost Analysis**: Track compute costs per scene
4. **Team Collaboration**: Share runs and recommendations
5. **Advanced Workflows**: Custom telemetry tracking for workflows

### For Next Developer
- Start with Wave 1 (Real-time + Historical)
- Wave 1 is critical path for monitoring capability
- Wave 2 (Filtering + Recommendations) adds value-add features
- Wave 3 (Export) is optional polish for external integration
- All phases maintain backward compatibility with Phase 2B

---

## File Structure Changes

```diff
components/
  TelemetryBadges.tsx (ENHANCED)
+ HistoricalTelemetryCard.tsx
+ TelemetryComparisonChart.tsx
+ TelemetryFilterPanel.tsx
+ RecommendationCard.tsx
+ ExportDialog.tsx

services/
  comfyUIService.ts (ENHANCED)
+ realtimeTelemetryService.ts
+ runHistoryService.ts
+ telemetryFilterService.ts
+ telemetryAnalyzer.ts
+ exportService.ts

utils/
  hooks.ts (ENHANCED)
  
types.ts
  (Add new telemetry types)

(IndexedDB)
  stores: runs, scenes, recommendations, filterPresets
```

---

## Summary

**Phase 2C transforms gemDirect1's telemetry system from static display to dynamic analytics platform.**

- **Wave 1**: Real-time monitoring + historical tracking (2.5 hrs)
- **Wave 2**: Advanced filtering + recommendations (2 hrs)
- **Wave 3**: Export + reporting (1.5 hrs)

**Total Estimated Time**: 4-6 hours for full completion  
**Recommended Start**: After Phase 2B verification complete ✅

---

**Ready to begin Phase 2C?** → Start with Wave 1: Real-Time Telemetry WebSocket Integration

