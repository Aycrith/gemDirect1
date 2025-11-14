# 🚀 Wave 2 Testing Quick-Start

**Status**: ✅ Ready to Test  
**Current Time**: November 14, 2025  
**Environment**: All systems go  

---

## What's Running Now

```
✅ Dev Server: http://localhost:5173
✅ ComfyUI: http://127.0.0.1:8188 (verified running)
✅ Code: Zero errors, hot reload active
✅ Database: IndexedDB ready to accept data
```

---

## 3-Step Testing Flow

### Step 1: See Current State (NOW)
1. App should be loading in browser at http://localhost:5173
2. Look for artifact metadata (if available)
3. Scroll to bottom to see "Historical Analysis" section
4. Should show empty state: *"Historical telemetry data will appear here..."*

### Step 2: Generate Test Data (15 minutes)
1. Open ComfyUI at http://127.0.0.1:8188 in another tab
2. Load/create a test workflow
3. Run it to completion
4. Let artifact data generate

### Step 3: Verify Historical Data (10 minutes)
1. Refresh app or reload artifact view
2. Scroll to "Historical Analysis" section
3. Should now show:
   - ✅ Run-level comparison card
   - ✅ Duration trend chart
   - ✅ Success rate trend chart
   - ✅ Per-scene metrics
4. Open DevTools (F12) → Application → Storage → IndexedDB
5. Verify `TelemetryDB` contains your run data

---

## What to Look For

### Green Flags ✅
- Historical section renders without errors
- Comparison cards show data
- Charts display sparklines
- No console errors
- DevTools shows IndexedDB populated
- Metrics make sense (duration reasonable, success rate 0-100%)

### Red Flags ❌
- Console shows errors
- Empty state still appears after running workflow
- Charts don't render
- IndexedDB empty after workflow
- Metrics show impossible values

---

## Testing Checklist

Phase 1: Verify Current Load
- [ ] App loads
- [ ] Empty state shows

Phase 2: Run Workflow
- [ ] ComfyUI running
- [ ] Workflow executed
- [ ] Artifact generated

Phase 3: Verify Data Display
- [ ] Historical section shows
- [ ] Comparison card displays
- [ ] Charts render
- [ ] IndexedDB populated

Phase 4: Data Validation
- [ ] Database has expected structure
- [ ] Calculations look correct
- [ ] No console errors

---

## Key Files

**If Issues Found**, check these:

| File | Purpose |
|------|---------|
| `services/runHistoryService.ts` | Database operations |
| `utils/hooks.ts` | useRunHistory hook |
| `components/ArtifactViewer.tsx` | Integration point |
| `components/HistoricalTelemetryCard.tsx` | Comparison display |
| `components/TelemetryComparisonChart.tsx` | Chart rendering |

---

## Commands to Know

```powershell
# If dev server crashes, restart:
npm run dev

# If you need to clear data:
# (In browser DevTools, Application > Storage > IndexedDB > TelemetryDB > Delete)

# Check ComfyUI status:
$response = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats"
$response | ConvertTo-Json
```

---

## Success = Wave 3 Ready!

When all tests pass:
```
✅ Wave 1: Real-time streaming (tested)
✅ Wave 2: Historical analytics (tested)
✅ Both: Working together (verified)
→ Ready for: Wave 3 (Export & Reporting)
```

---

## Issues?

**Common Problem**: Historical section shows empty state after running workflow
- **Solution**: 
  1. Refresh browser (Ctrl+R or Cmd+R)
  2. Wait 2-3 seconds for data to load
  3. If still empty, check DevTools Console for errors
  4. Open IndexedDB to verify data exists

**Common Problem**: No IndexedDB in DevTools
- **Solution**:
  1. Hard refresh page (Ctrl+Shift+R / Cmd+Shift+R)
  2. Run a ComfyUI workflow
  3. Wait for app to update
  4. Check DevTools again

**Common Problem**: Charts not rendering
- **Solution**:
  1. Check Console for errors
  2. Refresh page
  3. Verify historical runs exist in IndexedDB
  4. Look for JavaScript errors in console

---

## Detailed Testing Guide

Full testing guide available in:
📄 `WAVE_2_INTEGRATION_TESTING_GUIDE.md`

Includes:
- 10 detailed test phases
- Success criteria for each
- Issue troubleshooting
- Performance benchmarks
- Data validation checklist

---

## Ready? 

1. ✅ App is loading at http://localhost:5173
2. ✅ ComfyUI is running
3. ✅ Code is error-free
4. 👉 **Next**: Run a workflow and check the results!

---

*Testing environment ready. Let's verify Wave 2 works!*
