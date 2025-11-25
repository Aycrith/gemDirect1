# Agent Handoff: Comprehensive E2E Testing with Playwright MCP

**Created**: November 24, 2025  
**Session Type**: In-Browser End-to-End Testing  
**Tools Required**: Playwright MCP (browser_navigate, browser_snapshot, browser_click, browser_type, etc.)  
**Duration Estimate**: 2-3 hours (with checkpoints)

---

## 📋 Executive Summary

This handoff document provides a structured, phased approach to comprehensive E2E testing of the gemDirect1 cinematic story generator. The testing uses **Playwright MCP tools** for browser automation and is designed with frequent checkpoints to manage context window efficiently.

### Testing Objectives
1. Validate complete user workflow from initial load to final video generation
2. Test all generation modes (standard keyframes, bookend videos, batch operations)
3. Verify data persistence and state management
4. Benchmark performance against established thresholds
5. Document any issues with full diagnostic data

### Pre-requisites Checklist
- [ ] Dev server running: `npm run dev` (port 3000)
- [ ] ComfyUI server running: port 8188 with FLUX and WAN models loaded
- [ ] LM Studio (optional): port 1234 for local LLM fallback
- [ ] Unit tests passing: `npm test -- --run` should show 241/241 passing

---

## 🔧 Test Environment Configuration

### Required Services Status Check
Before beginning, verify services are accessible:

```
Dev Server: http://127.0.0.1:3000
ComfyUI:    http://127.0.0.1:8188
LM Studio:  http://192.168.50.192:1234 (optional)
```

### Key Test Data (Mock Fixtures)
The test fixtures provide consistent data for reproducible testing:
- **Mock Story Bible**: Cyberpunk noir hacker story
- **Mock Scenes**: 3 scenes (Discovery, Meeting, Infiltration)
- **Mock Keyframes**: Base64 placeholder images
- **Mock Director's Vision**: Blade Runner aesthetic

### Browser Configuration
- Target: Chromium (headless or headed based on debug needs)
- Viewport: 1280x720 (standard HD)
- Timeout: 120 seconds per test operation

---

## 📊 Phase Structure Overview

| Phase | Focus Area | Duration | Checkpoints |
|-------|-----------|----------|-------------|
| 1 | Initial Load & Storage | 15 min | 2 |
| 2 | Story Generation Flow | 25 min | 3 |
| 3 | Scene Management | 30 min | 3 |
| 4 | Keyframe Generation | 30 min | 3 |
| 5 | Bookend Video Workflow | 25 min | 3 |
| 6 | Batch Operations | 20 min | 2 |
| 7 | Regression & Performance | 15 min | 2 |

---

# PHASE 1: Initial Load & Storage Initialization

## Objective
Verify the application loads correctly, initializes IndexedDB storage, and displays the landing page with all required elements.

## Test Steps

### 1.1 Navigate to Application
```
Action: browser_navigate to http://127.0.0.1:3000
Expected: Page loads within 5 seconds
```

### 1.2 Capture Initial State
```
Action: browser_snapshot
Verify:
- Page title visible
- Story idea input area present
- Mode selector (Quick/Director) visible
- Settings button accessible
```

### 1.3 Dismiss Welcome Dialog (if present)
```
Action: browser_click on dialog dismiss button OR press Escape
Verify: Dialog closes, main content accessible
```

### 1.4 Verify Storage Initialization
```
Action: browser_evaluate
Code: 
  const result = await new Promise((resolve) => {
    const req = indexedDB.open('cinematic-story-db', 1);
    req.onsuccess = () => {
      const db = req.result;
      const stores = Array.from(db.objectStoreNames);
      db.close();
      resolve({ exists: true, stores });
    };
    req.onerror = () => resolve({ exists: false, stores: [] });
  });
  return result;

Expected: { exists: true, stores: ['storyBible', 'scenes', 'misc'] }
```

## Checkpoint 1.A
**PAUSE HERE** - Summarize findings:
- [ ] Application loaded successfully
- [ ] All UI elements visible
- [ ] IndexedDB initialized with correct stores
- [ ] Any errors in console?

## Success Criteria (Phase 1)
- App loads in <5 seconds
- No JavaScript errors in console
- All stores created in IndexedDB
- Welcome dialog handled appropriately

---

# PHASE 2: Story Generation Flow

## Objective
Test the complete story generation flow from idea input to story bible creation.

## Test Steps

### 2.1 Enter Story Idea
```
Action: browser_type in story idea textarea
Element: textarea[placeholder*="story idea"] or [data-testid="story-idea-input"]
Text: "A quantum physicist discovers her experiments are creating parallel dimensions, and must close the rifts before reality collapses."
```

### 2.2 Verify Input Captured
```
Action: browser_snapshot
Verify: Input text visible in textarea
```

### 2.3 Select Genre (if available)
```
Action: browser_click on genre selector
Action: browser_click on "sci-fi" option
Verify: Genre selected
```

### 2.4 Generate Story Bible
```
Action: browser_click on "Generate Story Bible" button
Verify: Loading indicator appears
```

### 2.5 Wait for Generation Complete
```
Action: browser_wait_for text="logline" OR "characters" OR "setting"
Timeout: 60 seconds
Fallback: Check for error messages
```

## Checkpoint 2.A
**PAUSE HERE** - Summarize findings:
- [ ] Story idea input accepted
- [ ] Generation initiated successfully
- [ ] Story bible populated (or error captured)

### 2.6 Verify Story Bible Content
```
Action: browser_snapshot
Verify:
- Logline field populated
- Characters section has content
- Setting description present
- Plot outline visible
```

### 2.7 Check for Hero Arcs (if visible)
```
Action: browser_snapshot
Verify: 12 hero arc entries (if expanded view)
```

## Checkpoint 2.B
**PAUSE HERE** - Document story bible state:
- [ ] All required fields populated
- [ ] Content is coherent (not garbled)
- [ ] Ready for scene generation

### 2.8 Enter Director's Vision
```
Action: browser_type in director's vision field
Text: "Cinematic sci-fi with warm amber lighting. Split-diopter shots for dual focus. Tarkovsky-inspired long takes. Color palette: deep blues, quantum purples, reality-tear whites."
```

### 2.9 Generate Scenes
```
Action: browser_click on "Set Vision & Generate Scenes" OR "Generate Scenes"
Verify: Loading state, then scene cards appear
```

## Checkpoint 2.C - Phase 2 Complete
**FULL PHASE SUMMARY**:
- Story generation: PASS/FAIL
- Scene count: ___ scenes generated
- Any errors: ___
- Console warnings: ___
- Ready for Phase 3: YES/NO

---

# PHASE 3: Scene Management

## Objective
Test scene viewing, editing, navigation, and timeline management.

## Test Steps

### 3.1 Verify Scene Cards Visible
```
Action: browser_snapshot
Verify:
- At least 1 scene card visible
- Scene title readable
- Scene summary visible
- Edit/delete controls present
```

### 3.2 Navigate Between Scenes
```
Action: browser_click on scene selector/navigator
Action: browser_click on scene 2 (if multiple scenes)
Verify: Scene 2 content loads
```

### 3.3 Expand Scene Timeline
```
Action: browser_click on "Timeline" or "Expand" button for a scene
Verify: Shot list visible
```

## Checkpoint 3.A
**PAUSE HERE** - Document scene state:
- [ ] Scenes displayed correctly
- [ ] Navigation working
- [ ] Timeline expandable

### 3.4 Edit Scene Title
```
Action: browser_click on scene title (or edit icon)
Action: browser_type new title: "The Quantum Discovery"
Action: browser_click save/confirm
Verify: Title updated in UI
```

### 3.5 Add Shot to Timeline
```
Action: browser_click "Add Shot" button
Action: browser_type shot description: "Extreme close-up of particle collision in accelerator"
Action: browser_click save
Verify: New shot appears in list
```

### 3.6 Reorder Shots (if supported)
```
Action: browser_drag shot 3 to position 1
Verify: Order updated
```

## Checkpoint 3.B
**PAUSE HERE** - Document editing results:
- [ ] Title edit persisted
- [ ] Shot added successfully
- [ ] Ordering maintained

### 3.7 Delete Shot
```
Action: browser_click delete button on last shot
Action: browser_click confirm (if dialog appears)
Verify: Shot removed from list
```

### 3.8 Verify State Persistence
```
Action: browser_evaluate
Code:
  location.reload();
  await new Promise(r => setTimeout(r, 3000));

Action: browser_snapshot
Verify: All edits preserved after reload
```

## Checkpoint 3.C - Phase 3 Complete
**FULL PHASE SUMMARY**:
- Scene navigation: PASS/FAIL
- Editing capabilities: PASS/FAIL
- State persistence: PASS/FAIL
- Issues found: ___

---

# PHASE 4: Keyframe Generation (FLUX T2I)

## Objective
Test keyframe image generation using FLUX model through ComfyUI.

## Prerequisites Check
```
Action: browser_click Settings button
Action: browser_snapshot
Verify: 
- ComfyUI URL configured (http://127.0.0.1:8188)
- flux-t2i workflow profile visible
- Profile shows "Ready" status
```

## Test Steps

### 4.1 Navigate to Scene with Timeline
```
Action: browser_click on scene with shots
Verify: Scene expanded with timeline visible
```

### 4.2 Initiate Single Keyframe Generation
```
Action: browser_click "Generate Keyframe" for Scene 1
Verify: 
- Loading indicator appears
- ComfyUI queue status shows activity
```

### 4.3 Wait for Generation Complete
```
Action: browser_wait_for image element to appear
Timeout: 120 seconds
Alternative: browser_wait_for text="complete" or progress=100
```

## Checkpoint 4.A
**PAUSE HERE** - Document generation status:
- [ ] Generation initiated
- [ ] ComfyUI queue accepted job
- [ ] Generation in progress or complete

### 4.4 Verify Keyframe Output
```
Action: browser_snapshot
Verify:
- Image displayed in scene card
- No "comic panel" or split-screen artifacts
- Image appears as single cohesive composition
```

### 4.5 Check Image Quality Metrics
```
Action: browser_evaluate
Code:
  const img = document.querySelector('[data-scene-keyframe] img');
  if (img) {
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      loaded: img.complete,
      src: img.src.substring(0, 50)
    };
  }
  return null;

Expected: { naturalWidth: 1280, naturalHeight: 720, loaded: true }
```

## Checkpoint 4.B
**PAUSE HERE** - Document keyframe quality:
- [ ] Image generated successfully
- [ ] Resolution correct (1280x720)
- [ ] Single cohesive image (not comic panels)
- [ ] Generation time: ___ seconds

### 4.6 Generate Second Keyframe (Different Scene)
```
Action: browser_click on Scene 2
Action: browser_click "Generate Keyframe"
Action: browser_wait_for completion
Verify: Second keyframe appears
```

### 4.7 Compare Keyframe Styles
```
Action: browser_snapshot
Verify:
- Both keyframes visible
- Consistent visual style (director's vision applied)
- Different content for different scenes
```

## Checkpoint 4.C - Phase 4 Complete
**FULL PHASE SUMMARY**:
- FLUX T2I integration: PASS/FAIL
- Keyframe quality: PASS/FAIL
- Generation time (avg): ___ seconds
- Issues: ___

---

# PHASE 5: Bookend Video Workflow

## Objective
Test the bookend workflow (start/end keyframes + video generation).

## Prerequisites
- At least one scene with keyframe generated (from Phase 4)
- ComfyUI WAN I2V workflow configured

## Test Steps

### 5.1 Enable Bookend Mode
```
Action: browser_click Settings button
Action: browser_snapshot to find bookend toggle
Action: browser_click "Enable Bookend Mode" toggle
Action: browser_click Save
Verify: Bookend mode enabled
```

### 5.2 Navigate to Scene for Bookend Generation
```
Action: browser_click on scene with existing keyframe
Verify: Scene shows "Start Keyframe" and "End Keyframe" slots
```

### 5.3 Generate Start Keyframe (if not existing)
```
Action: browser_click "Generate Start Keyframe"
Action: browser_wait_for completion
Verify: Start keyframe image visible
```

## Checkpoint 5.A
**PAUSE HERE** - Document bookend setup:
- [ ] Bookend mode enabled
- [ ] Start keyframe present
- [ ] UI shows dual keyframe layout

### 5.4 Generate End Keyframe
```
Action: browser_click "Generate End Keyframe"
Action: browser_wait_for completion
Verify: End keyframe image visible alongside start
```

### 5.5 Verify Side-by-Side Display
```
Action: browser_snapshot
Verify:
- Both start and end keyframes visible
- Clear visual distinction between them
- Both are single cohesive images (not comic panels)
```

### 5.6 Initiate Video Generation
```
Action: browser_click "Generate Video" or "Generate from Bookends"
Verify: Video generation initiated
```

## Checkpoint 5.B
**PAUSE HERE** - Document video generation start:
- [ ] Both keyframes present
- [ ] Video generation initiated
- [ ] Queue status visible

### 5.7 Monitor Video Generation Progress
```
Action: browser_snapshot (every 30 seconds)
Verify:
- Progress indicator updating
- No error messages
- Queue position (if queued)
```

### 5.8 Wait for Video Completion
```
Action: browser_wait_for text containing "complete" OR video player element
Timeout: 180 seconds (WAN I2V takes ~60 seconds)
```

### 5.9 Verify Video Output
```
Action: browser_snapshot
Verify:
- Video player visible OR video download link present
- Play controls accessible (if player)
- No error states
```

### 5.10 Test Video Playback (if player available)
```
Action: browser_click play button
Action: browser_wait_for time=2 seconds
Verify: Video plays without errors
```

## Checkpoint 5.C - Phase 5 Complete
**FULL PHASE SUMMARY**:
- Bookend mode: PASS/FAIL
- Dual keyframe generation: PASS/FAIL
- Video generation: PASS/FAIL
- Video playback: PASS/FAIL
- Total generation time: ___ seconds
- Issues: ___

---

# PHASE 6: Batch Operations

## Objective
Test batch keyframe and video generation for multiple scenes.

## Prerequisites
- Multiple scenes exist (minimum 3)
- ComfyUI server responsive

## Test Steps

### 6.1 Ensure Multiple Scenes Present
```
Action: browser_snapshot
Verify: At least 3 scene cards visible
```

### 6.2 Initiate Batch Keyframe Generation
```
Action: browser_click "Generate All Keyframes" OR batch generation button
Verify: 
- All scenes show loading/queued state
- Progress indicator for batch operation
```

### 6.3 Monitor Batch Progress
```
Action: browser_snapshot (every 60 seconds)
Track:
- Completed: ___ / ___ scenes
- Errors: ___
- Queue depth: ___
```

## Checkpoint 6.A
**PAUSE HERE** - Document batch progress:
- [ ] Batch initiated successfully
- [ ] Progress tracking visible
- [ ] Scenes completing sequentially

### 6.4 Wait for Batch Completion
```
Action: browser_wait_for all scenes showing keyframes
Timeout: 300 seconds (5 minutes for 3 scenes)
```

### 6.5 Verify All Keyframes Generated
```
Action: browser_snapshot
Verify:
- All scenes have keyframe images
- No "failed" or "error" states
- Consistent visual style across all
```

### 6.6 Test Batch Video Generation (Optional)
```
Action: browser_click "Generate All Videos" (if available)
Monitor: Progress for each scene
Verify: Videos generate sequentially
```

## Checkpoint 6.B - Phase 6 Complete
**FULL PHASE SUMMARY**:
- Batch keyframe generation: PASS/FAIL
- Sequential processing: PASS/FAIL
- All outputs valid: PASS/FAIL
- Total batch time: ___ seconds
- Issues: ___

---

# PHASE 7: Regression & Performance Testing

## Objective
Verify performance benchmarks and test backward compatibility.

## Test Steps

### 7.1 Measure Load Time
```
Action: browser_evaluate
Code:
  const timing = performance.timing;
  return {
    domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
    loadComplete: timing.loadEventEnd - timing.navigationStart,
    firstPaint: performance.getEntriesByType('paint')[0]?.startTime
  };

Expected:
- domContentLoaded: <500ms
- loadComplete: <1500ms
- firstPaint: <800ms
```

### 7.2 Memory Usage Check
```
Action: browser_evaluate
Code:
  if (performance.memory) {
    return {
      usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576),
      totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576)
    };
  }
  return { note: 'memory API not available' };

Expected: usedJSHeapSize < 150 MB
```

## Checkpoint 7.A
**PAUSE HERE** - Document performance:
- [ ] Load time within threshold
- [ ] Memory usage acceptable
- [ ] No memory leaks observed

### 7.3 Test Project Export/Import
```
Action: browser_click "Export Project"
Verify: JSON file downloads (or modal appears)

Action: Clear storage (new session or incognito)
Action: browser_click "Import Project"
Action: Select exported file
Verify: All data restored correctly
```

### 7.4 Verify Historical Compatibility
```
Action: Import legacy project file (if available in test fixtures)
Verify:
- Project loads without errors
- Data migrates correctly
- All features accessible
```

### 7.5 Error Handling Test
```
Action: Disconnect ComfyUI (simulate network error)
Action: browser_click "Generate Keyframe"
Verify:
- Error message displayed gracefully
- No app crash
- Recovery instructions shown
```

## Checkpoint 7.B - Phase 7 Complete
**FULL PHASE SUMMARY**:
- Performance benchmarks: PASS/FAIL
- Export/Import: PASS/FAIL
- Error handling: PASS/FAIL
- Overall stability: PASS/FAIL

---

# 🔴 ERROR HANDLING PROTOCOL

## When Issues Arise

### Immediate Actions
1. **HALT** - Stop current test sequence
2. **SCREENSHOT** - `browser_take_screenshot` with descriptive filename
3. **CONSOLE** - `browser_console_messages` to capture errors
4. **NETWORK** - `browser_network_requests` to capture failed requests
5. **SNAPSHOT** - `browser_snapshot` for DOM state

### Documentation Template
```markdown
## Issue Report: [Brief Title]

**Phase**: [1-7]
**Step**: [X.Y]
**Timestamp**: [ISO timestamp]

### Reproduction Steps
1. [Step that led to issue]
2. [Previous state]
3. [Action taken]
4. [Unexpected result]

### Expected Behavior
[What should have happened]

### Actual Behavior
[What actually happened]

### Diagnostic Data
- Console Errors: [paste]
- Network Failures: [paste]
- Screenshot: [filename]

### Root Cause Analysis
[Initial hypothesis]

### Suggested Fix
[If obvious]
```

### Error Categories
| Category | Action |
|----------|--------|
| UI Bug | Document + continue |
| Integration Failure | Document + retry once |
| Crash/Freeze | Document + restart phase |
| Data Loss | CRITICAL - halt all testing |

---

# ✅ FINAL SUMMARY TEMPLATE

## Test Execution Summary

**Date**: [Date]
**Duration**: [Total time]
**Agent Session**: [Session ID if available]

### Phase Results

| Phase | Status | Issues | Notes |
|-------|--------|--------|-------|
| 1: Initial Load | ⬜ | 0 | |
| 2: Story Generation | ⬜ | 0 | |
| 3: Scene Management | ⬜ | 0 | |
| 4: Keyframe Generation | ⬜ | 0 | |
| 5: Bookend Workflow | ⬜ | 0 | |
| 6: Batch Operations | ⬜ | 0 | |
| 7: Regression | ⬜ | 0 | |

### Performance Benchmarks

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| App Load | <1500ms | | ⬜ |
| Keyframe Gen | <60s | | ⬜ |
| Video Gen | <120s | | ⬜ |
| Memory Usage | <150MB | | ⬜ |

### Issues Found

| # | Severity | Phase | Description | Status |
|---|----------|-------|-------------|--------|
| 1 | | | | |

### Recommendations

1. [First recommendation]
2. [Second recommendation]

### Files Generated
- Screenshots: [list]
- Error logs: [list]
- Performance data: [list]

---

# 🚀 AGENT QUICK START

## To Begin Testing

1. **Confirm services are running**:
   - Dev server: http://127.0.0.1:3000
   - ComfyUI: http://127.0.0.1:8188

2. **Start Phase 1**:
   ```
   browser_navigate to http://127.0.0.1:3000
   browser_snapshot to capture initial state
   ```

3. **Follow phases sequentially** - pause at each checkpoint

4. **Report issues immediately** using the error protocol

5. **Complete final summary** after all phases

## Context Window Management

- **At each checkpoint**: Summarize progress briefly
- **After completing a phase**: Provide phase summary
- **When context is 60% full**: Request context reset, provide continuation point
- **Use modular approach**: One phase = one focused testing block

## Key Selectors Reference

| Element | Selector |
|---------|----------|
| Story Input | `textarea[placeholder*="story"]` |
| Generate Bible | `button:has-text("Generate Story")` |
| Settings | `button:has-text("Settings")` or gear icon |
| Scene Cards | `[data-scene-index]` |
| Keyframe Button | `button:has-text("Generate Keyframe")` |
| Video Button | `button:has-text("Generate Video")` |
| Progress | `[role="progressbar"]` |

---

**End of Handoff Document**

*Ready for execution by new agent session with Playwright MCP tools*
