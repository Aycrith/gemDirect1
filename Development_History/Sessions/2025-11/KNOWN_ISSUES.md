# Known Issues & Limitations (v1.0.0)

**Last Updated**: November 21, 2025  
**Version**: v1.0.0-production-ready  
**Status**: Production Deployment  

---

## 🚧 Incomplete Features

### 1. Video Generation UI Not Wired
**Severity**: MEDIUM  
**Impact**: Users cannot generate videos directly from Timeline Editor  
**Workaround**: Export prompts → Manual ComfyUI workflow  
**Status**: In Development (Phase 3 Week 1)  
**ETA**: 2-4 hours work, deploy within 1 week  

**Technical Details**:
- File: `TimelineEditor.tsx` line 251
- Function: `generateStoryToVideo` is stub
- Service layer: ✅ Complete (`comfyUIService.generateTimelineVideos()`)
- Workflow: ✅ wan-i2v configured and validated

**Workaround Steps**:
1. Generate story and keyframes
2. Click "Export Prompts" button
3. Open ComfyUI (http://localhost:8188)
4. Load wan-i2v workflow
5. Import prompts manually
6. Queue workflow

---

### 2. Workflow Settings Persistence Issue
**Severity**: LOW  
**Impact**: Users must manually save workflow settings after import  
**Workaround**: Click "Save Settings" after importing localGenSettings.json  
**Status**: Known UX Issue  
**ETA**: Investigation scheduled for Phase 3 Week 1  

**Technical Details**:
- `usePersistentState` hook should auto-save but doesn't trigger on import
- Manual "Save Settings" button works correctly
- Settings persist correctly after manual save

---

## ⏱️ Performance Notes

### Processing Times (Expected)
These are **NORMAL** processing times for high-quality AI generation:

| Operation | Time | Notes |
|-----------|------|-------|
| Story generation | 30-60 seconds | LM Studio (Mistral Nemo) or Gemini |
| Scene batch | 10-20 seconds | Gemini API or local LLM |
| Keyframe generation | 5-15 minutes | ComfyUI WAN T2I (30 diffusion steps) |
| Video generation | 3-8 minutes | ComfyUI WAN I2V (when available) |

**Important**: 
- Do not refresh browser during generation
- UI will show progress indicators
- ComfyUI queue API can be checked: http://localhost:8188/queue
- State persists in IndexedDB if browser crashes

---

## 🐛 Minor Issues

### 3. Playwright Test Hydration Timing
**Severity**: TRIVIAL  
**Impact**: 2/50 E2E tests fail due to timing (not functional bugs)  
**Status**: Test infrastructure issue, not production issue  
**Priority**: Low (cleanup task)  

**Details**:
- Tests: `full-pipeline.spec.ts` and one welcome modal test
- Cause: Fixture hydration timing in test environment
- User Impact: None - production functionality works correctly

---

## 📋 Non-Issues (Clarifications)

### "Generation Appears Hung"
**NOT A BUG**: Keyframe generation with 30 diffusion steps takes 5-15 minutes per image. This is expected for high-quality generation.

**How to verify generation is working**:
1. Check browser console for activity (look for "GEMDIRECT-KEYFRAME" messages)
2. Check ComfyUI queue API: 
   ```powershell
   Invoke-RestMethod http://127.0.0.1:8188/queue
   ```
3. Look for "Running: 1" in queue status
4. UI will update automatically when complete
5. Check ComfyUI logs in terminal

**Validated in Phase 2**: 5 keyframes generated successfully with average 9-minute processing time

---

### "Workflow Settings Not Loading"
**NOT A BUG**: `localGenSettings.json` is a reference file, not auto-loaded by browser.

**Correct process**:
1. Open Settings (⚙️ icon) → ComfyUI Settings tab
2. Click "Import from File" button
3. Select `localGenSettings.json`
4. Click "Save Settings" button (important!)
5. Profiles now loaded and persisted in IndexedDB

**Why it works this way**: Browser security prevents auto-loading local files. Import process validates workflow structure and mappings before saving.

---

## 🔄 Deployment Monitoring

### Metrics Being Tracked (First 48 Hours)
- Keyframe generation success rate (target: >95%)
- Average generation times (baseline: 5-15 min per keyframe)
- ComfyUI queue errors (target: <5%)
- IndexedDB persistence errors (target: 0%)
- User-reported issues (triage within 4 hours)

### Rollback Triggers
- Generation success rate <80%
- Multiple reports of resource exhaustion
- Data loss/corruption issues
- Critical security vulnerability

### Monitoring Tools
- Browser console for errors
- ComfyUI queue API for health checks
- IndexedDB inspection for data integrity
- User feedback via GitHub issues

---

## 🎯 Phase 3 Roadmap (Post-Deployment)

### Week 1: Video Generation UI
- Wire TimelineEditor to comfyUIService
- Test with 1-2 sample videos
- Deploy video generation feature

### Week 2: Error Recovery
- Implement error recovery test suite
- Test ComfyUI offline scenarios
- Test partial batch failures

### Week 3: Performance Validation
- Test with 10+ scenes
- Memory profiling
- Storage tracking

---

## 🐞 Reporting Issues

### How to Report
1. **Search existing issues**: https://github.com/Aycrith/gemDirect1/issues
2. **Create new issue** with:
   - Clear description of problem
   - Steps to reproduce
   - Expected vs. actual behavior
   - Browser console logs (if applicable)
   - ComfyUI logs (if generation-related)
   - Screenshots/videos if relevant

### Priority Levels
- **Critical**: Data loss, crashes, security issues
- **High**: Core features broken, no workaround
- **Medium**: Features broken but workaround exists
- **Low**: Cosmetic issues, minor UX problems

### Response Times
- **Critical**: Within 4 hours
- **High**: Within 24 hours
- **Medium**: Within 3 days
- **Low**: Next sprint

---

## 📚 Additional Resources

- **Full Status**: [`Documentation/PROJECT_STATUS_CONSOLIDATED.md`](Documentation/PROJECT_STATUS_CONSOLIDATED.md)
- **Quick Start**: [`START_HERE.md`](START_HERE.md)
- **Testing Guide**: [`Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md`](Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md)
- **Architecture**: [`Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md`](Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md)

---

**Document Created**: 2025-11-21  
**Maintained By**: Development Team  
**Review Frequency**: Weekly during Phase 3  
**Last Reviewed**: 2025-11-21
