# 🚀 NEXT AGENT: IMMEDIATE EXECUTION PROMPT
**Date**: November 25, 2025  
**Estimated Time to Productivity**: 15-30 minutes  
**Priority**: Fix TypeScript errors, then validate system

---

## 📌 COPY THIS ENTIRE SECTION AS YOUR STARTING CONTEXT

You are continuing development on **gemDirect1**, an AI-powered cinematic story generator. The system transforms text prompts into video timelines using Gemini AI for content and ComfyUI for video rendering.

### Current State (TL;DR)
- ✅ Core functionality working (story → scenes → keyframes → videos)
- ✅ FLUX T2I migration complete (replaces Lumina for keyframes)
- ✅ Bookend workflow implemented (dual keyframe video generation)
- ⚠️ TypeScript errors in `comfyUIService.ts` (non-blocking but need fixing)
- ⚠️ 2/241 unit tests failing (videoSplicer mocks)

### Your First 30 Minutes
```powershell
# 1. Validate environment (5 min)
cd C:\Dev\gemDirect1
npm run check:health-helper

# 2. Check current test state (5 min)
npm test -- --run

# 3. Check TypeScript errors (5 min)
npx tsc --noEmit 2>&1 | Select-Object -First 30

# 4. Read key files (15 min)
# - .github/copilot-instructions.md (coding patterns)
# - AGENT_HANDOFF_COMPREHENSIVE_20251125.md (full context)
```

---

## 🎯 IMMEDIATE TASK: Fix TypeScript Errors

### File: `services/comfyUIService.ts`

**Error 1: import.meta.env type (Lines 50, 795)**
```typescript
// Problem: Property 'env' does not exist on type 'ImportMeta'
// Solution: Add Vite env type declaration or use runtime check

// Option A: Add to vite-env.d.ts
/// <reference types="vite/client" />

// Option B: Runtime check with type guard
if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
    const env = import.meta.env as Record<string, unknown>;
    if (env.DEV) { /* ... */ }
}
```

**Error 2: WorkflowProfile return type (Line 267)**
```typescript
// Problem: Missing 'id' and 'label' properties
// Solution: Add required fields to return object

return {
    id: profileId || 'inferred',
    label: 'Inferred Workflow Profile',
    workflowJson: string,
    mapping: WorkflowMapping,
};
```

**Error 3: body/bodySnippet access (Lines 512-513)**
```typescript
// Problem: Type '{ ts: string; }' doesn't have body/bodySnippet
// Solution: Use type guard or explicit type cast

const safe = { ts: new Date().toISOString() } as Record<string, unknown>;
if (typeof safe.body === 'string' && (safe.body as string).length > 1000) {
    safe.body = (safe.body as string).slice(0, 1000) + '...';
}
```

**Error 4: node.inputs access (Lines 645-647)**
```typescript
// Problem: Property 'inputs' doesn't exist on type
// Solution: Use type assertion or interface

interface WorkflowNode {
    class_type: string;
    inputs?: Record<string, unknown>;
}
const node = entry[1] as WorkflowNode;
if (node.class_type === 'KSampler' && node.inputs && 'seed' in node.inputs) {
    // ...
}
```

**Error 5: status type (Line 1186)**
```typescript
// Problem: 'warning' not assignable to status enum
// Solution: Add 'warning' to LocalGenerationStatus type in types.ts
// Or use a valid status value: 'error' | 'running' | 'idle' | 'queued' | 'complete'
```

**Error 6: PromptTarget (Line 1251)**
```typescript
// Problem: Cannot find name 'PromptTarget'
// Solution: Define or import the type

type PromptTarget = 'shotImage' | 'sceneKeyframe' | 'sceneVideo';
```

**Error 7: string | undefined (Line 1659)**
```typescript
// Problem: undefined not assignable to string parameter
// Solution: Provide default value

const finalPrompt = applyPromptTemplate(
    basePrompt, 
    combinedVBSegment || '', // Default to empty string
    config
);
```

---

## 🧪 SECOND TASK: Fix Unit Tests

### File: `utils/__tests__/videoSplicer.test.ts`

**Failure 1: FFmpeg command mock mismatch**
The test expects specific FFmpeg arguments but the actual implementation generates different ones.

```typescript
// Check what the actual spliceVideos function generates
// Update mock expectations to match actual FFmpeg command structure

expect(mocks.spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
    '-i', expect.any(String),  // video1 path
    '-i', expect.any(String),  // video2 path
    // ... rest of args
]), expect.any(Object));
```

**Failure 2: filterComplex undefined**
The test expects `filterComplex` variable but it's not being captured.

```typescript
// The spawn mock needs to capture the filter_complex argument
const args = mocks.spawn.mock.calls[0][1];
const filterComplexIndex = args.indexOf('-filter_complex');
const filterComplex = filterComplexIndex !== -1 ? args[filterComplexIndex + 1] : undefined;

// Or: Update test to check args array directly
expect(args).toContain('-filter_complex');
```

---

## 📋 VALIDATION CHECKLIST

After fixes, run this sequence:

```powershell
# 1. TypeScript check (should be 0 errors)
npx tsc --noEmit

# 2. Unit tests (should be 241/241)
npm test -- --run

# 3. Health check (should show all green)
npm run check:health-helper

# 4. Build (should succeed)
npm run build
```

---

## 🔧 ENVIRONMENT REQUIREMENTS

### Running Services
- **ComfyUI**: http://127.0.0.1:8188 (use VS Code task to start)
- **Dev Server**: http://localhost:3000 (npm run dev)

### Required Models (ComfyUI)
- FLUX: `flux1-krea-dev_fp8_scaled.safetensors`
- T5 Encoder: `t5/t5xxl_fp8_e4m3fn_scaled.safetensors`
- CLIP: `clip_l.safetensors`
- VAE: `ae.safetensors`
- WAN I2V: `wan2.2_ti2v_5B_fp16.safetensors`

### Configuration
Import workflow profiles from `localGenSettings.json` via:
Settings → ComfyUI Settings → Import from File

---

## 📁 KEY FILE LOCATIONS

| What | Where |
|------|-------|
| Main service with errors | `services/comfyUIService.ts` |
| Type definitions | `types.ts` |
| Vite types | `vite-env.d.ts` |
| Test with failures | `utils/__tests__/videoSplicer.test.ts` |
| Video splicer impl | `utils/videoSplicer.ts` |
| Coding guidelines | `.github/copilot-instructions.md` |
| Full handoff doc | `AGENT_HANDOFF_COMPREHENSIVE_20251125.md` |

---

## 🎓 CRITICAL PATTERNS TO FOLLOW

### Never Do This
```typescript
// ❌ Direct API call from component
const response = await fetch('/api/comfyui/...');
```

### Always Do This
```typescript
// ✅ Route through service layer
const result = await comfyUIService.queuePrompt(settings, payload);
```

### State Management Pattern
```typescript
// For persistent data
const [value, setValue] = usePersistentState('key', defaultValue);

// For UI-only state
const [open, setOpen] = useState(false);
```

---

## 🔗 QUICK REFERENCES

- **ComfyUI Docs**: http://127.0.0.1:8188/docs
- **Project README**: `README.md`
- **Agent Guidelines**: `.github/copilot-instructions.md`
- **Status Document**: `Documentation/PROJECT_STATUS_CONSOLIDATED.md`
- **Test Checklist**: `Testing/E2E/BOOKEND_WORKFLOW_TEST_CHECKLIST.md`

---

## ✅ DEFINITION OF DONE

Your session is complete when:
1. `npx tsc --noEmit` returns 0 errors
2. `npm test -- --run` shows 241/241 passing
3. `npm run build` succeeds
4. You've updated this handoff document with your changes

---

**Start here. Fix errors. Validate. Document. Good luck!** 🚀
