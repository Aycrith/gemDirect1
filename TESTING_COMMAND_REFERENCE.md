# Phase 2C Wave 2: Testing Command Reference
**Date**: November 14, 2025  
**Purpose**: Quick reference for running Wave 2 integration tests  

---

## Environment Status (Pre-Testing Verified ✅)

```
✅ Dev Server: http://localhost:5173 (running, hot reload active)
✅ ComfyUI: http://127.0.0.1:8188 (confirmed running)
✅ TypeScript: Zero errors
✅ IndexedDB: Available and ready
✅ WebSocket: Active
```

---

## Testing Timeline

### Total Duration: ~75-90 minutes
```
Phase 1-2  (5 min)  : Verify Current Load
Phase 3    (15 min) : Generate Test Data
Phase 4    (10 min) : Verify IndexedDB
Phase 5-6  (15 min) : Verify Display Components
Phase 7    (10 min) : Stress Test
Phase 8    (5 min)  : Error Handling
Phase 9    (5 min)  : Browser Compatibility
Phase 10   (5 min)  : Performance Check
Documentation (5 min): Results summary
```

---

## Quick Start (3 Steps)

### Step 1: Verify Current State (Now - 5 min)
```
1. Open http://localhost:5173 in browser
2. Look for artifact metadata (if available)
3. Scroll to bottom → See "Historical Analysis" section
4. Should show empty state message
5. Check console (F12) → No errors expected
```

**Expected Result**: 
✅ App loads  
✅ Empty state shows  
✅ No console errors  

---

### Step 2: Generate Test Data (15 min)
```
1. Open http://127.0.0.1:8188 in new tab (ComfyUI)
2. Load/create a simple test workflow
3. Execute workflow to completion
4. Watch for artifact generation
5. Return to dev app tab
6. Refresh or wait for auto-update
```

**Expected Result**:
✅ Workflow completes  
✅ Artifact metadata generated  
✅ App detects new data  

---

### Step 3: Verify Data Storage & Display (25 min)

#### Part A: IndexedDB Inspection (10 min)
```
1. Open DevTools: F12
2. Go to: Application → Storage → IndexedDB → TelemetryDB
3. Expand: TelemetryDB
4. Check stores:
   - runs (should have 1 entry)
   - scenes (should have 2+ entries)
   - recommendations (empty OK)
   - filterPresets (empty OK)
5. Click a run entry → inspect data structure
6. Verify: runId, timestamp, durationMs, successRate, scenes array
```

**Checklist**:
- [ ] TelemetryDB exists
- [ ] runs store has data
- [ ] scenes store has data
- [ ] Document structure looks correct
- [ ] Data looks reasonable

---

#### Part B: UI Component Display (15 min)
```
1. In app tab, scroll to "Historical Analysis" section
2. Look for 3 main components:
   a) HistoricalTelemetryCard (run-level comparison)
   b) TelemetryComparisonChart (duration trend)
   c) TelemetryComparisonChart (success rate trend)
3. Verify each shows data:
   - Cards have titles and metrics
   - Charts show sparklines
   - Numbers are reasonable (duration in ms, rate 0-100%)
4. Look for per-scene metrics section
5. Check console (F12) for any errors
```

**Checklist**:
- [ ] Historical Analysis section shows
- [ ] Comparison card displays
- [ ] Duration chart renders
- [ ] Success rate chart renders
- [ ] Per-scene metrics visible
- [ ] No console errors

---

## Detailed Testing Phases

### Phase 1-2: Verify Current Load (5 min)

**Actions**:
```
1. Navigate to http://localhost:5173
2. Wait for page to fully load (should be <2s)
3. Verify artifact metadata loads
4. Look for "Latest artifact snapshot" section
5. Check TelemetryBadges render (duration, success rate, GPU)
6. Scroll down to bottom
7. Find "Historical Analysis" section header
8. Verify it shows empty state message
9. Open DevTools (F12) → Console tab
10. Check for any errors (should be none)
```

**Success Criteria**:
- ✅ Page loads without errors
- ✅ Current artifact data displays
- ✅ TelemetryBadges show metrics
- ✅ Historical section shows empty state
- ✅ Console is clean (no errors)

---

### Phase 3: End-to-End ComfyUI Workflow (15-20 min)

**Actions**:
```
1. Open http://127.0.0.1:8188 in new browser tab
2. Wait for ComfyUI interface to load
3. Load a workflow (or create simple test workflow)
4. Verify all nodes connected properly
5. Click "Queue Prompt" button
6. Monitor execution progress
7. Wait for completion (should complete successfully)
8. Note the artifact ID if visible
9. Return to dev app tab
10. Trigger artifact refresh (refresh page or wait)
```

**Success Criteria**:
- ✅ ComfyUI loads without errors
- ✅ Workflow executes successfully
- ✅ Artifact generates (new metadata)
- ✅ App detects and loads new data

---

### Phase 4: Verify IndexedDB Data Persistence (10 min)

**Actions**:
```
1. Open DevTools (F12)
2. Navigate to Application tab
3. Go to Storage → IndexedDB
4. Locate "TelemetryDB" database
5. Expand the database
6. Inspect each object store:

   stores to check:
   - runs (primary store)
   - scenes (related data)
   - recommendations (should be empty)
   - filterPresets (should be empty)

7. Double-click on a run entry
8. Verify the data structure:
   - runId: string (non-empty)
   - timestamp: ISO date string (reasonable)
   - durationMs: number (>0)
   - successRate: number (0-1 range)
   - totalScenes: number (>0)
   - failedScenes: number (>=0)
   - averageDurationPerScene: number (>0)
   - scenes: array (with scene objects)

9. Refresh page (Ctrl+R)
10. Re-open IndexedDB → confirm data still there
```

**Success Criteria**:
- ✅ TelemetryDB exists and is accessible
- ✅ runs store contains run documents
- ✅ scenes store contains scene metrics
- ✅ Data structure matches HistoricalRun interface
- ✅ Data persists across page refresh

**Sample Valid Data**:
```json
{
  "runId": "run-2025-11-14-abc123",
  "timestamp": "2025-11-14T14:30:25.000Z",
  "durationMs": 5234,
  "successRate": 0.95,
  "totalScenes": 12,
  "failedScenes": 0,
  "averageDurationPerScene": 435,
  "scenes": [
    {
      "sceneId": "scene-001",
      "durationMs": 400,
      "successRate": 1.0,
      "timestamp": "2025-11-14T14:30:25.000Z"
    }
  ]
}
```

---

### Phase 5-6: Verify Historical Display Components (15 min)

**Action A: HistoricalTelemetryCard (5 min)**
```
1. Locate "Run-level Comparison" section
2. Verify it displays:
   - Current duration (in ms)
   - Average duration from history
   - Delta (difference)
   - Color indicator (green=better, red=worse, gray=stable)
   - Success rate comparison
   - Confidence level ("High" or "Medium" or "Low")

3. Verify delta format looks like: "↓ -123ms" or "↑ +45ms"
4. Verify success rate shows percentage (0-100%)
5. Check font sizes and colors are readable
```

**Success Criteria**:
- ✅ Card displays with title
- ✅ All metrics visible (duration, success rate)
- ✅ Delta calculations shown
- ✅ Color coding applied correctly
- ✅ Confidence level displayed

---

**Action B: Duration Trend Chart (5 min)**
```
1. Look for "Duration Trend" section (should have sparkline)
2. Verify it displays:
   - Chart title: "Duration Trend"
   - Min value (lowest duration ever)
   - Current value (most recent)
   - Max value (highest duration)
   - Sparkline visualization (small line chart)
   - Unit label (ms)

3. Check sparkline shape (should trend upward/downward or stable)
4. Verify all values are > 0
5. Verify current is between min and max
```

**Success Criteria**:
- ✅ Chart displays with title
- ✅ Min/current/max values shown
- ✅ Sparkline renders without errors
- ✅ Values are reasonable (duration in ms)
- ✅ No overlapping text

---

**Action C: Success Rate Trend Chart (5 min)**
```
1. Look for "Success Rate Trend" section
2. Verify it displays:
   - Chart title: "Success Rate Trend"
   - Min value (lowest success rate)
   - Current value (most recent)
   - Max value (highest success rate)
   - Sparkline visualization
   - Percentage labels (%)

3. Check all values are in 0-100% range
4. Verify current is between min and max
5. Look for trend line to show pattern
```

**Success Criteria**:
- ✅ Chart displays with title
- ✅ Min/current/max shown as percentages
- ✅ Sparkline renders
- ✅ Values are in valid range (0-100%)
- ✅ Layout is clean and readable

---

**Action D: Per-Scene Metrics (5 min)**
```
1. Look for "Per-Scene Historical Metrics" section
2. Verify it lists all scenes from current run
3. For each scene, check:
   - Scene ID displayed
   - Current duration shown
   - Average duration shown
   - Delta calculation visible
   - Trend indicator (↑↓→)
   - History count ("5 runs" etc)

4. Verify scene list is complete (all scenes from artifact)
5. Check colors match current vs historical comparison
```

**Success Criteria**:
- ✅ All scenes listed
- ✅ Current duration shown for each
- ✅ Average duration calculated
- ✅ Delta shown with color coding
- ✅ History count displayed

---

### Phase 7: Stress Test - Multiple Workflows (10 min)

**Actions**:
```
1. In ComfyUI, run 2-3 additional workflows
2. Let each complete fully
3. Return to dev app after each
4. Check if historical data accumulates
5. Verify database stores multiple runs
6. Check comparison values update
7. Ensure no errors occur during accumulation
```

**Expected Behavior**:
- First run: 1 entry in IndexedDB
- Second run: 2 entries in IndexedDB
- Third run: 3 entries in IndexedDB
- Average duration: Should change as more data accumulates
- Confidence level: Should increase (from "Low" to "Medium" to "High")

**Success Criteria**:
- ✅ Multiple runs save successfully
- ✅ Database accumulates data correctly
- ✅ Comparisons update with each new run
- ✅ No performance degradation
- ✅ No errors in console

---

### Phase 8: Error Handling Verification (5 min)

**Actions**:
```
1. Open DevTools Console (F12 → Console)
2. Clear console (right-click → Clear console)
3. Perform these actions and watch console:
   - Refresh page
   - Scroll through historical section
   - Inspect IndexedDB
   - Resize browser window
   - Open/close DevTools

4. Watch for any errors:
   - "Cannot read property" errors
   - "undefined is not a function"
   - "IndexedDB quota exceeded"
   - React errors
   - Network errors

5. Check memory usage (should be stable)
6. Look for warnings (yellow)
7. Look for errors (red)
```

**Success Criteria**:
- ✅ No console errors
- ✅ No console warnings
- ✅ Memory usage stable
- ✅ All operations complete without exceptions
- ✅ Graceful handling of edge cases

---

### Phase 9: Browser Compatibility Check (5 min)

**On Primary Browser (Chrome/Edge)**:
```
1. Complete all tests above
2. Document browser and version
3. Note any specific behavior
```

**On Secondary Browser (if available)**:
```
1. Open http://localhost:5173
2. Verify historical section renders
3. Check IndexedDB is accessible
4. Note any browser-specific issues
5. Compare with primary browser results
```

**Supported Browsers**:
- ✅ Chrome 24+
- ✅ Firefox 16+
- ✅ Safari 10+
- ✅ Edge 79+

**Success Criteria**:
- ✅ At least Chrome tested
- ✅ Historical section displays
- ✅ IndexedDB works
- ✅ No browser-specific errors
- ✅ Performance acceptable

---

### Phase 10: Performance Benchmarking (5 min)

**Using DevTools Performance Tab**:
```
1. Open DevTools → Performance tab
2. Click "Record" button
3. Scroll through entire Historical Analysis section
4. Perform these actions:
   - Scroll up/down
   - Expand scene details
   - Inspect different metrics
   - Resize browser
5. Stop recording
6. Analyze results:
   - FPS should stay at 60
   - No long tasks (>50ms)
   - Total time <2 seconds for interaction
```

**Memory Check**:
```
1. Open DevTools → Memory tab
2. Take heap snapshot
3. Note total memory usage:
   - Should be <5MB for telemetry-related objects
   - IndexedDB queries should complete <50ms
   - No memory leaks (memory doesn't grow over time)
```

**Success Criteria**:
- ✅ Consistent 60 FPS
- ✅ No frame drops during scrolling
- ✅ Memory usage stable
- ✅ All interactions <100ms
- ✅ Rendering performant

---

## Testing Troubleshooting Guide

### Issue: "Historical Analysis" section doesn't appear
**Possible Causes**:
1. Component not rendered (check console for errors)
2. No historical data exists yet
3. useRunHistory hook not initialized

**Solutions**:
1. Hard refresh page (Ctrl+Shift+R)
2. Run a ComfyUI workflow
3. Wait 2-3 seconds for data to load
4. Check console (F12) for errors
5. Open IndexedDB to verify data exists

---

### Issue: IndexedDB not visible in DevTools
**Possible Causes**:
1. Private browsing mode (limited storage)
2. Browser doesn't support IndexedDB
3. Database not initialized

**Solutions**:
1. Use normal browsing mode (not private)
2. Use supported browser (Chrome, Firefox, Edge, Safari)
3. Refresh page and run a workflow
4. Hard refresh with Ctrl+Shift+R

---

### Issue: Charts don't render / show as blank
**Possible Causes**:
1. Bad sparkline calculation
2. Missing or invalid data
3. Console errors

**Solutions**:
1. Check console (F12) for JavaScript errors
2. Refresh page and run workflow again
3. Verify data in IndexedDB looks valid
4. Look for "NaN" or "undefined" values

---

### Issue: Metrics show impossible values
**Examples**:
- Duration showing "-123ms" (negative)
- Success rate > 100% or < 0%
- Scene count = 0

**Solutions**:
1. Data validation issue → check IndexedDB data
2. Calculation error → check console
3. Clear data and re-run workflow

---

### Issue: Performance is slow / stuttering
**Possible Causes**:
1. Too many historical runs (100+)
2. Large dataset with complex scenes
3. Memory leak in component
4. Browser running other tasks

**Solutions**:
1. Clear old runs from IndexedDB (use DevTools to delete)
2. Close other browser tabs
3. Hard refresh page
4. Profile with DevTools Performance tab

---

## Quick Command Reference

### Browser DevTools
```
F12              - Open DevTools
Ctrl+Shift+J     - Open Console
Ctrl+Shift+I     - Open Inspector
Ctrl+Shift+M     - Toggle device mode
Ctrl+Shift+R     - Hard refresh (clear cache)
```

### Navigation
```
http://localhost:5173     - Dev app
http://127.0.0.1:8188     - ComfyUI
```

### Check Status
```
In Terminal:
npm run dev       - Start dev server (already running)
```

---

## Data Validation Checklist

### Run Document Structure ✅
```
runId: ✓ Present, string, non-empty
timestamp: ✓ Present, ISO format, valid date
durationMs: ✓ Present, number > 0
successRate: ✓ Present, number 0-1
totalScenes: ✓ Present, number > 0
failedScenes: ✓ Present, number >= 0
averageDurationPerScene: ✓ Present, number > 0
scenes: ✓ Present, array with scene objects
```

### Scene Document Structure ✅
```
sceneId: ✓ Present, string, non-empty
durationMs: ✓ Present, number > 0
successRate: ✓ Present, number 0-1
timestamp: ✓ Present, ISO format, valid date
```

### Comparison Calculations ✅
```
durationDelta: ✓ Calculated correctly (current - avg)
successRateDelta: ✓ Calculated correctly
trendDirection: ✓ Identifies improving/degrading/stable
confidence: ✓ Set appropriately based on sample size
```

---

## Test Results Template

Use this to document your testing session:

```
# Wave 2 Testing Session - [Date]

## Environment
- Browser: [Chrome/Firefox/Safari/Edge]
- Dev Server: http://localhost:5173 ✓/✗
- ComfyUI: http://127.0.0.1:8188 ✓/✗

## Test Results

### Phase 1-2: Current Load
- [ ] Pass / [ ] Fail
- Notes: _______________

### Phase 3: ComfyUI Workflow
- [ ] Pass / [ ] Fail
- Workflow: _______________
- Duration: _______________

### Phase 4: IndexedDB Verification
- [ ] Pass / [ ] Fail
- Runs stored: _____ 
- Scenes stored: _____

### Phase 5-6: Display Components
- HistoricalTelemetryCard: [ ] Pass / [ ] Fail
- Duration Chart: [ ] Pass / [ ] Fail
- Success Chart: [ ] Pass / [ ] Fail
- Per-scene metrics: [ ] Pass / [ ] Fail

### Phase 7: Stress Test
- [ ] Pass / [ ] Fail
- Total runs: _____
- Issues: _______________

### Phase 8-10: Advanced Tests
- Error handling: [ ] Pass / [ ] Fail
- Browser compat: [ ] Pass / [ ] Fail
- Performance: [ ] Pass / [ ] Fail

## Issues Found
[List any issues, errors, or concerns]

## Conclusion
[ ] All tests passed → Ready for Wave 3
[ ] Issues found → Document and fix
```

---

## Next Steps After Testing

### If All Pass ✅
```
1. ✅ Mark Phase 2C Wave 2 as TESTED & COMPLETE
2. ✅ Archive test results and screenshots
3. ✅ Create deployment checklist
4. ✅ Begin Wave 3 planning
5. ✅ Schedule Wave 3 development
```

### If Issues Found ❌
```
1. Document issue with details
2. Root cause analysis
3. Implement fix in code
4. Re-run relevant tests
5. Validate fix
6. Continue to Wave 3 when resolved
```

---

*Command Reference Created November 14, 2025*  
*Ready for Testing Phase*

