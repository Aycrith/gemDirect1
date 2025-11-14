# Phase 2C Wave 2 Integration Testing Guide
**Date**: November 14, 2025  
**Status**: Ready for Testing  
**Duration**: ~30-45 minutes for full test cycle  

---

## Pre-Testing Checklist

### Environment Setup
- [x] Dev server running (`npm run dev`)
- [x] ComfyUI server running (verified at http://127.0.0.1:8188)
- [x] Browser ready (Chrome/Firefox/Edge)
- [x] Browser DevTools available for IndexedDB inspection
- [x] No TypeScript errors in build

### Code Status
- [x] Wave 1 components deployed
- [x] Wave 2 components integrated
- [x] ArtifactViewer updated
- [x] Hot module reloading working
- [x] All imports resolved

---

## Testing Session Structure

### Phase 1: Verify Current Artifact Load (5 minutes)
**Objective**: Ensure existing functionality still works  

**Steps**:
1. [ ] Navigate to http://localhost:5173 in browser
2. [ ] Verify artifact metadata loads (look for "Latest artifact snapshot")
3. [ ] Check current telemetry displays correctly (TelemetryBadges)
4. [ ] Verify scene table displays
5. [ ] Check console for any errors

**Expected Result**: Application loads without errors, existing views render

---

### Phase 2: Inspect Historical Section Rendering (5 minutes)
**Objective**: Verify Wave 2 components render (no data state)  

**Steps**:
1. [ ] Scroll to bottom of ArtifactViewer component
2. [ ] Look for "Historical Analysis" section header
3. [ ] Verify it shows "Historical telemetry data will appear here..." message
4. [ ] Check console for any component rendering errors
5. [ ] Verify no console errors or warnings

**Expected Result**: Empty state shows gracefully, no errors

**Console Check**:
```javascript
// In browser console, verify no errors like:
// - "Cannot read property 'length' of undefined"
// - "useRunHistory is not defined"
// - Component render errors
```

---

### Phase 3: Run End-to-End ComfyUI Workflow (15-20 minutes)
**Objective**: Generate artifact data and trigger database save  

**Steps**:
1. [ ] Open ComfyUI in separate browser tab (http://127.0.0.1:8188)
2. [ ] Load a workflow (or create simple test workflow)
3. [ ] Execute workflow to completion
4. [ ] Monitor artifact generation
5. [ ] Let app refresh/update with new artifact

**Expected Result**: New artifact metadata available

---

### Phase 4: Verify Historical Data Saves to IndexedDB (10 minutes)
**Objective**: Confirm Wave 2 database operations work  

**Steps**:
1. [ ] Open DevTools (F12 in Chrome/Firefox)
2. [ ] Go to **Application** tab → **Storage** → **IndexedDB**
3. [ ] Look for **TelemetryDB** database
4. [ ] Expand **TelemetryDB** to see object stores:
   - [ ] `runs` - should contain run documents
   - [ ] `scenes` - should contain scene metrics
   - [ ] `recommendations` - should be empty initially
   - [ ] `filterPresets` - should be empty initially

**Expected Results**:
- TelemetryDB exists and is accessible
- At least one run document in `runs` store
- Scene metrics in `scenes` store
- Document structure matches HistoricalRun interface

**Sample Data Structure** (what to look for):
```json
{
  "runId": "run-xxxxx",
  "timestamp": "2025-11-14T...",
  "durationMs": 5234,
  "successRate": 0.95,
  "totalScenes": 12,
  "failedScenes": 0,
  "averageDurationPerScene": 435,
  "scenes": [
    {
      "sceneId": "scene-1",
      "durationMs": 400,
      "successRate": 1.0,
      "timestamp": "2025-11-14T..."
    }
  ]
}
```

---

### Phase 5: Verify Historical Comparison Display (10 minutes)
**Objective**: Check if comparison cards render with historical data  

**Prerequisites**: Complete Phase 4 (need historical data)  

**Steps**:
1. [ ] Refresh browser or reload artifact metadata
2. [ ] Scroll to "Historical Analysis" section
3. [ ] Verify **HistoricalTelemetryCard** renders:
   - [ ] Shows "Run-level Comparison" header
   - [ ] Displays current duration vs avg
   - [ ] Shows success rate comparison
   - [ ] Has delta indicators (📈📉➡️)
   - [ ] Shows confidence level

4. [ ] Verify **Duration Trend Chart** renders:
   - [ ] Shows "Duration Trend" header
   - [ ] Displays sparkline visualization
   - [ ] Shows min/current/max values
   - [ ] No rendering errors

5. [ ] Verify **Success Rate Trend Chart** renders:
   - [ ] Shows "Success Rate Trend" header
   - [ ] Displays trend sparkline
   - [ ] Shows percentage values
   - [ ] Properly colored indicators

**Expected Result**: All three Wave 2 components display with actual data

**Color Coding Check**:
- Green deltas: Current metric is better (lower duration, higher success)
- Red deltas: Current metric is worse (higher duration, lower success)
- Gray deltas: Metrics are stable (neutral change)

---

### Phase 6: Verify Per-Scene Metrics Display (5 minutes)
**Objective**: Check per-scene historical comparison  

**Steps**:
1. [ ] Look for "Per-Scene Historical Metrics" section (in Historical Analysis)
2. [ ] Verify scene cards display:
   - [ ] Scene ID appears
   - [ ] Current duration shown
   - [ ] Average duration shown
   - [ ] Delta calculation visible
   - [ ] Trend indicator (📈📉➡️)
   - [ ] History count shows

3. [ ] Check multiple scenes render correctly
4. [ ] Verify no layout issues or truncation

**Expected Result**: All scenes show historical metrics properly

**Example Display**:
```
Per-Scene Historical Metrics
┌─────────────────────────────────────┐
│ scene-001                    📉 +150ms
│ Current: 550ms | Avg: 400ms
│ History: 24 runs
└─────────────────────────────────────┘
```

---

### Phase 7: Run Stress Test (Multiple Workflows)
**Objective**: Verify database handles multiple runs correctly  

**Steps**:
1. [ ] Run 2-3 additional workflows in ComfyUI
2. [ ] Wait for each artifact to generate
3. [ ] Refresh artifact view after each
4. [ ] Check IndexedDB to verify data accumulates:
   - [ ] `runs` store has 2-3 run documents
   - [ ] `scenes` store has multiple entries
   - [ ] Timestamps differ for each run

5. [ ] Verify comparison calculations update:
   - [ ] Average duration changes
   - [ ] Trend indicators update
   - [ ] Delta calculations reflect new data

**Expected Result**: Database correctly accumulates data, comparisons update

---

### Phase 8: Verify Error Handling (5 minutes)
**Objective**: Confirm graceful error handling  

**Steps**:
1. [ ] Open browser console
2. [ ] Check for any errors or warnings (should be none)
3. [ ] Trigger IndexedDB inspection (DevTools → Storage)
4. [ ] Verify database is accessible
5. [ ] Check memory usage in DevTools (should be <5MB for telemetry)

**Error Checks**:
- [ ] No "Cannot read property" errors
- [ ] No "undefined is not a function" errors
- [ ] No "IndexedDB quota exceeded" errors
- [ ] No console warnings about deprecated APIs
- [ ] No memory leaks detected

---

### Phase 9: Browser Compatibility Check (5 minutes)
**Objective**: Verify Wave 2 works across browsers  

**If Available, Test On**:
- [ ] Chrome/Chromium (primary)
- [ ] Firefox (if available)
- [ ] Safari (if available)
- [ ] Edge (if available)

**For Each Browser**:
1. [ ] Load artifact view
2. [ ] Verify historical section renders
3. [ ] Check IndexedDB is accessible
4. [ ] Confirm no console errors
5. [ ] Test performance/rendering speed

**Expected Result**: Consistent rendering across browsers

---

### Phase 10: Component Performance Check (5 minutes)
**Objective**: Verify rendering performance  

**Steps**:
1. [ ] Open DevTools → Performance tab
2. [ ] Click "Record"
3. [ ] Scroll through Historical Analysis section
4. [ ] Stop recording
5. [ ] Analyze frame rate:
   - [ ] Should maintain 60 FPS
   - [ ] No frame drops or stuttering
   - [ ] Component rendering < 5ms each

6. [ ] Check memory profile:
   - [ ] IndexedDB queries < 20ms
   - [ ] Total component render < 30ms
   - [ ] No memory growth over time

**Expected Result**: Smooth 60 FPS performance throughout

---

## Test Data Validation Checklist

### IndexedDB Schema Verification
```
Database: TelemetryDB (Version 1)
├── runs (keyPath: 'runId')
│   ├── Index: timestamp
│   ├── Index: durationMs
│   └── Index: successRate
├── scenes (keyPath: 'sceneId')
│   ├── Index: runId (foreign key)
│   └── Index: timestamp
├── recommendations (keyPath: 'recommendationId')
│   └── Index: runId (foreign key)
└── filterPresets (keyPath: 'presetId')
    └── Index: name
```

### Run Document Validation
Check each run in IndexedDB contains:
- [x] `runId`: string (non-empty)
- [x] `timestamp`: ISO string (valid date)
- [x] `durationMs`: number (>0)
- [x] `successRate`: number (0-1)
- [x] `totalScenes`: number (>0)
- [x] `failedScenes`: number (>=0)
- [x] `averageDurationPerScene`: number (>0)
- [x] `scenes`: array (HistoricalSceneMetrics[])

### Scene Document Validation
Check each scene in IndexedDB contains:
- [x] `sceneId`: string (non-empty)
- [x] `durationMs`: number (>0)
- [x] `successRate`: number (0-1)
- [x] `timestamp`: ISO string (valid)
- [x] Optional: `gpuVramUsedMB`: number

### Comparison Calculation Validation
When 2+ runs exist, verify:
- [x] `durationDelta`: calculated correctly (current - average)
- [x] `durationPercentChange`: accurate percentage
- [x] `successRateDelta`: calculated correctly
- [x] `trendDirection`: correctly identified (improving/degrading/stable)
- [x] `confidence`: set appropriately (high/medium/low based on sample size)

---

## Issue Reporting Template

### If You Find An Issue

**Issue**: [Brief description]
```
Title: [What went wrong]
Location: [Component/file]
Steps to reproduce:
1. [First step]
2. [Second step]
3. [Expected vs actual result]

Console errors (if any):
[Paste exact error message]

Browser: [Chrome/Firefox/Safari]
Screenshot: [If applicable]
```

### Common Issues & Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Historical Analysis" section doesn't show | No historical runs saved | Run more ComfyUI workflows |
| IndexedDB not found in DevTools | Database not initialized | Refresh page, run workflow |
| Empty state message shows when data exists | Hook not initialized | Clear cache, hard refresh |
| Charts not rendering | Bad sparkline calculation | Check console for calculation errors |
| Memory usage growing | Potential memory leak | Profile in DevTools, report issue |

---

## Success Criteria

### All Tests Pass When:
✅ Application loads without errors  
✅ Empty state shows for no historical data  
✅ Historical data saves to IndexedDB after workflows  
✅ HistoricalTelemetryCard renders with data  
✅ TelemetryComparisonChart renders correctly  
✅ Per-scene metrics display properly  
✅ Database structure matches schema  
✅ Comparison calculations are accurate  
✅ No console errors or warnings  
✅ Performance remains smooth (60 FPS)  
✅ Works across browsers (tested Chrome minimum)  

---

## Performance Benchmarks

### Expected Timings
| Operation | Expected | Max Acceptable |
|-----------|----------|-----------------|
| Page load | <2s | <5s |
| Artifact refresh | <500ms | <1s |
| Database query | 10-20ms | <50ms |
| Comparison calc | <1ms | <5ms |
| Component render | 2-5ms | <10ms |
| Chart sparkline | 2-3ms | <5ms |

### Memory Usage
| Metric | Expected | Max Acceptable |
|--------|----------|-----------------|
| Single run (IndexedDB) | ~100KB | <200KB |
| 10 runs | ~1MB | <2MB |
| 100 runs | ~10MB | <20MB |
| App overhead | <1MB | <3MB |

---

## Post-Testing Checklist

### If All Tests Pass ✅
- [x] Document: "Wave 2 integration testing passed"
- [x] Plan: Proceed to Wave 3 development
- [x] Archive: Save test results and screenshots
- [x] Update: Mark Phase 2C as deployment-ready

### If Issues Found ❌
- [ ] Document: Issue report (use template above)
- [ ] Diagnose: Root cause analysis
- [ ] Fix: Address in code
- [ ] Re-test: Run affected tests again
- [ ] Validate: All tests must pass before Wave 3

### Final Sign-off
After all tests complete:
- [ ] Create test results document
- [ ] Note any minor issues for Wave 3
- [ ] Plan Wave 3 development kickoff
- [ ] Archive this testing guide with results

---

## Notes & Observations

### During Testing, Document:
- [ ] Any unexpected UI behavior
- [ ] Performance observations
- [ ] Browser-specific issues
- [ ] Data accuracy concerns
- [ ] Suggestions for Wave 3

### Areas to Watch:
1. **IndexedDB Initialization**: First-time DB creation
2. **Data Persistence**: Data survives page refresh
3. **Comparison Accuracy**: Calculations match expected values
4. **Memory Management**: No leaks with 100+ runs
5. **Browser Support**: Consistent across browsers

---

## Next Steps After Testing

### If Passing (Expected)
```
1. Mark Phase 2C as COMPLETE & TESTED
2. Begin Wave 3 planning:
   - Export functionality
   - Recommendations engine
   - Advanced filtering UI
3. Schedule Wave 3 development
4. Create deployment checklist
```

### If Issues Found
```
1. File issue report with details
2. Root cause analysis
3. Implement fix
4. Re-run relevant tests
5. Continue to Wave 3 when resolved
```

---

## Quick Reference

### Key URLs
- App: http://localhost:5173
- ComfyUI: http://127.0.0.1:8188
- DevTools: F12 (Chrome/Firefox)

### Key Files to Monitor
- `services/runHistoryService.ts` - Database operations
- `utils/hooks.ts` - useRunHistory hook
- `components/ArtifactViewer.tsx` - Integration point
- `components/HistoricalTelemetryCard.tsx` - Display
- `components/TelemetryComparisonChart.tsx` - Charts

### Key Browser Features
- IndexedDB: Application → Storage → IndexedDB
- Console: Ctrl+Shift+J (Chrome) or F12 → Console
- Performance: DevTools → Performance tab
- Network: DevTools → Network tab

---

## Testing Duration Estimate

- Phase 1: 5 min
- Phase 2: 5 min
- Phase 3: 15-20 min
- Phase 4: 10 min
- Phase 5: 10 min
- Phase 6: 5 min
- Phase 7: 10 min
- Phase 8: 5 min
- Phase 9: 5 min
- Phase 10: 5 min

**Total**: ~75-90 minutes for complete test cycle

---

*Testing Guide Created November 14, 2025*  
*Ready to begin Phase 2C Wave 2 Integration Testing*
