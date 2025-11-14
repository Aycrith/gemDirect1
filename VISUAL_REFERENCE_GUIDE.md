# Phase 2C Wave 2: Visual Reference & Quick Guide
**Created**: November 14, 2025  
**Type**: Quick Visual Reference  

---

## 🎯 Where to Start (Decision Tree)

```
YOU ARE HERE
    ↓
┌─────────────────────────────────┐
│ What do you need right now?     │
└────────────┬────────────────────┘
             │
    ┌────────┼────────┬──────────┬──────────┐
    ↓        ↓        ↓          ↓          ↓
 STATUS  TESTING  CODE    HELP   PLANNING
    │        │      │      │       │
    ↓        ↓      ↓      ↓       ↓
   [S]      [T]    [C]    [H]     [P]

[S] STATUS?
    ↓
    Executive Summary ← START HERE (5 min)
    or Status Report ← Detailed (20 min)

[T] TESTING?
    ↓
    Quick Start ← Fast (5 min)
    or Command Reference ← Detailed (reference)
    or Full Guide ← Comprehensive (45 min)

[C] CODE?
    ↓
    Wave 1 Details ← Real-time (20 min)
    or Wave 2 Details ← Historical (25 min)
    or Roadmap ← Architecture (15 min)

[H] HELP?
    ↓
    Troubleshooting ← Problems (reference)
    or Session Index ← Navigation (reference)

[P] PLANNING?
    ↓
    Roadmap ← Next 3 waves (15 min)
    or Status Index ← Complete overview (20 min)
```

---

## 📚 Document Quick Links

### 🎬 For Quick Starts
```
┌─────────────────────────────────────┐
│ FASTEST PATHS                       │
├─────────────────────────────────────┤
│ STATUS (5 min):                     │
│ → PHASE_2C_WAVE_2_EXECUTIVE_SUMMARY │
│                                     │
│ TESTING (5 min):                    │
│ → WAVE_2_TESTING_QUICKSTART         │
│                                     │
│ REFERENCE (quick):                  │
│ → TESTING_COMMAND_REFERENCE         │
└─────────────────────────────────────┘
```

### 📖 For Deep Dives
```
┌─────────────────────────────────────┐
│ COMPREHENSIVE PATHS                 │
├─────────────────────────────────────┤
│ COMPLETE STATUS (20 min):           │
│ → PHASE_2C_WAVE_2_STATUS_REPORT     │
│                                     │
│ FULL TESTING (45 min):              │
│ → WAVE_2_INTEGRATION_TESTING_GUIDE  │
│                                     │
│ ARCHITECTURE (30 min):              │
│ → PHASE_2C_ROADMAP                  │
│ → PHASE_2C_WAVE_1_COMPLETION        │
│ → PHASE_2C_WAVE_2_COMPLETION        │
└─────────────────────────────────────┘
```

### 🗺️ For Navigation
```
┌─────────────────────────────────────┐
│ FINDING YOUR WAY                    │
├─────────────────────────────────────┤
│ Which doc should I read?            │
│ → PHASE_2C_WAVE_2_TESTING_SESSION   │
│   _INDEX                            │
│                                     │
│ Complete overview                   │
│ → PHASE_2C_COMPLETE_STATUS_INDEX    │
└─────────────────────────────────────┘
```

---

## 🧪 Testing Timeline Visualization

```
PHASE 1-2          PHASE 3            PHASE 4
Verify Load    Generate Data    Verify Database
5 minutes      15 minutes       10 minutes
   ┌──────────────┬──────────────┬──────────────┐
   │              │              │              │
   ↓              ↓              ↓              ↓
 PHASE 5-6      PHASE 7        PHASE 8        PHASE 9-10
 Verify UI    Stress Test    Error Handling  Browser & Perf
 15 minutes   10 minutes     5 minutes       10 minutes
   │              │              │              │
   └──────────────┴──────────────┴──────────────┘
                    ↓
              DOCUMENTATION
              5 minutes
                    ↓
              COMPLETE ✅
          Total: 75-90 min
```

---

## ✅ Testing Success Path

```
START
  ↓
Read Executive Summary (5 min)
  ↓
Open Testing Command Reference
  ↓
┌────────────────────────────┐
│ PHASE 1-2: Verify Load     │
│ [5 min]                    │
│ ✓ App loads                │
│ ✓ Empty state shows        │
│ ✓ No errors                │
└────────────────┬───────────┘
                 ↓
         ┌──────────────────┐
         │ Phase 3 Ready?   │
         │ [→ YES]          │
         └────────┬─────────┘
                  ↓
┌────────────────────────────┐
│ PHASE 3: Generate Data     │
│ [15 min]                   │
│ ✓ Run ComfyUI workflow     │
│ ✓ Artifact generated       │
└────────────────┬───────────┘
                 ↓
         ┌──────────────────┐
         │ Data ready?      │
         │ [→ YES]          │
         └────────┬─────────┘
                  ↓
┌────────────────────────────┐
│ PHASE 4: Verify IndexedDB  │
│ [10 min]                   │
│ ✓ Database populated       │
│ ✓ Data structure valid     │
└────────────────┬───────────┘
                 ↓
         ┌──────────────────┐
         │ Data verified?   │
         │ [→ YES]          │
         └────────┬─────────┘
                  ↓
┌────────────────────────────┐
│ PHASE 5-6: Verify Display  │
│ [15 min]                   │
│ ✓ Components render        │
│ ✓ Data displays            │
└────────────────┬───────────┘
                 ↓
        ... Continue phases 7-10 ...
                 ↓
                 ✅ COMPLETE!
```

---

## 🔍 What Each Phase Checks

```
Phase 1-2: Current Load
┌──────────────────────────────────┐
│ ✓ App loads without errors       │
│ ✓ Empty historical state shows   │
│ ✓ Console is clean               │
│ Expected time: 5 minutes         │
└──────────────────────────────────┘

Phase 3: Generate Test Data
┌──────────────────────────────────┐
│ ✓ ComfyUI workflow runs          │
│ ✓ Artifact metadata generated    │
│ ✓ App detects new data           │
│ Expected time: 15 minutes        │
└──────────────────────────────────┘

Phase 4: IndexedDB Verification
┌──────────────────────────────────┐
│ ✓ TelemetryDB exists             │
│ ✓ runs store populated           │
│ ✓ scenes store populated         │
│ ✓ Data structure valid           │
│ Expected time: 10 minutes        │
└──────────────────────────────────┘

Phase 5-6: Display Components
┌──────────────────────────────────┐
│ ✓ HistoricalTelemetryCard shows  │
│ ✓ Duration Chart renders         │
│ ✓ Success Rate Chart renders     │
│ ✓ Per-scene metrics display      │
│ Expected time: 15 minutes        │
└──────────────────────────────────┘

Phase 7: Stress Test
┌──────────────────────────────────┐
│ ✓ Multiple runs accumulate       │
│ ✓ Comparisons update             │
│ ✓ No performance degradation     │
│ Expected time: 10 minutes        │
└──────────────────────────────────┘

Phase 8: Error Handling
┌──────────────────────────────────┐
│ ✓ No console errors              │
│ ✓ No console warnings            │
│ ✓ Graceful handling              │
│ Expected time: 5 minutes         │
└──────────────────────────────────┘

Phase 9: Browser Compatibility
┌──────────────────────────────────┐
│ ✓ Works on Chrome (minimum)      │
│ ✓ Works on Firefox (if available)│
│ ✓ Works on Safari (if available) │
│ Expected time: 5 minutes         │
└──────────────────────────────────┘

Phase 10: Performance
┌──────────────────────────────────┐
│ ✓ Smooth 60 FPS scrolling        │
│ ✓ Response times good            │
│ ✓ Memory stable                  │
│ Expected time: 5 minutes         │
└──────────────────────────────────┘
```

---

## 🎨 Component Architecture Overview

```
ArtifactViewer (Integration Point)
├─ Real-Time Section (Wave 1)
│  ├─ TelemetryBadges
│  │  ├─ Duration (live)
│  │  ├─ Success Rate (live)
│  │  └─ GPU Usage (live)
│  └─ WebSocket Stream (TelemetryStreamManager)
│
├─ Artifact Details Section (Existing)
│  └─ Scene Table
│
└─ Historical Analysis Section (Wave 2)
   ├─ HistoricalTelemetryCard
   │  ├─ Current vs Average Duration
   │  ├─ Success Rate Comparison
   │  └─ Trend Indicators
   │
   ├─ TelemetryComparisonChart (Duration)
   │  ├─ Min/Current/Max values
   │  ├─ Sparkline visualization
   │  └─ Trend direction
   │
   ├─ TelemetryComparisonChart (Success Rate)
   │  ├─ Min/Current/Max percentages
   │  ├─ Sparkline visualization
   │  └─ Trend direction
   │
   └─ Per-Scene Historical Metrics
      └─ Scene ID
         ├─ Current duration
         ├─ Average duration
         ├─ Delta calculation
         └─ History count
```

---

## 💾 Database Structure

```
TelemetryDB (IndexedDB)
├─ Object Store: runs
│  ├─ Key: runId
│  ├─ Indexes: [timestamp, durationMs, successRate]
│  └─ Stores: HistoricalRun documents
│
├─ Object Store: scenes
│  ├─ Key: sceneId
│  ├─ Indexes: [runId, timestamp]
│  └─ Stores: HistoricalSceneMetrics documents
│
├─ Object Store: recommendations
│  ├─ Key: recommendationId
│  ├─ Indexes: [runId]
│  └─ Stores: Performance recommendations
│
└─ Object Store: filterPresets
   ├─ Key: presetId
   └─ Stores: User-defined filter configurations
```

---

## 🚀 Quick Command Reference

```
Open App:
→ http://localhost:5173

Open ComfyUI:
→ http://127.0.0.1:8188

Open DevTools:
→ F12 (Chrome/Firefox)

Inspect IndexedDB:
→ DevTools → Application → Storage → IndexedDB → TelemetryDB

Open Console:
→ DevTools → Console tab

Hard Refresh:
→ Ctrl+Shift+R (Windows)
→ Cmd+Shift+R (Mac)
```

---

## 📊 Data Structure Templates

### Expected Run Document
```json
{
  "runId": "string",
  "timestamp": "ISO date",
  "durationMs": number (>0),
  "successRate": number (0-1),
  "totalScenes": number (>0),
  "failedScenes": number (>=0),
  "averageDurationPerScene": number,
  "scenes": [
    {
      "sceneId": "string",
      "durationMs": number,
      "successRate": number,
      "timestamp": "ISO date"
    }
  ]
}
```

### Expected Comparison
```
Duration:
  Current: 5234ms
  Average: 4800ms
  Delta: +434ms (8.8% slower)
  Trend: ↑ Degrading

Success Rate:
  Current: 95%
  Average: 98%
  Delta: -3% (lower)
  Trend: ↓ Worse
```

---

## 🎯 Success Indicators

### Green Indicators ✅
```
✓ App loads quickly
✓ No console errors
✓ Empty state shows (no data yet)
✓ Historical section appears when data exists
✓ Charts render with sparklines
✓ Calculations look reasonable
✓ Data persists after refresh
✓ Multiple runs accumulate
✓ Performance stays smooth
✓ IndexedDB organized correctly
```

### Red Indicators ❌
```
✗ Console shows errors
✗ App doesn't load
✗ Historical section missing
✗ Charts don't render
✗ Calculations show impossible values
✗ IndexedDB empty after workflow
✗ App becomes slow with multiple runs
✗ Page crashes or freezes
✗ Memory grows unbounded
✗ Data doesn't persist
```

---

## 📱 Browser DevTools Cheat Sheet

### Inspector Tab
```
Look for: Historical Analysis section
Verify: Component names, class names
Check: CSS properly applied
```

### Console Tab
```
Check: No red error messages
Look for: No warnings (optional)
Note: Message patterns
```

### Application Tab → IndexedDB
```
Find: TelemetryDB
Expand: runs, scenes stores
Click: Entry to view data
Verify: Structure matches template
Count: Number of entries
```

### Performance Tab
```
Record: Scroll through page
Stop: After 10 seconds
Check: 60 FPS maintained
Note: Any frame drops
```

### Memory Tab
```
Take: Heap snapshot
Check: Total size (<50MB)
Look for: Memory leaks (growing over time)
```

---

## ⏱️ Time Budget

```
Reading & Prep:     10 min (Executive Summary + Quick Start)
Phase 1-2:          5 min  (Verify load)
Phase 3:            15 min (Generate data)
Phase 4:            10 min (Verify DB)
Phase 5-6:          15 min (Verify UI)
Phase 7:            10 min (Stress test)
Phase 8:            5 min  (Error handling)
Phase 9:            5 min  (Browser compat)
Phase 10:           5 min  (Performance)
Documentation:      5 min  (Results)
─────────────────────────────
TOTAL:              85-90 minutes
```

---

## 🔧 Troubleshooting Quick Links

```
Issue: App not loading
→ Solution: Hard refresh (Ctrl+Shift+R)

Issue: No historical data after workflow
→ Solution: Wait 2-3 sec, refresh, check console

Issue: IndexedDB not showing
→ Solution: Hard refresh, run workflow, check again

Issue: Charts not rendering
→ Solution: Check console (F12) for errors

Issue: Slow performance
→ Solution: Close other tabs, profile with Performance tab

Issue: Private browsing issues
→ Solution: Use normal browsing mode

More help: See TESTING_COMMAND_REFERENCE.md
```

---

## 📈 Expected Metrics

### Timing Targets
```
Page Load:          <2 seconds       ✓
Artifact Refresh:   <500ms           ✓
DB Query:           10-20ms          ✓
Component Render:   2-5ms            ✓
Chart Sparkline:    2-3ms            ✓
```

### Memory Targets
```
Single Run:         ~100KB           ✓
10 Runs:            ~1MB             ✓
100 Runs:           ~10MB            ✓
App Overhead:       <1MB             ✓
```

### Performance Targets
```
FPS Scrolling:      60 FPS           ✓
Frame Time:         <16ms            ✓
No Jank:            Smooth           ✓
Memory Growth:      None (stable)    ✓
```

---

## 🎓 Key Learnings

### Wave 1: Real-Time Telemetry
```
Architecture: WebSocket → TelemetryStreamManager → useRealtimeTelemetry → TelemetryBadges
Data Flow: ComfyUI telemetry endpoint → Stream manager buffers → Hook state → UI updates
Key Point: Live updates with 200ms debounce and auto-reconnection
```

### Wave 2: Historical Analytics
```
Architecture: RunHistoryService → IndexedDB ↔ useRunHistory → Display components
Data Flow: Artifact metadata → Save to DB → Query for display → Calculate comparisons
Key Point: Persistent storage with trend visualization and per-scene metrics
```

### Integration
```
Architecture: ArtifactViewer combines Wave 1 (top) + Wave 2 (bottom)
Data Flow: Same artifact triggers both real-time AND historical updates
Key Point: Seamless combination without interference
```

---

## 🏆 Success Criteria Summary

```
When you can answer "YES" to all these:

□ Does app load without errors?
□ Does empty state show when no data?
□ Does ComfyUI workflow complete?
□ Does artifact data generate?
□ Does IndexedDB populate?
□ Do all 4 display components render?
□ Do calculations look correct?
□ Does data persist after refresh?
□ Do multiple runs accumulate?
□ Are there NO console errors?
□ Is performance smooth (60 FPS)?

All YES → Testing Passes ✅
```

---

## 🎉 Next Milestone

```
After testing passes:
↓
Wave 2 marked as TESTED & COMPLETE
↓
Wave 3 Planning begins
↓
Export & Reporting features defined
↓
Next development phase starts
```

---

*Visual Reference Guide - November 14, 2025*
*Keep this handy during testing for quick lookups*

