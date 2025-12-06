# Quality Gaps and Follow-ups

**Created**: December 5, 2025  
**Task**: GA1 – End-to-End Gap Analysis & Hardening Pass  
**Status**: Initial Assessment Complete

This document captures non-trivial issues discovered during the GA1 gap analysis that were not fixed in this pass. Each item includes location, impact, and suggested follow-up.

---

## Summary

| Category | Fixed | Deferred | Notes |
|----------|-------|----------|-------|
| Missing Assets | 1 | 0 | Created `public/config/narrative/demo-three-shot.json` |
| Documentation | 3 | 2 | Fixed npm test commands, updated test counts |
| UI Issues | 0 | 3 | Mock data, clipboard-only links, VRAM label minor mismatch |
| Architecture | 0 | 2 | A/B Dashboard uses mocks, ReplayViewer limited to clipboard |

---

## Fixed in This Pass

### 1. Missing Narrative Script in Public Folder
- **Location**: `public/config/narrative/`
- **Issue**: `demo-three-shot.json` was only in `config/narrative/`, not in `public/` where browser can access it
- **Fix**: Created `public/config/narrative/demo-three-shot.json`
- **Impact**: NarrativeDashboard now loads scripts correctly in browser

### 2. Duplicate `--run` Flag in npm test Commands
- **Location**: `README.md`, `GETTING_STARTED.md`, `START_HERE.md`
- **Issue**: `npm test -- --run` was documented, but `npm test` already includes `--run` in package.json
- **Fix**: Updated documentation to use just `npm test`
- **Impact**: Prevents confusing error when users add `--reporter=verbose`

### 3. Outdated Test Counts in Documentation
- **Location**: `README.md`, `GETTING_STARTED.md`, `START_HERE.md`
- **Issue**: Test counts showed "158+ tests" or "1,522 tests" but actual count is 2400+
- **Fix**: Updated to "2400+ tests passing"
- **Impact**: Accurate expectations for users

---

## Deferred (Non-Trivial Gaps)

### D1. A/B Dashboard Uses Mock Data Instead of Real Pipeline Runs

**Location**: `components/AbCompareDashboard.tsx` (lines 600-660)

**Description**:  
The A/B Compare Dashboard currently uses placeholder/mock data for comparison results rather than actually invoking the pipeline. The code explicitly states "For demo purposes, create a placeholder result".

**Impact**:  
- Users clicking "Run A/B Comparison" get fake metrics that don't reflect actual pipeline performance
- Cannot validate real Quality differences between presets
- Misleading for QA workflows

**Current Behavior**:
```typescript
// Simulate API call delay (in real implementation, this would call the backend)
await new Promise(resolve => setTimeout(resolve, 1000));

const mockResult: AbCompareResult = {
    // ... hardcoded metrics
    metrics: {
        visionVerdict: 'PASS',
        visionOverall: 85,  // Not real
        flickerMetric: 3,   // Not real
        // ...
    }
};
```

**Suggested Follow-up**:  
- Implement actual pipeline invocation via worker thread or server endpoint
- Connect to `pipelines/abComparePipeline.ts` for real execution
- Add progress tracking for long-running comparisons
- Priority: Medium (P2) - required for production QA validation workflows

---

### D2. FileLink Component Limited to Clipboard Copy

**Location**: `components/AbCompareDashboard.tsx`, `components/NarrativeDashboard.tsx`

**Description**:  
The `FileLink` component only copies paths to clipboard rather than opening files in explorer. This is a browser limitation (no direct file system access).

**Current Behavior**:
```typescript
const FileLink: React.FC<{ path: string; ... }> = ({ path, ... }) => {
    const handleClick = async () => {
        await navigator.clipboard.writeText(path);
        // Shows "Copied!" tooltip
    };
};
```

**Impact**:  
- Users must manually paste paths into File Explorer
- Cannot directly open benchmark reports, manifests, or videos
- UX friction for QA workflows

**Suggested Follow-up**:
- For Electron/Tauri deployment: Use `shell.showItemInFolder()` or equivalent
- For web: Add "Open in new tab" for web-accessible paths (videos served via ComfyUI)
- Consider adding a "Copy All Links" bulk action
- Priority: Low (P3) - cosmetic UX improvement

---

### D3. Production Preset vs Production QA Mode Naming Confusion

**Location**: 
- `components/ProductionQualityPreviewPanel.tsx` (PIPELINE_PRESETS)
- `utils/featureFlags.ts` (PRODUCTION_QA_FLAGS)
- `Documentation/Guides/PRESETS_AND_VRAM.md`

**Description**:  
Two concepts with similar names serve different purposes:
1. **"Production" preset** in ProductionQualityPreviewPanel: Uses standard stability profile, 8-12 GB VRAM
2. **"Production QA Mode"** in feature flags: Enables QA features (keyframePairAnalysis, etc.), 10-12 GB VRAM

**Impact**:  
- Users may confuse the two when following guides
- Documentation references "Production QA" but UI shows just "Production"
- VRAM hints differ slightly (8-12 GB vs 10-12 GB)

**Current State**:  
Documentation in PRESETS_AND_VRAM.md correctly distinguishes them, but the naming is confusing.

**Suggested Follow-up**:
- Rename UI preset to "Standard (Production)" to distinguish from "Production QA Mode"
- OR add an info tooltip explaining the difference
- Align VRAM hints to be consistent
- Priority: Low (P3) - clarification only, no functional issue

---

### D4. ReplayViewerModal Limited for Web Deployment

**Location**: `components/ReplayViewerModal.tsx`

**Description**:  
The replay viewer displays original and replayed video paths but cannot directly play local files in browser. Videos must be served via HTTP.

**Impact**:  
- Works when videos are in `public/` or served via ComfyUI output
- Doesn't work for arbitrary local paths unless served via dev server

**Suggested Follow-up**:
- Add video serving proxy endpoint in dev server for local paths
- For production: Ensure all video outputs are in accessible locations
- Priority: Low (P3) - works for most common workflows

---

### D5. Temporal Regularization Adaptive Mode Not Exposed in UI

**Location**:  
- `utils/featureFlags.ts` (temporalRegularizationAdaptiveMode flag)
- `services/temporalPolicyService.ts` (suggestTemporalRegularization)

**Description**:  
The adaptive temporal regularization mode (E2.2) is implemented but not exposed in the Settings UI. Users can only toggle it via direct flag manipulation.

**Impact**:  
- Users cannot easily enable path-guided temporal tuning
- Feature is "hidden" despite being documented

**Suggested Follow-up**:
- Add toggle in Features tab: "Adaptive Temporal Regularization"
- Include tooltip explaining that it adjusts smoothing based on motion metrics
- Priority: Low (P3) - advanced feature, opt-in

---

## Documentation Gaps (Minor)

### Doc-1. Multiple Files Reference Old Test Commands

**Location**: Various files in `validation/`, `IMPLEMENTATION_PLAN_OUTSTANDING.md`, etc.

**Description**:  
Many internal documents still reference `npm test -- --run`. While these work, they're inconsistent with the fixed user-facing docs.

**Suggested Follow-up**:
- Bulk search-replace in next documentation cleanup pass
- Priority: Very Low (P4) - internal docs, no user impact

### Doc-2. Test Count Inconsistencies Across Docs

**Description**:  
Various documents cite different test counts (107, 158, 1522, etc.) as the codebase evolved.

**Suggested Follow-up**:
- Add a single source of truth for test metrics
- Consider auto-generating test count from CI
- Priority: Very Low (P4) - cosmetic

---

## Validation Summary

### TypeScript Compilation
```powershell
npx tsc --noEmit
# Exit code: 0 (success)
```

### Unit Tests
```powershell
npm test
# Result: 2422 passed | 1 skipped (2423)
# Duration: 12.51s
```

### Files Changed in This Pass
1. `public/config/narrative/demo-three-shot.json` - Created
2. `README.md` - Fixed npm test commands, updated test counts
3. `Documentation/Guides/GETTING_STARTED.md` - Fixed npm test commands, updated test counts
4. `START_HERE.md` - Fixed npm test command, updated test counts

---

## Recommendations for Future Passes

1. **D1 (A/B Dashboard)**: Priority for next sprint - implement real pipeline execution
2. **D2-D5**: Can be addressed opportunistically during related feature work
3. **Doc Gaps**: Bundle with next major documentation update

---

*Last updated: December 5, 2025*
